package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.model.WorkflowGatewayRewindPlan;
import com.cloudflow.workflow.model.WorkflowRuntimeGraph;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

@Slf4j
@Service
@RequiredArgsConstructor
public class WorkflowRewindService {
    private final WfGatewayActivationMapper activations;
    private final WfParallelJoinMapper arrivals;
    private final WfProcessInstanceMapper instances;
    private final WfTaskMapper tasks;
    private final WfTaskHistoryMapper histories;
    private final WfTaskReadMapper reads;
    private final WfTaskCandidateMapper candidates;
    private final WfTaskDelegationMapper delegations;
    private final WfTaskAddSignMapper addSigns;
    private final WfCountersignTaskMapper countersigns;
    private final WfNodeRecordMapper nodeRecords;
    private final TaskMonitorMapper monitors;
    private final TaskReminderJob reminders;
    private final TimerSchedulerService timers;
    private final WorkflowGatewayService gateways;
    private final WorkflowProcessStateService states;
    private final ICountersignService countersignService;

    @Transactional(propagation = Propagation.MANDATORY)
    public WfTaskHistory target(WfProcessInstance instance, WorkflowRuntimeGraph graph, WfTask task, String targetKey) {
        assertTenant(instance);
        WorkflowExecutionContext.Frame context = WorkflowExecutionContext.parse(task.getExecutionContext());
        gateways.assertActive(instance, context);
        Set<String> upstream = ancestors(graph, task.getNodeKey());
        Map<String, WfGatewayActivation> rounds = rounds(instance);
        Set<String> invalidated = WorkflowHistoryState.invalidated(instance);
        return history(instance).stream().filter(WorkflowHistoryState::approval)
                .filter(history -> !invalidated.contains(history.getHistoryId()) && upstream.contains(history.getNodeKey())
                        && !task.getNodeKey().equals(history.getNodeKey()) && (targetKey == null || targetKey.equals(history.getNodeKey())))
                .filter(history -> usable(graph, context, rounds, history))
                .max(Comparator.comparingLong(history -> WorkflowHistoryState.execution(history).sequence()))
                .orElseThrow(() -> WorkflowException.validationError("没有当前分支已生效的上游审批记录"));
    }

    @Audit(name = "回退流程分支", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY)
    public WorkflowGatewayRewindPlan rewind(WfProcessInstance instance, WorkflowRuntimeGraph graph,
                                             WorkflowExecutionContext.Frame source, WfTaskHistory target) {
        assertTenant(instance);
        Map<String, WfGatewayActivation> rounds = rounds(instance);
        if (!usable(graph, source, rounds, target) || WorkflowHistoryState.invalidated(instance).contains(target.getHistoryId())) {
            throw WorkflowException.invalidState("该审批记录已失效，无法再次回退");
        }
        WorkflowGatewayRewindPlan plan = WorkflowGatewayRewindPlan.resolve(graph, target.getNodeKey(), source, rounds);
        List<WfTaskHistory> completed = history(instance);
        long threshold = WorkflowHistoryState.execution(target).sequence();
        if (plan.restartedGateway() != null) {
            WorkflowExecutionContext.Frame oldRound = WorkflowHistoryState.execution(target).context();
            while (oldRound != null && !plan.restartedGateway().equals(rounds.get(oldRound.activationId()).getGatewayId())) oldRound = oldRound.parent();
            if (oldRound == null) throw WorkflowExecutionContext.invalid();
            String activationId = oldRound.activationId();
            threshold = completed.stream().map(WorkflowHistoryState::execution).filter(Objects::nonNull)
                    .filter(execution -> containsActivation(execution.context(), activationId)).mapToLong(WorkflowHistoryState.Execution::sequence)
                    .min().orElse(threshold);
        }
        long firstInvalid = threshold;
        WorkflowHistoryState.invalidate(instance, completed.stream().filter(history -> {
            WorkflowHistoryState.Execution execution = WorkflowHistoryState.execution(history);
            return execution != null && execution.sequence() >= firstInvalid && WorkflowExecutionContext.within(execution.context(), plan.context());
        }).map(WfTaskHistory::getHistoryId).toList());
        clearScope(instance, plan.context(), new HashSet<>());
        return plan;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public WorkflowExecutionContext.Frame withdrawalContext(WfProcessInstance instance, WfTaskHistory history) {
        assertTenant(instance);
        WorkflowHistoryState.Execution execution = WorkflowHistoryState.execution(history);
        if (!WorkflowHistoryState.effectiveApproval(instance, history)) {
            throw WorkflowException.invalidState("只能撤回仍生效的通过记录");
        }
        Map<String, WfGatewayActivation> rounds = rounds(instance);
        List<WorkflowExecutionContext.Frame> frames = new ArrayList<>();
        for (WorkflowExecutionContext.Frame frame = execution.context(); frame != null; frame = frame.parent()) frames.add(0, frame);
        WorkflowExecutionContext.Frame retained = null;
        for (WorkflowExecutionContext.Frame frame : frames) {
            WfGatewayActivation activation = rounds.get(frame.activationId());
            if (activation == null || "CANCELLED".equals(activation.getStatus())) throw WorkflowExecutionContext.invalid();
            if (!"WAITING".equals(activation.getStatus()) || arrivals.selectArrivalsForUpdate(instance.getTenantId(), frame.activationId())
                    .stream().anyMatch(arrival -> frame.branchKey().equals(arrival.getBranchKey()))) break;
            retained = frame;
        }
        return retained;
    }

    @Audit(name = "清理回退实例的失效分支", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY)
    public void clear(WfProcessInstance instance) {
        assertTenant(instance);
        WorkflowHistoryState.invalidate(instance, history(instance).stream().map(WfTaskHistory::getHistoryId).toList());
        clearScope(instance, null, new HashSet<>());
    }

    private boolean usable(WorkflowRuntimeGraph graph, WorkflowExecutionContext.Frame source,
                           Map<String, WfGatewayActivation> rounds, WfTaskHistory history) {
        WorkflowHistoryState.Execution execution = WorkflowHistoryState.execution(history);
        if (execution == null) return false;
        for (WorkflowExecutionContext.Frame frame = execution.context(); frame != null; frame = frame.parent()) {
            WfGatewayActivation activation = rounds.get(frame.activationId());
            if (activation == null || "CANCELLED".equals(activation.getStatus())
                    || !Objects.equals(WorkflowExecutionContext.parse(activation.getParentContext()), frame.parent())) return false;
        }
        try {
            WorkflowGatewayRewindPlan plan = WorkflowGatewayRewindPlan.resolve(graph, history.getNodeKey(), source, rounds);
            return plan.restartedGateway() == null ? Objects.equals(execution.context(), plan.context())
                    : WorkflowExecutionContext.within(execution.context(), plan.context());
        } catch (WorkflowException rejected) {
            return false;
        }
    }

    private void clearScope(WfProcessInstance instance, WorkflowExecutionContext.Frame scope, Set<String> visited) {
        if (!visited.add(instance.getInstanceId()) || visited.size() > 64) throw WorkflowExecutionContext.invalid();
        Set<String> cancelledNodes = new HashSet<>();
        for (WfGatewayActivation activation : rounds(instance).values()) {
            if ("WAITING".equals(activation.getStatus()) && WorkflowExecutionContext.within(WorkflowExecutionContext.parse(activation.getParentContext()), scope)) {
                activation.setStatus("CANCELLED");
                activation.setUpdateTime(LocalDateTime.now());
                if (activations.updateById(activation) != 1) throw WorkflowExecutionContext.invalid();
                cancelledNodes.add(activation.getGatewayId());
                cancelledNodes.add(activation.getJoinNodeKey());
            }
        }
        List<WfTask> cancelled = tasks.selectList(new LambdaQueryWrapper<WfTask>()
                        .eq(WfTask::getTenantId, instance.getTenantId()).eq(WfTask::getInstanceId, instance.getInstanceId())).stream()
                .filter(task -> WorkflowExecutionContext.within(WorkflowExecutionContext.parse(task.getExecutionContext()), scope)).toList();
        for (WfTask task : cancelled) {
            cancelledNodes.add(task.getNodeKey());
            if (countersignService.isCountersignTask(task)) {
                WfCountersignTask countersign = countersigns.selectById(countersignService.extractCountersignId(task));
                if (countersign != null && "VOTING".equals(countersign.getStatus())) {
                    countersign.setStatus("REJECTED");
                    countersign.setCompleteTime(LocalDateTime.now());
                    if (countersigns.updateById(countersign) != 1) throw WorkflowExecutionContext.invalid();
                }
            }
            reads.delete(new LambdaQueryWrapper<WfTaskRead>().eq(WfTaskRead::getTaskId, task.getTaskId()));
            candidates.update(null, new LambdaUpdateWrapper<WfTaskCandidate>().eq(WfTaskCandidate::getTaskId, task.getTaskId())
                    .eq(WfTaskCandidate::getStatus, "PENDING").set(WfTaskCandidate::getStatus, "CANCELLED"));
            delegations.update(null, new LambdaUpdateWrapper<WfTaskDelegation>().eq(WfTaskDelegation::getTaskId, task.getTaskId())
                    .eq(WfTaskDelegation::getStatus, "ACTIVE").set(WfTaskDelegation::getStatus, "CANCELLED").set(WfTaskDelegation::getEndTime, LocalDateTime.now()));
            addSigns.update(null, new LambdaUpdateWrapper<WfTaskAddSign>().eq(WfTaskAddSign::getTaskId, task.getTaskId())
                    .eq(WfTaskAddSign::getStatus, "PENDING").set(WfTaskAddSign::getStatus, "CANCELLED").set(WfTaskAddSign::getCompleteTime, LocalDateTime.now()));
            monitors.update(null, new LambdaUpdateWrapper<TaskMonitor>().eq(TaskMonitor::getTaskId, task.getTaskId())
                    .eq(TaskMonitor::getTenantId, instance.getTenantId()).set(TaskMonitor::getStatus, "CANCELLED")
                    .set(TaskMonitor::getCompleteTime, LocalDateTime.now()).set(TaskMonitor::getAction, "ROLLBACK_CANCEL"));
            if (tasks.deleteById(task.getTaskId()) != 1) throw WorkflowExecutionContext.invalid();
        }
        if (!cancelled.isEmpty()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                for (WfTask task : cancelled) {
                    try { reminders.cancelReminders(task.getTaskId()); }
                    catch (RuntimeException failure) { log.warn("回退任务提醒索引清理失败, taskId={}", task.getTaskId(), failure); }
                }
            }
        });
        for (WorkflowWaitState.Pending pending : WorkflowWaitState.list(instance, null)) {
            if (!WorkflowExecutionContext.within(pending.context(), scope)) continue;
            cancelledNodes.add(pending.nodeKey());
            WorkflowWaitState.finish(instance, null, pending.waitId());
            if ("TIMER".equals(pending.kind())) timers.completeAfterCommit(instance.getInstanceId(), pending);
            if ("SUBPROCESS".equals(pending.kind())) {
                WfProcessInstance child = instances.selectForExecution(instance.getTenantId(), pending.waitId());
                if (child == null || !instance.getInstanceId().equals(child.getParentInstanceId())) throw WorkflowExecutionContext.invalid();
                if (WfProcessStatus.isOpen(child.getStatus())) {
                    clearScope(child, null, visited);
                    states.transition(child, WfProcessStatus.CANCELLED);
                }
            }
        }
        if (!cancelledNodes.isEmpty()) nodeRecords.update(null, new LambdaUpdateWrapper<WfNodeRecord>()
                .eq(WfNodeRecord::getInstanceId, instance.getInstanceId()).in(WfNodeRecord::getNodeKey, cancelledNodes)
                .eq(WfNodeRecord::getStatus, "RUNNING").set(WfNodeRecord::getStatus, "CANCELLED").set(WfNodeRecord::getEndTime, LocalDateTime.now()));
        if (instances.updateById(instance) != 1) throw WorkflowException.invalidState("回退时流程已变更，请重新读取");
    }

    private List<WfTaskHistory> history(WfProcessInstance instance) {
        return histories.selectList(new LambdaQueryWrapper<WfTaskHistory>().eq(WfTaskHistory::getTenantId, instance.getTenantId())
                .eq(WfTaskHistory::getInstanceId, instance.getInstanceId()));
    }

    private Map<String, WfGatewayActivation> rounds(WfProcessInstance instance) {
        Map<String, WfGatewayActivation> result = new LinkedHashMap<>();
        for (WfGatewayActivation activation : activations.selectList(new LambdaQueryWrapper<WfGatewayActivation>()
                .eq(WfGatewayActivation::getTenantId, instance.getTenantId()).eq(WfGatewayActivation::getInstanceId, instance.getInstanceId()))) {
            result.put(activation.getActivationId(), activation);
        }
        return result;
    }

    private Set<String> ancestors(WorkflowRuntimeGraph graph, String nodeKey) {
        Set<String> result = new HashSet<>();
        ArrayDeque<String> pending = new ArrayDeque<>();
        pending.add(nodeKey);
        while (!pending.isEmpty()) {
            for (WorkflowRuntimeGraph.EdgeLink incoming : graph.getIncomingEdges(pending.removeFirst())) {
                if (result.add(incoming.getSourceId())) pending.addLast(incoming.getSourceId());
            }
        }
        return result;
    }

    private static boolean containsActivation(WorkflowExecutionContext.Frame context, String activationId) {
        for (WorkflowExecutionContext.Frame frame = context; frame != null; frame = frame.parent()) {
            if (activationId.equals(frame.activationId())) return true;
        }
        return false;
    }

    private void assertTenant(WfProcessInstance instance) {
        if (instance == null || instance.getTenantId() == null || !Objects.equals(instance.getTenantId(), TenantContext.getTenantId())) {
            throw WorkflowExecutionContext.invalid();
        }
    }
}

package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.workflow.domain.WfCountersignTask;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskAddSign;
import com.cloudflow.workflow.domain.WfTaskCandidate;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.WfTaskRead;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfCountersignTaskMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskAddSignMapper;
import com.cloudflow.workflow.mapper.WfTaskCandidateMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.WfTaskReadMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class WorkflowTerminalTaskService {
    private final WfProcessInstanceMapper instances;
    private final WfTaskMapper tasks;
    private final WfTaskAddSignMapper addSigns;
    private final WfTaskDelegationMapper delegations;
    private final WfTaskCandidateMapper candidates;
    private final WfTaskReadMapper reads;
    private final WfCountersignTaskMapper countersigns;
    private final TaskMonitorMapper monitors;
    private final TaskReminderJob reminders;

    @Audit(name = "结束流程并关闭未完成任务", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY)
    public void finish(WfProcessInstance instance, WfProcessStatus target) {
        if (!target.isTerminal() || instances.selectForExecution(instance.getTenantId(), instance.getInstanceId()) == null) {
            throw WorkflowException.invalidState("流程不存在或目标状态不是终态");
        }
        LambdaQueryWrapper<WfTask> scope = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getTenantId, instance.getTenantId()).eq(WfTask::getInstanceId, instance.getInstanceId());
        List<WfTask> remaining = tasks.selectInstanceForUpdate(instance.getTenantId(), instance.getInstanceId());
        int pendingGroups = addSigns.selectPendingForUpdate(instance.getTenantId(), instance.getInstanceId(), null).size();
        if (WfProcessStatus.isSuccess(target.getCode())) {
            if (!remaining.isEmpty() || pendingGroups != 0 || !WorkflowWaitState.list(instance, null).isEmpty()) {
                throw WorkflowException.invalidState("流程仍有未完成的任务、加签或等待，不能通过");
            }
            return;
        }
        LocalDateTime finishedAt = LocalDateTime.now();
        addSigns.update(null, new LambdaUpdateWrapper<WfTaskAddSign>()
                .eq(WfTaskAddSign::getTenantId, instance.getTenantId()).eq(WfTaskAddSign::getInstanceId, instance.getInstanceId())
                .eq(WfTaskAddSign::getStatus, "PENDING").set(WfTaskAddSign::getStatus, "CANCELLED")
                .set(WfTaskAddSign::getCompleteTime, finishedAt));
        delegations.update(null, new LambdaUpdateWrapper<WfTaskDelegation>()
                .eq(WfTaskDelegation::getTenantId, instance.getTenantId()).eq(WfTaskDelegation::getInstanceId, instance.getInstanceId())
                .eq(WfTaskDelegation::getStatus, "ACTIVE").set(WfTaskDelegation::getStatus, "CANCELLED")
                .set(WfTaskDelegation::getEndTime, finishedAt));
        candidates.update(null, new LambdaUpdateWrapper<WfTaskCandidate>()
                .eq(WfTaskCandidate::getTenantId, instance.getTenantId()).eq(WfTaskCandidate::getInstanceId, instance.getInstanceId())
                .eq(WfTaskCandidate::getStatus, "PENDING").set(WfTaskCandidate::getStatus, "CANCELLED"));
        countersigns.update(null, new LambdaUpdateWrapper<WfCountersignTask>()
                .eq(WfCountersignTask::getTenantId, instance.getTenantId()).eq(WfCountersignTask::getInstanceId, instance.getInstanceId())
                .eq(WfCountersignTask::getStatus, "VOTING")
                .set(WfCountersignTask::getStatus, target == WfProcessStatus.REJECTED ? "REJECTED" : "TERMINATED")
                .set(WfCountersignTask::getCompleteTime, finishedAt));
        monitors.update(null, new LambdaUpdateWrapper<TaskMonitor>()
                .eq(TaskMonitor::getTenantId, instance.getTenantId()).eq(TaskMonitor::getInstanceId, instance.getInstanceId())
                .in(TaskMonitor::getStatus, "PENDING", "SUSPENDED", "DELEGATED")
                .set(TaskMonitor::getStatus, "CANCELLED").set(TaskMonitor::getCompleteTime, finishedAt)
                .set(TaskMonitor::getAction, target.getCode()).set(TaskMonitor::getUpdateTime, finishedAt));
        for (WfTask task : remaining) {
            reads.delete(new LambdaQueryWrapper<WfTaskRead>()
                    .eq(WfTaskRead::getTenantId, task.getTenantId()).eq(WfTaskRead::getTaskId, task.getTaskId()));
            reminders.cancelAfterCommit(task.getTaskId());
        }
        if (!remaining.isEmpty() && tasks.delete(scope) != remaining.size()) {
            throw WorkflowException.invalidState("结束流程时任务已变更，请重新读取");
        }
    }
}

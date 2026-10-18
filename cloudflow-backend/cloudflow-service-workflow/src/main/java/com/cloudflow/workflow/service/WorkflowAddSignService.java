package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.vo.PendingSignatureVO;
import com.cloudflow.workflow.domain.vo.TaskSignatureContext;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.job.TaskReminderJob;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class WorkflowAddSignService {
    private static final String MEMBER = "ADDSIGN_MEMBER:";
    private final WfTaskMapper tasks;
    private final WfTaskAddSignMapper groups;
    private final WfCountersignTaskMapper countersigns;
    private final WfProcessInstanceMapper instances;
    private final WfTaskHistoryMapper histories;
    private final WfTaskReadMapper reads;
    private final TaskMonitorMapper monitors;
    private final WorkflowAgentService agents;
    private final WorkflowDelegationReturnService delegation;
    private final WorkflowPermissionService permissions;
    private final WorkflowNodePolicy nodePolicy;
    private final WorkflowHParticipantPolicy participants;
    private final WorkflowGatewayService gateways;
    private final WorkflowHistoryState historyState;
    private final WorkflowSecurityUtils security;
    private final WorkflowEventPublisher events;
    private final TaskReminderJob reminders;
    private final MessageSender messages;

    public record Completion(WfTask task, WfTaskHistory approval) { }
    public record Reduction(int removed, Completion completion) { }

    public PageResult<PendingSignatureVO> pending(int pageNum, int pageSize) {
        if (pageNum < 1 || pageSize < 1 || pageSize > 100) throw WorkflowException.validationError("页码须从1开始，每页1至100条");
        if (UserContext.getTenantId() == null || UserContext.getUserId() == null) throw WorkflowException.permissionDenied("请登录后查询本人加签");
        return PageResult.build(groups.selectPending(new Page<>(pageNum, pageSize), UserContext.getTenantId(), UserContext.getUserId()));
    }

    public TaskSignatureContext context(String taskId) {
        WfTask task = tasks.selectById(taskId);
        if (task == null) throw WorkflowException.taskNotFound(taskId);
        permissions.checkTaskPermission(task);
        WfProcessInstance instance = instances.selectById(task.getInstanceId());
        if (instance == null || !Objects.equals(instance.getTenantId(), task.getTenantId()) || !WfProcessStatus.isActive(instance.getStatus())) throw conflict();
        WfNodeConfig node = nodePolicy.resolveNode(instance, task.getNodeKey());
        if (node == null) throw conflict();
        String reference = task.getCandidateRoles();
        if (reference != null && reference.startsWith("CS:")) {
            WfCountersignTask countersign = countersigns.selectById(reference.substring(3));
            if (countersign == null || !Objects.equals(countersign.getTenantId(), task.getTenantId())
                    || !Objects.equals(countersign.getInstanceId(), task.getInstanceId())) throw conflict();
            List<TaskSignatureContext.Member> members = tasks.selectList(new LambdaQueryWrapper<WfTask>()
                    .eq(WfTask::getTenantId, task.getTenantId()).eq(WfTask::getInstanceId, task.getInstanceId())
                    .eq(WfTask::getCandidateRoles, reference).eq(WfTask::getStatus, "TODO")).stream()
                    .map(member -> new TaskSignatureContext.Member(member.getAssignee(), member.getAssigneeName(), member.getStatus())).toList();
            boolean active = "TODO".equals(task.getStatus()) && "VOTING".equals(countersign.getStatus()) && !"SEQUENTIAL".equals(countersign.getSignType());
            return new TaskSignatureContext(taskId, "COUNTERSIGN", countersign.getSignType(), task.getAssignee(),
                    active && WorkflowNodePolicy.allows(node, "allowAddSign"), active && WorkflowNodePolicy.allows(node, "allowReduceSign") && !members.isEmpty(),
                    active ? "新增人员参与当前会签；只能移除未投票人员，至少保留一人。" : "当前会签状态或顺序签模式不允许加减签。", members);
        }
        WfTaskAddSign group = ownedGroup(task);
        boolean supported = reference == null || !reference.startsWith(MEMBER) && !WorkflowDelegationReturnService.requiresReturn(task);
        List<TaskSignatureContext.Member> selected = group == null ? List.of() : "AFTER".equals(group.getSignType()) && "TODO".equals(task.getStatus())
                ? plannedMembers(group) : members(group).stream().filter(member -> "TODO".equals(member.getStatus()))
                .map(member -> new TaskSignatureContext.Member(member.getAssignee(), member.getAssigneeName(), member.getStatus())).toList();
        boolean active = Set.of("TODO", "SUSPENDED").contains(task.getStatus());
        return new TaskSignatureContext(taskId, "ORDERED", group == null ? null : group.getSignType(), task.getAssignee(),
                supported && "TODO".equals(task.getStatus()) && group == null && WorkflowNodePolicy.allows(node, "allowAddSign"),
                supported && active && group != null && !selected.isEmpty() && WorkflowNodePolicy.allows(node, "allowReduceSign"),
                !supported ? "请完成当前受委派或加签任务，交还后由原负责人调整加签。" : group == null ? "前加签先由新增人员审批；后加签先由原负责人审批；并行加签须双方全部完成。"
                        : "本节点已有加签组，只能移除仍待处理的成员；最后一人移除后仍以原负责人真实审批为准。", selected);
    }

    @Audit(name = "增加审批签核人员")
    @Transactional(rollbackFor = Exception.class)
    public String create(String taskId, List<Long> userIds, String signType, String reason) {
        WfTask original = agents.lockTask(taskId);
        permissions.checkTaskPermission(original);
        WfProcessInstance instance = activeInstance(original);
        nodePolicy.assertTaskAllowed(original, "allowAddSign");
        participants.assertFrozenParticipants(instance.getInstanceId());
        if (!Set.of("BEFORE", "AFTER", "PARALLEL").contains(signType == null ? "" : signType)) {
            throw WorkflowException.validationError("加签类型须为前加签、后加签或并行加签");
        }
        if (original.getCandidateRoles() != null && (original.getCandidateRoles().startsWith("CS:")
                || original.getCandidateRoles().startsWith(MEMBER) || WorkflowDelegationReturnService.requiresReturn(original))) {
            throw WorkflowException.validationError("会签任务请使用会签加减席位，受委派或加签任务须处理交还后再调整加签顺序");
        }
        if (ownedGroup(original) != null) throw conflict();
        validateUsers(userIds);
        List<SysUser> targets = userIds.stream().map(userId -> delegation.target(original, userId)).toList();
        participants.assertParticipantChange(original, userIds);
        String encodedIds = userIds.stream().map(String::valueOf).collect(Collectors.joining(","));
        String encodedNames = targets.stream().map(WorkflowDelegationReturnService::display).collect(Collectors.joining(","));
        if (encodedIds.length() > 500 || encodedNames.length() > 500 || reason != null && reason.length() > 500) {
            throw WorkflowException.validationError("加签名单或原因超过500字符，请减少人数或缩短原因");
        }
        WfTaskAddSign group = new WfTaskAddSign();
        group.setAddSignId(UUID.randomUUID().toString());
        group.setTenantId(original.getTenantId());
        group.setInstanceId(original.getInstanceId());
        group.setTaskId(original.getTaskId());
        group.setSignType(signType);
        group.setSignUserIds(encodedIds);
        group.setSignUserNames(encodedNames);
        group.setInitiatorId(UserContext.getUserId());
        group.setInitiatorName(UserContext.getUserName());
        group.setReason(reason == null ? null : security.sanitizeXss(reason));
        group.setStatus("PENDING");
        group.setVersion(0);
        group.setCreateTime(LocalDateTime.now());
        if (groups.insert(group) != 1) throw conflict();
        if ("BEFORE".equals(signType)) {
            original.setStatus("SUSPENDED");
            if (tasks.updateById(original) != 1) throw conflict();
            reminders.cancelAfterCommit(original.getTaskId());
            monitorStatus(original, "SUSPENDED", "ADD_SIGN_BEFORE");
        }
        if (!"AFTER".equals(signType)) createMembers(instance, original, group);
        return group.getAddSignId();
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public boolean retainOriginal(WfTask task) {
        WfTaskAddSign group = ownedGroup(task);
        if (group == null) return false;
        if (!Set.of("AFTER", "PARALLEL").contains(group.getSignType())) throw conflict();
        task.setStatus("SUSPENDED");
        if (tasks.updateById(task) != 1) throw conflict();
        return true;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public Completion completed(WfProcessInstance instance, WfTask task, WfTaskHistory history) {
        WfTaskAddSign owned = ownedGroup(task);
        if (owned != null) {
            if (!"SUSPENDED".equals(task.getStatus())) throw conflict();
            if ("AFTER".equals(owned.getSignType())) createMembers(instance, task, owned);
            if (!members(owned).isEmpty()) return null;
            finish(owned);
            if (tasks.deleteById(task.getTaskId()) != 1) throw conflict();
            return new Completion(task, history);
        }
        WfTaskAddSign group = memberGroup(task);
        if (group == null) return new Completion(task, history);
        return resolveGroup(instance, group);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void transferred(WfTask previous, WfTask replacement) {
        WfTaskAddSign group = ownedGroup(previous);
        if (group == null) return;
        group.setTaskId(replacement.getTaskId());
        if (groups.updateById(group) != 1) throw conflict();
    }

    @Audit(name = "移除未完成的加签人员", highRisk = true)
    @Transactional(propagation = Propagation.MANDATORY)
    public Reduction remove(String taskId, List<Long> userIds, String reason) {
        validateUsers(userIds);
        if (reason != null && reason.length() > 500) throw WorkflowException.validationError("减签原因不能超过500字符");
        WfTask probe = tasks.selectById(taskId);
        WfProcessInstance instance = activeInstance(probe);
        WfTask source = tasks.selectForUpdate(instance.getTenantId(), taskId);
        if (source == null) throw conflict();
        permissions.checkTaskPermission(source);
        if (!Set.of("TODO", "SUSPENDED").contains(source.getStatus())) throw conflict();
        WfTaskAddSign group = ownedGroup(source);
        if (group == null) group = memberGroup(source);
        if (group == null) throw WorkflowException.validationError("当前任务没有待处理的加签组");
        WfTask original = original(group);
        permissions.checkTaskPermission(original);
        nodePolicy.assertTaskAllowed(original, "allowReduceSign");
        participants.assertFrozenParticipants(instance.getInstanceId());
        if ("AFTER".equals(group.getSignType()) && "TODO".equals(original.getStatus())) {
            return removePlanned(instance, original, group, userIds, reason);
        }
        Set<Long> selected = new HashSet<>(userIds);
        List<WfTask> removed = members(group).stream().filter(member -> "TODO".equals(member.getStatus()) && selected.contains(member.getAssignee())).toList();
        if (removed.size() != selected.size()) throw WorkflowException.validationError("只能移除本加签组中仍待本人处理的加签人员");
        for (WfTask member : removed) {
            WfTaskHistory history = new WfTaskHistory();
            history.setHistoryId(UUID.randomUUID().toString());
            history.setTenantId(member.getTenantId());
            history.setInstanceId(member.getInstanceId());
            history.setTaskId(member.getTaskId());
            history.setNodeKey(member.getNodeKey());
            history.setNodeName(member.getNodeName());
            history.setOperatorId(UserContext.getUserId());
            history.setOperatorName(UserContext.getUserName());
            history.setTaskType("REDUCE_SIGN");
            history.setAction("REMOVE_SIGN");
            history.setComment(reason == null ? "减签" : security.sanitizeXss(reason));
            history.setCreateTime(LocalDateTime.now());
            agents.annotateHistory(history, original, UserContext.getUserId());
            historyState.record(instance, member, history);
            agents.detachAssignment(member);
            if (histories.insert(history) != 1 || tasks.deleteById(member.getTaskId()) != 1) throw conflict();
            reads.delete(new LambdaQueryWrapper<WfTaskRead>().eq(WfTaskRead::getTenantId, member.getTenantId()).eq(WfTaskRead::getTaskId, member.getTaskId()));
            reminders.cancelAfterCommit(member.getTaskId());
            monitorStatus(member, "CANCELLED", "REMOVE_SIGN");
            events.publishTaskCompleted(instance, member.getTaskId(), member.getNodeKey(), member.getNodeName(), "REMOVE_SIGN", history.getComment(), "REDUCE_SIGN");
            messages.send(member.getAssignee(), "加签已取消", "您在「" + member.getNodeName() + "」的加签已取消。", "1", UserContext.getUserId(), UserContext.getUserName());
        }
        return new Reduction(removed.size(), resolveGroup(instance, group));
    }

    private List<TaskSignatureContext.Member> plannedMembers(WfTaskAddSign group) {
        String[] identifiers = group.getSignUserIds().split(",");
        List<TaskSignatureContext.Member> result = new ArrayList<>();
        for (int index = 0; index < identifiers.length; index++) {
            Long userId = Long.valueOf(identifiers[index]);
            result.add(new TaskSignatureContext.Member(userId, delegation.displayName(group.getTenantId(), userId), "PLANNED"));
        }
        return result;
    }

    private Reduction removePlanned(WfProcessInstance instance, WfTask original, WfTaskAddSign group, List<Long> userIds, String reason) {
        List<TaskSignatureContext.Member> planned = plannedMembers(group);
        Set<Long> selected = new HashSet<>(userIds);
        if (planned.stream().filter(member -> selected.contains(member.userId())).count() != selected.size()) {
            throw WorkflowException.validationError("只能移除本组尚未分派的后加签人员");
        }
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTenantId(original.getTenantId());
        history.setInstanceId(original.getInstanceId());
        history.setTaskId(original.getTaskId());
        history.setNodeKey(original.getNodeKey());
        history.setNodeName(original.getNodeName());
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setTaskType("REDUCE_SIGN");
        history.setAction("REMOVE_SIGN");
        history.setComment(security.sanitizeXss("移除" + selected.size() + "名尚未分派的后加签人员；" + (reason == null ? "" : reason)));
        history.setCreateTime(LocalDateTime.now());
        agents.annotateHistory(history, original, UserContext.getUserId());
        historyState.recordDetails(instance, original, history, Map.of("addSignId", group.getAddSignId(), "removedUserIds", userIds,
                "removedUserNames", planned.stream().filter(member -> selected.contains(member.userId())).map(TaskSignatureContext.Member::userName).toList()));
        if (histories.insert(history) != 1) throw conflict();
        List<TaskSignatureContext.Member> retained = planned.stream().filter(member -> !selected.contains(member.userId())).toList();
        if (retained.isEmpty()) {
            group.setStatus("CANCELLED");
            group.setCompleteTime(LocalDateTime.now());
        } else {
            group.setSignUserIds(retained.stream().map(member -> member.userId().toString()).collect(Collectors.joining(",")));
            group.setSignUserNames(retained.stream().map(TaskSignatureContext.Member::userName).collect(Collectors.joining(",")));
        }
        if (groups.updateById(group) != 1) throw conflict();
        return new Reduction(selected.size(), null);
    }

    private Completion resolveGroup(WfProcessInstance instance, WfTaskAddSign group) {
        if (!members(group).isEmpty()) return null;
        WfTask original = original(group);
        if ("BEFORE".equals(group.getSignType())) {
            if (!"SUSPENDED".equals(original.getStatus())) throw conflict();
            finish(group);
            original.setStatus("TODO");
            if (tasks.updateById(original) != 1) throw conflict();
            agents.refreshAssignment(original);
            monitorStatus(original, "PENDING", "ADD_SIGN_RETURN");
            WfNodeConfig node = nodePolicy.resolveNode(instance, original.getNodeKey());
            reminders.registerAfterCommit(original.getTaskId(), node == null ? null : node.getSlaHours());
            events.publishTaskAssigned(instance, original.getTaskId(), original.getNodeKey(), original.getNodeName(), original.getAssignee(), original.getAssigneeName(), original.getTaskType());
            messages.send(original.getAssignee(), "前加签已完成", "加签人员已处理「" + original.getNodeName() + "」，请继续审批。", "1", UserContext.getUserId(), UserContext.getUserName());
            return null;
        }
        if (!"SUSPENDED".equals(original.getStatus())) return null;
        WfTaskHistory approval = histories.selectTaskForUpdate(original.getTenantId(), original.getTaskId()).stream()
                .filter(history -> WorkflowHistoryState.effectiveApproval(instance, history))
                .max(Comparator.comparingLong(history -> WorkflowHistoryState.execution(history).sequence())).orElseThrow(WorkflowAddSignService::conflict);
        finish(group);
        if (tasks.deleteById(original.getTaskId()) != 1) throw conflict();
        return new Completion(original, approval);
    }

    private WfTask original(WfTaskAddSign group) {
        WfTask original = tasks.selectForUpdate(group.getTenantId(), group.getTaskId());
        if (original == null || !Objects.equals(group.getInstanceId(), original.getInstanceId())) throw conflict();
        return original;
    }

    private WfTaskAddSign ownedGroup(WfTask task) {
        List<WfTaskAddSign> pending = groups.selectPendingForUpdate(task.getTenantId(), task.getInstanceId(), task.getTaskId());
        if (pending.size() > 1) throw conflict();
        return pending.isEmpty() ? null : pending.get(0);
    }

    private WfTaskAddSign memberGroup(WfTask task) {
        String reference = task.getCandidateRoles();
        if (reference == null || !reference.startsWith(MEMBER)) return null;
        WfTaskAddSign group = groups.selectForUpdate(task.getTenantId(), task.getInstanceId(), reference.substring(MEMBER.length()));
        if (group == null || !"PENDING".equals(group.getStatus()) || !Objects.equals(group.getTenantId(), task.getTenantId())
                || !Objects.equals(group.getInstanceId(), task.getInstanceId())) throw conflict();
        WfTask original = original(group);
        if (!Objects.equals(original.getNodeKey(), task.getNodeKey()) || !Objects.equals(
                WorkflowExecutionContext.parse(original.getExecutionContext()), WorkflowExecutionContext.parse(task.getExecutionContext()))) throw conflict();
        return group;
    }

    private List<WfTask> members(WfTaskAddSign group) {
        return tasks.selectSignMembersForUpdate(group.getTenantId(), group.getInstanceId(), MEMBER + group.getAddSignId());
    }

    private void createMembers(WfProcessInstance instance, WfTask original, WfTaskAddSign group) {
        WfNodeConfig node = nodePolicy.resolveNode(instance, original.getNodeKey());
        if (node == null) throw conflict();
        for (String identifier : group.getSignUserIds().split(",")) {
            SysUser user = delegation.target(original, Long.valueOf(identifier));
            WfTask member = new WfTask();
            member.setTaskId(UUID.randomUUID().toString());
            member.setTenantId(original.getTenantId());
            member.setInstanceId(original.getInstanceId());
            member.setNodeKey(original.getNodeKey());
            member.setNodeName(original.getNodeName());
            member.setTaskType("ADD_SIGN");
            member.setCandidateRoles(MEMBER + group.getAddSignId());
            member.setExecutionContext(original.getExecutionContext());
            member.setAssignee(user.getUserId());
            member.setAssigneeName(WorkflowDelegationReturnService.display(user));
            member.setStatus("TODO");
            member.setCreateTime(LocalDateTime.now());
            participants.assertTaskAssignment(member, member.getAssignee());
            agents.createTask(member);
            TaskMonitor monitor = new TaskMonitor();
            monitor.setTaskId(member.getTaskId());
            monitor.setTenantId(member.getTenantId());
            monitor.setInstanceId(member.getInstanceId());
            monitor.setNodeKey(member.getNodeKey());
            monitor.setTaskName(member.getNodeName());
            monitor.setAssigneeId(member.getAssignee());
            monitor.setAssigneeName(member.getAssigneeName());
            monitor.setStatus("PENDING");
            monitor.setCreateTimeTask(member.getCreateTime());
            monitor.setVersion(0);
            monitor.setCreateTime(member.getCreateTime());
            if (monitors.insert(monitor) != 1) throw conflict();
            reminders.registerAfterCommit(member.getTaskId(), node.getSlaHours());
            events.publishTaskAssigned(instance, member.getTaskId(), member.getNodeKey(), member.getNodeName(), member.getAssignee(), member.getAssigneeName(), member.getTaskType());
            messages.send(member.getAssignee(), "加签任务", "请处理「" + member.getNodeName() + "」的加签。", "1", UserContext.getUserId(), UserContext.getUserName());
        }
    }

    private void finish(WfTaskAddSign group) {
        group.setStatus("COMPLETED");
        group.setCompleteTime(LocalDateTime.now());
        if (groups.updateById(group) != 1) throw conflict();
    }

    private void monitorStatus(WfTask task, String status, String action) {
        LambdaUpdateWrapper<TaskMonitor> update = new LambdaUpdateWrapper<TaskMonitor>().eq(TaskMonitor::getTenantId, task.getTenantId())
                .eq(TaskMonitor::getTaskId, task.getTaskId()).set(TaskMonitor::getStatus, status)
                .set(TaskMonitor::getAction, action).set(TaskMonitor::getUpdateTime, LocalDateTime.now());
        if ("CANCELLED".equals(status)) update.set(TaskMonitor::getCompleteTime, LocalDateTime.now());
        if ("PENDING".equals(status)) update.set(TaskMonitor::getCompleteTime, null);
        monitors.update(null, update);
    }

    private WfProcessInstance activeInstance(WfTask task) {
        if (task == null || !Objects.equals(UserContext.getTenantId(), task.getTenantId())) throw WorkflowException.permissionDenied("任务不存在或无权操作");
        WfProcessInstance instance = instances.selectForExecution(task.getTenantId(), task.getInstanceId());
        if (instance == null || !WfProcessStatus.isActive(instance.getStatus())) throw conflict();
        gateways.assertActive(instance, WorkflowExecutionContext.parse(task.getExecutionContext()));
        return instance;
    }

    private static void validateUsers(List<Long> userIds) {
        if (userIds == null || userIds.isEmpty() || userIds.size() > 100 || userIds.stream().anyMatch(userId -> userId == null || userId <= 0)
                || new HashSet<>(userIds).size() != userIds.size()) throw WorkflowException.validationError("请选择1至100个不同的加签用户");
    }

    private static WorkflowException conflict() {
        return new WorkflowException("TASK_VERSION_CONFLICT", "加签任务或流程已变更，请重新读取");
    }
}

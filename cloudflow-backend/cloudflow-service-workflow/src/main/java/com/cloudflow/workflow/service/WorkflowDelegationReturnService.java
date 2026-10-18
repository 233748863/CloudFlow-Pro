package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.WfTaskHistory;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.WfTaskHistoryMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class WorkflowDelegationReturnService {
    private final WfTaskMapper tasks;
    private final WfTaskDelegationMapper delegations;
    private final WfTaskHistoryMapper histories;
    private final TaskMonitorMapper monitors;
    private final SysUserMapper users;
    private final WorkflowAgentService agents;
    private final MessageSender messages;
    private final ObjectMapper json;

    public static boolean requiresReturn(WfTask task) {
        return task != null && task.getCandidateRoles() != null
                && task.getCandidateRoles().startsWith("DELEGATE_FROM:");
    }

    public SysUser target(WfTask task, Long targetUserId) {
        SysUser target = targetUserId == null ? null : users.selectById(targetUserId);
        if (target == null || !Objects.equals(task.getTenantId(), target.getTenantId())
                || !"0".equals(target.getStatus()) || Integer.valueOf(1).equals(target.getDeleted())
                || Objects.equals(task.getAssignee(), targetUserId)) {
            throw WorkflowException.validationError("请选择本租户其他启用用户接收任务");
        }
        return target;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    @Audit(name = "受委派人处理后交还原负责人")
    public WfTask restore(WfTask delegated, String action, String comment) {
        if (!requiresReturn(delegated) || !Set.of("APPROVE", "REJECT").contains(action)) throw conflict();
        String[] reference = delegated.getCandidateRoles().split(":", -1);
        if (reference.length != 3 || reference[1].isBlank() || reference[2].isBlank()
                || reference[1].equals(delegated.getTaskId())) throw conflict();
        WfTask original = agents.lockDelegatedTask(reference[1]);
        WfTaskDelegation relation = delegations.selectForUpdate(delegated.getTenantId(), reference[2]);
        if (relation == null || !"ACTIVE".equals(relation.getStatus()) || relation.getSettingId() != null
                || !"DELEGATE".equals(relation.getAgentMode()) || !"DELEGATE_RETURN".equals(relation.getDelegationType())
                || !Objects.equals(original.getTaskId(), relation.getTaskId())
                || !Objects.equals(original.getTenantId(), delegated.getTenantId())
                || !Objects.equals(original.getInstanceId(), delegated.getInstanceId())
                || !Objects.equals(original.getInstanceId(), relation.getInstanceId())
                || !Objects.equals(original.getNodeKey(), delegated.getNodeKey())
                || !Objects.equals(original.getAssignee(), relation.getFromUserId())) throw conflict();
        relation.setStatus("COMPLETED");
        if (delegations.updateById(relation) != 1) throw conflict();
        original.setStatus("TODO");
        if (tasks.updateById(original) != 1) throw conflict();
        agents.refreshAssignment(original);
        WfTaskHistory history = new WfTaskHistory();
        history.setHistoryId(UUID.randomUUID().toString());
        history.setTenantId(original.getTenantId());
        history.setTaskId(original.getTaskId());
        history.setInstanceId(original.getInstanceId());
        history.setNodeKey(original.getNodeKey());
        history.setNodeName(original.getNodeName());
        history.setTaskType("DELEGATE_RETURN");
        history.setAction("DELEGATE_RETURN");
        history.setOperatorId(UserContext.getUserId());
        history.setOperatorName(UserContext.getUserName());
        history.setComment(comment);
        history.setCreateTime(LocalDateTime.now());
        try {
            history.setVariablesChanged(json.writeValueAsString(Map.of("delegationId", relation.getDelegationId(),
                    "delegatedTaskId", delegated.getTaskId(), "delegatedDecision", action)));
        } catch (Exception invalid) {
            throw WorkflowException.validationError("委派交还记录无法保存");
        }
        if (histories.insert(history) != 1) throw conflict();
        monitors.update(null, new LambdaUpdateWrapper<TaskMonitor>()
                .eq(TaskMonitor::getTenantId, original.getTenantId()).eq(TaskMonitor::getTaskId, original.getTaskId())
                .set(TaskMonitor::getStatus, "PENDING").set(TaskMonitor::getCompleteTime, null)
                .set(TaskMonitor::getAction, "DELEGATE_RETURN").set(TaskMonitor::getUpdateTime, LocalDateTime.now()));
        messages.send(original.getAssignee(), "委派任务已交还", "受委派人已处理任务「" + original.getNodeName() + "」，请确认结果。",
                "1", UserContext.getUserId(), UserContext.getUserName());
        return original;
    }

    public static String display(SysUser user) {
        return StringUtils.hasText(user.getNickName()) ? user.getNickName() : user.getUserName();
    }

    public String displayName(Long tenantId, Long userId) {
        SysUser user = users.selectById(userId);
        return user != null && Objects.equals(tenantId, user.getTenantId()) ? display(user) : String.valueOf(userId);
    }

    private static WorkflowException conflict() {
        return new WorkflowException("TASK_VERSION_CONFLICT", "委派关系已变更或已交还，请重新读取任务");
    }
}

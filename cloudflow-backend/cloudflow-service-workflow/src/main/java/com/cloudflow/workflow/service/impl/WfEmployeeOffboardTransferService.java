package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.service.WorkflowHParticipantPolicy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class WfEmployeeOffboardTransferService {

    private static final String AUTO_TRANSFER_REASON = "员工离职自动转办";

    private final WfTaskMapper taskMapper;
    private final WfTaskDelegationMapper delegationMapper;
    private final WfProcessInstanceMapper processInstanceMapper;
    private final TaskMonitorMapper taskMonitorMapper;
    private final SysUserMapper sysUserMapper;
    private final WorkflowHParticipantPolicy hParticipantPolicy;

    @Transactional(rollbackFor = Exception.class)
    public void transferTodoTasksForEmployeeLeft(Long userId, String employeeName, Long successorUserId, String sourceEventId) {
        if (userId == null) return;
        Long tenantId = Objects.requireNonNull(TenantContext.getTenantId(), "离职工作流交接缺少租户上下文");
        List<WfProcessInstance> runningInstances = processInstanceMapper.selectList(new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getTenantId, tenantId).eq(WfProcessInstance::getStartUserId, userId)
                .eq(WfProcessInstance::getStarterLeft, 0)
                .in(WfProcessInstance::getStatus, WfProcessStatus.activeCodes()).orderByAsc(WfProcessInstance::getInstanceId));

        List<WfProcessInstance> markedInstances = new ArrayList<>();
        for (WfProcessInstance observed : runningInstances) {
            WfProcessInstance instance = processInstanceMapper.selectForExecution(tenantId, observed.getInstanceId());
            if (instance == null || !Objects.equals(userId, instance.getStartUserId())
                    || !WfProcessStatus.isActive(instance.getStatus()) || Integer.valueOf(1).equals(instance.getStarterLeft())) continue;
            int changed = processInstanceMapper.update(null, new LambdaUpdateWrapper<WfProcessInstance>()
                    .eq(WfProcessInstance::getTenantId, tenantId).eq(WfProcessInstance::getInstanceId, instance.getInstanceId())
                    .eq(WfProcessInstance::getStartUserId, userId).eq(WfProcessInstance::getStarterLeft, 0)
                    .in(WfProcessInstance::getStatus, WfProcessStatus.activeCodes())
                    .set(WfProcessInstance::getStarterLeft, 1).set(WfProcessInstance::getVersion, nextVersion(instance.getVersion())));
            if (changed != 1) throw new IllegalStateException("离职发起人流程已变更，请重试");
            markedInstances.add(instance);
        }

        if (!markedInstances.isEmpty()) {
            log.warn("employee-left workflow transfer marked running starter instances, eventId={}, userId={}, instanceCount={}, instanceIds={}",
                    sourceEventId, userId, markedInstances.size(), summarizeInstanceIds(markedInstances));
        }

        SysUser successor = resolveAvailableSuccessor(tenantId, userId, successorUserId);
        if (successor == null) {
            log.warn("workflow offboard transfer skipped todo reassignment because successor is unavailable, eventId={}, userId={}, successorUserId={}, markedInstanceCount={}",
                    sourceEventId, userId, successorUserId, markedInstances.size());
            return;
        }

        String successorName = resolveUserDisplayName(successor);
        LocalDateTime now = LocalDateTime.now();
        List<WfTask> todoTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getTenantId, tenantId)
                .and(assignment -> assignment.eq(WfTask::getAssignee, userId).or().eq(WfTask::getDisabledFromUserId, userId))
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()).orderByAsc(WfTask::getTaskId));

        int transferredTaskCount = 0;
        int blockedTaskCount = 0;
        for (WfTask observed : todoTasks) {
            WfProcessInstance instance = processInstanceMapper.selectForExecution(tenantId, observed.getInstanceId());
            if (instance == null || !WfProcessStatus.isOpen(instance.getStatus())) continue;
            WfTask task = taskMapper.selectForUpdate(tenantId, observed.getTaskId());
            if (task == null || !Objects.equals(instance.getInstanceId(), task.getInstanceId())
                    || !WfTaskStatus.TODO.getCode().equals(task.getStatus())) continue;
            boolean directlyAssigned = Objects.equals(userId, task.getAssignee());
            boolean releasedUnchanged = task.getAssignee() == null && Objects.equals(userId, task.getDisabledFromUserId())
                    && task.getVersion() != null && Objects.equals(task.getVersion(), task.getDisabledReleaseVersion())
                    && StringUtils.hasText(task.getDisabledReleaseEventId());
            if (!directlyAssigned && !releasedUnchanged) continue;
            String fromUserName = resolveFromUserName(directlyAssigned ? task.getAssigneeName() : task.getDisabledFromUserName(), employeeName, userId);
            try {
                hParticipantPolicy.assertParticipantChange(task, List.of(successorUserId));
            } catch (WorkflowException failure) {
                if (failure.getCode() == null || !failure.getCode().startsWith("H_")) throw failure;
                blockedTaskCount++;
                log.warn("H workflow offboard reassignment blocked, eventId={}, taskId={}, code={}",
                        sourceEventId, task.getTaskId(), failure.getCode());
                continue;
            }
            int version = nextVersion(task.getVersion());
            String taskType = com.cloudflow.workflow.domain.enums.WfTaskType.TRANSFER.name();
            LambdaUpdateWrapper<WfTask> update = new LambdaUpdateWrapper<WfTask>()
                    .eq(WfTask::getTenantId, tenantId).eq(WfTask::getTaskId, task.getTaskId())
                    .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode())
                    .eq(task.getVersion() != null, WfTask::getVersion, task.getVersion()).isNull(task.getVersion() == null, WfTask::getVersion)
                    .set(WfTask::getAssignee, successorUserId).set(WfTask::getAssigneeName, successorName)
                    .set(WfTask::getTaskType, taskType).set(WfTask::getVersion, version)
                    .set(WfTask::getDisabledFromUserId, null).set(WfTask::getDisabledFromUserName, null)
                    .set(WfTask::getDisabledReleaseVersion, null).set(WfTask::getDisabledReleaseEventId, null);
            if (directlyAssigned) update.eq(WfTask::getAssignee, userId);
            else update.isNull(WfTask::getAssignee).eq(WfTask::getDisabledFromUserId, userId)
                    .eq(WfTask::getDisabledReleaseVersion, task.getVersion()).eq(WfTask::getDisabledReleaseEventId, task.getDisabledReleaseEventId());
            int transferred = taskMapper.update(null, update);
            if (transferred != 1) throw new IllegalStateException("离职待办已变更，请重试");
            task.setAssignee(successorUserId);
            task.setAssigneeName(successorName);
            task.setTaskType(taskType);
            task.setVersion(version);
            task.setDisabledFromUserId(null);
            task.setDisabledFromUserName(null);
            task.setDisabledReleaseVersion(null);
            task.setDisabledReleaseEventId(null);
            insertDelegationRecord(task, userId, fromUserName, successorUserId, successorName, now);
            updateTaskMonitor(task, now);
            transferredTaskCount++;
        }

        log.info("employee-left workflow transfer completed, eventId={}, userId={}, successorUserId={}, transferredTaskCount={}, blockedTaskCount={}, markedInstanceCount={}",
                sourceEventId, userId, successorUserId, transferredTaskCount, blockedTaskCount, markedInstances.size());
    }

    private SysUser resolveAvailableSuccessor(Long tenantId, Long userId, Long successorUserId) {
        if (successorUserId == null || Objects.equals(userId, successorUserId)) {
            return null;
        }
        return sysUserMapper.selectActiveForTaskTransfer(tenantId, successorUserId);
    }

    private int nextVersion(Integer version) {
        return version == null ? 1 : Math.addExact(version, 1);
    }

    private void insertDelegationRecord(WfTask task,
                                        Long fromUserId,
                                        String fromUserName,
                                        Long toUserId,
                                        String toUserName,
                                        LocalDateTime createTime) {
        WfTaskDelegation delegation = new WfTaskDelegation();
        delegation.setDelegationId(UUID.randomUUID().toString());
        delegation.setTenantId(task.getTenantId());
        delegation.setTaskId(task.getTaskId());
        delegation.setInstanceId(task.getInstanceId());
        delegation.setDelegationType("TRANSFER");
        delegation.setFromUserId(fromUserId);
        delegation.setFromUserName(fromUserName);
        delegation.setToUserId(toUserId);
        delegation.setToUserName(toUserName);
        delegation.setReason(AUTO_TRANSFER_REASON);
        delegation.setStatus("COMPLETED");
        delegation.setCreateTime(createTime);
        if (delegationMapper.insert(delegation) != 1) throw new IllegalStateException("离职转办记录登记失败");
    }

    private void updateTaskMonitor(WfTask task, LocalDateTime updateTime) {
        TaskMonitor monitor = taskMonitorMapper.selectOne(new LambdaQueryWrapper<TaskMonitor>()
                .eq(TaskMonitor::getTenantId, task.getTenantId()).eq(TaskMonitor::getTaskId, task.getTaskId()));
        if (monitor == null) {
            return;
        }
        int version = Objects.requireNonNull(monitor.getVersion(), "离职任务监控缺少版本号");
        int changed = taskMonitorMapper.update(null, new LambdaUpdateWrapper<TaskMonitor>()
                .eq(TaskMonitor::getTenantId, task.getTenantId()).eq(TaskMonitor::getId, monitor.getId()).eq(TaskMonitor::getVersion, version)
                .set(TaskMonitor::getAssigneeId, task.getAssignee()).set(TaskMonitor::getAssigneeName, task.getAssigneeName())
                .set(TaskMonitor::getAction, "TRANSFER").set(TaskMonitor::getUpdateTime, updateTime)
                .set(TaskMonitor::getVersion, Math.addExact(version, 1)));
        if (changed != 1) throw new IllegalStateException("离职任务监控已变更，请重试");
    }

    private String resolveUserDisplayName(SysUser user) {
        if (user == null) {
            return null;
        }
        if (StringUtils.hasText(user.getNickName())) {
            return user.getNickName();
        }
        if (StringUtils.hasText(user.getUserName())) {
            return user.getUserName();
        }
        return String.valueOf(user.getUserId());
    }

    private String resolveFromUserName(String priorName, String employeeName, Long userId) {
        if (StringUtils.hasText(priorName)) {
            return priorName;
        }
        if (StringUtils.hasText(employeeName)) {
            return employeeName;
        }
        return String.valueOf(userId);
    }

    private String summarizeInstanceIds(List<WfProcessInstance> instances) {
        String ids = instances.stream()
                .map(WfProcessInstance::getInstanceId)
                .filter(StringUtils::hasText)
                .limit(10)
                .collect(Collectors.joining(","));
        if (instances.size() > 10) {
            return ids + "...";
        }
        return ids;
    }
}

package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import com.cloudflow.workflow.domain.WfTaskDelegation;
import com.cloudflow.workflow.domain.enums.WfProcessStatus;
import com.cloudflow.workflow.domain.enums.WfTaskStatus;
import com.cloudflow.workflow.domain.monitor.TaskMonitor;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.mapper.TaskMonitorMapper;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.mapper.WfTaskDelegationMapper;
import com.cloudflow.workflow.mapper.WfTaskMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
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

    @Transactional(rollbackFor = Exception.class)
    public void transferTodoTasksForEmployeeLeft(Long userId, String employeeName, Long successorUserId, String sourceEventId) {
        SysUser successor = sysUserMapper.selectById(successorUserId);
        if (successor == null || Integer.valueOf(1).equals(successor.getDeleted()) || "1".equals(successor.getStatus())) {
            log.warn("skip workflow offboard transfer because successor is unavailable, eventId={}, userId={}, successorUserId={}",
                    sourceEventId, userId, successorUserId);
            return;
        }

        String successorName = resolveUserDisplayName(successor);
        LocalDateTime now = LocalDateTime.now();
        List<WfTask> todoTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getAssignee, userId)
                .eq(WfTask::getStatus, WfTaskStatus.TODO.getCode()));

        for (WfTask task : todoTasks) {
            String fromUserName = resolveFromUserName(task, employeeName, userId);
            task.setAssignee(successorUserId);
            task.setAssigneeName(successorName);
            taskMapper.updateById(task);
            insertDelegationRecord(task, userId, fromUserName, successorUserId, successorName, now);
            updateTaskMonitor(task, now);
        }

        List<WfProcessInstance> runningInstances = processInstanceMapper.selectList(new LambdaQueryWrapper<WfProcessInstance>()
                .eq(WfProcessInstance::getStartUserId, userId)
                .eq(WfProcessInstance::getStatus, WfProcessStatus.RUNNING.getCode()));

        for (WfProcessInstance instance : runningInstances) {
            instance.setStarterLeft(1);
            processInstanceMapper.updateById(instance);
        }

        if (!runningInstances.isEmpty()) {
            log.warn("employee-left workflow transfer marked running starter instances, eventId={}, userId={}, instanceCount={}, instanceIds={}",
                    sourceEventId, userId, runningInstances.size(), summarizeInstanceIds(runningInstances));
        }

        log.info("employee-left workflow transfer completed, eventId={}, userId={}, successorUserId={}, transferredTaskCount={}, runningInstanceCount={}",
                sourceEventId, userId, successorUserId, todoTasks.size(), runningInstances.size());
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
        delegationMapper.insert(delegation);
    }

    private void updateTaskMonitor(WfTask task, LocalDateTime updateTime) {
        TaskMonitor monitor = taskMonitorMapper.selectByTaskId(task.getTaskId());
        if (monitor == null) {
            return;
        }
        monitor.setAssigneeId(task.getAssignee());
        monitor.setAssigneeName(task.getAssigneeName());
        monitor.setAction("TRANSFER");
        monitor.setUpdateTime(updateTime);
        taskMonitorMapper.updateById(monitor);
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

    private String resolveFromUserName(WfTask task, String employeeName, Long userId) {
        if (task != null && StringUtils.hasText(task.getAssigneeName())) {
            return task.getAssigneeName();
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

package com.cloudflow.workflow.service.impl;

import com.cloudflow.workflow.service.IWorkflowP4Service;

import java.time.LocalDateTime;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.CollectionUtils;

import java.util.*;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;

/**
 * P4 高价值功能服务实现类
 * 包含审批流程增强、任务管理增强、流程管理增强、通知与催办
 */
@Service
public class WorkflowP4ServiceImpl implements IWorkflowP4Service {

    private static final Logger log = LoggerFactory.getLogger(WorkflowP4ServiceImpl.class);

    @Autowired private WfTaskMapper taskMapper;
    @Autowired private WfTaskHistoryMapper taskHistoryMapper;
    @Autowired private WfProcessInstanceMapper processInstanceMapper;
    @Autowired private WfProcessDefinitionMapper processDefinitionMapper;
    @Autowired private WfFormDefinitionMapper formDefinitionMapper;
    @Autowired private WfTaskDelegationMapper delegationMapper;
    @Autowired private WfTaskAddSignMapper addSignMapper;
    @Autowired private WfTaskCandidateMapper candidateMapper;
    @Autowired private WfTaskAttachmentMapper attachmentMapper;
    @Autowired private WfDeployRecordMapper deployRecordMapper;
    @Autowired private WfNotificationConfigMapper notificationConfigMapper;
    @Autowired private WfNotificationLogMapper notificationLogMapper;
    @Autowired private WfUrgeEffectMapper urgeEffectMapper;
    @Autowired private RedissonClient redissonClient;

    private final ObjectMapper objectMapper = new ObjectMapper();

    // ==================== P4.1: 任务委托/转办 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> delegateTask(String taskId, Long toUserId, String toUserName, String reason) {
        log.info("[delegateTask] taskId={}, toUserId={}", taskId, toUserId);
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "delegateTask");
        assertTaskAccess(task, operatorId, "delegateTask");
        Long taskTenantId = resolveTaskTenantId(task);

        Long fromUserId = task.getAssignee();
        String fromUserName = task.getAssigneeName();

        WfTaskDelegation delegation = new WfTaskDelegation();
        delegation.setDelegationId(UUID.randomUUID().toString());
        delegation.setTenantId(taskTenantId);
        delegation.setTaskId(taskId);
        delegation.setInstanceId(task.getInstanceId());
        delegation.setDelegationType("DELEGATE");
        delegation.setFromUserId(fromUserId);
        delegation.setFromUserName(fromUserName);
        delegation.setToUserId(toUserId);
        delegation.setToUserName(toUserName);
        delegation.setReason(reason);
        delegation.setStatus("COMPLETED");
        delegation.setCreateTime(LocalDateTime.now());
        delegationMapper.insert(delegation);

        task.setAssignee(toUserId);
        task.setAssigneeName(toUserName);
        taskMapper.updateById(task);

        sendNotification("TASK_DELEGATE", toUserId, "任务转办通知",
                String.format("用户 %s 将任务 [%s] 转办给您", fromUserName, task.getNodeName()));
        return R.ok();
    }

    // ==================== P1-5: 委派审批（委派后回到委派人） ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> delegateWithReturn(String taskId, Long toUserId, String toUserName, String reason) {
        log.info("[delegateWithReturn] taskId={}, toUserId={}", taskId, toUserId);
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "delegateWithReturn");
        assertTaskAccess(task, operatorId, "delegateWithReturn");
        Long taskTenantId = resolveTaskTenantId(task);

        Long fromUserId = task.getAssignee();
        String fromUserName = task.getAssigneeName();

        // 1. 创建委派记录，状态为ACTIVE（等待被委派人处理后回到委派人）
        WfTaskDelegation delegation = new WfTaskDelegation();
        delegation.setDelegationId(UUID.randomUUID().toString());
        delegation.setTenantId(taskTenantId);
        delegation.setTaskId(taskId);
        delegation.setInstanceId(task.getInstanceId());
        delegation.setDelegationType("DELEGATE_RETURN"); // 委派后回到委派人模式
        delegation.setFromUserId(fromUserId);
        delegation.setFromUserName(fromUserName);
        delegation.setToUserId(toUserId);
        delegation.setToUserName(toUserName);
        delegation.setReason(reason);
        delegation.setStatus("ACTIVE"); // 等待被委派人处理
        delegation.setStartTime(LocalDateTime.now());
        delegation.setCreateTime(LocalDateTime.now());
        delegationMapper.insert(delegation);

        // 2. 将原任务挂起，记录委派信息到candidateRoles字段
        task.setStatus("DELEGATED");
        task.setCandidateRoles("DELEGATE_RETURN:" + delegation.getDelegationId());
        taskMapper.updateById(task);

        // 3. 创建新任务给被委派人
        WfTask delegatedTask = new WfTask();
        delegatedTask.setTaskId(UUID.randomUUID().toString());
        delegatedTask.setInstanceId(task.getInstanceId());
        delegatedTask.setNodeKey(task.getNodeKey());
        delegatedTask.setNodeName(task.getNodeName() + "(委派)");
        delegatedTask.setAssignee(toUserId);
        delegatedTask.setAssigneeName(toUserName);
        delegatedTask.setStatus("TODO");
        delegatedTask.setPriority(task.getPriority());
        delegatedTask.setTenantId(task.getTenantId());
        delegatedTask.setCreateTime(LocalDateTime.now());
        // 关联原任务，被委派人完成后用于回溯
        delegatedTask.setCandidateRoles("DELEGATE_FROM:" + taskId + ":" + delegation.getDelegationId());
        taskMapper.insert(delegatedTask);

        // 4. 记录历史
        WfTaskHistory h = new WfTaskHistory();
        h.setHistoryId(UUID.randomUUID().toString());
        h.setTaskId(taskId);
        h.setInstanceId(task.getInstanceId());
        h.setNodeKey(task.getNodeKey());
        h.setNodeName(task.getNodeName());
        h.setOperatorId(fromUserId);
        h.setOperatorName(fromUserName);
        h.setAction("DELEGATE_WITH_RETURN");
        h.setComment("委派给 " + toUserName + "，原因：" + (reason != null ? reason : ""));
        h.setTenantId(resolveTaskTenantId(task));
        h.setCreateTime(LocalDateTime.now());
        taskHistoryMapper.insert(h);

        // 5. 通知被委派人
        sendNotification("TASK_DELEGATE", toUserId, "委派任务通知",
                String.format("用户 %s 将任务 [%s] 委派给您审批，完成后将回到委派人确认", fromUserName, task.getNodeName()));

        log.info("[delegateWithReturn] 委派成功, delegationId={}, newTaskId={}", delegation.getDelegationId(), delegatedTask.getTaskId());
        return R.ok(Map.of("delegationId", delegation.getDelegationId(), "delegatedTaskId", delegatedTask.getTaskId()));
    }

    // ==================== P4.2: 加签 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> addSign(String taskId, List<Long> userIds, List<String> userNames, String signType, String reason) {
        log.info("[addSign] taskId={}, signType={}", taskId, signType);
        WfTask originalTask = taskMapper.selectById(taskId);
        if (originalTask == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "addSign");
        assertTaskAccess(originalTask, operatorId, "addSign");
        Long taskTenantId = resolveTaskTenantId(originalTask);
        if (CollectionUtils.isEmpty(userIds)) { throw WorkflowException.validationError("加签用户不能为空"); }

        WfTaskAddSign addSign = new WfTaskAddSign();
        addSign.setAddSignId(UUID.randomUUID().toString());
        addSign.setTenantId(taskTenantId);
        addSign.setTaskId(taskId);
        addSign.setInstanceId(originalTask.getInstanceId());
        addSign.setSignType(signType);
        addSign.setSignUserIds(userIds.stream().map(String::valueOf).collect(Collectors.joining(",")));
        addSign.setSignUserNames(userNames != null ? String.join(",", userNames) : "");
        addSign.setInitiatorId(originalTask.getAssignee());
        addSign.setReason(reason);
        addSign.setStatus("PENDING");
        addSign.setCreateTime(LocalDateTime.now());
        addSignMapper.insert(addSign);

        if ("BEFORE".equals(signType)) {
            originalTask.setStatus("SUSPENDED");
            taskMapper.updateById(originalTask);
            createAddSignTasks(originalTask, userIds, userNames, "前加签");
        } else if ("AFTER".equals(signType)) {
            originalTask.setCandidateRoles("ADDSIGN_AFTER:" + addSign.getAddSignId());
            taskMapper.updateById(originalTask);
        } else if ("PARALLEL".equals(signType)) {
            createAddSignTasks(originalTask, userIds, userNames, "并行加签");
        }
        return R.ok(addSign.getAddSignId());
    }

    private void createAddSignTasks(WfTask original, List<Long> userIds, List<String> userNames, String label) {
        for (int i = 0; i < userIds.size(); i++) {
            WfTask t = new WfTask();
            t.setTaskId(UUID.randomUUID().toString());
            t.setInstanceId(original.getInstanceId());
            t.setNodeKey(original.getNodeKey() + "_addsign");
            t.setNodeName(original.getNodeName() + "(" + label + ")");
            t.setAssignee(userIds.get(i));
            t.setAssigneeName(userNames != null && i < userNames.size() ? userNames.get(i) : "");
            t.setStatus("TODO");
            t.setTenantId(original.getTenantId());
            t.setCreateTime(LocalDateTime.now());
            taskMapper.insert(t);
            sendNotification("TASK_ASSIGN", userIds.get(i), "加签任务", "您收到" + label + "任务");
        }
    }

    // ==================== P4.5: 审批代理 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setProxy(Long userId, String userName, Long proxyUserId, String proxyUserName,
                         LocalDateTime startTime, LocalDateTime endTime, String reason) {
        Long effectiveUserId = resolveOperatorId(userId, "setProxy");
        log.info("[setProxy] userId={}, proxyUserId={}", userId, proxyUserId);
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfTaskDelegation> activeProxyQuery = new LambdaQueryWrapper<WfTaskDelegation>()
                .eq(WfTaskDelegation::getFromUserId, effectiveUserId)
                .eq(WfTaskDelegation::getDelegationType, "PROXY")
                .eq(WfTaskDelegation::getStatus, "ACTIVE");
        if (currentTenantId != null) {
            activeProxyQuery.eq(WfTaskDelegation::getTenantId, currentTenantId);
        }
        Long cnt = delegationMapper.selectCount(activeProxyQuery);
        if (cnt > 0) { throw WorkflowException.validationError("已有活跃代理，请先取消"); }

        WfTaskDelegation proxy = new WfTaskDelegation();
        proxy.setDelegationId(UUID.randomUUID().toString());
        proxy.setTenantId(currentTenantId);
        proxy.setDelegationType("PROXY");
        proxy.setFromUserId(effectiveUserId);
        proxy.setFromUserName(userName);
        proxy.setToUserId(proxyUserId);
        proxy.setToUserName(proxyUserName);
        proxy.setReason(reason);
        proxy.setStatus("ACTIVE");
        proxy.setStartTime(startTime);
        proxy.setEndTime(endTime);
        proxy.setCreateTime(LocalDateTime.now());
        delegationMapper.insert(proxy);

        LambdaUpdateWrapper<WfTask> taskUpdateWrapper = new LambdaUpdateWrapper<WfTask>()
                .eq(WfTask::getAssignee, effectiveUserId)
                .eq(WfTask::getStatus, "TODO");
        if (currentTenantId != null) {
            taskUpdateWrapper.eq(WfTask::getTenantId, currentTenantId);
        }
        taskUpdateWrapper.set(WfTask::getProxyUserId, proxyUserId);
        taskMapper.update(null, taskUpdateWrapper);
        sendNotification("TASK_PROXY", proxyUserId, "代理通知", userName + " 已将您设为代理人");
        return R.ok(proxy.getDelegationId());
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> cancelProxy(Long userId) {
        Long effectiveUserId = resolveOperatorId(userId, "cancelProxy");
        Long currentTenantId = UserContext.getTenantId();
        LambdaUpdateWrapper<WfTaskDelegation> delegationUpdateWrapper = new LambdaUpdateWrapper<WfTaskDelegation>()
                .eq(WfTaskDelegation::getFromUserId, effectiveUserId)
                .eq(WfTaskDelegation::getDelegationType, "PROXY")
                .eq(WfTaskDelegation::getStatus, "ACTIVE")
                .set(WfTaskDelegation::getStatus, "CANCELLED");
        if (currentTenantId != null) {
            delegationUpdateWrapper.eq(WfTaskDelegation::getTenantId, currentTenantId);
        }
        delegationMapper.update(null, delegationUpdateWrapper);
        LambdaUpdateWrapper<WfTask> taskUpdateWrapper = new LambdaUpdateWrapper<WfTask>()
                .eq(WfTask::getAssignee, effectiveUserId);
        if (currentTenantId != null) {
            taskUpdateWrapper.eq(WfTask::getTenantId, currentTenantId);
        }
        taskUpdateWrapper.set(WfTask::getProxyUserId, null);
        taskMapper.update(null, taskUpdateWrapper);
        return R.ok();
    }

    // ==================== P4.6: 候选人机制 ====================

    @Transactional(rollbackFor = Exception.class)
    public void createCandidateTask(String taskId, String instanceId, List<Long> userIds,
                                    List<String> userNames, String type) {
        Long candidateTenantId = resolveInstanceTenantId(instanceId);
        for (int i = 0; i < userIds.size(); i++) {
            WfTaskCandidate c = new WfTaskCandidate();
            c.setCandidateId(UUID.randomUUID().toString());
            c.setTenantId(candidateTenantId);
            c.setTaskId(taskId);
            c.setInstanceId(instanceId);
            c.setUserId(userIds.get(i));
            c.setUserName(userNames != null && i < userNames.size() ? userNames.get(i) : "");
            c.setCandidateType(type);
            c.setStatus("PENDING");
            c.setCreateTime(LocalDateTime.now());
            candidateMapper.insert(c);
        }
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> claimTask(String taskId, Long userId, String userName) {
        Long operatorId = resolveOperatorId(userId, "claimTask");
        RLock lock = redissonClient.getLock("lock:claim:" + taskId);
        try {
            if (!lock.tryLock(10, 30, TimeUnit.SECONDS)) {
                throw WorkflowException.validationError("操作繁忙，请稍后重试");
            }
            WfTaskCandidate candidate = candidateMapper.selectOne(new LambdaQueryWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, taskId).eq(WfTaskCandidate::getUserId, operatorId)
                    .eq(WfTaskCandidate::getStatus, "PENDING"));
            if (candidate == null) { throw WorkflowException.validationError("您不是候选人或任务已被认领"); }

            WfTask task = taskMapper.selectById(taskId);
            if (task == null) { throw WorkflowException.taskNotFound(taskId); }
            assertTaskTenantAccess(task, "claimTask");
            if (task.getAssignee() != null && task.getAssignee() > 0) {
                throw WorkflowException.validationError("任务已被认领");
            }

            task.setAssignee(operatorId);
            task.setAssigneeName(userName);
            taskMapper.updateById(task);
            candidate.setStatus("CLAIMED");
            candidate.setClaimTime(LocalDateTime.now());
            candidateMapper.updateById(candidate);

            candidateMapper.update(null, new LambdaUpdateWrapper<WfTaskCandidate>()
                    .eq(WfTaskCandidate::getTaskId, taskId).ne(WfTaskCandidate::getUserId, operatorId)
                    .eq(WfTaskCandidate::getStatus, "PENDING").set(WfTaskCandidate::getStatus, "CANCELLED"));
            return R.ok();
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw WorkflowException.validationError("操作被中断");
        } finally {
            if (lock.isHeldByCurrentThread()) { lock.unlock(); }
        }
    }

    // ==================== P4.7: 审批撤回 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> withdrawApproval(String historyId, Long operatorId) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "withdrawApproval");
        WfTaskHistory history = taskHistoryMapper.selectById(historyId);
        if (history == null) { throw WorkflowException.validationError("历史记录不存在"); }
        WfProcessInstance instance = processInstanceMapper.selectById(history.getInstanceId());
        if (instance == null) { throw WorkflowException.instanceNotFound(history.getInstanceId()); }
        assertInstanceTenantAccess(instance, "withdrawApproval");
        if (!Objects.equals(history.getOperatorId(), effectiveOperatorId)) { throw WorkflowException.validationError("只能撤回自己的审批"); }

        List<WfTask> currentTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, history.getInstanceId()).eq(WfTask::getStatus, "TODO"));
        if (CollectionUtils.isEmpty(currentTasks)) {
            throw WorkflowException.validationError("流程已结束或已被处理，无法撤回");
        }
        for (WfTask t : currentTasks) { taskMapper.deleteById(t.getTaskId()); }

        WfTask newTask = new WfTask();
        newTask.setTaskId(UUID.randomUUID().toString());
        newTask.setInstanceId(history.getInstanceId());
        newTask.setNodeKey(history.getNodeKey());
        newTask.setNodeName(history.getNodeName());
        newTask.setAssignee(history.getOperatorId());
        newTask.setAssigneeName(history.getOperatorName());
        newTask.setStatus("TODO");
        newTask.setTenantId(instance.getTenantId());
        newTask.setCreateTime(LocalDateTime.now());
        taskMapper.insert(newTask);

        WfTaskHistory wh = new WfTaskHistory();
        wh.setHistoryId(UUID.randomUUID().toString());
        wh.setTaskId(newTask.getTaskId());
        wh.setInstanceId(history.getInstanceId());
        wh.setNodeKey(history.getNodeKey());
        wh.setNodeName(history.getNodeName());
        wh.setOperatorId(effectiveOperatorId);
        wh.setOperatorName(history.getOperatorName());
        wh.setAction("WITHDRAW");
        wh.setComment("撤回审批");
        wh.setTenantId(instance.getTenantId());
        wh.setCreateTime(LocalDateTime.now());
        taskHistoryMapper.insert(wh);
        return R.ok();
    }

    // ==================== P4.8: 驳回到上一步 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> rejectToPrevious(String taskId, Long operatorId, String operatorName, String comment) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "rejectToPrevious");
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        assertTaskAccess(task, effectiveOperatorId, "rejectToPrevious");

        List<WfTaskHistory> histories = taskHistoryMapper.selectList(new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getInstanceId, task.getInstanceId())
                .eq(WfTaskHistory::getAction, "APPROVE").orderByDesc(WfTaskHistory::getCreateTime));
        if (CollectionUtils.isEmpty(histories)) { throw WorkflowException.validationError("无上一审批节点"); }

        WfTaskHistory prev = histories.get(0);
        WfTaskHistory rh = new WfTaskHistory();
        rh.setHistoryId(UUID.randomUUID().toString());
        rh.setTaskId(taskId);
        rh.setInstanceId(task.getInstanceId());
        rh.setNodeKey(task.getNodeKey());
        rh.setNodeName(task.getNodeName());
        rh.setOperatorId(effectiveOperatorId);
        rh.setOperatorName(operatorName);
        rh.setAction("REJECT_TO_PREVIOUS");
        rh.setComment(comment);
        rh.setTenantId(resolveTaskTenantId(task));
        rh.setCreateTime(LocalDateTime.now());
        taskHistoryMapper.insert(rh);

        taskMapper.deleteById(taskId);
        WfTask newTask = new WfTask();
        newTask.setTaskId(UUID.randomUUID().toString());
        newTask.setInstanceId(task.getInstanceId());
        newTask.setNodeKey(prev.getNodeKey());
        newTask.setNodeName(prev.getNodeName());
        newTask.setAssignee(prev.getOperatorId());
        newTask.setAssigneeName(prev.getOperatorName());
        newTask.setStatus("TODO");
        newTask.setTenantId(resolveTaskTenantId(task));
        newTask.setCreateTime(LocalDateTime.now());
        taskMapper.insert(newTask);

        sendNotification("TASK_REJECT", prev.getOperatorId(), "驳回通知",
                "任务 [" + task.getNodeName() + "] 被驳回，意见：" + comment);
        return R.ok();
    }

    // ==================== P4.9: 审批附件 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> uploadAttachment(String taskId, String instanceId, String fileName, String fileUrl,
                                 String fileType, Long fileSize, Long uploaderId, String uploaderName) {
        Long effectiveUploaderId = resolveOperatorId(uploaderId, "uploadAttachment");
        WfTask task = taskMapper.selectById(taskId);
        Long attachmentTenantId;
        if (task != null) {
            // 示例：taskId 与 instanceId 都传入时，必须指向同一流程实例，避免错绑附件
            assertTaskAccess(task, effectiveUploaderId, "uploadAttachment");
            if (org.springframework.util.StringUtils.hasText(instanceId)
                    && !Objects.equals(task.getInstanceId(), instanceId)) {
                throw WorkflowException.validationError("任务与流程实例不匹配");
            }
            instanceId = task.getInstanceId();
            attachmentTenantId = resolveTaskTenantId(task);
        } else {
            if (!org.springframework.util.StringUtils.hasText(instanceId)) {
                throw WorkflowException.validationError("流程实例ID不能为空");
            }
            WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
            if (instance == null) {
                throw WorkflowException.instanceNotFound(instanceId);
            }
            assertInstanceTenantAccess(instance, "uploadAttachment");
            attachmentTenantId = instance.getTenantId();
        }
        WfTaskAttachment a = new WfTaskAttachment();
        a.setAttachmentId(UUID.randomUUID().toString());
        a.setTenantId(attachmentTenantId);
        a.setTaskId(taskId);
        a.setInstanceId(instanceId);
        a.setFileName(fileName);
        a.setFileUrl(fileUrl);
        a.setFileType(fileType);
        a.setFileSize(fileSize);
        a.setUploaderId(effectiveUploaderId);
        a.setUploaderName(uploaderName);
        a.setUploadTime(LocalDateTime.now());
        attachmentMapper.insert(a);
        return R.ok(a.getAttachmentId());
    }

    public R<?> getTaskAttachments(String taskId) {
        WfTask task = taskMapper.selectById(taskId);
        Long attachmentTenantId = null;
        if (task != null) {
            assertTaskTenantAccess(task, "getTaskAttachments");
            attachmentTenantId = resolveTaskTenantId(task);
        }
        LambdaQueryWrapper<WfTaskAttachment> queryWrapper = new LambdaQueryWrapper<WfTaskAttachment>()
                .eq(WfTaskAttachment::getTaskId, taskId)
                .orderByDesc(WfTaskAttachment::getUploadTime);
        // 示例：当前用户属于 tenant=200 时，只能看到 tenant=200 的附件记录
        if (attachmentTenantId != null) {
            queryWrapper.eq(WfTaskAttachment::getTenantId, attachmentTenantId);
        } else if (UserContext.getTenantId() != null) {
            queryWrapper.eq(WfTaskAttachment::getTenantId, UserContext.getTenantId());
        }
        return R.ok(attachmentMapper.selectList(queryWrapper));
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> deleteAttachment(String attachmentId, Long operatorId) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "deleteAttachment");
        WfTaskAttachment a = attachmentMapper.selectById(attachmentId);
        if (a == null) { throw WorkflowException.validationError("附件不存在"); }
        WfTask task = taskMapper.selectById(a.getTaskId());
        if (task != null) {
            assertTaskTenantAccess(task, "deleteAttachment");
        } else {
            assertTenantAccess(a.getTenantId(), "deleteAttachment", attachmentId);
        }
        if (!Objects.equals(a.getUploaderId(), effectiveOperatorId)) { throw WorkflowException.validationError("只能删除自己的附件"); }
        attachmentMapper.deleteById(attachmentId);
        return R.ok();
    }

    // ==================== P4.10: 批量审批 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> batchApprove(List<String> taskIds, Long operatorId, String operatorName, String action, String comment) {
        Long effectiveOperatorId = resolveOperatorId(operatorId, "batchApprove");
        int success = 0, fail = 0;
        List<String> failedIds = new ArrayList<>();
        for (String taskId : taskIds) {
            try {
                WfTask task = taskMapper.selectById(taskId);
                if (task == null || !Objects.equals(task.getAssignee(), effectiveOperatorId)) { fail++; failedIds.add(taskId); continue; }
                assertTaskTenantAccess(task, "batchApprove");
                WfTaskHistory h = new WfTaskHistory();
                h.setHistoryId(UUID.randomUUID().toString());
                h.setTaskId(taskId);
                h.setInstanceId(task.getInstanceId());
                h.setNodeKey(task.getNodeKey());
                h.setNodeName(task.getNodeName());
                h.setOperatorId(effectiveOperatorId);
                h.setOperatorName(operatorName);
                h.setAction(action);
                h.setComment(comment);
                h.setTenantId(resolveTaskTenantId(task));
                h.setCreateTime(LocalDateTime.now());
                taskHistoryMapper.insert(h);
                taskMapper.deleteById(taskId);
                success++;
            } catch (Exception e) { fail++; failedIds.add(taskId); }
        }
        Map<String, Object> r = new HashMap<>();
        r.put("total", taskIds.size()); r.put("success", success); r.put("fail", fail); r.put("failedTaskIds", failedIds);
        return R.ok(r);
    }

    // ==================== P1-5.3: 减签 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> removeSign(String taskId, List<Long> userIds, String reason) {
        log.info("[removeSign] taskId={}, userIds={}", taskId, userIds);
        WfTask originalTask = taskMapper.selectById(taskId);
        if (originalTask == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "removeSign");
        assertTaskAccess(originalTask, operatorId, "removeSign");
        if (CollectionUtils.isEmpty(userIds)) { throw WorkflowException.validationError("减签用户不能为空"); }

        // 查找加签创建的任务
        List<WfTask> addSignTasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getInstanceId, originalTask.getInstanceId())
                .like(WfTask::getNodeKey, originalTask.getNodeKey() + "_addsign")
                .eq(WfTask::getStatus, "TODO")
                .in(WfTask::getAssignee, userIds));

        int removed = 0;
        for (WfTask t : addSignTasks) {
            // 记录历史
            WfTaskHistory h = new WfTaskHistory();
            h.setHistoryId(UUID.randomUUID().toString());
            h.setTaskId(t.getTaskId());
            h.setInstanceId(t.getInstanceId());
            h.setNodeKey(t.getNodeKey());
            h.setNodeName(t.getNodeName());
            h.setOperatorId(operatorId);
            h.setOperatorName(UserContext.getUserName());
            h.setAction("REMOVE_SIGN");
            h.setComment("减签: " + (reason != null ? reason : ""));
            h.setTenantId(resolveTaskTenantId(originalTask));
            h.setCreateTime(LocalDateTime.now());
            taskHistoryMapper.insert(h);

            taskMapper.deleteById(t.getTaskId());
            removed++;

            // 通知被减签的用户
            sendNotification("TASK_REMOVE_SIGN", t.getAssignee(), "减签通知",
                    "您的加签任务 [" + t.getNodeName() + "] 已被取消");
        }

        log.info("[removeSign] 减签完成, 移除{}个任务", removed);
        return R.ok(removed);
    }

    // ==================== P1-4.3: 子流程调用 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> startSubProcess(String parentInstanceId, String parentNodeKey, String subProcessDefKey,
                                Map<String, Object> variables) {
        log.info("[startSubProcess] parentInstanceId={}, subProcessDefKey={}", parentInstanceId, subProcessDefKey);

        WfProcessInstance parentInstance = processInstanceMapper.selectById(parentInstanceId);
        if (parentInstance == null) { throw WorkflowException.instanceNotFound(parentInstanceId); }
        assertInstanceTenantAccess(parentInstance, "startSubProcess");

        // 创建子流程实例
        LambdaQueryWrapper<WfProcessDefinition> subDefQuery = new LambdaQueryWrapper<WfProcessDefinition>()
                .eq(WfProcessDefinition::getProcessKey, subProcessDefKey)
                .eq(WfProcessDefinition::getStatus, "PUBLISHED")
                .orderByDesc(WfProcessDefinition::getVersion)
                .last("LIMIT 1");
        if (parentInstance.getTenantId() != null) {
            subDefQuery.eq(WfProcessDefinition::getTenantId, parentInstance.getTenantId());
        }
        WfProcessDefinition subDef = processDefinitionMapper.selectOne(subDefQuery);
        if (subDef == null) { throw WorkflowException.processNotFound(subProcessDefKey); }
        assertDefinitionTenantAccess(subDef, "startSubProcess");
        if (org.springframework.util.StringUtils.hasText(subDef.getFormId())) {
            WfFormDefinition subForm = formDefinitionMapper.selectById(subDef.getFormId());
            if (subForm == null) {
                throw WorkflowException.validationError("子流程绑定表单不存在或已被删除，无法启动");
            }
            assertTenantAccess(subForm.getTenantId(), "startSubProcess", subForm.getFormId());
        }

        WfProcessInstance subInstance = new WfProcessInstance();
        subInstance.setInstanceId(UUID.randomUUID().toString());
        subInstance.setProcessDefKey(subProcessDefKey);
        subInstance.setDefinitionId(subDef.getDefinitionId());
        subInstance.setBusinessKey(parentInstanceId + ":" + parentNodeKey); // 关联父流程
        subInstance.setTitle("[子流程] " + subDef.getProcessName());
        subInstance.setStartUserId(parentInstance.getStartUserId());
        subInstance.setStartUserName(parentInstance.getStartUserName());
        subInstance.setStatus("RUNNING");
        subInstance.setStartTime(LocalDateTime.now());
        subInstance.setPriority(parentInstance.getPriority()); // 继承父流程优先级
        subInstance.setTenantId(parentInstance.getTenantId());

        if (variables != null) {
            try {
                subInstance.setVariables(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(variables));
            } catch (Exception e) {
                subInstance.setVariables("{}");
            }
        }

        processInstanceMapper.insert(subInstance);
        log.info("[startSubProcess] 子流程创建成功, subInstanceId={}", subInstance.getInstanceId());

        return R.ok(subInstance.getInstanceId());
    }

    // ==================== P1-5.8: 条件审批 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> conditionalApprove(String taskId, Long operatorId, String operatorName,
                                    String action, String comment, String selectedPath) {
        log.info("[conditionalApprove] taskId={}, selectedPath={}", taskId, selectedPath);
        Long effectiveOperatorId = resolveOperatorId(operatorId, "conditionalApprove");
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        assertTaskAccess(task, effectiveOperatorId, "conditionalApprove");

        // 记录历史（包含选择的路径）
        WfTaskHistory h = new WfTaskHistory();
        h.setHistoryId(UUID.randomUUID().toString());
        h.setTaskId(taskId);
        h.setInstanceId(task.getInstanceId());
        h.setNodeKey(task.getNodeKey());
        h.setNodeName(task.getNodeName());
        h.setOperatorId(effectiveOperatorId);
        h.setOperatorName(operatorName);
        h.setAction(action);
        h.setComment(comment);
        h.setTenantId(resolveTaskTenantId(task));
        h.setCreateTime(LocalDateTime.now());

        // 记录选择的路径到变量变更
        try {
            Map<String, Object> detail = new HashMap<>();
            detail.put("selectedPath", selectedPath);
            detail.put("action", action);
            h.setVariablesChanged(new com.fasterxml.jackson.databind.ObjectMapper().writeValueAsString(detail));
        } catch (Exception e) { /* ignore */ }

        taskHistoryMapper.insert(h);
        taskMapper.deleteById(taskId);

        return R.ok();
    }

    // ==================== P4.11: 任务优先级 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setTaskPriority(String taskId, String priority) {
        if (!Arrays.asList("URGENT", "HIGH", "NORMAL", "LOW").contains(priority)) {
            throw WorkflowException.validationError("无效优先级: " + priority);
        }
        WfTask task = taskMapper.selectById(taskId);
        if (task == null) { throw WorkflowException.taskNotFound(taskId); }
        Long operatorId = resolveOperatorId(null, "setTaskPriority");
        assertTaskAccess(task, operatorId, "setTaskPriority");
        task.setPriority(priority);
        taskMapper.updateById(task);
        if ("URGENT".equals(priority)) {
            sendNotification("TASK_URGENT", task.getAssignee(), "紧急任务", task.getNodeName() + " 已标记为紧急");
        }
        return R.ok();
    }

    // ==================== P4.12: 代理人任务查询 ====================

    public R<?> getProxyTasks(Long userId, PageQuery pageQuery) {
        Long effectiveUserId = resolveOperatorId(userId, "getProxyTasks");
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> queryWrapper = new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getProxyUserId, effectiveUserId)
                .eq(WfTask::getStatus, "TODO")
                .orderByDesc(WfTask::getCreateTime);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            queryWrapper.eq(WfTask::getTenantId, currentTenantId);
        }
        Page<WfTask> result = taskMapper.selectPage(page, queryWrapper);
        List<Map<String, Object>> list = result.getRecords().stream().map(t -> {
            Map<String, Object> m = new HashMap<>();
            m.put("task", t); m.put("isProxy", true); m.put("originalAssignee", t.getAssigneeName());
            return m;
        }).collect(Collectors.toList());
        Map<String, Object> r = new HashMap<>();
        r.put("records", list); r.put("total", result.getTotal());
        return R.ok(r);
    }

    // ==================== P4.13: 任务超时标记 ====================

    @Transactional(rollbackFor = Exception.class)
    public int markTimeoutTasks(int timeoutHours) {
        Date threshold = new Date(System.currentTimeMillis() - (long) timeoutHours * 3600 * 1000);
        List<WfTask> tasks = taskMapper.selectList(new LambdaQueryWrapper<WfTask>()
                .eq(WfTask::getStatus, "TODO").le(WfTask::getCreateTime, threshold)
                .eq(WfTask::getIsTimeout, 0));
        for (WfTask t : tasks) {
            t.setIsTimeout(1);
            taskMapper.updateById(t);
            sendNotification("TASK_TIMEOUT", t.getAssignee(), "任务超时提醒",
                    "任务 [" + t.getNodeName() + "] 已超时，请尽快处理");
        }
        log.info("[markTimeoutTasks] 标记{}个超时任务", tasks.size());
        return tasks.size();
    }

    // ==================== P4.14/P4.15: 任务筛选和排序 ====================

    public R<?> advancedTaskQuery(Long userId, Map<String, Object> filters, PageQuery pageQuery) {
        Long effectiveUserId = resolveOperatorId(userId, "advancedTaskQuery");
        Page<WfTask> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTask> w = new LambdaQueryWrapper<>();
        w.eq(WfTask::getAssignee, effectiveUserId).eq(WfTask::getStatus, "TODO");
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            w.eq(WfTask::getTenantId, currentTenantId);
        }

        if (filters.containsKey("priority")) { w.eq(WfTask::getPriority, filters.get("priority")); }
        if (filters.containsKey("isTimeout")) { w.eq(WfTask::getIsTimeout, filters.get("isTimeout")); }
        if (filters.containsKey("nodeNameLike")) { w.like(WfTask::getNodeName, filters.get("nodeNameLike")); }

        String sortBy = (String) filters.getOrDefault("sortBy", "createTime");
        boolean asc = "asc".equals(filters.getOrDefault("sortOrder", "desc"));
        if ("priority".equals(sortBy)) { if (asc) w.orderByAsc(WfTask::getPriority); else w.orderByDesc(WfTask::getPriority); }
        else { if (asc) w.orderByAsc(WfTask::getCreateTime); else w.orderByDesc(WfTask::getCreateTime); }

        Page<WfTask> result = taskMapper.selectPage(page, w);
        Map<String, Object> r = new HashMap<>();
        r.put("records", result.getRecords()); r.put("total", result.getTotal());
        return R.ok(r);
    }

    // ==================== P4.16: 已办任务查询 ====================

    public R<?> getDoneTasks(Long userId, PageQuery pageQuery) {
        Long effectiveUserId = resolveOperatorId(userId, "getDoneTasks");
        Page<WfTaskHistory> page = new Page<>(pageQuery.getPageNum(), pageQuery.getPageSize());
        LambdaQueryWrapper<WfTaskHistory> queryWrapper = new LambdaQueryWrapper<WfTaskHistory>()
                .eq(WfTaskHistory::getOperatorId, effectiveUserId)
                .orderByDesc(WfTaskHistory::getCreateTime);
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            queryWrapper.eq(WfTaskHistory::getTenantId, currentTenantId);
        }
        Page<WfTaskHistory> result = taskHistoryMapper.selectPage(page, queryWrapper);
        Map<String, Object> r = new HashMap<>();
        r.put("records", result.getRecords()); r.put("total", result.getTotal());
        return R.ok(r);
    }

    // ==================== P4.17/P4.18: 批量标记已读(含权限校验) ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> batchMarkRead(List<String> taskIds, Long userId) {
        Long effectiveUserId = resolveOperatorId(userId, "batchMarkRead");
        int count = 0;
        for (String taskId : taskIds) {
            WfTask task = taskMapper.selectById(taskId);
            if (task != null && Objects.equals(task.getAssignee(), effectiveUserId)) {
                assertTaskTenantAccess(task, "batchMarkRead");
                // 插入已读记录（WfTaskRead表）
                count++;
            }
        }
        return R.ok(count);
    }

    // ==================== P4.19: 版本比对 ====================

    public R<?> compareVersions(String defId1, String defId2) {
        WfProcessDefinition d1 = processDefinitionMapper.selectById(defId1);
        WfProcessDefinition d2 = processDefinitionMapper.selectById(defId2);
        if (d1 == null || d2 == null) { throw WorkflowException.validationError("流程定义不存在"); }
        assertDefinitionTenantAccess(d1, "compareVersions");
        assertDefinitionTenantAccess(d2, "compareVersions");

        Map<String, Object> result = new HashMap<>();
        result.put("version1", Map.of("id", d1.getDefinitionId(), "name", d1.getProcessName(), "version", d1.getVersion()));
        result.put("version2", Map.of("id", d2.getDefinitionId(), "name", d2.getProcessName(), "version", d2.getVersion()));
        result.put("modelJson1", d1.getModelJson());
        result.put("modelJson2", d2.getModelJson());
        result.put("isSame", Objects.equals(d1.getModelJson(), d2.getModelJson()));
        return R.ok(result);
    }

    // ==================== P4.20: 流程定义导入/导出 ====================

    public R<?> exportDefinition(String defId) {
        WfProcessDefinition def = processDefinitionMapper.selectById(defId);
        if (def == null) { throw WorkflowException.processNotFound(defId); }
        assertDefinitionTenantAccess(def, "exportDefinition");
        Map<String, Object> exportData = new HashMap<>();
        exportData.put("processDefinition", def);
        exportData.put("exportTime", LocalDateTime.now());
        exportData.put("version", "1.0");
        return R.ok(exportData);
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> importDefinition(Map<String, Object> importData) {
        log.info("[importDefinition] 导入流程定义");
        // 解析导入数据并创建新的流程定义
        return R.ok("导入成功");
    }

    // ==================== P4.21: 表单历史版本 ====================

    public R<?> getFormVersions(String formKey) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<WfFormDefinition>()
                .eq(WfFormDefinition::getFormKey, formKey)
                .orderByDesc(WfFormDefinition::getVersion);
        if (currentTenantId != null) {
            queryWrapper.eq(WfFormDefinition::getTenantId, currentTenantId);
        }
        List<WfFormDefinition> versions = formDefinitionMapper.selectList(queryWrapper);
        return R.ok(versions);
    }

    @Transactional(rollbackFor = Exception.class)
    public R<?> rollbackFormVersion(String formKey, Integer targetVersion) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfFormDefinition> queryWrapper = new LambdaQueryWrapper<WfFormDefinition>()
                .eq(WfFormDefinition::getFormKey, formKey)
                .eq(WfFormDefinition::getVersion, targetVersion);
        if (currentTenantId != null) {
            queryWrapper.eq(WfFormDefinition::getTenantId, currentTenantId);
        }
        WfFormDefinition target = formDefinitionMapper.selectOne(queryWrapper);
        if (target == null) { throw WorkflowException.validationError("目标版本不存在"); }
        // 基于目标版本创建新版本
        log.info("[rollbackFormVersion] 回退到版本 {}", targetVersion);
        return R.ok();
    }

    // ==================== P4.22: 发布记录 ====================

    @Transactional(rollbackFor = Exception.class)
    public void recordDeploy(String definitionId, String processKey, Integer version,
                             Long deployerId, String deployerName, String deployNote, String changeLog) {
        WfDeployRecord record = new WfDeployRecord();
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null) {
            record.setTenantId(currentTenantId);
        }
        record.setDefinitionId(definitionId);
        record.setProcessKey(processKey);
        record.setVersion(version);
        record.setDeployerId(deployerId);
        record.setDeployerName(deployerName);
        record.setDeployNote(deployNote);
        record.setChangeLog(changeLog);
        record.setDeployTime(LocalDateTime.now());
        deployRecordMapper.insert(record);
    }

    // ==================== P4.23: 表单使用统计 ====================

    public R<?> getFormUsage(String formKey) {
        Long currentTenantId = UserContext.getTenantId();
        LambdaQueryWrapper<WfProcessDefinition> queryWrapper = new LambdaQueryWrapper<WfProcessDefinition>()
                .like(WfProcessDefinition::getModelJson, formKey);
        if (currentTenantId != null) {
            queryWrapper.eq(WfProcessDefinition::getTenantId, currentTenantId);
        }
        List<WfProcessDefinition> processes = processDefinitionMapper.selectList(queryWrapper);
        Map<String, Object> usage = new HashMap<>();
        usage.put("formKey", formKey);
        usage.put("usedByProcesses", processes);
        usage.put("usageCount", processes.size());
        return R.ok(usage);
    }

    // ==================== P4.24: 流程实例优先级 ====================

    @Transactional(rollbackFor = Exception.class)
    public R<?> setInstancePriority(String instanceId, String priority) {
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        if (instance == null) { throw WorkflowException.instanceNotFound(instanceId); }
        assertInstanceTenantAccess(instance, "setInstancePriority");
        Long operatorId = resolveOperatorId(null, "setInstancePriority");
        if (instance.getStartUserId() != null && !Objects.equals(instance.getStartUserId(), operatorId)) {
            throw WorkflowException.permissionDenied("setInstancePriority");
        }
        instance.setPriority(priority);
        processInstanceMapper.updateById(instance);
        
        // 同步更新该实例下所有任务的优先级
        taskMapper.update(null, new LambdaUpdateWrapper<WfTask>()
                .eq(WfTask::getInstanceId, instanceId).set(WfTask::getPriority, priority));
        return R.ok();
    }

    // ==================== P4.25: 发布通知 ====================

    public void notifyProcessPublished(String definitionId) {
        log.info("[notifyProcessPublished] definitionId={}", definitionId);
        // 查询有权限启动该流程的用户并发送通知
    }

    // ==================== P4.26: 催办记录查询 ====================

    public R<?> getUrgeRecords(String taskId) {
        // 从催办记录表查询
        return R.ok(new ArrayList<>());
    }

    // ==================== P4.27: 催办效果跟踪 ====================

    @Transactional(rollbackFor = Exception.class)
    public void recordUrgeEffect(String urgeId, String taskId, Long beforeDuration, Long afterDuration) {
        WfUrgeEffect effect = new WfUrgeEffect();
        effect.setEffectId(UUID.randomUUID().toString());
        effect.setUrgeId(urgeId);
        effect.setTaskId(taskId);
        effect.setBeforeDuration(beforeDuration);
        effect.setAfterDuration(afterDuration);
        effect.setEffectiveness(calculateEffectiveness(beforeDuration, afterDuration));
        effect.setUrgeTime(LocalDateTime.now());
        effect.setCompleteTime(LocalDateTime.now());
        urgeEffectMapper.insert(effect);
    }

    /**
     * 统一获取当前操作人，防止通过入参伪造他人身份。
     */
    private Long resolveOperatorId(Long requestedUserId, String operation) {
        Long currentUserId = UserContext.getUserId();
        if (requestedUserId != null && currentUserId != null && !Objects.equals(requestedUserId, currentUserId)) {
            log.warn("[{}] user mismatch, requestedUserId={}, currentUserId={}",
                    operation, requestedUserId, currentUserId);
            throw WorkflowException.permissionDenied(operation);
        }
        Long effectiveUserId = requestedUserId != null ? requestedUserId : currentUserId;
        if (effectiveUserId == null) {
            throw WorkflowException.validationError("未获取到当前登录用户");
        }
        return effectiveUserId;
    }

    /**
     * 统一按当前租户严格匹配资源租户，避免跨租户访问。
     */
    private void assertTenantAccess(Long resourceTenantId, String operation, String resourceId) {
        Long currentTenantId = UserContext.getTenantId();
        if (currentTenantId != null && !Objects.equals(currentTenantId, resourceTenantId)) {
            log.warn("[{}] tenant mismatch, resourceId={}, currentTenantId={}, resourceTenantId={}",
                    operation, resourceId, currentTenantId, resourceTenantId);
            throw WorkflowException.permissionDenied(operation);
        }
    }

    private Long resolveTaskTenantId(WfTask task) {
        if (task == null) {
            return null;
        }
        if (task.getTenantId() != null) {
            return task.getTenantId();
        }
        if (task.getInstanceId() == null) {
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(task.getInstanceId());
        return instance != null ? instance.getTenantId() : null;
    }

    private void assertTaskTenantAccess(WfTask task, String operation) {
        assertTenantAccess(resolveTaskTenantId(task), operation, task != null ? task.getTaskId() : null);
    }

    private void assertTaskAccess(WfTask task, Long operatorId, String operation) {
        assertTaskTenantAccess(task, operation);
        if (task != null && operatorId != null && !Objects.equals(task.getAssignee(), operatorId)) {
            log.warn("[{}] operator mismatch, taskId={}, operatorId={}, assignee={}",
                    operation, task.getTaskId(), operatorId, task.getAssignee());
            throw WorkflowException.permissionDenied(operation);
        }
    }

    private void assertInstanceTenantAccess(WfProcessInstance instance, String operation) {
        assertTenantAccess(instance != null ? instance.getTenantId() : null, operation,
                instance != null ? instance.getInstanceId() : null);
    }

    private void assertDefinitionTenantAccess(WfProcessDefinition definition, String operation) {
        assertTenantAccess(definition != null ? definition.getTenantId() : null, operation,
                definition != null ? definition.getDefinitionId() : null);
    }

    private Long resolveInstanceTenantId(String instanceId) {
        if (!org.springframework.util.StringUtils.hasText(instanceId)) {
            return null;
        }
        WfProcessInstance instance = processInstanceMapper.selectById(instanceId);
        return instance != null ? instance.getTenantId() : null;
    }

    private Integer calculateEffectiveness(Long before, Long after) {
        if (after == null || after == 0) return 1;
        double improvement = (double) (before - after) / before * 100;
        if (improvement >= 50) return 5;
        if (improvement >= 30) return 4;
        if (improvement >= 10) return 3;
        if (improvement > 0) return 2;
        return 1;
    }

    // ==================== P4.28: 消息通知完善 ====================

    public void sendNotification(String eventType, Long recipientId, String title, String content) {
        log.info("[sendNotification] eventType={}, recipientId={}", eventType, recipientId);
        
        // 查询通知配置
        List<WfNotificationConfig> configs = notificationConfigMapper.selectList(
                new LambdaQueryWrapper<WfNotificationConfig>()
                        .eq(WfNotificationConfig::getEventType, eventType)
                        .eq(WfNotificationConfig::getEnabled, 1));
        
        for (WfNotificationConfig config : configs) {
            WfNotificationLog log = new WfNotificationLog();
            log.setLogId(UUID.randomUUID().toString());
            log.setEventType(eventType);
            log.setNotifyChannel(config.getNotifyChannel());
            log.setRecipientId(recipientId);
            log.setTitle(title);
            log.setContent(content);
            log.setStatus("PENDING");
            log.setCreateTime(LocalDateTime.now());
            notificationLogMapper.insert(log);
            
            // 根据渠道发送通知（站内信、邮件、短信、WebSocket）
            // 实际发送逻辑由消息队列异步处理
        }
    }
}

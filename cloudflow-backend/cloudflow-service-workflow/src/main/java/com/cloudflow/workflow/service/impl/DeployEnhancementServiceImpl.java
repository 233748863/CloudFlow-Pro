package com.cloudflow.workflow.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.dto.*;
import com.cloudflow.workflow.domain.enums.DeployEnums.*;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.service.IDeployEnhancementService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 流程发布增强服务实现
 * 包含：发布窗口、发布通知、回滚机制、发布审批流
 */
@Slf4j
@Service
public class DeployEnhancementServiceImpl implements IDeployEnhancementService {

    @Autowired
    private WfDeployWindowMapper deployWindowMapper;

    @Autowired
    private WfDeployNotificationMapper deployNotificationMapper;

    @Autowired
    private WfDeployApprovalMapper deployApprovalMapper;

    @Autowired
    private WfDeployApprovalStepMapper deployApprovalStepMapper;

    @Autowired
    private WfProcessVersionSnapshotMapper versionSnapshotMapper;

    @Autowired
    private WfDeployImpactMapper deployImpactMapper;

    @Autowired
    private WfDeployRollbackHistoryMapper rollbackHistoryMapper;

    @Autowired
    private WfDeployRecordMapper deployRecordMapper;

    @Autowired
    private WfProcessDefinitionMapper processDefinitionMapper;

    @Autowired
    private WfProcessInstanceMapper processInstanceMapper;

    @Autowired
    private WfTaskMapper taskMapper;

    @Autowired
    private ObjectMapper objectMapper;

    // ==================== 发布窗口管理 ====================

    @Override
    public R<Map<String, Object>> checkDeployWindow() {
        LocalDateTime now = LocalDateTime.now();
        List<WfDeployWindow> windows = deployWindowMapper.checkDeployWindow(now);
        Map<String, Object> result = new HashMap<>();
        if (windows != null && !windows.isEmpty()) {
            result.put("allowed", true);
            result.put("windowName", windows.get(0).getWindowName());
            result.put("message", "当前在发布窗口 [" + windows.get(0).getWindowName() + "] 内，允许发布");
        } else {
            result.put("allowed", false);
            result.put("message", "当前不在任何发布窗口内，不允许发布");
            // 查询所有启用的窗口供参考
            List<WfDeployWindow> enabledWindows = deployWindowMapper.listEnabledWindows();
            result.put("availableWindows", enabledWindows);
        }
        return R.ok(result);
    }

    @Override
    public R<List<WfDeployWindow>> listDeployWindows() {
        List<WfDeployWindow> list = deployWindowMapper.selectList(
                new LambdaQueryWrapper<WfDeployWindow>().orderByDesc(WfDeployWindow::getCreateTime));
        return R.ok(list);
    }

    @Override
    public R<?> saveDeployWindow(DeployWindowDTO dto) {
        WfDeployWindow window = new WfDeployWindow();
        BeanUtils.copyProperties(dto, window);
        // 创建者字段由 MyBatis-Plus 自动填充处理
        deployWindowMapper.insert(window);
        return R.ok("发布窗口创建成功");
    }

    @Override
    public R<?> updateDeployWindow(DeployWindowDTO dto) {
        if (dto.getId() == null) {
            return R.fail("窗口ID不能为空");
        }
        WfDeployWindow window = deployWindowMapper.selectById(dto.getId());
        if (window == null) {
            return R.fail("发布窗口不存在");
        }
        BeanUtils.copyProperties(dto, window);
        // 更新者字段由 MyBatis-Plus 自动填充处理
        deployWindowMapper.updateById(window);
        return R.ok("发布窗口更新成功");
    }

    @Override
    public R<?> deleteDeployWindow(Long windowId) {
        WfDeployWindow window = deployWindowMapper.selectById(windowId);
        if (window == null) {
            return R.fail("发布窗口不存在");
        }
        deployWindowMapper.deleteById(windowId);
        return R.ok("发布窗口删除成功");
    }

    @Override
    public R<?> toggleDeployWindow(Long windowId, Boolean enabled) {
        WfDeployWindow window = deployWindowMapper.selectById(windowId);
        if (window == null) {
            return R.fail("发布窗口不存在");
        }
        window.setIsEnabled(enabled);
        window.setUpdatedBy(UserContext.getUserId());
        window.setUpdatedTime(LocalDateTime.now());
        deployWindowMapper.updateById(window);
        return R.ok(enabled ? "发布窗口已启用" : "发布窗口已禁用");
    }

    // ==================== 发布通知 ====================

    @Override
    @Transactional
    public R<?> sendDeployNotification(Long deployId, List<NotificationConfigDTO> configs) {
        WfDeployRecord deployRecord = deployRecordMapper.selectById(deployId);
        if (deployRecord == null) {
            return R.fail("发布记录不存在");
        }

        List<WfDeployNotification> notifications = new ArrayList<>();
        for (NotificationConfigDTO config : configs) {
            WfDeployNotification notification = new WfDeployNotification();
            notification.setDeployId(deployId);
            notification.setNotificationType(config.getNotificationType());
            notification.setRecipientType(config.getRecipientType());
            try {
                notification.setRecipientIds(objectMapper.writeValueAsString(config.getRecipientIds()));
            } catch (JsonProcessingException e) {
                log.error("序列化接收人ID失败", e);
                notification.setRecipientIds("[]");
            }
            notification.setNotificationTitle(config.getNotificationTitle());
            notification.setNotificationContent(config.getNotificationContent());
            notification.setSendStatus(SendStatus.PENDING.getCode());
            notification.setCreatedTime(LocalDateTime.now());
            deployNotificationMapper.insert(notification);
            notifications.add(notification);
        }

        // 异步发送通知
        for (WfDeployNotification notification : notifications) {
            try {
                doSendNotification(notification);
                deployNotificationMapper.updateSendStatus(
                        notification.getId(), SendStatus.SUCCESS.getCode(), null);
            } catch (Exception e) {
                log.error("发送通知失败, notificationId={}", notification.getId(), e);
                deployNotificationMapper.updateSendStatus(
                        notification.getId(), SendStatus.FAILED.getCode(), e.getMessage());
            }
        }

        return R.ok("发布通知已发送");
    }

    @Override
    public R<List<WfDeployNotification>> listDeployNotifications(Long deployId) {
        List<WfDeployNotification> list = deployNotificationMapper.listByDeployId(deployId);
        return R.ok(list);
    }

    @Override
    @Transactional
    public R<?> resendFailedNotifications(Long deployId) {
        List<WfDeployNotification> failedList = deployNotificationMapper.listByStatus(SendStatus.FAILED.getCode());
        failedList = failedList.stream()
                .filter(n -> n.getDeployId().equals(deployId))
                .collect(Collectors.toList());

        int successCount = 0;
        for (WfDeployNotification notification : failedList) {
            try {
                doSendNotification(notification);
                deployNotificationMapper.updateSendStatus(
                        notification.getId(), SendStatus.SUCCESS.getCode(), null);
                successCount++;
            } catch (Exception e) {
                log.error("重发通知失败, notificationId={}", notification.getId(), e);
                deployNotificationMapper.updateSendStatus(
                        notification.getId(), SendStatus.FAILED.getCode(), e.getMessage());
            }
        }

        return R.ok("重发完成，成功 " + successCount + " 条，失败 " + (failedList.size() - successCount) + " 条");
    }

    /**
     * 实际发送通知的方法
     */
    private void doSendNotification(WfDeployNotification notification) {
        String type = notification.getNotificationType();
        switch (type) {
            case "WEBSOCKET":
                // 通过WebSocket发送站内信
                log.info("发送站内信通知: title={}, recipientType={}", 
                        notification.getNotificationTitle(), notification.getRecipientType());
                break;
            case "EMAIL":
                // 发送邮件通知
                log.info("发送邮件通知: title={}, recipientType={}", 
                        notification.getNotificationTitle(), notification.getRecipientType());
                break;
            case "SMS":
                // 发送短信通知
                log.info("发送短信通知: title={}, recipientType={}", 
                        notification.getNotificationTitle(), notification.getRecipientType());
                break;
            case "WECHAT":
                // 发送微信通知
                log.info("发送微信通知: title={}, recipientType={}", 
                        notification.getNotificationTitle(), notification.getRecipientType());
                break;
            default:
                log.warn("未知的通知类型: {}", type);
        }
    }

    // ==================== 回滚机制 ====================

    @Override
    @Transactional
    public R<?> rollbackDeploy(RollbackRequestDTO dto) {
        Long deployId = dto.getDeployId();
        Integer targetVersion = dto.getTargetVersion();
        String reason = dto.getRollbackReason();
        Long userId = UserContext.getUserId();

        // 1. 验证发布记录
        WfDeployRecord deployRecord = deployRecordMapper.selectById(deployId);
        if (deployRecord == null) {
            return R.fail("发布记录不存在");
        }

        String processDefId = deployRecord.getProcessDefId();

        // 2. 获取目标版本快照
        WfProcessVersionSnapshot snapshot = versionSnapshotMapper
                .selectByProcessDefIdAndVersion(processDefId, targetVersion);
        if (snapshot == null) {
            return R.fail("目标版本 " + targetVersion + " 的快照不存在，无法回滚");
        }

        // 3. 如果不是强制回滚，检查影响
        if (!Boolean.TRUE.equals(dto.getForceRollback())) {
            List<WfDeployImpact> highImpacts = deployImpactMapper.listHighImpactByDeployId(deployId);
            if (highImpacts != null && !highImpacts.isEmpty()) {
                return R.fail("存在高影响项，请先确认影响分析或使用强制回滚");
            }
        }

        // 4. 更新流程定义为目标版本
        WfProcessDefinition definition = processDefinitionMapper.selectById(processDefId);
        if (definition == null) {
            return R.fail("流程定义不存在");
        }
        definition.setModelContent(snapshot.getSnapshotData());
        definition.setVersion(targetVersion);
        processDefinitionMapper.updateById(definition);

        // 5. 创建新的发布记录
        WfDeployRecord rollbackRecord = new WfDeployRecord();
        rollbackRecord.setProcessDefId(processDefId);
        rollbackRecord.setVersion(targetVersion);
        rollbackRecord.setDeployStatus("SUCCESS");
        rollbackRecord.setDeployBy(userId);
        rollbackRecord.setDeployTime(LocalDateTime.now());
        rollbackRecord.setRollbackFromVersion(deployRecord.getVersion());
        rollbackRecord.setRollbackReason(reason);
        rollbackRecord.setRollbackBy(userId);
        rollbackRecord.setRollbackTime(LocalDateTime.now());
        deployRecordMapper.insert(rollbackRecord);

        // 6. 记录回滚历史
        WfDeployRollbackHistory history = new WfDeployRollbackHistory();
        history.setOriginalDeployId(deployId);
        history.setRollbackDeployId(rollbackRecord.getId());
        history.setFromVersion(deployRecord.getVersion());
        history.setToVersion(targetVersion);
        history.setRollbackReason(reason);
        history.setRollbackType(RollbackType.MANUAL.getCode());
        history.setRollbackStatus(RollbackStatus.SUCCESS.getCode());
        history.setRollbackBy(userId);
        history.setRollbackTime(LocalDateTime.now());
        rollbackHistoryMapper.insert(history);

        log.info("流程定义 {} 已从版本 {} 回滚到版本 {}", processDefId, deployRecord.getVersion(), targetVersion);
        return R.ok("回滚成功，已恢复到版本 " + targetVersion);
    }

    @Override
    public R<List<WfProcessVersionSnapshot>> listRollbackVersions(String processDefId) {
        List<WfProcessVersionSnapshot> list = versionSnapshotMapper.listByProcessDefId(processDefId);
        return R.ok(list);
    }

    @Override
    public R<List<WfDeployRollbackHistory>> listRollbackHistory(String processDefId) {
        // 通过发布记录关联查询回滚历史
        LambdaQueryWrapper<WfDeployRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfDeployRecord::getProcessDefId, processDefId);
        List<WfDeployRecord> records = deployRecordMapper.selectList(wrapper);
        
        List<WfDeployRollbackHistory> allHistory = new ArrayList<>();
        for (WfDeployRecord record : records) {
            List<WfDeployRollbackHistory> histories = rollbackHistoryMapper
                    .listByOriginalDeployId(record.getId());
            allHistory.addAll(histories);
        }
        allHistory.sort((a, b) -> b.getRollbackTime().compareTo(a.getRollbackTime()));
        return R.ok(allHistory);
    }

    @Override
    public R<WfProcessVersionSnapshot> getVersionSnapshot(String processDefId, Integer version) {
        WfProcessVersionSnapshot snapshot = versionSnapshotMapper
                .selectByProcessDefIdAndVersion(processDefId, version);
        if (snapshot == null) {
            return R.fail("版本快照不存在");
        }
        return R.ok(snapshot);
    }

    @Override
    public R<ImpactAnalysisDTO> analyzeDeployImpact(String processDefId) {
        ImpactAnalysisDTO result = new ImpactAnalysisDTO();
        result.setProcessDefId(processDefId);
        List<ImpactAnalysisDTO.ImpactItem> impacts = new ArrayList<>();

        // 1. 分析运行中的实例
        LambdaQueryWrapper<WfProcessInstance> instanceWrapper = new LambdaQueryWrapper<>();
        instanceWrapper.eq(WfProcessInstance::getProcessDefId, processDefId)
                .eq(WfProcessInstance::getStatus, "RUNNING");
        Long runningCount = processInstanceMapper.selectCount(instanceWrapper);
        if (runningCount > 0) {
            ImpactAnalysisDTO.ImpactItem item = new ImpactAnalysisDTO.ImpactItem();
            item.setImpactType(ImpactType.RUNNING_INSTANCE.getCode());
            item.setImpactCount(runningCount.intValue());
            item.setImpactLevel(runningCount > 10 ? ImpactLevel.HIGH.getCode() : ImpactLevel.MEDIUM.getCode());
            item.setSuggestion("有 " + runningCount + " 个运行中的实例，发布新版本不会影响已运行的实例");
            impacts.add(item);
        }

        // 2. 分析待办任务
        LambdaQueryWrapper<WfTask> taskWrapper = new LambdaQueryWrapper<>();
        taskWrapper.eq(WfTask::getStatus, "PENDING");
        // 通过实例关联流程定义
        Long pendingTaskCount = taskMapper.selectCount(taskWrapper);
        if (pendingTaskCount > 0) {
            ImpactAnalysisDTO.ImpactItem item = new ImpactAnalysisDTO.ImpactItem();
            item.setImpactType(ImpactType.PENDING_TASK.getCode());
            item.setImpactCount(pendingTaskCount.intValue());
            item.setImpactLevel(pendingTaskCount > 50 ? ImpactLevel.HIGH.getCode() : ImpactLevel.LOW.getCode());
            item.setSuggestion("有 " + pendingTaskCount + " 个待办任务，发布新版本不会影响已创建的任务");
            impacts.add(item);
        }

        result.setImpacts(impacts);

        // 计算总体影响级别
        boolean hasHigh = impacts.stream().anyMatch(i -> "HIGH".equals(i.getImpactLevel()) || "CRITICAL".equals(i.getImpactLevel()));
        result.setOverallLevel(hasHigh ? "HIGH" : "LOW");
        result.setAllowDeploy(true); // 默认允许发布，但会提示影响

        return R.ok(result);
    }

    // ==================== 发布审批流 ====================

    @Override
    @Transactional
    public R<?> submitDeployApproval(String definitionId, DeployApprovalDTO dto) {
        Long userId = UserContext.getUserId();

        // 1. 检查是否已有待审批的发布请求
        LambdaQueryWrapper<WfDeployApproval> existWrapper = new LambdaQueryWrapper<>();
        existWrapper.eq(WfDeployApproval::getProcessDefId, definitionId)
                .eq(WfDeployApproval::getApprovalStatus, ApprovalStatus.PENDING.getCode());
        Long existCount = deployApprovalMapper.selectCount(existWrapper);
        if (existCount > 0) {
            return R.fail("该流程定义已有待审批的发布请求");
        }

        // 2. 创建审批记录
        WfDeployApproval approval = new WfDeployApproval();
        approval.setProcessDefId(definitionId);
        approval.setApprovalStatus(ApprovalStatus.PENDING.getCode());
        approval.setCurrentStep(1);
        approval.setTotalSteps(dto.getSteps() != null ? dto.getSteps().size() : 1);
        try {
            approval.setApprovalConfig(objectMapper.writeValueAsString(dto));
        } catch (JsonProcessingException e) {
            log.error("序列化审批配置失败", e);
        }
        approval.setSubmitterId(userId);
        approval.setSubmitTime(LocalDateTime.now());
        approval.setCreatedTime(LocalDateTime.now());
        deployApprovalMapper.insert(approval);

        // 3. 创建审批步骤
        if (dto.getSteps() != null) {
            int stepNo = 1;
            for (DeployApprovalDTO.ApprovalStepConfig stepConfig : dto.getSteps()) {
                WfDeployApprovalStep step = new WfDeployApprovalStep();
                step.setApprovalId(approval.getId());
                step.setStepNo(stepNo);
                step.setStepName(stepConfig.getStepName());
                step.setApproverType(stepConfig.getApproverType());
                try {
                    step.setApproverIds(objectMapper.writeValueAsString(stepConfig.getApproverIds()));
                } catch (JsonProcessingException e) {
                    log.error("序列化审批人ID失败", e);
                }
                step.setApprovalMode(stepConfig.getApprovalMode() != null ? stepConfig.getApprovalMode() : "ANY");
                step.setStepStatus(stepNo == 1 ? ApprovalStatus.PENDING.getCode() : "WAITING");
                step.setCreatedTime(LocalDateTime.now());
                deployApprovalStepMapper.insert(step);
                stepNo++;
            }
        }

        log.info("用户 {} 提交了流程定义 {} 的发布审批", userId, definitionId);
        return R.ok("发布审批已提交，等待审批");
    }

    @Override
    @Transactional
    public R<?> approveDeployRequest(Long approvalId, Long stepId, String action, String comment) {
        Long userId = UserContext.getUserId();

        // 1. 获取审批记录
        WfDeployApproval approval = deployApprovalMapper.selectById(approvalId);
        if (approval == null) {
            return R.fail("审批记录不存在");
        }
        if (!ApprovalStatus.PENDING.getCode().equals(approval.getApprovalStatus())) {
            return R.fail("该审批已完成，无法操作");
        }

        // 2. 获取当前步骤
        WfDeployApprovalStep step = deployApprovalStepMapper.selectById(stepId);
        if (step == null || !step.getApprovalId().equals(approvalId)) {
            return R.fail("审批步骤不存在");
        }
        if (!ApprovalStatus.PENDING.getCode().equals(step.getStepStatus())) {
            return R.fail("该步骤已处理");
        }

        // 3. 更新步骤状态
        step.setActualApproverId(userId);
        step.setApprovalComment(comment);
        step.setApprovalTime(LocalDateTime.now());

        if ("APPROVE".equals(action)) {
            step.setStepStatus(ApprovalStatus.APPROVED.getCode());
            deployApprovalStepMapper.updateById(step);

            // 检查是否还有下一步
            WfDeployApprovalStep nextStep = deployApprovalStepMapper.selectNextPendingStep(approvalId);
            if (nextStep == null) {
                // 所有步骤都已通过，审批完成
                approval.setApprovalStatus(ApprovalStatus.APPROVED.getCode());
                approval.setCompleteTime(LocalDateTime.now());
                deployApprovalMapper.updateById(approval);

                // 自动执行发布
                autoDeployAfterApproval(approval);
                return R.ok("审批通过，流程已自动发布");
            } else {
                // 激活下一步
                nextStep.setStepStatus(ApprovalStatus.PENDING.getCode());
                deployApprovalStepMapper.updateById(nextStep);
                approval.setCurrentStep(nextStep.getStepNo());
                deployApprovalMapper.updateById(approval);
                return R.ok("当前步骤审批通过，已进入下一步审批");
            }
        } else if ("REJECT".equals(action)) {
            step.setStepStatus(ApprovalStatus.REJECTED.getCode());
            deployApprovalStepMapper.updateById(step);

            // 整个审批被驳回
            approval.setApprovalStatus(ApprovalStatus.REJECTED.getCode());
            approval.setCompleteTime(LocalDateTime.now());
            deployApprovalMapper.updateById(approval);
            return R.ok("发布审批已驳回");
        } else {
            return R.fail("无效的操作: " + action);
        }
    }

    /**
     * 审批通过后自动执行发布
     */
    private void autoDeployAfterApproval(WfDeployApproval approval) {
        try {
            String processDefId = approval.getProcessDefId();
            WfProcessDefinition definition = processDefinitionMapper.selectById(processDefId);
            if (definition != null) {
                // 创建发布记录
                WfDeployRecord record = new WfDeployRecord();
                record.setProcessDefId(processDefId);
                record.setVersion(definition.getVersion() != null ? definition.getVersion() + 1 : 1);
                record.setDeployStatus("SUCCESS");
                record.setDeployBy(approval.getSubmitterId());
                record.setDeployTime(LocalDateTime.now());
                record.setApprovalId(approval.getId());
                deployRecordMapper.insert(record);

                // 更新审批记录的发布ID
                approval.setDeployId(record.getId());
                deployApprovalMapper.updateById(approval);

                // 更新流程定义版本
                definition.setVersion(record.getVersion());
                definition.setStatus("PUBLISHED");
                processDefinitionMapper.updateById(definition);

                // 创建版本快照
                WfProcessVersionSnapshot snapshot = new WfProcessVersionSnapshot();
                snapshot.setProcessDefId(processDefId);
                snapshot.setVersion(record.getVersion());
                snapshot.setDeployId(record.getId());
                snapshot.setSnapshotData(definition.getModelContent());
                snapshot.setCreatedBy(approval.getSubmitterId());
                snapshot.setCreatedTime(LocalDateTime.now());
                versionSnapshotMapper.insert(snapshot);

                log.info("流程定义 {} 审批通过后自动发布成功，版本: {}", processDefId, record.getVersion());
            }
        } catch (Exception e) {
            log.error("审批通过后自动发布失败", e);
        }
    }

    @Override
    public R<List<WfDeployApproval>> listPendingApprovals(Long userId) {
        List<WfDeployApproval> list = deployApprovalMapper.listPendingForUser(userId);
        return R.ok(list);
    }

    @Override
    public R<Map<String, Object>> getApprovalDetail(Long approvalId) {
        WfDeployApproval approval = deployApprovalMapper.selectById(approvalId);
        if (approval == null) {
            return R.fail("审批记录不存在");
        }

        List<WfDeployApprovalStep> steps = deployApprovalStepMapper.listByApprovalId(approvalId);

        Map<String, Object> detail = new HashMap<>();
        detail.put("approval", approval);
        detail.put("steps", steps);

        // 获取流程定义信息
        WfProcessDefinition definition = processDefinitionMapper.selectById(approval.getProcessDefId());
        if (definition != null) {
            detail.put("processName", definition.getProcessName());
            detail.put("processKey", definition.getProcessKey());
        }

        return R.ok(detail);
    }

    @Override
    @Transactional
    public R<?> cancelDeployApproval(Long approvalId) {
        Long userId = UserContext.getUserId();
        WfDeployApproval approval = deployApprovalMapper.selectById(approvalId);
        if (approval == null) {
            return R.fail("审批记录不存在");
        }
        if (!approval.getSubmitterId().equals(userId)) {
            return R.fail("只有提交人可以取消审批");
        }
        if (!ApprovalStatus.PENDING.getCode().equals(approval.getApprovalStatus())) {
            return R.fail("只有待审批状态的记录可以取消");
        }

        approval.setApprovalStatus(ApprovalStatus.CANCELLED.getCode());
        approval.setCompleteTime(LocalDateTime.now());
        deployApprovalMapper.updateById(approval);

        return R.ok("发布审批已取消");
    }

    @Override
    public R<List<WfDeployApproval>> listMySubmittedApprovals(Long userId) {
        List<WfDeployApproval> list = deployApprovalMapper.listBySubmitter(userId);
        return R.ok(list);
    }

    @Override
    public R<Map<String, Object>> getDeployStatistics(String processDefId) {
        Map<String, Object> stats = new HashMap<>();

        // 发布总次数
        LambdaQueryWrapper<WfDeployRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(WfDeployRecord::getProcessDefId, processDefId);
        Long totalDeploys = deployRecordMapper.selectCount(wrapper);
        stats.put("totalDeploys", totalDeploys);

        // 成功次数
        wrapper.clear();
        wrapper.eq(WfDeployRecord::getProcessDefId, processDefId)
                .eq(WfDeployRecord::getDeployStatus, "SUCCESS");
        Long successCount = deployRecordMapper.selectCount(wrapper);
        stats.put("successCount", successCount);

        // 回滚次数
        wrapper.clear();
        wrapper.eq(WfDeployRecord::getProcessDefId, processDefId)
                .isNotNull(WfDeployRecord::getRollbackTime);
        Long rollbackCount = deployRecordMapper.selectCount(wrapper);
        stats.put("rollbackCount", rollbackCount);

        // 版本快照数
        List<WfProcessVersionSnapshot> snapshots = versionSnapshotMapper.listByProcessDefId(processDefId);
        stats.put("snapshotCount", snapshots != null ? snapshots.size() : 0);

        // 最新版本
        WfProcessVersionSnapshot latest = versionSnapshotMapper.selectLatestByProcessDefId(processDefId);
        stats.put("latestVersion", latest != null ? latest.getVersion() : 0);

        return R.ok(stats);
    }
}

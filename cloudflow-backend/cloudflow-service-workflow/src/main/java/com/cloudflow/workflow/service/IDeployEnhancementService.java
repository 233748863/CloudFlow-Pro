package com.cloudflow.workflow.service;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.workflow.domain.*;
import com.cloudflow.workflow.domain.dto.*;

import java.util.List;
import java.util.Map;

/**
 * 流程发布增强服务接口
 * 包含：发布窗口、发布通知、回滚机制、发布审批流
 */
public interface IDeployEnhancementService {

    // ==================== 发布窗口管理 ====================

    /**
     * 检查当前时间是否在发布窗口内
     */
    R<Map<String, Object>> checkDeployWindow();

    /**
     * 获取所有发布窗口配置
     */
    R<List<WfDeployWindow>> listDeployWindows();

    /**
     * 保存发布窗口配置
     */
    R<?> saveDeployWindow(DeployWindowDTO dto);

    /**
     * 更新发布窗口配置
     */
    R<?> updateDeployWindow(DeployWindowDTO dto);

    /**
     * 删除发布窗口配置
     */
    R<?> deleteDeployWindow(Long windowId);

    /**
     * 启用/禁用发布窗口
     */
    R<?> toggleDeployWindow(Long windowId, Boolean enabled);

    // ==================== 发布通知 ====================

    /**
     * 发送发布通知
     */
    R<?> sendDeployNotification(Long deployId, List<NotificationConfigDTO> configs);

    /**
     * 查询发布通知记录
     */
    R<List<WfDeployNotification>> listDeployNotifications(Long deployId);

    /**
     * 重发失败的通知
     */
    R<?> resendFailedNotifications(Long deployId);

    // ==================== 回滚机制 ====================

    /**
     * 执行版本回滚
     */
    R<?> rollbackDeploy(RollbackRequestDTO dto);

    /**
     * 获取可回滚的版本列表
     */
    R<List<WfProcessVersionSnapshot>> listRollbackVersions(String processDefId);

    /**
     * 查询回滚历史
     */
    R<List<WfDeployRollbackHistory>> listRollbackHistory(String processDefId);

    /**
     * 获取版本快照详情
     */
    R<WfProcessVersionSnapshot> getVersionSnapshot(String processDefId, Integer version);

    /**
     * 发布影响分析
     */
    R<ImpactAnalysisDTO> analyzeDeployImpact(String processDefId);

    // ==================== 发布审批流 ====================

    /**
     * 提交发布审批
     */
    R<?> submitDeployApproval(String definitionId, DeployApprovalDTO dto);

    /**
     * 审批发布请求
     */
    R<?> approveDeployRequest(Long approvalId, Long stepId, String action, String comment);

    /**
     * 查询待审批的发布请求
     */
    R<List<WfDeployApproval>> listPendingApprovals(Long userId);

    /**
     * 查询审批详情
     */
    R<Map<String, Object>> getApprovalDetail(Long approvalId);

    /**
     * 取消发布审批
     */
    R<?> cancelDeployApproval(Long approvalId);

    /**
     * 查询我提交的审批
     */
    R<List<WfDeployApproval>> listMySubmittedApprovals(Long userId);

    /**
     * 获取发布统计信息
     */
    R<Map<String, Object>> getDeployStatistics(String processDefId);
}

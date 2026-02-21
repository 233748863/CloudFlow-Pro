package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.WfAuditLog;
import com.cloudflow.workflow.domain.vo.NotificationRequest;
import com.cloudflow.workflow.event.WorkflowEvent;

/**
 * 异步工作流服务接口
 * 用于异步执行非核心操作，提升响应速度
 * 
 * @author CloudFlow Team
 * @since 2026-02-21
 */
public interface IAsyncWorkflowService {

    /**
     * 异步发送通知
     * 包括邮件、短信、站内信等
     * 
     * @param request 通知请求
     */
    void sendNotificationAsync(NotificationRequest request);

    /**
     * 异步记录审计日志
     * 
     * @param auditLog 审计日志
     */
    void recordAuditLogAsync(WfAuditLog auditLog);

    /**
     * 异步发布工作流事件
     * 
     * @param event 工作流事件
     */
    void publishEventAsync(WorkflowEvent event);

    /**
     * 异步生成流程快照
     * 
     * @param instanceId 流程实例ID
     */
    void generateSnapshotAsync(String instanceId);

    /**
     * 异步更新流程统计数据
     * 
     * @param instanceId 流程实例ID
     */
    void updateStatisticsAsync(String instanceId);
}

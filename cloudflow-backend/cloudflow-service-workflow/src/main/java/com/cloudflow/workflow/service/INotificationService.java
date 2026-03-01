package com.cloudflow.workflow.service;

/**
 * 通知服务接口
 * 用于发送各类业务通知（归档通知、审批通知等）
 * 支持多种通知渠道：站内信、邮件
 * 
 * @author CloudFlow Team
 * @since 2026-02-28
 */
public interface INotificationService {
    
    /**
     * 发送归档通知
     * 当流程被归档时，通知流程创建者
     * 
     * @param creatorId 流程创建者ID
     * @param workflowId 流程ID
     * @param workflowName 流程名称
     * @param archiveReason 归档原因
     * @param operatorName 操作人姓名
     */
    void sendArchiveNotification(Long creatorId, String workflowId, 
                                 String workflowName, String archiveReason, 
                                 String operatorName);
    
    /**
     * 发送流程恢复通知
     * 当归档的流程被恢复时，通知流程创建者
     * 
     * @param creatorId 流程创建者ID
     * @param workflowId 流程ID
     * @param workflowName 流程名称
     * @param operatorName 操作人姓名
     */
    void sendRestoreNotification(Long creatorId, String workflowId, 
                                String workflowName, String operatorName);
    
    /**
     * 发送版本回滚通知
     * 当流程版本被回滚时，通知流程创建者
     * 
     * @param creatorId 流程创建者ID
     * @param workflowId 流程ID
     * @param workflowName 流程名称
     * @param fromVersion 源版本号
     * @param toVersion 目标版本号
     * @param rollbackReason 回滚原因
     * @param operatorName 操作人姓名
     */
    void sendRollbackNotification(Long creatorId, String workflowId, 
                                  String workflowName, String fromVersion, 
                                  String toVersion, String rollbackReason, 
                                  String operatorName);
    
    /**
     * 发送通用通知
     * 
     * @param recipientId 接收者ID
     * @param title 通知标题
     * @param content 通知内容
     * @param eventType 事件类型
     */
    void sendNotification(Long recipientId, String title, String content, String eventType);
}

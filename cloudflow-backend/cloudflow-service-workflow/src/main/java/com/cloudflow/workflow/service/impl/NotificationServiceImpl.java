package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.workflow.service.INotificationService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 工作流通知服务，统一通过消息 SDK 写入 outbox。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationServiceImpl implements INotificationService {

    private final MessageSender messageSender;

    @Override
    public void sendArchiveNotification(Long creatorId, String workflowId, String workflowName,
                                        String archiveReason, String operatorName) {
        sendNotification(creatorId, "流程归档通知",
                String.format("您创建的流程「%s」已被管理员 %s 归档。\n归档原因：%s\n如需恢复，请联系管理员。",
                        workflowName, operatorName, archiveReason), "WORKFLOW_ARCHIVE");
    }

    @Override
    public void sendRestoreNotification(Long creatorId, String workflowId, String workflowName,
                                        String operatorName) {
        sendNotification(creatorId, "流程恢复通知",
                String.format("您创建的流程「%s」已被管理员 %s 从归档状态恢复，现在可以正常使用。",
                        workflowName, operatorName), "WORKFLOW_RESTORE");
    }

    @Override
    public void sendRollbackNotification(Long creatorId, String workflowId, String workflowName,
                                         String fromVersion, String toVersion, String rollbackReason,
                                         String operatorName) {
        sendNotification(creatorId, "流程版本回滚通知",
                String.format("您创建的流程「%s」已被管理员 %s 从版本 %s 回滚到版本 %s。\n回滚原因：%s",
                        workflowName, operatorName, fromVersion, toVersion, rollbackReason), "VERSION_ROLLBACK");
    }

    @Override
    public void sendNotification(Long recipientId, String title, String content, String eventType) {
        if (recipientId == null) {
            log.warn("工作流通知缺少接收人，已跳过");
            return;
        }
        try {
            messageSender.send(recipientId, title, content, "1", null, "系统");
        } catch (RuntimeException e) {
            log.warn("工作流通知提交失败，eventType={}, recipientId={}", eventType, recipientId, e);
        }
    }
}

package com.cloudflow.workflow.service;

import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageCategory;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.domain.WfTask;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 超时处理通知与对应数据库操作共同提交；重试使用同一消息身份。 */
@Component
@RequiredArgsConstructor
public class TaskTimeoutNotifications {
    private final MessageSender messageSender;

    public void completed(WfTask task, WfProcessInstance instance, String action) {
        String result = "REJECT".equals(action) ? "驳回" : "通过";
        send(task, instance, "automatic:" + action, "任务超时自动处理通知",
                "您的待办任务「" + task.getNodeName() + "」已超时，系统已自动" + result + "处理。",
                "流程「" + instance.getTitle() + "」中的任务「" + task.getNodeName() + "」已超时，系统已自动" + result + "。");
    }

    public void manual(WfTask task, WfProcessInstance instance) {
        send(task, instance, "manual", "超时任务自动处理失败",
                "您的待办任务「" + task.getNodeName() + "」超时后系统自动处理失败，请尽快人工处理。",
                "流程「" + instance.getTitle() + "」中的任务「" + task.getNodeName() + "」超时后系统自动处理失败，请联系处理人或管理员人工处理。");
    }

    private void send(WfTask task, WfProcessInstance instance, String kind, String title, String assigneeText, String initiatorText) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()) throw new IllegalStateException("超时通知必须在事务中登记");
        Long tenant = TenantContext.getTenantId();
        if (tenant == null || !Objects.equals(tenant, task.getTenantId()) || !Objects.equals(tenant, instance.getTenantId())) {
            throw new IllegalStateException("超时通知租户不一致");
        }
        if (task.getAssignee() != null) sendTo(task, instance, kind, task.getAssignee(), title, assigneeText);
        if (instance.getStartUserId() != null && !instance.getStartUserId().equals(task.getAssignee())) {
            sendTo(task, instance, kind, instance.getStartUserId(), title, initiatorText);
        }
    }

    private void sendTo(WfTask task, WfProcessInstance instance, String kind, Long user, String title, String content) {
        String reference = task.getTaskId() + ":" + task.getDueTime() + ":" + kind;
        messageSender.send(MessageSendRequest.builder().templateCode("WF_TASK_TIMEOUT")
                .channelTypes(List.of(MessageChannelType.INTERNAL)).category(MessageCategory.TODO)
                .receivers(List.of(MessageReceiver.ofUser(user)))
                .bizType("WF_TASK_TIMEOUT").bizId(reference).deduplicationKey("wf:task:timeout:" + reference + ":" + user)
                .params(Map.of("taskId", task.getTaskId(), "nodeName", Objects.toString(task.getNodeName(), "待办任务"),
                        "processTitle", Objects.toString(instance.getTitle(), "未知流程"), "title", title, "content", content))
                .title(title).content(content).build());
    }
}

package com.cloudflow.workflow.service;

import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfProcessInstance;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import java.util.List;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** 定时节点停止自动重试后的业务提醒，复用现有通知渠道及持久等待标记。 */
@Component
@RequiredArgsConstructor
public class TimerFailureNotifications {
    private final SysUserMapper users;
    private final MessageSender messages;

    public void send(WfProcessInstance instance, WorkflowWaitState.Pending pending) {
        Long tenantId = TenantContext.getTenantId();
        if (!TransactionSynchronizationManager.isActualTransactionActive() || tenantId == null
                || !Objects.equals(tenantId, instance.getTenantId())) {
            throw new IllegalStateException("定时失败提醒必须在当前租户事务中登记");
        }
        boolean initiatorIsAdmin = false;
        long afterUserId = 0;
        while (true) {
            List<Long> admins = users.selectTimerFailureAdminIds(tenantId, afterUserId, 500);
            for (Long admin : admins) {
                sendTo(instance, pending, admin, "【告警】定时节点处理失败",
                        "流程「" + instance.getTitle() + "」的定时节点「" + pending.nodeKey()
                                + "」多次处理失败，已停止自动重试，请查看定时任务日志并人工处理。");
                initiatorIsAdmin |= Objects.equals(admin, instance.getStartUserId());
            }
            if (admins.size() < 500) break;
            afterUserId = admins.get(admins.size() - 1);
        }
        if (!initiatorIsAdmin && instance.getStartUserId() != null) {
            sendTo(instance, pending, instance.getStartUserId(), "流程定时节点处理异常",
                    "您发起的流程「" + instance.getTitle() + "」中的定时节点多次处理失败，已停止自动重试，请联系管理员人工处理。");
        }
    }

    private void sendTo(WfProcessInstance instance, WorkflowWaitState.Pending pending,
                        Long userId, String title, String content) {
        String reference = instance.getInstanceId() + ":" + pending.waitId();
        messages.send(MessageSendRequest.legacy(userId, title, content, "2", 0L, "系统定时任务")
                .toBuilder().bizType("WF_TIMER_FAILURE").bizId(instance.getInstanceId())
                .deduplicationKey("wf:timer:failure:" + reference + ":" + userId).build());
    }
}

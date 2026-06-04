package com.cloudflow.workflow.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.service.ISysNoticeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

/**
 * 系统通知服务实现
 * 通过 WebSocket 实时推送通知，同时记录日志
 * 
 * @author CloudFlow
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SysNoticeServiceImpl implements ISysNoticeService {

    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;

    @Override
    @Async
    public void sendNotice(Long userId, String title, String content,
                          String type, Long senderId, String senderName) {
        if (userId == null) {
            log.warn("[sendNotice] 接收用户ID为空，跳过通知发送");
            return;
        }

        try {
            SystemNoticeDispatchEvent event = new SystemNoticeDispatchEvent();
            event.setTenantId(resolveTenantId());
            event.setRecipientId(userId);
            event.setTitle(title);
            event.setContent(content);
            event.setType(type);
            event.setSenderId(senderId);
            event.setSenderName(senderName);

            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventType("SYSTEM_NOTICE_DISPATCH")
                    .sourceModule("cloudflow-workflow")
                    .sourceId(userId)
                    .tenantId(event.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            log.warn("[sendNotice] 通知推送失败: userId={}, title={}, error={}",
                    userId, title, e.getMessage());
        }
    }

    private Long resolveTenantId() {
        Long tenantId = UserContext.getTenantId();
        return tenantId != null ? tenantId : TenantContext.getTenantId();
    }
}

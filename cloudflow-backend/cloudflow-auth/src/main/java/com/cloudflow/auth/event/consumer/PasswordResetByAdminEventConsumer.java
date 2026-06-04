package com.cloudflow.auth.event.consumer;

import com.cloudflow.common.core.event.PasswordResetByAdminEvent;
import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class PasswordResetByAdminEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OutboxPublisher outboxPublisher;

    @Override
    public String eventType() {
        return "PASSWORD_RESET_BY_ADMIN";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        PasswordResetByAdminEvent event = objectMapper.readValue(envelope.getPayload(), PasswordResetByAdminEvent.class);
        if (event.getUserId() == null) {
            log.warn("skip password reset notice, missing userId, eventId={}", envelope.getEventId());
            return;
        }

        SystemNoticeDispatchEvent noticeEvent = new SystemNoticeDispatchEvent();
        noticeEvent.setTenantId(event.getTenantId());
        noticeEvent.setRecipientId(event.getUserId());
        noticeEvent.setTitle("密码已被管理员重置");
        noticeEvent.setContent(buildContent(event));
        noticeEvent.setType("1");
        noticeEvent.setSenderId(event.getOperatorId());
        noticeEvent.setSenderName(event.getOperatorName());

        BusinessEventEnvelope noticeEnvelope = BusinessEventEnvelope.builder()
                .eventType("SYSTEM_NOTICE_DISPATCH")
                .sourceModule("cloudflow-auth")
                .sourceId(event.getUserId())
                .tenantId(event.getTenantId())
                .payload(objectMapper.writeValueAsString(noticeEvent))
                .build();
        outboxPublisher.publish(noticeEnvelope);
    }

    private String buildContent(PasswordResetByAdminEvent event) {
        String operatorName = event.getOperatorName() == null ? "system" : event.getOperatorName();
        String operatorIp = event.getOperatorIp() == null ? "unknown" : event.getOperatorIp();
        return "您的账号密码已被管理员重置。操作人：" + operatorName
                + "，操作IP：" + operatorIp
                + "。系统已强制您下次登录修改密码，如非本人知悉请立即联系管理员。";
    }
}

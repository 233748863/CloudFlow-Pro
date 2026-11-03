package com.cloudflow.auth.message;

import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.push.MessagePushGateway;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.util.UUID;

/** 将已确定归属的站内通知经 Outbox 交给 Workflow 的 WebSocket。 */
@Component
@Primary
@RequiredArgsConstructor
public class AuthMessagePushGateway implements MessagePushGateway {
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    @Override
    public void push(SystemNoticeCreatedEvent event) {
        if (event == null || event.getTenantId() == null || event.getTenantId() <= 0
                || event.getRecipientId() == null || event.getRecipientId() <= 0 || event.getNoticeId() == null) {
            throw new IllegalArgumentException("站内通知必须具有租户、接收人和消息编号");
        }
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("SYSTEM_NOTICE_CREATED")
                    .sourceModule(environment.getProperty("spring.application.name", "cloudflow-auth"))
                    .sourceId(event.getNoticeId())
                    .tenantId(event.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (JsonProcessingException exception) {
            throw new IllegalStateException("站内通知无法序列化", exception);
        }
    }
}

package com.cloudflow.auth.message;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.push.MessagePushGateway;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.core.env.Environment;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.UUID;

/**
 * auth 侧站内消息推送适配器。
 *
 * 消息记录由 auth 统一落库，而 WebSocket 连接在 workflow 服务；这里用既有
 * outbox 事件把实时推送安全地转发到 workflow，避免 auth 直接持有其他服务连接。
 */
@Component
@Primary
@RequiredArgsConstructor
public class AuthMessagePushGateway implements MessagePushGateway {
    private final OutboxPublisher outboxPublisher;
    private final ObjectMapper objectMapper;
    private final Environment environment;

    @Override
    public void push(Long userId, Map<String, Object> message) {
        if (userId == null || message == null) {
            return;
        }
        Object rawData = message.get("data");
        if (!(rawData instanceof Map<?, ?> data)) {
            return;
        }
        SystemNoticeCreatedEvent event = new SystemNoticeCreatedEvent();
        event.setNoticeId(toLong(data.get("recordId"), data.get("noticeId")));
        event.setTenantId(toLong(data.get("tenantId"), UserContext.getTenantId()));
        event.setRecipientId(userId);
        event.setSenderId(toLong(data.get("senderId"), null));
        event.setSenderName(toText(data.get("senderName")));
        event.setTitle(firstText(data.get("noticeTitle"), data.get("title")));
        event.setContent(firstText(data.get("noticeContent"), data.get("content")));
        event.setType(firstText(data.get("noticeType"), data.get("messageCategory")));
        event.setStatus("SUCCESS");
        event.setLinkUrl(toText(data.get("linkUrl")));
        event.setCreateTime(LocalDateTime.now());
        if (event.getNoticeId() == null) {
            return;
        }
        if (event.getTitle() == null) event.setTitle("新消息");
        if (event.getContent() == null) event.setContent("");
        try {
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType("SYSTEM_NOTICE_CREATED")
                    .sourceModule(environment.getProperty("spring.application.name", "cloudflow-auth"))
                    .sourceId(event.getNoticeId())
                    .tenantId(event.getTenantId() == null ? 100000L : event.getTenantId())
                    .payload(objectMapper.writeValueAsString(event))
                    .build();
            outboxPublisher.publish(envelope);
        } catch (Exception e) {
            throw new IllegalStateException("站内消息推送事件写入失败", e);
        }
    }

    private String firstText(Object first, Object second) {
        String value = toText(first);
        return value == null ? toText(second) : value;
    }

    private String toText(Object value) {
        if (value == null) return null;
        String text = String.valueOf(value);
        return text.isBlank() ? null : text;
    }

    private Long toLong(Object first, Object fallback) {
        Object value = first == null ? fallback : first;
        if (value == null) return null;
        if (value instanceof Number number) return number.longValue();
        try { return Long.valueOf(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return null; }
    }
}

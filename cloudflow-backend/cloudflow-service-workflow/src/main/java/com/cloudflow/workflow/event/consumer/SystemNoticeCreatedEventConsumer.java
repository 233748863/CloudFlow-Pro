package com.cloudflow.workflow.event.consumer;

import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.workflow.config.NotificationWebSocketHandler;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.HashMap;
import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class SystemNoticeCreatedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final NotificationWebSocketHandler notificationWebSocketHandler;

    @Override
    public String eventType() {
        return "SYSTEM_NOTICE_CREATED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        SystemNoticeCreatedEvent event = objectMapper.readValue(envelope.getPayload(), SystemNoticeCreatedEvent.class);
        if (event.getRecipientId() == null || event.getNoticeId() == null) {
            log.warn("skip system notice ws push, missing recipientId/noticeId, eventId={}", envelope.getEventId());
            return;
        }
        Map<String, Object> notice = new HashMap<>();
        notice.put("noticeId", event.getNoticeId());
        notice.put("noticeTitle", event.getTitle());
        notice.put("noticeContent", event.getContent());
        notice.put("noticeType", event.getType());
        notice.put("status", event.getStatus());
        notice.put("senderId", event.getSenderId());
        notice.put("recipientId", event.getRecipientId());
        notice.put("createBy", event.getSenderName());
        notice.put("createTime", event.getCreateTime());

        Map<String, Object> message = new HashMap<>();
        message.put("type", "NOTICE");
        message.put("data", notice);
        notificationWebSocketHandler.sendMessage(event.getRecipientId(), message);
    }
}

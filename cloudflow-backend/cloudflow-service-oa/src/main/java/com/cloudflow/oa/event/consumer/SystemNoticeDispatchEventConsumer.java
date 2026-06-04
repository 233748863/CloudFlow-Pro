package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.service.ISysNoticeService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SystemNoticeDispatchEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final ISysNoticeService sysNoticeService;

    @Override
    public String eventType() {
        return "SYSTEM_NOTICE_DISPATCH";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        SystemNoticeDispatchEvent event = objectMapper.readValue(
                envelope.getPayload(), SystemNoticeDispatchEvent.class);
        if (event.getRecipientId() == null) {
            log.warn("skip system notice dispatch, missing recipientId, eventId={}", envelope.getEventId());
            return;
        }
        sysNoticeService.sendNotice(
                event.getRecipientId(),
                event.getTitle(),
                event.getContent(),
                event.getType(),
                event.getSenderId(),
                event.getSenderName()
        );
    }
}

package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.service.impl.OaRfqMessageSourceService;
import com.cloudflow.oa.service.impl.OaMeetingReminderService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MessageDeliveryResultEventConsumer implements BusinessEventConsumer {
    private final OaRfqMessageSourceService sources;
    private final OaMeetingReminderService meetings;

    @Override
    public String eventType() { return "MESSAGE_DELIVERY_RESULT"; }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        sources.deliveryEvent(envelope);
        meetings.deliveryEvent(envelope);
    }
}

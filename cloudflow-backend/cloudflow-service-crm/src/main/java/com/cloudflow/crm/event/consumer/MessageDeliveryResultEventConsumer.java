package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.email.CrmEmailMessageSourceService;
import com.cloudflow.crm.service.email.archive.CrmEmailArchiveSource;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class MessageDeliveryResultEventConsumer implements BusinessEventConsumer {
    private final CrmEmailMessageSourceService sources;
    private final CrmEmailArchiveSource archive;

    @Override public String eventType() { return "MESSAGE_DELIVERY_RESULT"; }

    @Override public void consume(BusinessEventEnvelope envelope) throws Exception { sources.deliveryEvent(envelope); archive.deliveryEvent(envelope); }
}

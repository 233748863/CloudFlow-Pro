package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaSealRenewal;
import com.cloudflow.oa.event.SealRenewalSubmittedEvent;
import com.cloudflow.oa.service.impl.OaSealRenewalServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SealRenewalSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaSealRenewalServiceImpl sealRenewalService;

    @Override
    public String eventType() {
        return "SEAL_RENEWAL_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        SealRenewalSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), SealRenewalSubmittedEvent.class);
        OaSealRenewal renewal = sealRenewalService.getById(event.getRenewalId());
        if (renewal == null) {
            log.warn("skip seal renewal workflow start, renewal not found, renewalId={}, eventId={}", event.getRenewalId(), envelope.getEventId());
            return;
        }
        if (renewal.getInstanceId() != null && !renewal.getInstanceId().isBlank()) {
            log.info("skip seal renewal workflow start, instance already exists, renewalId={}, instanceId={}",
                    renewal.getId(), renewal.getInstanceId());
            return;
        }
        sealRenewalService.startRenewalWorkflow(renewal);
    }
}

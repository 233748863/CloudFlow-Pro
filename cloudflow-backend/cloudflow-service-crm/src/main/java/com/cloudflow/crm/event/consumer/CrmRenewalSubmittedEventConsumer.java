package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.domain.CrmRenewal;
import com.cloudflow.crm.event.CrmRenewalSubmittedEvent;
import com.cloudflow.crm.service.impl.CrmRenewalServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmRenewalSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final CrmRenewalServiceImpl renewalService;

    @Override
    public String eventType() {
        return "CRM_RENEWAL_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        CrmRenewalSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), CrmRenewalSubmittedEvent.class);
        CrmRenewal renewal = renewalService.getById(event.getRenewalId());
        if (renewal == null) {
            log.warn("skip crm renewal workflow start, renewal not found, renewalId={}, eventId={}",
                    event.getRenewalId(), envelope.getEventId());
            return;
        }
        if (renewal.getInstanceId() != null && !renewal.getInstanceId().isBlank()) {
            log.info("skip crm renewal workflow start, instance already exists, renewalId={}, instanceId={}",
                    renewal.getRenewalId(), renewal.getInstanceId());
            return;
        }
        renewalService.startRenewalWorkflow(renewal);
    }
}

package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaLicenseRenewal;
import com.cloudflow.oa.event.LicenseRenewalSubmittedEvent;
import com.cloudflow.oa.service.impl.OaLicenseRenewalServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class LicenseRenewalSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaLicenseRenewalServiceImpl licenseRenewalService;

    @Override
    public String eventType() {
        return "LICENSE_RENEWAL_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        LicenseRenewalSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), LicenseRenewalSubmittedEvent.class);
        OaLicenseRenewal renewal = licenseRenewalService.getById(event.getRenewalId());
        if (renewal == null) {
            log.warn("skip license renewal workflow start, renewal not found, renewalId={}, eventId={}", event.getRenewalId(), envelope.getEventId());
            return;
        }
        if (renewal.getInstanceId() != null && !renewal.getInstanceId().isBlank()) {
            log.info("skip license renewal workflow start, instance already exists, renewalId={}, instanceId={}",
                    renewal.getId(), renewal.getInstanceId());
            return;
        }
        licenseRenewalService.startRenewalWorkflow(renewal);
    }
}

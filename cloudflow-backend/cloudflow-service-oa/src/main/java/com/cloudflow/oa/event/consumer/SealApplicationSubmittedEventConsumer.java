package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.event.SealApplicationSubmittedEvent;
import com.cloudflow.oa.service.impl.OaSealApplicationServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class SealApplicationSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaSealApplicationServiceImpl sealApplicationService;

    @Override
    public String eventType() {
        return "SEAL_APPLICATION_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        SealApplicationSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), SealApplicationSubmittedEvent.class);
        OaSealApplication application = sealApplicationService.getById(event.getApplicationId());
        if (application == null) {
            log.warn("skip seal application workflow start, application not found, applicationId={}, eventId={}", event.getApplicationId(), envelope.getEventId());
            return;
        }
        if (application.getInstanceId() != null && !application.getInstanceId().isBlank()) {
            log.info("skip seal application workflow start, instance already exists, applicationId={}, instanceId={}",
                    application.getId(), application.getInstanceId());
            return;
        }
        sealApplicationService.startSealApplicationWorkflow(application);
    }
}

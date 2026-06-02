package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrWorkInjury;
import com.cloudflow.hr.event.HrWorkInjurySubmittedEvent;
import com.cloudflow.hr.mapper.HrWorkInjuryMapper;
import com.cloudflow.hr.service.impl.HrWorkInjuryServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrWorkInjurySubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrWorkInjuryMapper injuryMapper;
    private final HrWorkInjuryServiceImpl workInjuryService;

    @Override
    public String eventType() {
        return "HR_WORK_INJURY_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrWorkInjurySubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrWorkInjurySubmittedEvent.class);
        HrWorkInjury injury = injuryMapper.selectById(event.getInjuryId());
        if (injury == null) {
            log.warn("skip hr work injury workflow start, injury not found, injuryId={}, eventId={}", event.getInjuryId(), envelope.getEventId());
            return;
        }
        if (injury.getProcessInstanceId() != null && !injury.getProcessInstanceId().isBlank()) {
            log.info("skip hr work injury workflow start, instance already exists, injuryId={}, instanceId={}",
                    injury.getId(), injury.getProcessInstanceId());
            return;
        }
        workInjuryService.startWorkInjuryWorkflow(injury);
    }
}

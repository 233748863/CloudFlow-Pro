package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrTalentSuccessionPlan;
import com.cloudflow.hr.event.HrTalentSuccessionSubmittedEvent;
import com.cloudflow.hr.mapper.HrTalentSuccessionPlanMapper;
import com.cloudflow.hr.service.impl.HrTalentSuccessionServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrTalentSuccessionSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrTalentSuccessionPlanMapper planMapper;
    private final HrTalentSuccessionServiceImpl successionService;

    @Override
    public String eventType() {
        return "HR_TALENT_SUCCESSION_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrTalentSuccessionSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrTalentSuccessionSubmittedEvent.class);
        HrTalentSuccessionPlan plan = planMapper.selectById(event.getPlanId());
        if (plan == null) {
            log.warn("skip hr talent succession workflow start, plan not found, planId={}, eventId={}", event.getPlanId(), envelope.getEventId());
            return;
        }
        if (plan.getProcessInstanceId() != null && !plan.getProcessInstanceId().isBlank()) {
            log.info("skip hr talent succession workflow start, instance already exists, planId={}, instanceId={}",
                    plan.getId(), plan.getProcessInstanceId());
            return;
        }
        successionService.startTalentSuccessionWorkflow(plan);
    }
}

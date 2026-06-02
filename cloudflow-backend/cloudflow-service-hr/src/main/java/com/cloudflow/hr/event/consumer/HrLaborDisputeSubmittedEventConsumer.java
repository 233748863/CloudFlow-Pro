package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrLaborDispute;
import com.cloudflow.hr.event.HrLaborDisputeSubmittedEvent;
import com.cloudflow.hr.mapper.HrLaborDisputeMapper;
import com.cloudflow.hr.service.impl.HrLaborDisputeServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrLaborDisputeSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrLaborDisputeMapper disputeMapper;
    private final HrLaborDisputeServiceImpl laborDisputeService;

    @Override
    public String eventType() {
        return "HR_LABOR_DISPUTE_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrLaborDisputeSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrLaborDisputeSubmittedEvent.class);
        HrLaborDispute dispute = disputeMapper.selectById(event.getDisputeId());
        if (dispute == null) {
            log.warn("skip hr labor dispute workflow start, dispute not found, disputeId={}, eventId={}", event.getDisputeId(), envelope.getEventId());
            return;
        }
        if (dispute.getProcessInstanceId() != null && !dispute.getProcessInstanceId().isBlank()) {
            log.info("skip hr labor dispute workflow start, instance already exists, disputeId={}, instanceId={}",
                    dispute.getId(), dispute.getProcessInstanceId());
            return;
        }
        laborDisputeService.startLaborDisputeWorkflow(dispute);
    }
}

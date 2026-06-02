package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrBenefitRequest;
import com.cloudflow.hr.event.HrBenefitRequestSubmittedEvent;
import com.cloudflow.hr.mapper.HrBenefitRequestMapper;
import com.cloudflow.hr.service.impl.HrBenefitRequestServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrBenefitRequestSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrBenefitRequestMapper requestMapper;
    private final HrBenefitRequestServiceImpl benefitRequestService;

    @Override
    public String eventType() {
        return "HR_BENEFIT_REQUEST_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrBenefitRequestSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrBenefitRequestSubmittedEvent.class);
        HrBenefitRequest request = requestMapper.selectById(event.getRequestId());
        if (request == null) {
            log.warn("skip hr benefit workflow start, request not found, requestId={}, eventId={}", event.getRequestId(), envelope.getEventId());
            return;
        }
        if (request.getProcessInstanceId() != null && !request.getProcessInstanceId().isBlank()) {
            log.info("skip hr benefit workflow start, instance already exists, requestId={}, instanceId={}",
                    request.getId(), request.getProcessInstanceId());
            return;
        }
        benefitRequestService.startBenefitWorkflow(request);
    }
}

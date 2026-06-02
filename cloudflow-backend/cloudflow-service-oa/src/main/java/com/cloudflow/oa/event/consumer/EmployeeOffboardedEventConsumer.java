package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.event.EmployeeOffboardEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.service.impl.OaEmployeeOffboardService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EmployeeOffboardedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaEmployeeOffboardService oaEmployeeOffboardService;

    @Override
    public String eventType() {
        return "EMPLOYEE_OFFBOARDED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        EmployeeOffboardEvent event = objectMapper.readValue(envelope.getPayload(), EmployeeOffboardEvent.class);
        oaEmployeeOffboardService.cancelPendingDocumentsForEmployeeLeft(
                envelope.getTenantId(),
                event.getUserId(),
                envelope.getEventId());
    }
}

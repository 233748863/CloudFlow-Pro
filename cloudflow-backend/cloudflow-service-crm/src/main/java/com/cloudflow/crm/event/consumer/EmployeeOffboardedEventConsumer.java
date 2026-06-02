package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.core.event.EmployeeOffboardEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EmployeeOffboardedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final ICrmHandoverTaskService handoverTaskService;

    @Override
    public String eventType() {
        return "EMPLOYEE_OFFBOARDED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        EmployeeOffboardEvent event = objectMapper.readValue(envelope.getPayload(), EmployeeOffboardEvent.class);
        handoverTaskService.generateForEmployeeLeft(
                envelope.getTenantId(),
                event.getUserId(),
                event.getEmployeeName(),
                event.getDeptId(),
                envelope.getEventId(),
                event.getSuccessorUserId());
    }
}

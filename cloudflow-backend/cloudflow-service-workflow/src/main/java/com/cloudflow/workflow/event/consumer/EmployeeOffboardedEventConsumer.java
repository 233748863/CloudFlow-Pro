package com.cloudflow.workflow.event.consumer;

import com.cloudflow.common.core.event.EmployeeOffboardEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.workflow.service.impl.WfEmployeeOffboardTransferService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class EmployeeOffboardedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final WfEmployeeOffboardTransferService offboardTransferService;

    @Override
    public String eventType() {
        return "EMPLOYEE_OFFBOARDED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        EmployeeOffboardEvent event = objectMapper.readValue(envelope.getPayload(), EmployeeOffboardEvent.class);
        if (event.getUserId() == null) {
            return;
        }
        offboardTransferService.transferTodoTasksForEmployeeLeft(
                event.getUserId(),
                event.getEmployeeName(),
                event.getSuccessorUserId(),
                envelope.getEventId());
    }
}

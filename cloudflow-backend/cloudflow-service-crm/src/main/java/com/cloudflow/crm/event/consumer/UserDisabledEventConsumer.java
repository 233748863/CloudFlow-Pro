package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.core.event.UserDisabledEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.ICrmHandoverTaskService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserDisabledEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final ICrmHandoverTaskService handoverTaskService;

    @Override
    public String eventType() {
        return "USER_DISABLED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        UserDisabledEvent event = objectMapper.readValue(envelope.getPayload(), UserDisabledEvent.class);
        if (event.getUserId() == null) {
            return;
        }
        handoverTaskService.generateForEmployeeLeft(
                envelope.getTenantId(),
                event.getUserId(),
                event.getUserName(),
                event.getDeptId(),
                envelope.getEventId(),
                null);
    }
}

package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.core.event.UserDisabledEvent;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.service.impl.OaEmployeeOffboardService;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class UserDisabledEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaEmployeeOffboardService oaEmployeeOffboardService;

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
        oaEmployeeOffboardService.cancelPendingDocumentsForEmployeeLeft(
                envelope.getTenantId(),
                event.getUserId(),
                envelope.getEventId());
    }
}

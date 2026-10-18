package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.impl.CrmLeadScoreService;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.List;

@Component
@RequiredArgsConstructor
public class CrmLeadScoreEventConsumer implements BusinessEventConsumer {
    private final CrmLeadScoreService service;
    private final ObjectMapper json;
    @Override
    public String eventType() { return "CRM_LEAD_SCORE_RECALC"; }
    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        service.runBatch(json.readValue(envelope.getPayload(), new TypeReference<List<Long>>() { }));
    }
}

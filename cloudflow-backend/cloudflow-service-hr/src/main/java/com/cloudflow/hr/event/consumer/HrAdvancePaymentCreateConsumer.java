package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrAdvanceApplicationService;
import com.cloudflow.hr.service.HrAdvancePaymentService;
import com.cloudflow.hr.service.HrHSupport;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrAdvancePaymentCreateConsumer implements BusinessEventConsumer {
    private final HrAdvancePaymentService payments;
    private final ObjectMapper json;
    @Override public String eventType() { return HrAdvanceApplicationService.PAYMENT_CREATE; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception {
        JsonNode payload = json.readTree(envelope.getPayload());
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-hr".equals(envelope.getSourceModule())
                || !Objects.equals(envelope.getTenantId(), HrHSupport.number(payload.path("tenantId").asText()))
                || !Objects.equals(envelope.getSourceId(), HrHSupport.number(payload.path("requestId").asText()))) throw new IllegalArgumentException("借款付款通知来源无效");
        HrHSupport.runAsTenant(envelope.getTenantId(), () -> payments.create(envelope.getSourceId()));
    }
}

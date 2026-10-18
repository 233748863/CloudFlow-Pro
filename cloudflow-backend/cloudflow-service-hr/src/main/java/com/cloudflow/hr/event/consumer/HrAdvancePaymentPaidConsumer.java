package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrAdvancePaymentService;
import com.cloudflow.hr.service.HrHSupport;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrAdvancePaymentPaidConsumer implements BusinessEventConsumer {
    private final HrAdvancePaymentService payments;
    private final ObjectMapper json;
    @Override public String eventType() { return HrAdvancePaymentService.PAID_EVENT; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrAdvancePaymentService.Paid input = json.readValue(envelope.getPayload(), HrAdvancePaymentService.Paid.class);
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-oa".equals(envelope.getSourceModule())
                || !Objects.equals(envelope.getTenantId(), input.tenantId()) || !Objects.equals(envelope.getSourceId(), input.paymentId())
                || !Objects.equals(envelope.getEventId(), input.eventId())) throw new IllegalArgumentException("借款放款事件来源无效");
        HrHSupport.runAsTenant(envelope.getTenantId(), () -> payments.paid(input));
    }
}

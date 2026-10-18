package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementFundsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrSettlementPaymentPaidConsumer implements BusinessEventConsumer {
    private final HrSettlementFundsService funds;
    private final ObjectMapper json;
    @Override public String eventType() { return HrSettlementFundsService.PAID_EVENT; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrSettlementFundsService.Paid input = json.readValue(envelope.getPayload(), HrSettlementFundsService.Paid.class);
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-oa".equals(envelope.getSourceModule())
                || !Objects.equals(envelope.getTenantId(), input.tenantId()) || !Objects.equals(envelope.getSourceId(), input.paymentId())
                || !Objects.equals(envelope.getEventId(), input.eventId())) throw new IllegalArgumentException("结算付款事件来源无效");
        HrHSupport.runAsTenant(input.tenantId(), () -> funds.paid(input));
    }
}

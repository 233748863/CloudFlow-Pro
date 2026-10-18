package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrSettlementConfirmationService;
import com.cloudflow.hr.service.HrSettlementFundsService;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Objects;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrSettlementFundsRequestConsumer implements BusinessEventConsumer {
    private final HrSettlementFundsService funds;
    private final ObjectMapper json;
    @Override public String eventType() { return HrSettlementConfirmationService.FUNDS_REQUEST; }
    @Override public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrSettlementConfirmationService.Command input = json.readValue(envelope.getPayload(), HrSettlementConfirmationService.Command.class);
        if (!eventType().equals(envelope.getEventType()) || !"cloudflow-hr".equals(envelope.getSourceModule())
                || !Objects.equals(envelope.getTenantId(), input.tenantId()) || !Objects.equals(envelope.getSourceId(), input.settlementId())) throw new IllegalArgumentException("结算收付通知来源无效");
        HrHSupport.runAsTenant(input.tenantId(), () -> funds.processConfirmed(input.settlementId()));
    }
}

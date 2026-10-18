package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.deal.CrmCommissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CommissionProgressConsumer implements BusinessEventConsumer {
    private final CrmCommissionService commissions;
    @Override public String eventType() { return CommissionEvents.PROGRESS; }
    @Override public void consume(BusinessEventEnvelope envelope) { commissions.consume(envelope); }
}

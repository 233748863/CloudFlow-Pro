package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.commission.CommissionEvents;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.service.HrCommissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class HrCommissionRequestConsumer implements BusinessEventConsumer {
    private final HrCommissionService commissions;
    @Override public String eventType() { return CommissionEvents.REQUEST; }
    @Override public void consume(BusinessEventEnvelope envelope) { commissions.consume(envelope); }
}

package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.contract.ContractPerformanceSource;
import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.service.deal.CrmContractPerformanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ContractPerformanceEventConsumer implements BusinessEventConsumer {
    private final CrmContractPerformanceService performance;
    @Override public String eventType() { return ContractPerformanceSource.EVENT; }
    @Override public void consume(BusinessEventEnvelope envelope) { performance.consume(envelope); }
}

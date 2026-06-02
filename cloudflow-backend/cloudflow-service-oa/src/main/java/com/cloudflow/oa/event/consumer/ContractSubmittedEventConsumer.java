package com.cloudflow.oa.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.OaContract;
import com.cloudflow.oa.event.ContractSubmittedEvent;
import com.cloudflow.oa.service.impl.OaContractServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ContractSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final OaContractServiceImpl oaContractService;

    @Override
    public String eventType() {
        return "CONTRACT_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        ContractSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), ContractSubmittedEvent.class);
        OaContract contract = oaContractService.getById(event.getContractId());
        if (contract == null) {
            log.warn("skip contract workflow start, contract not found, contractId={}, eventId={}", event.getContractId(), envelope.getEventId());
            return;
        }
        if (contract.getInstanceId() != null && !contract.getInstanceId().isBlank()) {
            log.info("skip contract workflow start, instance already exists, contractId={}, instanceId={}", contract.getContractId(), contract.getInstanceId());
            return;
        }
        oaContractService.startContractWorkflow(contract);
    }
}

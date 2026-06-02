package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrContractSignature;
import com.cloudflow.hr.event.HrContractSignatureSubmittedEvent;
import com.cloudflow.hr.mapper.HrContractSignatureMapper;
import com.cloudflow.hr.service.impl.HrContractSignatureServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrContractSignatureSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrContractSignatureMapper signatureMapper;
    private final HrContractSignatureServiceImpl contractSignatureService;

    @Override
    public String eventType() {
        return "HR_CONTRACT_SIGNATURE_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrContractSignatureSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrContractSignatureSubmittedEvent.class);
        HrContractSignature signature = signatureMapper.selectById(event.getSignatureId());
        if (signature == null) {
            log.warn("skip hr contract signature workflow start, signature not found, signatureId={}, eventId={}", event.getSignatureId(), envelope.getEventId());
            return;
        }
        if (signature.getProcessInstanceId() != null && !signature.getProcessInstanceId().isBlank()) {
            log.info("skip hr contract signature workflow start, instance already exists, signatureId={}, instanceId={}",
                    signature.getId(), signature.getProcessInstanceId());
            return;
        }
        contractSignatureService.startContractSignatureWorkflow(signature);
    }
}

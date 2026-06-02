package com.cloudflow.hr.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.hr.domain.entity.HrCertificateRequest;
import com.cloudflow.hr.event.HrCertificateRequestSubmittedEvent;
import com.cloudflow.hr.mapper.HrCertificateRequestMapper;
import com.cloudflow.hr.service.impl.HrCertificateServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class HrCertificateRequestSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final HrCertificateRequestMapper requestMapper;
    private final HrCertificateServiceImpl certificateService;

    @Override
    public String eventType() {
        return "HR_CERTIFICATE_REQUEST_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        HrCertificateRequestSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), HrCertificateRequestSubmittedEvent.class);
        HrCertificateRequest request = requestMapper.selectById(event.getRequestId());
        if (request == null) {
            log.warn("skip hr certificate workflow start, request not found, requestId={}, eventId={}", event.getRequestId(), envelope.getEventId());
            return;
        }
        if (request.getProcessInstanceId() != null && !request.getProcessInstanceId().isBlank()) {
            log.info("skip hr certificate workflow start, instance already exists, requestId={}, instanceId={}",
                    request.getId(), request.getProcessInstanceId());
            return;
        }
        certificateService.startCertificateWorkflow(request);
    }
}

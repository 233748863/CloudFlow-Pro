package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.event.CrmApprovalSubmittedEvent;
import com.cloudflow.crm.service.impl.CrmApprovalServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmApprovalSubmittedEventConsumer implements BusinessEventConsumer {

    private final ObjectMapper objectMapper;
    private final CrmApprovalServiceImpl approvalService;

    @Override
    public String eventType() {
        return "CRM_APPROVAL_SUBMITTED";
    }

    @Override
    public void consume(BusinessEventEnvelope envelope) throws Exception {
        CrmApprovalSubmittedEvent event = objectMapper.readValue(envelope.getPayload(), CrmApprovalSubmittedEvent.class);
        CrmApproval approval = approvalService.getById(event.getApprovalId());
        if (approval == null) {
            log.warn("skip crm approval workflow start, approval not found, approvalId={}, eventId={}",
                    event.getApprovalId(), envelope.getEventId());
            return;
        }
        if (approval.getInstanceId() != null && !approval.getInstanceId().isBlank()) {
            log.info("skip crm approval workflow start, instance already exists, approvalId={}, instanceId={}",
                    approval.getApprovalId(), approval.getInstanceId());
            return;
        }
        approvalService.startWorkflow(approval, event.getProcessDefKey());
    }
}

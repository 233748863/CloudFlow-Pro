package com.cloudflow.crm.event.consumer;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.event.CrmApprovalSubmittedEvent;
import com.cloudflow.crm.service.impl.CrmApprovalServiceImpl;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmApprovalSubmittedEventConsumerTest {

    @Mock
    private CrmApprovalServiceImpl approvalService;

    private ObjectMapper objectMapper;
    private CrmApprovalSubmittedEventConsumer consumer;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().findAndRegisterModules();
        consumer = new CrmApprovalSubmittedEventConsumer(objectMapper, approvalService);
    }

    @Test
    void consume_startsWorkflowWhenApprovalExistsAndInstanceMissing() throws Exception {
        CrmApprovalSubmittedEvent event = new CrmApprovalSubmittedEvent();
        event.setApprovalId(9001L);
        event.setProcessDefKey("customer_claim_review");
        event.setSubmittedAt(LocalDateTime.now());

        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                .eventId("evt-001")
                .eventType("CRM_APPROVAL_SUBMITTED")
                .sourceModule("cloudflow-crm")
                .sourceId(9001L)
                .tenantId(100000L)
                .payload(objectMapper.writeValueAsString(event))
                .build();

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9001L);
        approval.setBusinessType("crm_customer_claim");
        when(approvalService.getById(9001L)).thenReturn(approval);

        consumer.consume(envelope);

        verify(approvalService).startWorkflow(approval, "customer_claim_review");
    }

    @Test
    void consume_skipsWhenInstanceAlreadyExists() throws Exception {
        CrmApprovalSubmittedEvent event = new CrmApprovalSubmittedEvent();
        event.setApprovalId(9002L);
        event.setProcessDefKey("crm_refund_review");
        event.setSubmittedAt(LocalDateTime.now());

        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                .eventId("evt-002")
                .eventType("CRM_APPROVAL_SUBMITTED")
                .sourceModule("cloudflow-crm")
                .sourceId(9002L)
                .tenantId(100000L)
                .payload(objectMapper.writeValueAsString(event))
                .build();

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9002L);
        approval.setInstanceId("wf-inst-001");
        when(approvalService.getById(9002L)).thenReturn(approval);

        consumer.consume(envelope);

        verify(approvalService, never()).startWorkflow(approval, "crm_refund_review");
    }
}

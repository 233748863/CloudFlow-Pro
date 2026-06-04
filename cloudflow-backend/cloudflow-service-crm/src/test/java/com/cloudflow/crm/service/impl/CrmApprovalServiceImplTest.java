package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.crm.constant.CrmBusinessTypes;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmApprovalServiceImplTest {

    @Mock
    private CrmApprovalMapper approvalMapper;

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmOpportunityMapper opportunityMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private RemoteWorkflowService remoteWorkflowService;

    @Mock
    private OutboxPublisher outboxPublisher;

    private ObjectMapper objectMapper;
    private CrmApprovalServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        UserContext.setDeptId(3001L);
        UserContext.setDeptName("销售一部");

        objectMapper = new ObjectMapper().findAndRegisterModules();
        service = new CrmApprovalServiceImpl(
                approvalMapper,
                customerMapper,
                opportunityMapper,
                receivableMapper,
                remoteWorkflowService,
                objectMapper,
                outboxPublisher
        );
        doAnswer(invocation -> {
            CrmApproval approval = invocation.getArgument(0);
            if (approval.getApprovalId() == null) {
                approval.setApprovalId(9001L);
            }
            return 1;
        }).when(approvalMapper).insert(any(CrmApproval.class));
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void submitCustomerClaim_insertsApprovalAndPublishesEvent() throws Exception {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setOwnerId(2100L);
        customer.setOwnerName("原负责人");
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);
        when(customerMapper.selectById(6001L)).thenReturn(customer);

        Long approvalId = service.submitCustomerClaim(6001L, "CLAIM", "领取客户");

        assertEquals(9001L, approvalId);

        ArgumentCaptor<CrmApproval> approvalCaptor = ArgumentCaptor.forClass(CrmApproval.class);
        verify(approvalMapper).insert(approvalCaptor.capture());
        CrmApproval approval = approvalCaptor.getValue();
        assertEquals(CrmBusinessTypes.CRM_CUSTOMER_CLAIM, approval.getBusinessType());
        assertEquals("CLAIM", approval.getActionType());
        assertEquals("CRM_CUSTOMER", approval.getBusinessRefType());
        assertEquals(6001L, approval.getBusinessRefId());
        assertEquals("景曜科技", approval.getBusinessRefName());
        assertEquals(100000L, approval.getTenantId());
        assertEquals(2001L, approval.getApplicantId());
        assertEquals("tester", approval.getApplicantName());
        assertEquals(3001L, approval.getDeptId());
        assertEquals("销售一部", approval.getDeptName());
        assertEquals(CrmConstants.QuoteStatus.PENDING, approval.getStatus());
        JsonNode payload = objectMapper.readTree(approval.getPayloadJson());
        assertEquals(6001L, payload.path("customerId").asLong());
        assertEquals(2100L, payload.path("currentOwnerId").asLong());
        assertEquals("CLAIM", payload.path("action").asText());

        ArgumentCaptor<BusinessEventEnvelope> envelopeCaptor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(envelopeCaptor.capture());
        BusinessEventEnvelope envelope = envelopeCaptor.getValue();
        assertEquals("CRM_APPROVAL_SUBMITTED", envelope.getEventType());
        assertEquals("cloudflow-crm", envelope.getSourceModule());
        assertEquals(9001L, envelope.getSourceId());
        assertEquals(100000L, envelope.getTenantId());
        JsonNode event = objectMapper.readTree(envelope.getPayload());
        assertEquals(9001L, event.path("approvalId").asLong());
        assertEquals("customer_claim_review", event.path("processDefKey").asText());
    }

    @Test
    void submitCustomerLevelChange_recordsTargetLevelAndPublishesEvent() throws Exception {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6002L);
        customer.setCustomerName("北辰制造");
        customer.setLevelCode("B");
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);
        when(customerMapper.selectById(6002L)).thenReturn(customer);

        Long approvalId = service.submitCustomerLevelChange(6002L, "LEVEL_UP", "A", "提级");

        assertEquals(9001L, approvalId);
        ArgumentCaptor<CrmApproval> approvalCaptor = ArgumentCaptor.forClass(CrmApproval.class);
        verify(approvalMapper).insert(approvalCaptor.capture());
        JsonNode payload = objectMapper.readTree(approvalCaptor.getValue().getPayloadJson());
        assertEquals("B", payload.path("currentLevel").asText());
        assertEquals("A", payload.path("targetLevel").asText());
        assertEquals("LEVEL_UP", payload.path("action").asText());

        ArgumentCaptor<BusinessEventEnvelope> envelopeCaptor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(envelopeCaptor.capture());
        assertEquals("customer_level_change", objectMapper.readTree(envelopeCaptor.getValue().getPayload()).path("processDefKey").asText());
    }

    @Test
    void submitOpportunityDowngrade_recordsTargetStageAndLostReason() throws Exception {
        CrmOpportunity opportunity = new CrmOpportunity();
        opportunity.setOpportunityId(7001L);
        opportunity.setOpportunityName("商机A");
        opportunity.setStage(CrmConstants.OpportunityStage.NEGOTIATION);
        opportunity.setDeleted(CrmConstants.DelFlag.NORMAL);
        when(opportunityMapper.selectById(7001L)).thenReturn(opportunity);

        Long approvalId = service.submitOpportunityDowngrade(7001L, "CLOSE", null, "竞争失败");

        assertEquals(9001L, approvalId);
        ArgumentCaptor<CrmApproval> approvalCaptor = ArgumentCaptor.forClass(CrmApproval.class);
        verify(approvalMapper).insert(approvalCaptor.capture());
        CrmApproval approval = approvalCaptor.getValue();
        assertEquals(CrmBusinessTypes.CRM_OPPORTUNITY_DOWNGRADE, approval.getBusinessType());
        JsonNode payload = objectMapper.readTree(approval.getPayloadJson());
        assertEquals(CrmConstants.OpportunityStage.NEGOTIATION, payload.path("currentStage").asText());
        assertEquals(CrmConstants.OpportunityStage.LOST, payload.path("targetStage").asText());
        assertEquals("竞争失败", payload.path("lostReason").asText());
        assertEquals("CLOSE", payload.path("action").asText());
    }

    @Test
    void submitRefund_recordsAmountsAndPublishesEvent() throws Exception {
        CrmReceivable receivable = new CrmReceivable();
        receivable.setReceivableId(6601L);
        receivable.setReceivableName("回款A");
        receivable.setCustomerId(6001L);
        receivable.setCustomerName("景曜科技");
        receivable.setContractId(8801L);
        receivable.setReceivedAmount(new BigDecimal("50000"));
        receivable.setDeleted(CrmConstants.DelFlag.NORMAL);
        when(receivableMapper.selectById(6601L)).thenReturn(receivable);

        Long approvalId = service.submitRefund(6601L, new BigDecimal("12000"), "多收退款");

        assertEquals(9001L, approvalId);
        ArgumentCaptor<CrmApproval> approvalCaptor = ArgumentCaptor.forClass(CrmApproval.class);
        verify(approvalMapper).insert(approvalCaptor.capture());
        CrmApproval approval = approvalCaptor.getValue();
        assertEquals(CrmBusinessTypes.CRM_REFUND, approval.getBusinessType());
        assertEquals("CRM_RECEIVABLE", approval.getBusinessRefType());
        JsonNode payload = objectMapper.readTree(approval.getPayloadJson());
        assertEquals(6601L, payload.path("receivableId").asLong());
        assertEquals(6001L, payload.path("customerId").asLong());
        assertEquals("景曜科技", payload.path("customerName").asText());
        assertTrue(payload.path("refundAmount").decimalValue().compareTo(new BigDecimal("12000")) == 0);
        assertTrue(payload.path("originalReceivedAmount").decimalValue().compareTo(new BigDecimal("50000")) == 0);

        ArgumentCaptor<BusinessEventEnvelope> envelopeCaptor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(envelopeCaptor.capture());
        assertEquals("crm_refund_review", objectMapper.readTree(envelopeCaptor.getValue().getPayload()).path("processDefKey").asText());
    }
}

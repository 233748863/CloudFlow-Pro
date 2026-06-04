package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmApproval;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmApprovalMapper;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Collection;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmApprovalHandlersTest {

    @Mock
    private CrmApprovalMapper approvalMapper;

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmOpportunityMapper opportunityMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper().findAndRegisterModules();
        MybatisConfiguration configuration = new MybatisConfiguration();
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(configuration, "");
        assistant.setCurrentNamespace("crmApprovalHandlersTest");
        TableInfoHelper.initTableInfo(assistant, CrmCustomer.class);
        TableInfoHelper.initTableInfo(assistant, CrmOpportunity.class);
        TableInfoHelper.initTableInfo(assistant, CrmReceivable.class);
    }

    @Test
    void customerClaimApproved_updatesOwnerRefreshesHealthAndPublishesOwnerChangedEvent() throws Exception {
        CrmCustomerClaimApprovalHandler handler = new CrmCustomerClaimApprovalHandler(
                approvalMapper, objectMapper, customerMapper, crmCustomerService, crmEventPublisher);

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9001L);
        approval.setApprovalNo("CLM-001");
        approval.setTenantId(100000L);
        approval.setApplicantId(2001L);
        approval.setApplicantName("tester");
        approval.setDeptId(3001L);
        approval.setDeptName("销售一部");
        approval.setDeleted(CrmConstants.DelFlag.NORMAL);
        approval.setPayloadJson(objectMapper.writeValueAsString(Map.of(
                "customerId", 6001L,
                "action", "CLAIM"
        )));

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setTenantId(100000L);
        customer.setOwnerId(2100L);
        customer.setOwnerName("原负责人");

        when(approvalMapper.selectById(9001L)).thenReturn(approval);
        when(customerMapper.selectById(6001L)).thenReturn(customer);

        handler.handleApproved(approvalDto(9001L, "wf-inst-001"));

        ArgumentCaptor<CrmApproval> approvalCaptor = ArgumentCaptor.forClass(CrmApproval.class);
        verify(approvalMapper).updateById(approvalCaptor.capture());
        assertEquals("APPROVED", approvalCaptor.getValue().getStatus());
        assertEquals("wf-inst-001", approvalCaptor.getValue().getInstanceId());

        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(customerMapper).update(isNull(), wrapperCaptor.capture());
        Collection<Object> values = wrapperCaptor.getValue().getParamNameValuePairs().values();
        assertTrue(values.contains(2001L));
        assertTrue(values.contains("tester"));
        assertTrue(values.contains(3001L));
        assertTrue(values.contains("销售一部"));
        assertTrue(values.contains(CrmConstants.CustomerStatus.ACTIVE));

        verify(crmCustomerService).refreshHealth(6001L);
        ArgumentCaptor<Map<String, Object>> fieldsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(crmEventPublisher).publish(
                org.mockito.ArgumentMatchers.eq(CrmEventStreamConstants.EVENT_CUSTOMER_OWNER_CHANGED),
                org.mockito.ArgumentMatchers.eq(100000L),
                fieldsCaptor.capture());
        assertEquals(6001L, fieldsCaptor.getValue().get("customerId"));
        assertEquals(2100L, fieldsCaptor.getValue().get("fromOwnerId"));
        assertEquals(2001L, fieldsCaptor.getValue().get("toOwnerId"));
    }

    @Test
    void customerLevelApproved_updatesLevelAndRefreshesHealth() throws Exception {
        CrmCustomerLevelApprovalHandler handler = new CrmCustomerLevelApprovalHandler(
                approvalMapper, objectMapper, customerMapper, crmCustomerService);

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9002L);
        approval.setDeleted(CrmConstants.DelFlag.NORMAL);
        approval.setPayloadJson(objectMapper.writeValueAsString(Map.of(
                "customerId", 6002L,
                "targetLevel", "A"
        )));

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6002L);
        when(customerMapper.selectById(6002L)).thenReturn(customer);
        when(approvalMapper.selectById(9002L)).thenReturn(approval);

        handler.handleApproved(approvalDto(9002L, "wf-inst-002"));

        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(customerMapper).update(isNull(), wrapperCaptor.capture());
        Collection<Object> values = wrapperCaptor.getValue().getParamNameValuePairs().values();
        assertTrue(values.contains("A"));
        verify(crmCustomerService).refreshHealth(6002L);
    }

    @Test
    void opportunityDowngradeApproved_updatesStageStatusAndRefreshesHealth() throws Exception {
        CrmOpportunityDowngradeApprovalHandler handler = new CrmOpportunityDowngradeApprovalHandler(
                approvalMapper, objectMapper, opportunityMapper, crmCustomerService);

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9003L);
        approval.setDeleted(CrmConstants.DelFlag.NORMAL);
        approval.setPayloadJson(objectMapper.writeValueAsString(Map.of(
                "opportunityId", 7001L,
                "targetStage", CrmConstants.OpportunityStage.LOST,
                "lostReason", "竞争失败",
                "action", "CLOSE"
        )));

        CrmOpportunity opportunity = new CrmOpportunity();
        opportunity.setOpportunityId(7001L);
        opportunity.setCustomerId(6001L);
        when(approvalMapper.selectById(9003L)).thenReturn(approval);
        when(opportunityMapper.selectById(7001L)).thenReturn(opportunity);

        handler.handleApproved(approvalDto(9003L, "wf-inst-003"));

        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(opportunityMapper).update(isNull(), wrapperCaptor.capture());
        Collection<Object> values = wrapperCaptor.getValue().getParamNameValuePairs().values();
        assertTrue(values.contains(CrmConstants.OpportunityStage.LOST));
        assertTrue(values.contains(CrmConstants.OpportunityStatus.CLOSED));
        assertTrue(values.contains("竞争失败"));
        verify(crmCustomerService).refreshHealth(6001L);
    }

    @Test
    void refundApproved_updatesReceivableAmountsStatusAndRefreshesHealth() throws Exception {
        CrmRefundApprovalHandler handler = new CrmRefundApprovalHandler(
                approvalMapper, objectMapper, receivableMapper, crmCustomerService);

        CrmApproval approval = new CrmApproval();
        approval.setApprovalId(9004L);
        approval.setApprovalNo("RFD-001");
        approval.setDeleted(CrmConstants.DelFlag.NORMAL);
        approval.setPayloadJson(objectMapper.writeValueAsString(Map.of(
                "receivableId", 6601L,
                "refundAmount", new BigDecimal("12000")
        )));

        CrmReceivable receivable = new CrmReceivable();
        receivable.setReceivableId(6601L);
        receivable.setCustomerId(6001L);
        receivable.setDeleted(CrmConstants.DelFlag.NORMAL);
        receivable.setPlannedAmount(new BigDecimal("50000"));
        receivable.setReceivedAmount(new BigDecimal("30000"));
        receivable.setRemark("原始备注");
        when(approvalMapper.selectById(9004L)).thenReturn(approval);
        when(receivableMapper.selectById(6601L)).thenReturn(receivable);

        handler.handleApproved(approvalDto(9004L, "wf-inst-004"));

        ArgumentCaptor<LambdaUpdateWrapper> wrapperCaptor = ArgumentCaptor.forClass(LambdaUpdateWrapper.class);
        verify(receivableMapper).update(isNull(), wrapperCaptor.capture());
        Collection<Object> values = wrapperCaptor.getValue().getParamNameValuePairs().values();
        assertTrue(values.contains(new BigDecimal("18000")));
        assertTrue(values.contains(new BigDecimal("32000")));
        assertTrue(values.contains(CrmConstants.ReceivableStatus.PARTIAL_RECEIVED));
        assertTrue(values.stream().anyMatch(value -> String.valueOf(value).contains("RFD-001")));
        verify(crmCustomerService).refreshHealth(6001L);
    }

    private ApprovalResultDTO approvalDto(Long businessId, String instanceId) {
        ApprovalResultDTO dto = new ApprovalResultDTO();
        dto.setBusinessId(businessId);
        dto.setProcessInstanceId(instanceId);
        dto.setApprovalComment("ok");
        return dto;
    }
}

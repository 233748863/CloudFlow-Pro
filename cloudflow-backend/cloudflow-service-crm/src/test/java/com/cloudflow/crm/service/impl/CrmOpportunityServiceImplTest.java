package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmOpportunity;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.domain.vo.HrEmployeeSummaryVO;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.remote.RemoteHrService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmOpportunityServiceImplTest {

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private CrmQuoteMapper quoteMapper;

    @Mock
    private RemoteOaService remoteOaService;

    @Mock
    private RemoteHrService remoteHrService;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    @Mock
    private CrmOpportunityMapper crmOpportunityMapper;

    private CrmOpportunityServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        TenantContext.setTenantId(100000L);
        service = spy(new CrmOpportunityServiceImpl(
                crmCustomerService,
                quoteMapper,
                remoteOaService,
                remoteHrService,
                crmEventPublisher
        ));
        ReflectionTestUtils.setField(service, "baseMapper", crmOpportunityMapper);
    }

    @org.junit.jupiter.api.AfterEach
    void tearDown() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void updateStage_won_updatesStatusPublishesEventAndRefreshesHealth() {
        CrmOpportunity opportunity = buildOpportunity();
        opportunity.setStage(CrmConstants.OpportunityStage.NEGOTIATION);
        CrmQuote acceptedQuote = new CrmQuote();
        acceptedQuote.setQuoteId(8101L);
        acceptedQuote.setQuoteNo("BJ-2026-001");
        acceptedQuote.setQuoteName("报价A");
        acceptedQuote.setCurrency("USD");
        acceptedQuote.setTotalAmount(new BigDecimal("168000"));

        doReturn(opportunity).when(service).getAccessibleOpportunity(7001L);
        doReturn(true).when(service).updateById(any(CrmOpportunity.class));
        when(quoteMapper.selectList(any())).thenReturn(List.of(acceptedQuote));
        when(remoteOaService.createContract(eq("true"), eq(CrmConstants.SERVICE_NAME), any(RemoteOaService.ContractDraftRequest.class)))
                .thenReturn(com.cloudflow.common.core.domain.R.ok(8801L));

        boolean result = service.updateStage(7001L, CrmConstants.OpportunityStage.WON, null);

        assertTrue(result);
        verify(crmCustomerService).refreshHealth(6001L);
        ArgumentCaptor<RemoteOaService.ContractDraftRequest> requestCaptor =
                ArgumentCaptor.forClass(RemoteOaService.ContractDraftRequest.class);
        verify(remoteOaService).createContract(eq("true"), eq(CrmConstants.SERVICE_NAME), requestCaptor.capture());
        RemoteOaService.ContractDraftRequest request = requestCaptor.getValue();
        assertEquals("报价A", request.getContractName());
        assertEquals(new BigDecimal("168000"), request.getAmount());
        assertEquals("USD", request.getCurrency());
        assertEquals("CRM_QUOTE", request.getSourceType());
        assertEquals(8101L, request.getSourceId());

        ArgumentCaptor<Map<String, Object>> fieldsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(crmEventPublisher).publish(eq(CrmEventStreamConstants.EVENT_OPPORTUNITY_WON), eq(100000L), fieldsCaptor.capture());
        Map<String, Object> payload = fieldsCaptor.getValue();
        assertEquals(7001L, payload.get("opportunityId"));
        assertEquals("商机A", payload.get("opportunityName"));
        assertEquals(6001L, payload.get("customerId"));
        assertEquals(8801L, payload.get("contractId"));
        assertEquals(2001L, payload.get("ownerId"));
    }

    @Test
    void updateStage_lost_updatesLostReasonAndRefreshesHealth() {
        CrmOpportunity opportunity = buildOpportunity();

        doReturn(opportunity).when(service).getAccessibleOpportunity(7001L);
        doReturn(true).when(service).updateById(any(CrmOpportunity.class));

        boolean result = service.updateStage(7001L, CrmConstants.OpportunityStage.LOST, "预算被砍");

        assertTrue(result);
        assertEquals(CrmConstants.OpportunityStage.LOST, opportunity.getStage());
        assertEquals(CrmConstants.OpportunityStatus.CLOSED, opportunity.getStatus());
        assertEquals("预算被砍", opportunity.getLostReason());
        verify(crmCustomerService).refreshHealth(6001L);
        verify(crmEventPublisher, never()).publish(eq(CrmEventStreamConstants.EVENT_OPPORTUNITY_WON), any(Long.class), any(Map.class));
    }

    @Test
    void updateStage_regularStage_updatesOpenStatusWithoutPublishingEvent() {
        CrmOpportunity opportunity = buildOpportunity();

        doReturn(opportunity).when(service).getAccessibleOpportunity(7001L);
        doReturn(true).when(service).updateById(any(CrmOpportunity.class));

        boolean result = service.updateStage(7001L, CrmConstants.OpportunityStage.PROPOSAL, null);

        assertTrue(result);
        assertEquals(CrmConstants.OpportunityStage.PROPOSAL, opportunity.getStage());
        assertEquals(CrmConstants.OpportunityStatus.OPEN, opportunity.getStatus());
        verify(crmCustomerService, never()).refreshHealth(any(Long.class));
        verify(crmEventPublisher, never()).publish(eq(CrmEventStreamConstants.EVENT_OPPORTUNITY_WON), any(Long.class), any(Map.class));
    }

    @Test
    void createOpportunity_enrichesOwnerAndKeepsHrDeptSnapshot() {
        CrmOpportunity opportunity = new CrmOpportunity();
        opportunity.setCustomerId(6001L);
        opportunity.setOpportunityName("商机B");
        opportunity.setOwnerId(2008L);

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setDeptId(3001L);
        customer.setDeptName("销售一部");

        HrEmployeeSummaryVO employee = new HrEmployeeSummaryVO();
        employee.setEmployeeName("王五");
        employee.setDeptId(3009L);
        employee.setDeptName("渠道销售");
        employee.setActive(true);

        when(remoteHrService.getEmployeeByUserId(2008L)).thenReturn(R.ok(employee));
        when(crmCustomerService.getAccessibleCustomer(6001L)).thenReturn(customer);
        doReturn(true).when(service).save(any(CrmOpportunity.class));

        boolean result = service.createOpportunity(opportunity);

        assertTrue(result);
        assertEquals("景曜科技", opportunity.getCustomerName());
        assertEquals("王五", opportunity.getOwnerName());
        assertEquals(3009L, opportunity.getDeptId());
        assertEquals("渠道销售", opportunity.getDeptName());
        assertEquals(CrmConstants.OpportunityStage.LEAD, opportunity.getStage());
        assertEquals(CrmConstants.OpportunityStatus.OPEN, opportunity.getStatus());
        assertEquals(100000L, opportunity.getTenantId());
    }

    @Test
    void updateOpportunity_rejectsInactiveOwnerFromHr() {
        CrmOpportunity input = new CrmOpportunity();
        input.setOpportunityId(7001L);
        input.setCustomerId(6001L);
        input.setOpportunityName("商机A");
        input.setOwnerId(2009L);

        CrmOpportunity persisted = buildOpportunity();

        HrEmployeeSummaryVO employee = new HrEmployeeSummaryVO();
        employee.setEmployeeName("离职员工");
        employee.setActive(false);

        doReturn(persisted).when(service).getAccessibleOpportunity(7001L);
        when(remoteHrService.getEmployeeByUserId(2009L)).thenReturn(R.ok(employee));

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.updateOpportunity(input));

        assertEquals("商机归属员工已离职，请选择其它员工", ex.getMessage());
        verify(service, never()).updateById(any(CrmOpportunity.class));
    }

    @Test
    void updateOpportunity_rejectsDirectDowngradeEdit() {
        CrmOpportunity input = new CrmOpportunity();
        input.setOpportunityId(7001L);
        input.setCustomerId(6001L);
        input.setOpportunityName("商机A");
        input.setStage(CrmConstants.OpportunityStage.PROPOSAL);

        CrmOpportunity persisted = buildOpportunity();
        persisted.setStage(CrmConstants.OpportunityStage.NEGOTIATION);

        doReturn(persisted).when(service).getAccessibleOpportunity(7001L);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.updateOpportunity(input));

        assertEquals("商机降级/输单请走审批流程", ex.getMessage());
        verify(service, never()).updateById(any(CrmOpportunity.class));
    }

    @Test
    void updateOpportunity_rejectsWinStageEdit() {
        CrmOpportunity input = new CrmOpportunity();
        input.setOpportunityId(7001L);
        input.setCustomerId(6001L);
        input.setOpportunityName("商机A");
        input.setStage(CrmConstants.OpportunityStage.WON);

        CrmOpportunity persisted = buildOpportunity();
        persisted.setStage(CrmConstants.OpportunityStage.NEGOTIATION);

        doReturn(persisted).when(service).getAccessibleOpportunity(7001L);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.updateOpportunity(input));

        assertEquals("商机赢单请使用赢单操作", ex.getMessage());
        verify(service, never()).updateById(any(CrmOpportunity.class));
    }

    @Test
    void updateOpportunity_rejectsDirectClosedStatusEdit() {
        CrmOpportunity input = new CrmOpportunity();
        input.setOpportunityId(7001L);
        input.setCustomerId(6001L);
        input.setOpportunityName("商机A");
        input.setStatus(CrmConstants.OpportunityStatus.CLOSED);

        CrmOpportunity persisted = buildOpportunity();
        persisted.setStage(CrmConstants.OpportunityStage.NEGOTIATION);
        persisted.setStatus(CrmConstants.OpportunityStatus.OPEN);

        doReturn(persisted).when(service).getAccessibleOpportunity(7001L);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.updateOpportunity(input));

        assertEquals("商机关闭请走审批流程，赢单请使用赢单操作", ex.getMessage());
        verify(service, never()).updateById(any(CrmOpportunity.class));
    }

    private CrmOpportunity buildOpportunity() {
        CrmOpportunity opportunity = new CrmOpportunity();
        opportunity.setOpportunityId(7001L);
        opportunity.setTenantId(100000L);
        opportunity.setCustomerId(6001L);
        opportunity.setCustomerName("景曜科技");
        opportunity.setOpportunityName("商机A");
        opportunity.setExpectedAmount(new BigDecimal("128000"));
        opportunity.setOwnerId(2001L);
        opportunity.setOwnerName("张三");
        opportunity.setDeptId(3001L);
        opportunity.setDeptName("销售一部");
        opportunity.setStatus(CrmConstants.OpportunityStatus.OPEN);
        opportunity.setStageChangedTime(LocalDateTime.now().minusDays(5));
        return opportunity;
    }
}

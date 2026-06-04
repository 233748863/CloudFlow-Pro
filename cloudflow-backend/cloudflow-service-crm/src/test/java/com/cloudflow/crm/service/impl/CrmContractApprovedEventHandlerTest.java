package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.remote.RemoteOaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.HashMap;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmContractApprovedEventHandlerTest {

    @Mock
    private RemoteOaService remoteOaService;

    private CrmContractApprovedEventHandler handler;

    @BeforeEach
    void setUp() {
        handler = new CrmContractApprovedEventHandler(remoteOaService);
    }

    @Test
    void handle_createsProjectAndBudgetFromContractPayload() {
        Map<String, String> body = new HashMap<>();
        body.put("contractId", "8801");
        body.put("contractNo", "\"HT-2026-001\"");
        body.put("contractName", "\"景曜科技年度框架合同\"");
        body.put("amount", "250000");
        body.put("customerId", "6001");
        body.put("customerName", "\"景曜科技\"");
        body.put("ownerId", "2001");
        body.put("ownerName", "\"张三\"");
        body.put("deptId", "3001");
        body.put("deptName", "\"销售一部\"");
        body.put("sourceType", "CRM_OPPORTUNITY");
        body.put("sourceId", "7001");

        when(remoteOaService.createProject(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.ProjectDraftRequest.class)))
                .thenReturn(R.ok(9901L));
        when(remoteOaService.createBudget(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.BudgetDraftRequest.class)))
                .thenReturn(R.ok());

        handler.handle(body);

        ArgumentCaptor<RemoteOaService.ProjectDraftRequest> projectCaptor =
                ArgumentCaptor.forClass(RemoteOaService.ProjectDraftRequest.class);
        verify(remoteOaService).createProject(eq("true"), eq("cloudflow-service-crm"), projectCaptor.capture());
        RemoteOaService.ProjectDraftRequest project = projectCaptor.getValue();
        assertEquals("景曜科技年度框架合同 交付项目", project.getProjectName());
        assertEquals(8801L, project.getContractId());
        assertEquals("HT-2026-001", project.getContractNo());
        assertEquals(6001L, project.getCustomerId());
        assertEquals("景曜科技", project.getCustomerName());
        assertEquals(2001L, project.getOwnerId());
        assertEquals(3001L, project.getDeptId());
        assertEquals(new BigDecimal("250000"), project.getBudgetAmount());
        assertEquals("CRM_OPPORTUNITY", project.getSourceType());
        assertEquals(7001L, project.getSourceId());

        ArgumentCaptor<RemoteOaService.BudgetDraftRequest> budgetCaptor =
                ArgumentCaptor.forClass(RemoteOaService.BudgetDraftRequest.class);
        verify(remoteOaService).createBudget(eq("true"), eq("cloudflow-service-crm"), budgetCaptor.capture());
        RemoteOaService.BudgetDraftRequest budget = budgetCaptor.getValue();
        assertEquals("景曜科技年度框架合同 预算", budget.getBudgetName());
        assertEquals("PROJECT", budget.getTargetType());
        assertEquals(9901L, budget.getTargetId());
        assertEquals(9901L, budget.getProjectId());
        assertEquals(new BigDecimal("250000"), budget.getTotalAmount());
        assertEquals(1, budget.getLines().size());
        assertEquals("SALES_DELIVERY", budget.getLines().get(0).getSubjectCode());
        assertEquals(new BigDecimal("250000"), budget.getLines().get(0).getAmount());
    }

    @Test
    void handle_skipsBudgetWhenAmountMissing() {
        Map<String, String> body = new HashMap<>();
        body.put("contractId", "8801");
        body.put("contractName", "\"景曜科技年度框架合同\"");

        when(remoteOaService.createProject(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.ProjectDraftRequest.class)))
                .thenReturn(R.ok(9901L));

        handler.handle(body);

        verify(remoteOaService).createProject(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.ProjectDraftRequest.class));
        verify(remoteOaService, never()).createBudget(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.BudgetDraftRequest.class));
    }

    @Test
    void handle_ignoresPayloadWhenContractIdMissing() {
        Map<String, String> body = new HashMap<>();
        body.put("contractName", "\"景曜科技年度框架合同\"");

        handler.handle(body);

        verify(remoteOaService, never()).createProject(any(), any(), any());
        verify(remoteOaService, never()).createBudget(any(), any(), any());
    }
}

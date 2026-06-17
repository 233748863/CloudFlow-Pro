package com.cloudflow.oa.service.impl;

import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.dto.WorkplaceSummaryDTO;
import com.cloudflow.oa.service.IOaContractMilestoneService;
import com.cloudflow.oa.service.IOaRiskAlertService;
import com.cloudflow.oa.service.IOaTraceEventService;
import com.cloudflow.oa.service.remote.RemoteCrmWorkplaceService;
import com.cloudflow.oa.service.remote.RemoteHrWorkplaceService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.concurrent.Executor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class WorkplaceServiceImplTest {

    @Mock
    private RemoteCrmWorkplaceService remoteCrmWorkplaceService;

    @Mock
    private RemoteHrWorkplaceService remoteHrWorkplaceService;

    @Mock
    private IOaRiskAlertService oaRiskAlertService;

    @Mock
    private IOaTraceEventService oaTraceEventService;

    @Mock
    private IOaContractMilestoneService oaContractMilestoneService;

    private WorkplaceServiceImpl workplaceService;

    @BeforeEach
    void setUp() {
        workplaceService = new WorkplaceServiceImpl();
        ReflectionTestUtils.setField(workplaceService, "remoteCrmWorkplaceService", remoteCrmWorkplaceService);
        ReflectionTestUtils.setField(workplaceService, "remoteHrWorkplaceService", remoteHrWorkplaceService);
        ReflectionTestUtils.setField(workplaceService, "oaRiskAlertService", oaRiskAlertService);
        ReflectionTestUtils.setField(workplaceService, "oaTraceEventService", oaTraceEventService);
        ReflectionTestUtils.setField(workplaceService, "oaContractMilestoneService", oaContractMilestoneService);
        ReflectionTestUtils.setField(workplaceService, "taskExecutor", (Executor) Runnable::run);

        when(oaRiskAlertService.queryPage(any(OaRiskAlert.class), any(PageQuery.class)))
                .thenReturn(new PageResult<>(List.of(), 0, 1, 8));
        when(remoteHrWorkplaceService.listReminders(eq(1L), eq(30), eq(8))).thenReturn(R.ok(List.of()));
        when(oaContractMilestoneService.loadOverdueRiskItems(anyInt())).thenReturn(List.of());
        when(oaTraceEventService.listRecent(anyInt())).thenReturn(List.of());
    }

    @Test
    void getWorkplaceSummaryEnrichment_callsCrmWorkplaceOnceAndMapsAllCrmSections() {
        when(remoteCrmWorkplaceService.getDashboardWorkplace()).thenReturn(R.ok(crmWorkplace()));

        WorkplaceSummaryDTO result = workplaceService.getWorkplaceSummaryEnrichment(1L);

        assertEquals(1, result.getTodayItems().size());
        assertEquals(1, result.getRiskItems().size());
        assertEquals(1, result.getRecentActivities().size());
        assertEquals("UP", result.getServiceHealth().get("crm").getStatus());
        verify(remoteCrmWorkplaceService, times(1)).getDashboardWorkplace();
    }

    @Test
    void getWorkplaceSummaryEnrichment_keepsResponseAvailableWhenCrmFails() {
        when(remoteCrmWorkplaceService.getDashboardWorkplace()).thenThrow(new RuntimeException("crm timeout"));

        WorkplaceSummaryDTO result = workplaceService.getWorkplaceSummaryEnrichment(1L);

        assertNotNull(result);
        assertEquals(0, result.getTodayItems().size());
        assertEquals(0, result.getRiskItems().size());
        assertEquals(0, result.getRecentActivities().size());
        assertEquals("DOWN", result.getServiceHealth().get("crm").getStatus());
        verify(remoteCrmWorkplaceService, times(1)).getDashboardWorkplace();
    }

    private RemoteCrmWorkplaceService.CrmDashboardWorkplaceResponse crmWorkplace() {
        RemoteCrmWorkplaceService.CrmTodoItem todo = new RemoteCrmWorkplaceService.CrmTodoItem();
        todo.setId("todo-1");
        todo.setBusinessType("CRM_QUOTE");
        todo.setModule("CRM");
        todo.setSourceLabel("CRM 报价");
        todo.setTitle("报价待跟进");
        todo.setDescription("客户报价即将到期");
        todo.setStatus("TODO");
        todo.setPath("/office/crm/quotes");

        RemoteCrmWorkplaceService.CrmRiskItem risk = new RemoteCrmWorkplaceService.CrmRiskItem();
        risk.setId("risk-100");
        risk.setBusinessType("CRM_RECEIVABLE");
        risk.setBusinessId(100L);
        risk.setModule("CRM");
        risk.setSourceLabel("CRM 回款");
        risk.setTitle("回款逾期");
        risk.setDescription("应收款超期未回");
        risk.setLevel("HIGH");
        risk.setStatus("OPEN");
        risk.setPath("/office/crm/receivables");

        RemoteCrmWorkplaceService.CrmActivityItem activity = new RemoteCrmWorkplaceService.CrmActivityItem();
        activity.setId("activity-1");
        activity.setBusinessType("CRM_CUSTOMER");
        activity.setModule("CRM");
        activity.setSourceLabel("CRM 动态");
        activity.setTitle("客户更新");
        activity.setContent("客户资料已更新");
        activity.setOperatorName("销售");
        activity.setEventTime(LocalDateTime.now());
        activity.setPath("/office/crm/customer/100");

        RemoteCrmWorkplaceService.CrmDashboardWorkplaceResponse response =
                new RemoteCrmWorkplaceService.CrmDashboardWorkplaceResponse();
        response.setTodos(List.of(todo));
        response.setRisks(List.of(risk));
        response.setActivities(List.of(activity));
        return response;
    }
}

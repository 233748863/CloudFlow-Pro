package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmSalesTarget;
import com.cloudflow.crm.domain.vo.CrmPerformanceSummaryVO;
import com.cloudflow.crm.service.ICrmPerformanceQueryService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmSalesTargetServiceImplTest {

    @Mock
    private ICrmPerformanceQueryService performanceQueryService;

    private CrmSalesTargetServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        service = spy(new CrmSalesTargetServiceImpl(performanceQueryService));
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void queryPage_attachesPerformanceForOwnerAndDeptTargets() {
        CrmSalesTarget ownerTarget = new CrmSalesTarget();
        ownerTarget.setSalesTargetId(1L);
        ownerTarget.setDimensionType(CrmConstants.SalesTargetDimension.OWNER);
        ownerTarget.setPeriodType(CrmConstants.SalesTargetPeriod.MONTH);
        ownerTarget.setTargetYear(2026);
        ownerTarget.setTargetPeriod(6);
        ownerTarget.setOwnerId(2001L);
        ownerTarget.setOwnerName("tester");
        ownerTarget.setTargetAmount(new BigDecimal("100000"));

        CrmSalesTarget deptTarget = new CrmSalesTarget();
        deptTarget.setSalesTargetId(2L);
        deptTarget.setDimensionType(CrmConstants.SalesTargetDimension.DEPT);
        deptTarget.setPeriodType(CrmConstants.SalesTargetPeriod.QUARTER);
        deptTarget.setTargetYear(2026);
        deptTarget.setTargetPeriod(2);
        deptTarget.setDeptId(3001L);
        deptTarget.setDeptName("销售一部");
        deptTarget.setTargetAmount(new BigDecimal("200000"));

        Page<CrmSalesTarget> page = new Page<>(1, 10);
        page.setRecords(List.of(ownerTarget, deptTarget));
        page.setTotal(2);
        doReturn(page).when(service).page(any(Page.class), any());

        CrmPerformanceSummaryVO ownerSummary = new CrmPerformanceSummaryVO();
        ownerSummary.setTargetId(2001L);
        ownerSummary.setReceivedAmount(new BigDecimal("65000"));

        CrmPerformanceSummaryVO deptSummary = new CrmPerformanceSummaryVO();
        deptSummary.setTargetId(3001L);
        deptSummary.setReceivedAmount(new BigDecimal("150000"));

        when(performanceQueryService.summarizeByOwner(eq(List.of(2001L)), eq("2026-06-01"), eq("2026-06-30")))
                .thenReturn(List.of(ownerSummary));
        when(performanceQueryService.summarizeByDept(eq(List.of(3001L)), eq("2026-04-01"), eq("2026-06-30")))
                .thenReturn(List.of(deptSummary));

        PageResult<CrmSalesTarget> result = service.queryPage(new CrmSalesTarget(), new PageQuery());

        assertEquals(2, result.getRows().size());

        CrmSalesTarget first = result.getRows().get(0);
        assertEquals(new BigDecimal("65000"), first.getAchievedAmount());
        assertEquals(new BigDecimal("35000"), first.getGapAmount());
        assertEquals(new BigDecimal("65.00"), first.getCompletionRate());
        assertEquals("2026年 6月", first.getPeriodLabel());

        CrmSalesTarget second = result.getRows().get(1);
        assertEquals(new BigDecimal("150000"), second.getAchievedAmount());
        assertEquals(new BigDecimal("50000"), second.getGapAmount());
        assertEquals(new BigDecimal("75.00"), second.getCompletionRate());
        assertEquals("2026年 Q2", second.getPeriodLabel());
    }

    @Test
    void createSalesTarget_ownerDimensionFillsContextDefaults() {
        CrmSalesTarget target = new CrmSalesTarget();
        target.setTargetName("6月个人配额");
        target.setDimensionType(CrmConstants.SalesTargetDimension.OWNER);
        target.setPeriodType(CrmConstants.SalesTargetPeriod.MONTH);
        target.setTargetYear(2026);
        target.setTargetPeriod(6);
        target.setTargetAmount(new BigDecimal("88888"));

        doReturn(true).when(service).save(any(CrmSalesTarget.class));

        boolean result = service.createSalesTarget(target);

        assertTrue(result);
        assertEquals(2001L, target.getOwnerId());
        assertEquals("tester", target.getOwnerName());
        assertNull(target.getDeptId());
        assertNull(target.getDeptName());
        assertEquals(CrmConstants.SalesTargetStatus.ACTIVE, target.getStatus());
        assertEquals(100000L, target.getTenantId());
        assertNotNull(target.getTargetNo());
    }

    @Test
    void updateSalesTarget_keepsPersistedTargetNoAndTenant() {
        CrmSalesTarget input = new CrmSalesTarget();
        input.setSalesTargetId(1L);
        input.setTargetName("Q2部门配额");
        input.setDimensionType(CrmConstants.SalesTargetDimension.DEPT);
        input.setPeriodType(CrmConstants.SalesTargetPeriod.QUARTER);
        input.setTargetYear(2026);
        input.setTargetPeriod(2);
        input.setDeptId(3001L);
        input.setDeptName("销售一部");
        input.setTargetAmount(new BigDecimal("300000"));

        CrmSalesTarget persisted = new CrmSalesTarget();
        persisted.setSalesTargetId(1L);
        persisted.setTenantId(100000L);
        persisted.setTargetNo("MB-2026-001");
        doReturn(persisted).when(service).getById(1L);
        doReturn(true).when(service).updateById(any(CrmSalesTarget.class));

        boolean result = service.updateSalesTarget(input);

        assertTrue(result);
        assertEquals(100000L, input.getTenantId());
        assertEquals("MB-2026-001", input.getTargetNo());
        assertEquals("tester", input.getUpdateBy());
    }
}

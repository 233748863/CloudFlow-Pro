package com.cloudflow.crm.service.impl;

import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.redis.core.SysDictHelper;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import org.junit.jupiter.api.Test;

import java.util.stream.LongStream;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class CrmCustomerWorkspaceServiceImplTest {
    private final ICrmCustomerService customers = mock(ICrmCustomerService.class);
    private final CrmCustomerMapper customerMapper = mock(CrmCustomerMapper.class);
    private final CrmFollowUpMapper followUps = mock(CrmFollowUpMapper.class);
    private final CrmRenewalMapper renewals = mock(CrmRenewalMapper.class);
    private final CrmReceivableMapper receivables = mock(CrmReceivableMapper.class);
    private final CrmServiceTicketMapper tickets = mock(CrmServiceTicketMapper.class);
    private final RemoteOaService oa = mock(RemoteOaService.class);
    private final CrmCustomerWorkspaceServiceImpl service = new CrmCustomerWorkspaceServiceImpl(
            customers, customerMapper, mock(CrmContactMapper.class), followUps,
            mock(CrmOpportunityMapper.class), mock(CrmQuoteMapper.class), receivables, renewals,
            tickets, oa, mock(SysDictHelper.class));

    @Test
    void dashboardLoadsEightCustomersOnceForAllFourSections() {
        var records = LongStream.rangeClosed(1, 8).mapToObj(id -> {
            CrmCustomer customer = new CrmCustomer();
            customer.setCustomerId(id);
            when(customers.getAccessibleCustomer(id)).thenReturn(customer);
            return customer;
        }).toList();
        when(customerMapper.selectPageByDataScope(any(), any(), any()))
                .thenReturn(new Page<CrmCustomer>(1, 8).setRecords(records));

        var summary = service.getDashboardSummary();

        assertNotNull(summary.getCrossModuleTodos());
        assertNotNull(summary.getCrossModuleRisks());
        assertTrue(summary.getBudgetAlerts().isEmpty());
        assertTrue(summary.getInvoiceExceptions().isEmpty());
        for (CrmCustomer customer : records) {
            verify(customers).getAccessibleCustomer(customer.getCustomerId());
            verify(customers).refreshHealth(eq(customer), any());
            verify(oa).listContracts(1, 50, customer.getCustomerId(), null);
            verify(oa).listInvoices(1, 100, null, null, null, customer.getCustomerId());
            verify(oa).listProjects(1, 50, customer.getCustomerId(), null);
        }
        verify(customers, never()).refreshHealth(anyLong());
        verify(followUps, times(8)).selectList(any());
        verify(tickets, never()).selectCount(any());
    }

    @Test
    void inaccessibleCustomerStopsBeforeAnyBusinessOrRemoteRead() {
        when(customers.getAccessibleCustomer(9L)).thenThrow(new IllegalArgumentException("无权访问"));
        assertThrows(IllegalArgumentException.class, () -> service.getWorkspace(9L));
        verifyNoInteractions(followUps, renewals, receivables, tickets, oa);
    }
}

package com.cloudflow.crm.service.impl;

import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmCrossModuleDraftServiceImplTest {

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private RemoteOaService remoteOaService;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    @Test
    void confirmReceivable_publishesReceivableConfirmedEvent() {
        CrmCrossModuleDraftServiceImpl service = new CrmCrossModuleDraftServiceImpl(
                customerMapper,
                receivableMapper,
                crmCustomerService,
                remoteOaService,
                crmEventPublisher
        );

        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(6001L);
        customer.setCustomerName("景曜科技");
        customer.setTenantId(100000L);

        CrmReceivable receivable = new CrmReceivable();
        receivable.setReceivableId(6601L);
        receivable.setDeleted(CrmConstants.DelFlag.NORMAL);
        receivable.setCustomerId(6001L);
        receivable.setReceivableNo("SK-2026-001");
        receivable.setReceivableName("一期回款");
        receivable.setContractId(8801L);
        receivable.setContractNo("HT-2026-001");
        receivable.setInvoiceId(9901L);
        receivable.setPlannedAmount(new BigDecimal("50000"));

        when(crmCustomerService.getAccessibleCustomer(6001L)).thenReturn(customer);
        when(receivableMapper.selectById(6601L)).thenReturn(receivable);
        when(receivableMapper.updateById(any(CrmReceivable.class))).thenReturn(1);
        doNothing().when(crmCustomerService).refreshHealth(6001L);

        boolean result = service.confirmReceivable(6001L, 6601L);

        assertTrue(result);
        assertEquals(CrmConstants.ReceivableStatus.RECEIVED, receivable.getStatus());
        ArgumentCaptor<Map<String, Object>> fieldsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(crmEventPublisher).publish(eq(CrmEventStreamConstants.EVENT_RECEIVABLE_CONFIRMED), eq(100000L), fieldsCaptor.capture());
        assertEquals(6601L, fieldsCaptor.getValue().get("receivableId"));
        assertEquals("景曜科技", fieldsCaptor.getValue().get("customerName"));
        assertEquals(9901L, fieldsCaptor.getValue().get("invoiceId"));
    }
}

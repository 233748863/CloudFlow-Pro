package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.crm.config.CrmEventStreamConstants;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmReceivable;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.service.CrmEventPublisher;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.common.redis.core.SysDictHelper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doNothing;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class CrmReceivableServiceImplTest {

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private RemoteOaService remoteOaService;

    @Mock
    private SysDictHelper sysDictHelper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private CrmEventPublisher crmEventPublisher;

    private CrmReceivableServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        service = spy(new CrmReceivableServiceImpl(
                crmCustomerService,
                remoteOaService,
                sysDictHelper,
                crmEventPublisher
        ));
        ReflectionTestUtils.setField(service, "baseMapper", receivableMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void updateReceivable_rejectsDirectSettlementFieldChange() {
        CrmReceivable input = buildInput();
        input.setReceivedAmount(new BigDecimal("1000"));

        CrmReceivable persisted = buildPersisted();
        doReturn(persisted).when(service).getAccessibleReceivable(6601L);

        IllegalArgumentException ex =
                assertThrows(IllegalArgumentException.class, () -> service.updateReceivable(input));

        assertEquals("回款确认、核销或退款请走专用流程", ex.getMessage());
        verify(service, never()).updateById(any(CrmReceivable.class));
    }

    @Test
    void updateReceivable_keepsProtectedFieldsFromPersistedRecord() {
        CrmReceivable input = buildInput();
        input.setDueDate(LocalDate.now().plusDays(15));
        input.setReceivedAmount(null);

        CrmReceivable persisted = buildPersisted();
        doReturn(persisted).when(service).getAccessibleReceivable(6601L);
        doReturn(true).when(service).updateById(any(CrmReceivable.class));
        doNothing().when(crmCustomerService).refreshHealth(6001L);

        boolean result = service.updateReceivable(input);

        assertTrue(result);
        assertEquals(persisted.getOwnerId(), input.getOwnerId());
        assertEquals(persisted.getOwnerName(), input.getOwnerName());
        assertEquals(persisted.getReceivedAmount(), input.getReceivedAmount());
        assertEquals(persisted.getOutstandingAmount(), input.getOutstandingAmount());
        assertEquals(persisted.getStatus(), input.getStatus());
        verify(crmCustomerService).refreshHealth(6001L);
    }

    @Test
    void confirmReceipt_publishesReceivableConfirmedEvent() {
        CrmReceivable persisted = buildPersisted();
        persisted.setReceivedAmount(BigDecimal.ZERO);
        persisted.setOutstandingAmount(persisted.getPlannedAmount());
        persisted.setReceivedDate(null);

        doReturn(persisted).when(service).getAccessibleReceivable(6601L);
        doReturn(true).when(service).updateById(any(CrmReceivable.class));
        doNothing().when(crmCustomerService).refreshHealth(6001L);

        boolean result = service.confirmReceipt(6601L);

        assertTrue(result);
        assertEquals(persisted.getPlannedAmount(), persisted.getReceivedAmount());
        assertEquals(BigDecimal.ZERO, persisted.getOutstandingAmount());
        assertEquals(CrmConstants.ReceivableStatus.RECEIVED, persisted.getStatus());
        ArgumentCaptor<Map<String, Object>> fieldsCaptor = ArgumentCaptor.forClass(Map.class);
        verify(crmEventPublisher).publish(eq(CrmEventStreamConstants.EVENT_RECEIVABLE_CONFIRMED), eq(100000L), fieldsCaptor.capture());
        assertEquals(6601L, fieldsCaptor.getValue().get("receivableId"));
        assertEquals("景曜科技", fieldsCaptor.getValue().get("customerName"));
        assertEquals(9901L, fieldsCaptor.getValue().get("invoiceId"));
    }

    private CrmReceivable buildInput() {
        CrmReceivable receivable = new CrmReceivable();
        receivable.setReceivableId(6601L);
        receivable.setCustomerId(6001L);
        receivable.setCustomerName("景曜科技");
        receivable.setReceivableName("一期回款");
        receivable.setPlannedAmount(new BigDecimal("50000"));
        receivable.setDueDate(LocalDate.now().plusDays(7));
        return receivable;
    }

    private CrmReceivable buildPersisted() {
        CrmReceivable receivable = new CrmReceivable();
        receivable.setReceivableId(6601L);
        receivable.setTenantId(100000L);
        receivable.setCustomerId(6001L);
        receivable.setCustomerName("景曜科技");
        receivable.setReceivableName("一期回款");
        receivable.setReceivableNo("SK-2026-001");
        receivable.setPlannedAmount(new BigDecimal("50000"));
        receivable.setOwnerId(2001L);
        receivable.setOwnerName("tester");
        receivable.setReceivedAmount(new BigDecimal("20000"));
        receivable.setOutstandingAmount(new BigDecimal("30000"));
        receivable.setReceivedDate(LocalDate.now().minusDays(3));
        receivable.setStatus(CrmConstants.ReceivableStatus.PARTIAL_RECEIVED);
        receivable.setInvoiceStatus(CrmConstants.InvoiceStatus.BOUND);
        receivable.setInvoiceId(9901L);
        return receivable;
    }
}

package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.crm.service.remote.RemoteOaService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

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
class CrmReceivableConfirmedEventHandlerTest {

    @Mock
    private RemoteOaService remoteOaService;

    private CrmReceivableConfirmedEventHandler handler;

    @BeforeEach
    void setUp() {
        handler = new CrmReceivableConfirmedEventHandler(remoteOaService);
    }

    @Test
    void handle_bindsInvoiceWhenRequiredFieldsPresent() {
        Map<String, String> body = new HashMap<>();
        body.put("invoiceId", "8801");
        body.put("receivableId", "6601");
        body.put("customerId", "9203");
        body.put("customerName", "\"景曜科技\"");
        body.put("contractId", "7302");
        body.put("contractNo", "\"HT-2026-001\"");

        when(remoteOaService.bindInvoice(eq(8801L), any(RemoteOaService.InvoiceBindRequest.class)))
                .thenReturn(R.ok());

        handler.handle(body);

        ArgumentCaptor<RemoteOaService.InvoiceBindRequest> captor =
                ArgumentCaptor.forClass(RemoteOaService.InvoiceBindRequest.class);
        verify(remoteOaService).bindInvoice(eq(8801L), captor.capture());

        RemoteOaService.InvoiceBindRequest request = captor.getValue();
        assertEquals(6601L, request.getReceivableId());
        assertEquals(9203L, request.getCustomerId());
        assertEquals("景曜科技", request.getCustomerName());
        assertEquals(7302L, request.getContractId());
        assertEquals("HT-2026-001", request.getContractNo());
    }

    @Test
    void handle_skipsBindingWhenInvoiceIdMissing() {
        Map<String, String> body = new HashMap<>();
        body.put("receivableId", "6601");
        body.put("customerId", "9203");

        handler.handle(body);

        verify(remoteOaService, never()).bindInvoice(any(Long.class), any(RemoteOaService.InvoiceBindRequest.class));
    }

    @Test
    void handle_setsNullableFieldsWhenOptionalValuesMissing() {
        Map<String, String> body = new HashMap<>();
        body.put("invoiceId", "8801");
        body.put("receivableId", "6601");

        when(remoteOaService.bindInvoice(eq(8801L), any(RemoteOaService.InvoiceBindRequest.class)))
                .thenReturn(R.ok());

        handler.handle(body);

        ArgumentCaptor<RemoteOaService.InvoiceBindRequest> captor =
                ArgumentCaptor.forClass(RemoteOaService.InvoiceBindRequest.class);
        verify(remoteOaService).bindInvoice(eq(8801L), captor.capture());

        RemoteOaService.InvoiceBindRequest request = captor.getValue();
        assertNull(request.getCustomerId());
        assertNull(request.getCustomerName());
        assertNull(request.getContractId());
        assertNull(request.getContractNo());
    }
}

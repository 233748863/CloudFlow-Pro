package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.crm.domain.CrmQuote;
import com.cloudflow.crm.mapper.CrmProductMapper;
import com.cloudflow.crm.mapper.CrmQuoteLineMapper;
import com.cloudflow.crm.mapper.CrmQuoteMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.cloudflow.crm.service.remote.RemoteOaService;
import com.cloudflow.crm.service.remote.RemoteWorkflowService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmQuoteServiceImplTest {

    @Mock
    private RemoteWorkflowService remoteWorkflowService;

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private RemoteOaService remoteOaService;

    @Mock
    private CrmProductMapper productMapper;

    @Mock
    private CrmQuoteLineMapper quoteLineMapper;

    @Mock
    private OutboxPublisher outboxPublisher;

    @Mock
    private CrmQuoteMapper crmQuoteMapper;

    private CrmQuoteServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);
        TenantContext.setTenantId(100000L);
        service = spy(new CrmQuoteServiceImpl(
                remoteWorkflowService,
                crmCustomerService,
                remoteOaService,
                productMapper,
                quoteLineMapper,
                outboxPublisher,
                new ObjectMapper()
        ));
        ReflectionTestUtils.setField(service, "baseMapper", crmQuoteMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
        TenantContext.clear();
    }

    @Test
    void createContractDraft_sendsQuoteSourceToOa() {
        CrmQuote quote = new CrmQuote();
        quote.setQuoteId(8101L);
        quote.setQuoteNo("BJ-2026-001");
        quote.setQuoteName("报价A");
        quote.setCustomerId(6001L);
        quote.setCustomerName("景曜科技");
        quote.setTotalAmount(new BigDecimal("188000"));
        quote.setCurrency("USD");
        quote.setOwnerId(2001L);
        quote.setOwnerName("张三");

        doReturn(quote).when(service).getAccessibleQuote(8101L);
        doReturn(true).when(service).updateById(any(CrmQuote.class));
        when(remoteOaService.createContract(eq("true"), eq("cloudflow-service-crm"), any(RemoteOaService.ContractDraftRequest.class)))
                .thenReturn(R.ok(8801L));
        RemoteOaService.ContractInfo contractInfo = new RemoteOaService.ContractInfo();
        contractInfo.setContractNo("HT-2026-001");
        when(remoteOaService.getContract(8801L)).thenReturn(R.ok(contractInfo));

        Long contractId = service.createContractDraft(8101L);

        assertEquals(8801L, contractId);
        assertEquals(8801L, quote.getContractId());
        assertEquals("HT-2026-001", quote.getContractNo());
        ArgumentCaptor<RemoteOaService.ContractDraftRequest> captor =
                ArgumentCaptor.forClass(RemoteOaService.ContractDraftRequest.class);
        verify(remoteOaService).createContract(eq("true"), eq("cloudflow-service-crm"), captor.capture());
        RemoteOaService.ContractDraftRequest request = captor.getValue();
        assertEquals("报价A", request.getContractName());
        assertEquals(new BigDecimal("188000"), request.getAmount());
        assertEquals("USD", request.getCurrency());
        assertEquals("CRM_QUOTE", request.getSourceType());
        assertEquals(8101L, request.getSourceId());
        assertTrue(String.valueOf(request.getRemark()).contains("BJ-2026-001"));
    }
}

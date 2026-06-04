package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.statemachine.config.StateMachineProperties;
import com.cloudflow.common.statemachine.core.DictValueProvider;
import com.cloudflow.common.statemachine.core.StateMachine;
import com.cloudflow.common.statemachine.core.StateMachineRegistry;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmLead;
import com.cloudflow.crm.domain.dto.CrmLeadConvertDTO;
import com.cloudflow.crm.enums.CrmLeadEvent;
import com.cloudflow.crm.enums.CrmLeadStatus;
import com.cloudflow.crm.event.LeadConvertedEvent;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Collections;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.spy;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmLeadServiceImplTest {

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private OutboxPublisher outboxPublisher;

    private ObjectMapper objectMapper;
    private StateMachineRegistry stateMachineRegistry;
    private CrmLeadServiceImpl service;

    @BeforeEach
    void setUp() {
        UserContext.setUserId(2001L);
        UserContext.setUserName("tester");
        UserContext.setTenantId(100000L);

        objectMapper = new ObjectMapper().findAndRegisterModules();
        StateMachineProperties properties = new StateMachineProperties();
        properties.setStrictDictBinding(false);
        stateMachineRegistry = new StateMachineRegistry(new DictValueProvider() {
            @Override
            public java.util.Set<String> getValues(String dictType) {
                return Collections.emptySet();
            }

            @Override
            public boolean available() {
                return false;
            }
        }, properties);
        stateMachineRegistry.register(StateMachine.builder("CrmLead", CrmLeadStatus.class, CrmLeadEvent.class)
                .transition(CrmLeadStatus.QUALIFIED, CrmLeadEvent.CONVERT, CrmLeadStatus.CONVERTED)
                .terminal(CrmLeadStatus.CONVERTED)
                .build());

        service = spy(new CrmLeadServiceImpl(
                crmCustomerService,
                customerMapper,
                stateMachineRegistry,
                outboxPublisher,
                objectMapper
        ));
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void convertLead_createsCustomerTransitionsStateAndPublishesEvent() throws Exception {
        CrmLead lead = new CrmLead();
        lead.setLeadId(5101L);
        lead.setLeadNo("XS-2026-001");
        lead.setLeadName("华东商机线索");
        lead.setCompanyName("景曜科技");
        lead.setIndustry("制造");
        lead.setSource("展会");
        lead.setOwnerId(2001L);
        lead.setOwnerName("tester");
        lead.setDeptId(3001L);
        lead.setDeptName("销售一部");
        lead.setMobile("13800000000");
        lead.setEmail("lead@example.com");
        lead.setRemark("原线索备注");
        lead.setStatus(CrmConstants.LeadStatus.QUALIFIED);
        lead.setDeleted(CrmConstants.DelFlag.NORMAL);

        doReturn(lead).when(service).getById(5101L);
        doReturn(true).when(service).updateById(any(CrmLead.class));

        doAnswer(invocation -> {
            CrmCustomer customer = invocation.getArgument(0);
            customer.setCustomerCode("KH-2026-001");
            return true;
        }).when(crmCustomerService).createCustomer(any(CrmCustomer.class));

        CrmCustomer persistedCustomer = new CrmCustomer();
        persistedCustomer.setCustomerId(6001L);
        persistedCustomer.setCustomerCode("KH-2026-001");
        persistedCustomer.setCustomerName("景曜科技");
        persistedCustomer.setCustomerType("ENTERPRISE");
        persistedCustomer.setOwnerId(2001L);
        persistedCustomer.setOwnerName("tester");
        when(customerMapper.selectOne(any())).thenReturn(persistedCustomer);

        CrmLeadConvertDTO request = new CrmLeadConvertDTO();
        request.setLeadId(5101L);
        request.setCustomerType("ENTERPRISE");
        request.setRemark("转客户");

        Long customerId = service.convertLead(request);

        assertEquals(6001L, customerId);
        assertEquals(6001L, lead.getConvertedCustomerId());
        assertEquals(CrmConstants.LeadStatus.CONVERTED, lead.getStatus());
        assertNotNull(lead.getConvertedTime());

        ArgumentCaptor<CrmCustomer> customerCaptor = ArgumentCaptor.forClass(CrmCustomer.class);
        verify(crmCustomerService).createCustomer(customerCaptor.capture());
        CrmCustomer created = customerCaptor.getValue();
        assertEquals("景曜科技", created.getCustomerName());
        assertEquals("ENTERPRISE", created.getCustomerType());
        assertEquals("制造", created.getIndustry());
        assertEquals("展会", created.getSource());
        assertEquals(2001L, created.getOwnerId());
        assertEquals("tester", created.getOwnerName());
        assertEquals(3001L, created.getDeptId());
        assertEquals("销售一部", created.getDeptName());
        assertTrue(String.valueOf(created.getRemark()).contains("原线索备注"));
        assertTrue(String.valueOf(created.getRemark()).contains("转客户"));

        ArgumentCaptor<BusinessEventEnvelope> envelopeCaptor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(envelopeCaptor.capture());
        BusinessEventEnvelope envelope = envelopeCaptor.getValue();
        assertEquals("LEAD_CONVERTED", envelope.getEventType());
        assertEquals("cloudflow-crm", envelope.getSourceModule());
        assertEquals(5101L, envelope.getSourceId());
        LeadConvertedEvent event = objectMapper.readValue(envelope.getPayload(), LeadConvertedEvent.class);
        assertEquals(5101L, event.getLeadId());
        assertEquals(6001L, event.getCustomerId());
        assertEquals("景曜科技", event.getCustomerName());
    }
}

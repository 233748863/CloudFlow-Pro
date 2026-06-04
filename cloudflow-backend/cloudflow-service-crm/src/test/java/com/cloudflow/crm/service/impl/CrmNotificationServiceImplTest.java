package com.cloudflow.crm.service.impl;

import com.cloudflow.common.core.event.SystemNoticeDispatchEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.crm.constant.CrmConstants;
import com.cloudflow.crm.domain.CrmCustomer;
import com.cloudflow.crm.domain.CrmServiceTicket;
import com.cloudflow.crm.mapper.CrmCustomerMapper;
import com.cloudflow.crm.mapper.CrmOpportunityMapper;
import com.cloudflow.crm.mapper.CrmReceivableMapper;
import com.cloudflow.crm.mapper.CrmServiceTicketMapper;
import com.cloudflow.crm.service.ICrmCustomerService;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CrmNotificationServiceImplTest {

    @Mock
    private CrmCustomerMapper customerMapper;

    @Mock
    private CrmReceivableMapper receivableMapper;

    @Mock
    private CrmOpportunityMapper opportunityMapper;

    @Mock
    private CrmServiceTicketMapper serviceTicketMapper;

    @Mock
    private ICrmCustomerService crmCustomerService;

    @Mock
    private TenantIterator tenantIterator;

    @Mock
    private OutboxPublisher outboxPublisher;

    private ObjectMapper objectMapper;
    private CrmNotificationServiceImpl service;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        service = new CrmNotificationServiceImpl(
                customerMapper,
                receivableMapper,
                opportunityMapper,
                serviceTicketMapper,
                crmCustomerService,
                tenantIterator,
                outboxPublisher,
                objectMapper
        );
        ReflectionTestUtils.setField(service, "followUpInactiveDays", 14);
        ReflectionTestUtils.setField(service, "ticketSlaReminderHours", 2);
    }

    @Test
    void dispatchFollowUpOverdue_publishesOwnerNoticeEvent() throws Exception {
        CrmCustomer customer = new CrmCustomer();
        customer.setCustomerId(101L);
        customer.setTenantId(100000L);
        customer.setOwnerId(2001L);
        customer.setCustomerName("景曜科技");
        customer.setDeleted(CrmConstants.DelFlag.NORMAL);
        customer.setPoolFlag(CrmConstants.CustomerPoolFlag.OUT_OF_POOL);
        customer.setLastFollowUpTime(LocalDateTime.now().minusDays(21));

        when(customerMapper.selectList(any())).thenReturn(List.of(customer));

        int published = service.dispatchFollowUpOverdue();

        assertEquals(1, published);
        ArgumentCaptor<BusinessEventEnvelope> captor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(captor.capture());

        BusinessEventEnvelope envelope = captor.getValue();
        assertEquals("SYSTEM_NOTICE_DISPATCH", envelope.getEventType());
        assertEquals("cloudflow-crm", envelope.getSourceModule());
        assertEquals(2001L, envelope.getSourceId());
        assertEquals(100000L, envelope.getTenantId());

        SystemNoticeDispatchEvent event = objectMapper.readValue(envelope.getPayload(), SystemNoticeDispatchEvent.class);
        assertEquals(100000L, event.getTenantId());
        assertEquals(2001L, event.getRecipientId());
        assertEquals("crm-system", event.getSenderName());
        assertEquals("1", event.getType());
        assertTrue(event.getTitle().contains("跟进逾期提醒"));
        assertTrue(event.getContent().contains("景曜科技"));
    }

    @Test
    void dispatchTicketSlaDue_refreshesHealthOncePerCustomer() throws Exception {
        CrmServiceTicket first = new CrmServiceTicket();
        first.setTicketId(1L);
        first.setTenantId(100000L);
        first.setCustomerId(9001L);
        first.setCustomerName("景曜科技");
        first.setOwnerId(2001L);
        first.setTicketTitle("接口阻塞");
        first.setSeverity(CrmConstants.TicketSeverity.HIGH);
        first.setStatus(CrmConstants.TicketStatus.OPEN);
        first.setDueTime(LocalDateTime.now().minusHours(3));
        first.setDeleted(CrmConstants.DelFlag.NORMAL);

        CrmServiceTicket second = new CrmServiceTicket();
        second.setTicketId(2L);
        second.setTenantId(100000L);
        second.setCustomerId(9001L);
        second.setCustomerName("景曜科技");
        second.setOwnerId(2002L);
        second.setTicketTitle("回调异常");
        second.setSeverity(CrmConstants.TicketSeverity.CRITICAL);
        second.setStatus(CrmConstants.TicketStatus.IN_PROGRESS);
        second.setDueTime(LocalDateTime.now().minusHours(1));
        second.setDeleted(CrmConstants.DelFlag.NORMAL);

        when(serviceTicketMapper.selectList(any())).thenReturn(List.of(first, second));

        int published = service.dispatchTicketSlaDue();

        assertEquals(2, published);
        verify(outboxPublisher, times(2)).publish(any(BusinessEventEnvelope.class));
        verify(crmCustomerService, times(1)).refreshHealth(9001L);

        ArgumentCaptor<BusinessEventEnvelope> captor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher, times(2)).publish(captor.capture());
        List<BusinessEventEnvelope> envelopes = captor.getAllValues();
        SystemNoticeDispatchEvent firstEvent = objectMapper.readValue(envelopes.get(0).getPayload(), SystemNoticeDispatchEvent.class);
        assertEquals("3", firstEvent.getType());
        assertEquals(2001L, firstEvent.getRecipientId());
        assertTrue(firstEvent.getTitle().contains("工单SLA已超时"));
    }
}

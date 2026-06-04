package com.cloudflow.hr.service.impl;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.event.EmployeeOffboardEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class HrEventPublisherImplTest {

    @Mock
    private OutboxPublisher outboxPublisher;

    private ObjectMapper objectMapper;
    private HrEventPublisherImpl publisher;

    @BeforeEach
    void setUp() {
        UserContext.setTenantId(100000L);
        objectMapper = new ObjectMapper().findAndRegisterModules();
        publisher = new HrEventPublisherImpl(outboxPublisher, objectMapper);
    }

    @AfterEach
    void tearDown() {
        UserContext.clear();
    }

    @Test
    void publishEmployeeLeft_emitsOutboxEnvelopeWithExpectedPayload() throws Exception {
        publisher.publishEmployeeLeft(5001L, 2001L, "张三", 3001L, "销售一部", 2002L);

        ArgumentCaptor<BusinessEventEnvelope> captor = ArgumentCaptor.forClass(BusinessEventEnvelope.class);
        verify(outboxPublisher).publish(captor.capture());
        BusinessEventEnvelope envelope = captor.getValue();
        assertNotNull(envelope.getEventId());
        assertEquals("EMPLOYEE_OFFBOARDED", envelope.getEventType());
        assertEquals("cloudflow-service-hr", envelope.getSourceModule());
        assertEquals(5001L, envelope.getSourceId());
        assertEquals(100000L, envelope.getTenantId());
        assertNotNull(envelope.getOccurredAt());

        EmployeeOffboardEvent event = objectMapper.readValue(envelope.getPayload(), EmployeeOffboardEvent.class);
        assertEquals(5001L, event.getEmployeeId());
        assertEquals(2001L, event.getUserId());
        assertEquals("张三", event.getEmployeeName());
        assertEquals(3001L, event.getDeptId());
        assertEquals("销售一部", event.getDeptName());
        assertEquals(2002L, event.getSuccessorUserId());
        assertNotNull(event.getLastWorkDate());
    }

    @Test
    void publishEmployeeLeft_skipsWhenEmployeeIdMissing() {
        publisher.publishEmployeeLeft(null, 2001L, "张三", 3001L, "销售一部", 2002L);

        verify(outboxPublisher, never()).publish(any());
    }
}

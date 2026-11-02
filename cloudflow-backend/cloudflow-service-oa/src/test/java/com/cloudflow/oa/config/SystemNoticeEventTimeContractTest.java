package com.cloudflow.oa.config;

import com.cloudflow.common.core.event.SystemNoticeCreatedEvent;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.oa.domain.SysNotice;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.exc.InvalidFormatException;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class SystemNoticeEventTimeContractTest {
    private final ObjectMapper provider = oaMapper();
    private final ObjectMapper consumer = Jackson2ObjectMapperBuilder.json().build();

    @Test
    void oaPayloadInsideEnvelopeRoundTripsThroughDefaultWorkflowMapperWithNanoseconds() throws Exception {
        for (int nanos : new int[] {123456789, 1000000, 0}) {
            LocalDateTime time = LocalDateTime.of(2026, 11, 2, 15, 23, 45, nanos);
            SystemNoticeCreatedEvent notice = new SystemNoticeCreatedEvent();
            notice.setNoticeId(12L);
            notice.setRecipientId(34L);
            notice.setCreateTime(time);
            String payload = provider.writeValueAsString(notice);
            assertEquals("2026-11-02T15:23:45." + String.format("%09d", nanos),
                    consumer.readTree(payload).path("createTime").asText());
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId("notice-12").eventType("SYSTEM_NOTICE_CREATED")
                    .occurredAt(time).payload(payload).build();

            BusinessEventEnvelope received = consumer.readValue(provider.writeValueAsString(envelope),
                    BusinessEventEnvelope.class);
            SystemNoticeCreatedEvent result = consumer.readValue(received.getPayload(), SystemNoticeCreatedEvent.class);

            assertEquals(time, received.getOccurredAt());
            assertEquals(time, result.getCreateTime());
            assertEquals(12L, result.getNoticeId());
            assertEquals(34L, result.getRecipientId());
        }
    }

    @Test
    void pageTimeKeepsItsDisplayFormatAndNullEventTimeStaysNull() throws Exception {
        SysNotice pageNotice = new SysNotice();
        pageNotice.setCreateTime(LocalDateTime.of(2026, 11, 2, 15, 23, 45, 123456789));
        assertEquals("2026-11-02 15:23:45",
                provider.readTree(provider.writeValueAsString(pageNotice)).path("createTime").asText());
        SystemNoticeCreatedEvent event = consumer.readValue(
                provider.writeValueAsString(new SystemNoticeCreatedEvent()), SystemNoticeCreatedEvent.class);
        assertNull(event.getCreateTime());
    }

    @Test
    void legacyPageTimeIsNotAcceptedAsAnEventTimestamp() {
        assertThrows(InvalidFormatException.class, () -> consumer.readValue(
                "{\"createTime\":\"2026-11-02 15:23:45\"}", SystemNoticeCreatedEvent.class));
    }

    private static ObjectMapper oaMapper() {
        OaJacksonConfig config = new OaJacksonConfig();
        Jackson2ObjectMapperBuilder builder = Jackson2ObjectMapperBuilder.json();
        config.oaJacksonCustomizer().customize(builder);
        return config.objectMapper(builder);
    }
}

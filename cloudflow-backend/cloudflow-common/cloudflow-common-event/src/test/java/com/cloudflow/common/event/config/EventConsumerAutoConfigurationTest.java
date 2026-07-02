package com.cloudflow.common.event.config;

import com.cloudflow.common.event.core.BusinessEventDispatcher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventIdempotentStore;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;

import java.time.Duration;
import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyMap;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class EventConsumerAutoConfigurationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void readEnvelopePayload_acceptsRawJsonObject() throws Exception {
        BusinessEventEnvelope envelope = EventConsumerAutoConfiguration.readEnvelopePayload(rawEnvelopeJson(), objectMapper);

        assertEquals("evt-001", envelope.getEventId());
        assertEquals("BUSINESS_TRIP_SUBMITTED", envelope.getEventType());
        assertEquals(100000L, envelope.getTenantId());
    }

    @Test
    void readEnvelopePayload_acceptsDoubleSerializedJsonString() throws Exception {
        String doubleSerialized = objectMapper.writeValueAsString(rawEnvelopeJson());

        BusinessEventEnvelope envelope = EventConsumerAutoConfiguration.readEnvelopePayload(doubleSerialized, objectMapper);

        assertEquals("evt-001", envelope.getEventId());
        assertEquals("BUSINESS_TRIP_SUBMITTED", envelope.getEventType());
        assertEquals(100000L, envelope.getTenantId());
    }

    @Test
    void readEnvelopePayload_acceptsIsoOccurredAtWithSevenFractionDigits() throws Exception {
        BusinessEventEnvelope envelope = EventConsumerAutoConfiguration.readEnvelopePayload(rawEnvelopeJson("""
                  "occurredAt": "2026-07-02T09:49:50.3086406",
                """), objectMapper);

        assertEquals(LocalDateTime.of(2026, 7, 2, 9, 49, 50, 308640600), envelope.getOccurredAt());
    }

    @Test
    void readEnvelopePayload_rejectsBlankPayload() {
        assertThrows(IllegalArgumentException.class,
                () -> EventConsumerAutoConfiguration.readEnvelopePayload(" ", objectMapper));
    }

    @Test
    void onMessage_writesRawDlqAndAcksWhenPayloadCannotBeParsed() throws Exception {
        EventConsumerAutoConfiguration config = new EventConsumerAutoConfiguration();
        OutboxProperties properties = new OutboxProperties();
        BusinessEventDispatcher dispatcher = mock(BusinessEventDispatcher.class);
        DeadLetterPublisher deadLetterPublisher = mock(DeadLetterPublisher.class);
        BusinessEventIdempotentStore idempotentStore = mock(BusinessEventIdempotentStore.class);
        RedisStreamUtil redisStreamUtil = mock(RedisStreamUtil.class);
        MapRecord<String, String, String> message = MapRecord.create(
                properties.getStreamKey(),
                Map.of("payload", "{bad-json", "eventId", "evt-raw")
        ).withId(RecordId.of("1748930000000-0"));

        config.onMessage(message, dispatcher, deadLetterPublisher, idempotentStore,
                objectMapper, properties, redisStreamUtil, "consumer-group", "app");

        verify(deadLetterPublisher).publishRaw(eq("1748930000000-0"), eq(properties.getStreamKey()),
                eq("consumer-group"), anyMap(), anyString(), eq(1));
        verify(redisStreamUtil).ackGlobal(properties.getStreamKey(), "consumer-group", "1748930000000-0");
        verify(dispatcher, never()).dispatch(any());
    }

    @Test
    void onMessage_keepsMessagePendingWhenRawDlqFails() throws Exception {
        EventConsumerAutoConfiguration config = new EventConsumerAutoConfiguration();
        OutboxProperties properties = new OutboxProperties();
        BusinessEventDispatcher dispatcher = mock(BusinessEventDispatcher.class);
        DeadLetterPublisher deadLetterPublisher = mock(DeadLetterPublisher.class);
        BusinessEventIdempotentStore idempotentStore = mock(BusinessEventIdempotentStore.class);
        RedisStreamUtil redisStreamUtil = mock(RedisStreamUtil.class);
        MapRecord<String, String, String> message = MapRecord.create(
                properties.getStreamKey(),
                Map.of("payload", "{bad-json", "eventId", "evt-raw")
        ).withId(RecordId.of("1748930000001-0"));
        doThrow(new IllegalStateException("dlq down")).when(deadLetterPublisher)
                .publishRaw(anyString(), anyString(), anyString(), anyMap(), anyString(), eq(1));

        config.onMessage(message, dispatcher, deadLetterPublisher, idempotentStore,
                objectMapper, properties, redisStreamUtil, "consumer-group", "app");

        verify(redisStreamUtil, never()).ackGlobal(anyString(), anyString(), anyString());
        verify(dispatcher, never()).dispatch(any());
    }

    @Test
    void onMessage_dispatchesAndAcksValidPayload() throws Exception {
        EventConsumerAutoConfiguration config = new EventConsumerAutoConfiguration();
        OutboxProperties properties = new OutboxProperties();
        BusinessEventDispatcher dispatcher = mock(BusinessEventDispatcher.class);
        DeadLetterPublisher deadLetterPublisher = mock(DeadLetterPublisher.class);
        BusinessEventIdempotentStore idempotentStore = mock(BusinessEventIdempotentStore.class);
        RedisStreamUtil redisStreamUtil = mock(RedisStreamUtil.class);
        org.mockito.Mockito.when(idempotentStore.acquire(eq("consumer-group"), eq("evt-001"), any(Duration.class)))
                .thenReturn(true);
        org.mockito.Mockito.when(dispatcher.dispatch(any())).thenReturn(true);
        MapRecord<String, String, String> message = MapRecord.create(
                properties.getStreamKey(),
                Map.of("payload", rawEnvelopeJson())
        ).withId(RecordId.of("1748930000002-0"));

        config.onMessage(message, dispatcher, deadLetterPublisher, idempotentStore,
                objectMapper, properties, redisStreamUtil, "consumer-group", "app");

        verify(dispatcher).dispatch(any(BusinessEventEnvelope.class));
        verify(deadLetterPublisher, never()).publishRaw(anyString(), anyString(), anyString(), anyMap(), anyString(), eq(1));
        verify(redisStreamUtil).ackGlobal(properties.getStreamKey(), "consumer-group", "1748930000002-0");
    }

    private String rawEnvelopeJson() {
        return rawEnvelopeJson("");
    }

    private String rawEnvelopeJson(String extraFields) {
        return """
                {
                  "eventId": "evt-001",
                  "eventType": "BUSINESS_TRIP_SUBMITTED",
                  "sourceModule": "cloudflow-oa",
                  "sourceId": 9016,
                %s
                  "payload": "{\\"tripId\\":9016}",
                  "tenantId": 100000
                }
                """.formatted(extraFields);
    }
}

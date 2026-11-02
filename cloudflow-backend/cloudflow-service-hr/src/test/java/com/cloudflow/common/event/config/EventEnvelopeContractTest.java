package com.cloudflow.common.event.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.*;

class EventEnvelopeContractTest {
    @Test
    void consumesIsoLocalTimeWithoutDiscardingPrecision() throws Exception {
        BusinessEventEnvelope event = BusinessEventEnvelopeCodec.read(
                "{\"eventId\":\"e1\",\"eventType\":\"test\",\"occurredAt\":\"2026-11-02T12:30:45.123456789\"}", new ObjectMapper());
        assertEquals(LocalDateTime.of(2026, 11, 2, 12, 30, 45, 123456789), event.getOccurredAt());
    }

    @Test
    void rejectsLegacyWebAndOffsetTimeFormats() {
        for (String time : new String[] {"2026-11-02 12:30:45", "2026-11-02T12:30:45+08:00"}) {
            assertThrows(java.time.format.DateTimeParseException.class, () ->
                    BusinessEventEnvelopeCodec.read(
                            "{\"eventId\":\"e1\",\"eventType\":\"test\",\"occurredAt\":\"" + time + "\"}", new ObjectMapper()));
        }
    }
}

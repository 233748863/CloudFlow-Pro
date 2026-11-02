package com.cloudflow.hr.config;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.*;

class HrEventTimeContractTest {
    @Test
    void eventTimePreservesNanosecondsWhileWebTimeKeepsItsFormat() throws Exception {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new HrJacksonConfig().hrJacksonCustomizer().customize(builder);
        ObjectMapper mapper = builder.build();
        LocalDateTime time = LocalDateTime.of(2026, 11, 2, 12, 30, 45, 123456789);
        BusinessEventEnvelope event = BusinessEventEnvelope.builder().eventId("test").eventType("test")
                .occurredAt(time).build();
        String json = mapper.writeValueAsString(event);
        assertEquals("2026-11-02T12:30:45.123456789", mapper.readTree(json).get("occurredAt").asText());
        assertEquals(time, mapper.readValue(json, BusinessEventEnvelope.class).getOccurredAt());
        assertEquals("2026-11-02 12:30:45", mapper.readTree(mapper.writeValueAsString(Map.of("date", time))).get("date").asText());
    }
}

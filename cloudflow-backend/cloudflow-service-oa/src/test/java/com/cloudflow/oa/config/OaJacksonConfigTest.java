package com.cloudflow.oa.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;

class OaJacksonConfigTest {

    @Test
    void shouldSerializeAndDeserializeLocalDateTime() throws Exception {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new OaJacksonConfig().oaJacksonCustomizer().customize(builder);

        ObjectMapper objectMapper = builder.build();
        SamplePayload payload = new SamplePayload();
        payload.setEventTime(LocalDateTime.of(2026, 5, 14, 22, 15, 16));

        String json = objectMapper.writeValueAsString(payload);
        SamplePayload restored = objectMapper.readValue(json, SamplePayload.class);

        assertEquals("{\"eventTime\":\"2026-05-14 22:15:16\"}", json);
        assertEquals(payload.getEventTime(), restored.getEventTime());
    }

    private static final class SamplePayload {
        private LocalDateTime eventTime;

        public LocalDateTime getEventTime() {
            return eventTime;
        }

        public void setEventTime(LocalDateTime eventTime) {
            this.eventTime = eventTime;
        }
    }
}

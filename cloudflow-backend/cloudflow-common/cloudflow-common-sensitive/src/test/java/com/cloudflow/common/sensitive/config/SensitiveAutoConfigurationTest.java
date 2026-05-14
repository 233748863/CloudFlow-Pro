package com.cloudflow.common.sensitive.config;

import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.http.converter.json.Jackson2ObjectMapperBuilder;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SensitiveAutoConfigurationTest {

    @Test
    void customizerShouldKeepJavaTimeModuleAndSensitiveSerializer() throws Exception {
        Jackson2ObjectMapperBuilder builder = new Jackson2ObjectMapperBuilder();
        new SensitiveAutoConfiguration().cloudFlowSensitiveJacksonCustomizer().customize(builder);

        ObjectMapper objectMapper = builder.build();
        String json = objectMapper.writeValueAsString(new SamplePayload(
            "13800138000",
            LocalDateTime.of(2026, 5, 14, 17, 46, 1)
        ));
        JsonNode root = objectMapper.readTree(json);

        assertTrue(root.hasNonNull("createdAt"));
        assertFalse(json.contains("13800138000"));
        assertEquals("138****8000", root.path("phone").asText());
    }

    private static final class SamplePayload {

        @Sensitive(type = SensitiveType.PHONE)
        private final String phone;
        private final LocalDateTime createdAt;

        private SamplePayload(String phone, LocalDateTime createdAt) {
            this.phone = phone;
            this.createdAt = createdAt;
        }

        public String getPhone() {
            return phone;
        }

        public LocalDateTime getCreatedAt() {
            return createdAt;
        }
    }
}

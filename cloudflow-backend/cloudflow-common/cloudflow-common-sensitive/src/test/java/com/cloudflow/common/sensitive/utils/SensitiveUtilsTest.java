package com.cloudflow.common.sensitive.utils;

import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertInstanceOf;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SensitiveUtilsTest {

    @Test
    void shouldMaskPhoneEmailAndIdCard() {
        assertEquals("138****5678", SensitiveUtils.maskPhone("13812345678"));
        assertEquals("u***@example.com", SensitiveUtils.maskEmail("user@example.com"));
        assertEquals("110101****1234", SensitiveUtils.maskIdCard("110101199001011234"));
        assertEquals("******", SensitiveUtils.maskByFieldName("token", "abcdefg"));
    }

    @Test
    void shouldMaskRequestParamsWithExtraKeywords() {
        Map<String, String[]> params = new LinkedHashMap<>();
        params.put("phone", new String[]{"13812345678"});
        params.put("apiKey", new String[]{"demo-secret"});
        params.put("keyword", new String[]{"cloudflow"});

        Map<String, String[]> masked = SensitiveUtils.maskRequestParams(params, List.of("apiKey"));
        assertEquals("138****5678", masked.get("phone")[0]);
        assertEquals("******", masked.get("apiKey")[0]);
        assertEquals("cloudflow", masked.get("keyword")[0]);
    }

    @Test
    void shouldMaskMapRecursively() {
        Map<String, Object> source = new LinkedHashMap<>();
        source.put("phone", "13812345678");
        source.put("profile", Map.of("idCard", "110101199001011234", "remark", "ok"));
        source.put("list", List.of(Map.of("email", "admin@example.com")));

        Map<String, Object> masked = SensitiveUtils.maskMap(source);
        assertEquals("138****5678", masked.get("phone"));
        assertTrue(masked.get("profile") instanceof Map);
        assertEquals("110101****1234", ((Map<?, ?>) masked.get("profile")).get("idCard"));
        assertTrue(masked.get("list") instanceof List);
        Object first = ((List<?>) masked.get("list")).get(0);
        assertTrue(first instanceof Map);
        assertEquals("a***@example.com", ((Map<?, ?>) first).get("email"));
    }

    @Test
    void shouldMaskBeanAndExtraSensitiveFields() {
        DemoPayload payload = new DemoPayload();
        Object masked = SensitiveUtils.maskObject(payload, List.of("apiKey"));

        Map<?, ?> maskedMap = assertInstanceOf(Map.class, masked);
        assertEquals("138****5678", maskedMap.get("phone"));
        assertEquals("******", maskedMap.get("token"));
        assertEquals("******", maskedMap.get("apiKey"));
    }

    private static final class DemoPayload {
        private final String phone = "13812345678";
        private final String token = "raw-token";
        private final String apiKey = "demo-key";
    }
}

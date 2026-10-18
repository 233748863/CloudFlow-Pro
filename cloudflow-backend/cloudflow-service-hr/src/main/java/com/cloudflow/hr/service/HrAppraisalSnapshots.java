package com.cloudflow.hr.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.ser.std.ToStringSerializer;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;

@Component
public class HrAppraisalSnapshots {
    private final ObjectMapper decimalMapper;

    public HrAppraisalSnapshots(ObjectMapper objectMapper) {
        SimpleModule decimals = new SimpleModule("appraisal-exact-decimals");
        decimals.addSerializer(BigDecimal.class, ToStringSerializer.instance);
        decimalMapper = objectMapper.copy().registerModule(decimals);
    }

    public JsonNode tree(Object value) {
        try {
            return decimalMapper.readTree(decimalMapper.writeValueAsBytes(value));
        } catch (java.io.IOException exception) {
            throw new IllegalStateException("绩效依据无法序列化", exception);
        }
    }

    public boolean matches(Object value, JsonNode snapshot) { return tree(value).equals(snapshot); }
}

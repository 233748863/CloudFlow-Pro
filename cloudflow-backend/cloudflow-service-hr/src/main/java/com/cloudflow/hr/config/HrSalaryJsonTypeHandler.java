package com.cloudflow.hr.config;

import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Salary component amounts must retain every decimal digit when read from the JSON column. */
public class HrSalaryJsonTypeHandler extends JacksonTypeHandler {
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS);

    public HrSalaryJsonTypeHandler(Class<?> type) { super(type); }

    public HrSalaryJsonTypeHandler(Class<?> type, Field field) { super(type, field); }

    /** MySQL parses JSON decimal literals as doubles. Keep lossy values as canonical decimal text. */
    public static Object storageValue(Object value) {
        if (value instanceof BigDecimal decimal) {
            double encoded = decimal.doubleValue();
            if (!Double.isFinite(encoded) || BigDecimal.valueOf(encoded).compareTo(decimal) != 0) {
                return decimal.stripTrailingZeros().toPlainString();
            }
            return decimal;
        }
        if (value instanceof Map<?, ?> map) {
            Map<Object, Object> stored = new LinkedHashMap<>();
            map.forEach((key, item) -> stored.put(key, storageValue(item)));
            return stored;
        }
        if (value instanceof List<?> list) {
            List<Object> stored = new ArrayList<>(list.size());
            list.forEach(item -> stored.add(storageValue(item)));
            return stored;
        }
        return value;
    }

    @Override
    public String toJson(Object value) {
        try {
            return JSON.writeValueAsString(storageValue(value));
        } catch (JsonProcessingException failure) {
            throw new IllegalArgumentException("工资组成快照无法保存", failure);
        }
    }

    @Override
    public Object parse(String json) {
        try {
            return JSON.readValue(json, JSON.constructType(getFieldType()));
        } catch (JsonProcessingException failure) {
            throw new IllegalArgumentException("工资组成快照格式无效", failure);
        }
    }
}

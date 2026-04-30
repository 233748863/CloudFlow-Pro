package com.cloudflow.oa.domain.vo;

import com.fasterxml.jackson.annotation.JsonAnyGetter;
import com.fasterxml.jackson.annotation.JsonIgnore;

import java.io.Serializable;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 动态结构返回 VO。
 */
public class DynamicMapVO implements Serializable {

    private static final long serialVersionUID = 1L;

    @JsonIgnore
    private final Map<String, Object> values;

    private DynamicMapVO(Map<String, Object> values) {
        this.values = values;
    }

    public static DynamicMapVO from(Map<String, ?> values) {
        Map<String, Object> result = new LinkedHashMap<>();
        if (values != null) {
            values.forEach(result::put);
        }
        return new DynamicMapVO(result);
    }

    @JsonAnyGetter
    public Map<String, Object> values() {
        return values;
    }
}

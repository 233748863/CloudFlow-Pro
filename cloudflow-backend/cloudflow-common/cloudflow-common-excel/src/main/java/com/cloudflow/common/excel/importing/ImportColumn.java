package com.cloudflow.common.excel.importing;

import java.math.BigDecimal;
import java.util.Map;
import lombok.Builder;
import lombok.Value;

@Value
@Builder(toBuilder = true)
public class ImportColumn {
    String field;
    String name;
    @Builder.Default Type type = Type.TEXT;
    @Builder.Default boolean required = false;
    @Builder.Default int maxLength = 255;
    BigDecimal minimum;
    BigDecimal maximum;
    String pattern;
    String reference;
    String example;
    @Builder.Default Map<String, String> options = Map.of();

    public enum Type { TEXT, INTEGER, DECIMAL, DATE, EMAIL, PHONE, ID_CARD, REFERENCE }

    public String header() {
        return name + (required ? "*" : "");
    }
}

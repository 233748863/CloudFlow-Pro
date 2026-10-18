package com.cloudflow.common.excel.importing;

import java.text.Normalizer;
import java.util.Locale;
import java.util.List;

public final class ImportKeys {
    private ImportKeys() {
    }

    public static String normalize(Object value) {
        return Normalizer.normalize(String.valueOf(value).trim(), Normalizer.Form.NFD)
                .replaceAll("\\p{M}", "").toLowerCase(Locale.ROOT);
    }

    public static String of(Object... values) {
        StringBuilder result = new StringBuilder();
        for (Object value : values) {
            if (value == null || String.valueOf(value).isBlank()) return null;
            String normalized = normalize(value);
            result.append(normalized.length()).append(':').append(normalized);
        }
        return result.toString();
    }

    public static String forFields(List<String> fields, Object... values) {
        String key = of(values);
        return key == null ? null : of(fields.toString()) + key;
    }
}

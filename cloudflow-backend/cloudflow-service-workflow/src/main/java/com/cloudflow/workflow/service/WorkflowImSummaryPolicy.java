package com.cloudflow.workflow.service;

import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;

@Component
public class WorkflowImSummaryPolicy {
    public List<Field> extract(FormDataPermissionFilter.Projection projection, JsonNode currentFields) {
        if (projection == null || projection.fields() == null || !projection.fields().isArray()
                || currentFields == null || !currentFields.isArray()) return List.of();
        Map<String, String> currentConsent = new LinkedHashMap<>();
        collectConsent(currentFields, currentConsent);
        List<Field> result = new ArrayList<>();
        collect(projection.fields(), projection.values(), currentConsent, result);
        return List.copyOf(result);
    }

    private void collectConsent(JsonNode fields, Map<String, String> consent) {
        for (JsonNode field : fields) {
            String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) collectConsent(field.path("children"), consent);
            else if (allowed(field)) consent.put(field.path("id").asText(), type);
        }
    }

    private void collect(JsonNode fields, Map<String, Object> values, Map<String, String> currentConsent, List<Field> result) {
        for (JsonNode field : fields) {
            if (result.size() == 5) return;
            String type = field.path("type").asText();
            if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) {
                collect(field.path("children"), values, currentConsent, result);
                continue;
            }
            String identifier = field.path("id").asText();
            if (!allowed(field) || !type.equals(currentConsent.get(identifier)) || !values.containsKey(identifier)) continue;
            String value = scalar(type, values.get(identifier));
            String label = field.path("label").isTextual() ? text(field.path("label").textValue(), 16) : "";
            if (!label.isBlank() && !value.isBlank()) result.add(new Field(label, value));
        }
    }

    private boolean allowed(JsonNode field) {
        return field.path("imSummaryAllowed").isBoolean() && field.path("imSummaryAllowed").booleanValue()
                && JsonSchemaValidator.IM_SUMMARY_TYPES.contains(field.path("type").asText());
    }

    private String scalar(String type, Object value) {
        if ("SWITCH".equals(type)) return value instanceof Boolean enabled ? enabled ? "是" : "否" : "";
        if ("NUMBER".equals(type) || "AMOUNT".equals(type)) {
            if (!(value instanceof String) && !(value instanceof Number)) return "";
            String number = value.toString();
            if (number.length() > 128 || !number.matches("-?[0-9]+(?:\\.[0-9]+)?")) return "";
            try { return text(new BigDecimal(number).toPlainString(), 128); }
            catch (NumberFormatException invalid) { return ""; }
        }
        return value instanceof String content ? text(content, 128) : "";
    }

    private String text(String value, int maximum) {
        String cleaned = value.replaceAll("[\\p{Cc}\\p{Cf}]", " ").strip();
        if (cleaned.codePointCount(0, cleaned.length()) <= maximum) return cleaned;
        return cleaned.substring(0, cleaned.offsetByCodePoints(0, maximum - 1)) + "…";
    }

    public record Field(String label, String value) {
        @Override public String toString() { return "WorkflowImSummaryPolicy.Field[protected]"; }
    }
}

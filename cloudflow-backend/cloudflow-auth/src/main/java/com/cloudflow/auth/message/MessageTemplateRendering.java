package com.cloudflow.auth.message;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.springframework.util.StringUtils;

public final class MessageTemplateRendering {
    private MessageTemplateRendering() { }

    public static String render(String template, Map<String, Object> params) {
        if (template == null) return "";
        String result = template;
        for (Map.Entry<String, Object> entry : params.entrySet()) {
            String value = entry.getValue() == null ? "" : String.valueOf(entry.getValue());
            result = result.replace("${" + entry.getKey() + "}", value)
                    .replace("{{" + entry.getKey() + "}}", value);
        }
        return result;
    }

    public static String missing(String declaration, Map<String, Object> params, ObjectMapper mapper) {
        if (!StringUtils.hasText(declaration)) return null;
        try {
            JsonNode definitions = mapper.readTree(declaration);
            if (!definitions.isArray()) return "params_declare";
            for (JsonNode item : definitions) {
                if (!item.path("required").asBoolean(false)) continue;
                String name = item.path("name").asText();
                Object value = params.get(name);
                if (value == null || value instanceof String text && !StringUtils.hasText(text)) return name;
            }
            return null;
        } catch (Exception failure) {
            return "params_declare";
        }
    }

    public static String renderHtml(String template, Map<String, Object> params) {
        Map<String, Object> escaped = new java.util.LinkedHashMap<>();
        params.forEach((name, value) -> escaped.put(name, value == null ? "" : value.toString().replace("&", "&amp;")
                .replace("<", "&lt;").replace(">", "&gt;").replace("\"", "&quot;").replace("'", "&#39;")));
        return render(template, escaped);
    }
}

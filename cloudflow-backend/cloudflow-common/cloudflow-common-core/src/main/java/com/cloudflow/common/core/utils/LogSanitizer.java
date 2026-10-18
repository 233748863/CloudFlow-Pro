package com.cloudflow.common.core.utils;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import java.util.Iterator;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class LogSanitizer {
    public static final String REQUEST_PARAMS_ATTRIBUTE = LogSanitizer.class.getName() + ".params";
    private static final String HIDDEN = "[REDACTED]";
    private static final Pattern KEY_SEPARATORS = Pattern.compile("[^a-z0-9]");
    private static final Set<String> SENSITIVE = Set.of("password", "pwd", "secret", "token", "accesskey", "idcard", "bankaccount", "phone", "mobile", "email", "code", "authorization", "cookie", "creditcard");
    private static final Pattern URL_QUERY = Pattern.compile("(https?://[^\\s\"'<>?]+)\\?[^\\s\"'<>]*", Pattern.CASE_INSENSITIVE);
    private static final Pattern PAIR = Pattern.compile("(?i)([\\w-]*(?:password|pwd|secret|token|signature|credential|access[_-]?key|authorization|cookie|id[_-]?card|bank[_-]?account|phone|mobile|email|code)[\\w-]*[\"']?\\s*[:=]\\s*)(?:\"(?:\\\\.|[^\"\\\\])*\"|'[^']*'|(?:Bearer\\s+)?[^\\s&,;]+)");
    private static final Pattern PHONE = Pattern.compile("(?<![0-9])1[3-9][0-9]{9}(?![0-9])");
    private static final Pattern ACCOUNT = Pattern.compile("(?<![0-9A-Za-z])[0-9]{15,19}[Xx]?(?![0-9A-Za-z])");
    private static final Pattern EMAIL = Pattern.compile("[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Za-z]{2,}");

    private LogSanitizer() {
    }

    public static boolean sensitiveKey(String key) {
        String normalized = key == null ? "" : KEY_SEPARATORS.matcher(key.toLowerCase(Locale.ROOT)).replaceAll("");
        return SENSITIVE.contains(normalized) || normalized.contains("password") || normalized.contains("secret")
                || normalized.endsWith("token") || normalized.contains("signature") || normalized.contains("credential")
                || normalized.endsWith("idcard") || normalized.endsWith("bankaccount") || normalized.endsWith("phone")
                || normalized.endsWith("email") || normalized.endsWith("accesskey") || normalized.contains("verifier")
                || normalized.contains("challenge") || normalized.equals("state") || normalized.equals("statevalue");
    }

    public static String text(String value) {
        if (value == null) return null;
        String cleaned = URL_QUERY.matcher(value).replaceAll("$1?" + HIDDEN);
        cleaned = PAIR.matcher(cleaned).replaceAll("$1" + HIDDEN);
        cleaned = PHONE.matcher(cleaned).replaceAll(HIDDEN);
        cleaned = ACCOUNT.matcher(cleaned).replaceAll(HIDDEN);
        return EMAIL.matcher(cleaned).replaceAll(HIDDEN);
    }

    public static String limit(String value, int maximum) {
        String cleaned = text(value);
        return cleaned == null || cleaned.length() <= maximum ? cleaned : cleaned.substring(0, maximum);
    }

    public static String stack(Throwable exception) {
        java.io.StringWriter output = new java.io.StringWriter();
        exception.printStackTrace(new java.io.PrintWriter(output));
        String cleaned = text(output.toString());
        int end = 0;
        int bytes = 0;
        while (end < cleaned.length()) {
            int point = cleaned.codePointAt(end);
            int size = point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
            if (bytes + size > 60000) break;
            bytes += size;
            end += Character.charCount(point);
        }
        return cleaned.substring(0, end);
    }

    public static String json(Object value, ObjectMapper mapper, int maximum) {
        try {
            String result = mapper.writeValueAsString(sanitize(mapper.valueToTree(value), 0));
            if (result.length() <= maximum) return result;
            return mapper.writeValueAsString("[内容已安全截断]");
        } catch (Exception exception) {
            return "[内容无法安全记录]";
        }
    }

    private static JsonNode sanitize(JsonNode value, int depth) {
        if (value == null || value.isNull()) return value;
        if (depth > 20) return TextNode.valueOf(HIDDEN);
        if (value.isObject()) {
            ObjectNode result = ((ObjectNode) value).objectNode();
            Iterator<Map.Entry<String, JsonNode>> fields = value.fields();
            int count = 0;
            while (fields.hasNext() && count++ < 200) {
                Map.Entry<String, JsonNode> field = fields.next();
                result.set(text(field.getKey()), sensitiveKey(field.getKey()) ? TextNode.valueOf(HIDDEN) : sanitize(field.getValue(), depth + 1));
            }
            return result;
        }
        if (value.isArray()) {
            ArrayNode result = ((ArrayNode) value).arrayNode();
            for (int index = 0; index < Math.min(value.size(), 200); index++) result.add(sanitize(value.get(index), depth + 1));
            return result;
        }
        if (value.isTextual()) return TextNode.valueOf(text(value.asText()));
        if (value.isNumber() && !value.asText().equals(text(value.asText()))) return TextNode.valueOf(HIDDEN);
        return value;
    }
}

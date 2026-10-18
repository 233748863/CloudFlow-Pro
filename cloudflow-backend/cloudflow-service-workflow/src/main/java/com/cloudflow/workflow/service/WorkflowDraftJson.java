package com.cloudflow.workflow.service;

import com.cloudflow.workflow.domain.dto.DraftSaveRequest;
import com.cloudflow.workflow.domain.dto.ProcessStartReq;
import com.cloudflow.workflow.exception.WorkflowException;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.StreamReadConstraints;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Component
public class WorkflowDraftJson {
    public static final int MAX_FORM_BYTES = 1048576;
    public static final int MAX_ASSIGNEE_BYTES = 60000;
    private final ObjectMapper mapper;
    private final ObjectMapper requestMapper;

    public WorkflowDraftJson(ObjectMapper objectMapper) {
        mapper = objectMapper.copy()
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .enable(DeserializationFeature.USE_BIG_DECIMAL_FOR_FLOATS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS);
        requestMapper = mapper.copy();
        requestMapper.getFactory().setStreamReadConstraints(StreamReadConstraints.builder().maxNestingDepth(20).build());
    }

    public DraftSaveRequest readRequest(String body) {
        requireSize(body, MAX_FORM_BYTES + MAX_ASSIGNEE_BYTES + 4096);
        try {
            JsonNode root = requestMapper.readTree(body);
            if (root == null || !root.isObject()) throw invalid();
            requireString(root, "draftId", false);
            requireString(root, "definitionId", true);
            requireString(root, "loadedContextHash", true);
            requireString(root, "title", false);
            if (!root.path("expectedVersion").isIntegralNumber() || !root.path("expectedVersion").canConvertToInt()
                    || !root.path("formData").isObject()) throw invalid();
            return requestMapper.treeToValue(root, DraftSaveRequest.class);
        } catch (WorkflowException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    public ProcessStartReq readStartRequest(String body) {
        requireSize(body, MAX_FORM_BYTES + MAX_ASSIGNEE_BYTES + 4096);
        try {
            JsonNode root = requestMapper.readTree(body);
            if (root == null || !root.isObject()) throw invalid();
            requireString(root, "draftId", false);
            requireString(root, "processDefKey", false);
            requireString(root, "businessKey", false);
            if (root.hasNonNull("expectedVersion") && (!root.path("expectedVersion").isIntegralNumber()
                    || !root.path("expectedVersion").canConvertToInt())) throw invalid();
            return requestMapper.treeToValue(root, ProcessStartReq.class);
        } catch (WorkflowException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    private void requireString(JsonNode root, String field, boolean required) {
        if ((required && !root.hasNonNull(field)) || (root.hasNonNull(field) && !root.path(field).isTextual())) throw invalid();
    }

    public JsonNode tree(String json) {
        try {
            return mapper.readTree(json);
        } catch (Exception exception) {
            throw new WorkflowException("FORM_INVALID_DEFINITION", "表单配置无法安全解析");
        }
    }

    public Map<String, Object> readData(String json) {
        try {
            return mapper.readValue(json, new TypeReference<Map<String, Object>>() { });
        } catch (Exception exception) {
            throw invalid();
        }
    }

    public Map<String, List<Long>> readAssignees(String json) {
        if (json == null) return Map.of();
        try {
            return mapper.readValue(json, new TypeReference<Map<String, List<Long>>>() { });
        } catch (Exception exception) {
            throw invalid();
        }
    }

    public String data(Map<String, Object> values) {
        if (values == null) throw invalid();
        validateValue(values, 0);
        String encoded = canonical(values);
        requireSize(encoded, MAX_FORM_BYTES);
        return encoded;
    }

    public String assignees(Map<String, List<Long>> values) {
        String encoded = canonical(values == null ? Map.of() : values);
        requireSize(encoded, MAX_ASSIGNEE_BYTES);
        return encoded;
    }

    public String canonical(Object value) {
        try {
            return mapper.writeValueAsString(sorted(mapper.valueToTree(value)));
        } catch (WorkflowException exception) {
            throw exception;
        } catch (Exception exception) {
            throw invalid();
        }
    }

    public String hash(Object value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(canonical(value).getBytes(StandardCharsets.UTF_8)));
        } catch (WorkflowException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new IllegalStateException("无法计算配置摘要");
        }
    }

    public Map<String, Object> asMap(JsonNode value) {
        return mapper.convertValue(value, new TypeReference<Map<String, Object>>() { });
    }

    public Object value(JsonNode value) {
        return mapper.convertValue(value, Object.class);
    }

    private Object sorted(JsonNode value) {
        if (value.isObject()) {
            Map<String, Object> result = new TreeMap<>();
            value.fields().forEachRemaining(entry -> result.put(entry.getKey(), sorted(entry.getValue())));
            return result;
        }
        if (value.isArray()) {
            List<Object> result = new ArrayList<>();
            value.forEach(item -> result.add(sorted(item)));
            return result;
        }
        return value;
    }

    private void validateValue(Object value, int depth) {
        if (depth > 16) throw new WorkflowException("DRAFT_TOO_LARGE", "草稿数据嵌套超过16层");
        if (value instanceof Map<?, ?> values) {
            for (Map.Entry<?, ?> entry : values.entrySet()) {
                if (!(entry.getKey() instanceof String)) throw invalid();
                validateValue(entry.getValue(), depth + 1);
            }
        } else if (value instanceof List<?> values) {
            for (Object item : values) validateValue(item, depth + 1);
        } else if (value instanceof Number number) {
            if (!Double.isFinite(number.doubleValue())) throw invalid();
        } else if (value != null && !(value instanceof String) && !(value instanceof Boolean)) {
            throw invalid();
        }
    }

    private void requireSize(String value, int maximum) {
        if (value == null || value.getBytes(StandardCharsets.UTF_8).length > maximum) {
            throw new WorkflowException("DRAFT_TOO_LARGE", "草稿数据超过允许的大小");
        }
    }

    private WorkflowException invalid() {
        return new WorkflowException("DRAFT_INVALID_DATA", "草稿必须是合法JSON对象，字段和数值须符合约定");
    }
}

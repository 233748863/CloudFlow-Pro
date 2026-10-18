package com.cloudflow.common.workflow.callback.util;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.DeserializationFeature;

import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

public final class WorkflowCallbackMetadata {
    public static final String OA_REQUEST_TOKEN = "oaRequestToken";
    public static final String CONSUMABLE_REQUEST = "OA_CONSUMABLE_REQUEST";
    public static final String MEETING_BOOKING = "OA_MEETING_BOOKING";
    public static final Set<String> MESSAGE_FIELDS = Set.of("tenantId", "processInstanceId", "businessType", "businessId", "businessNo",
            "approvalResult", "approvalComment", "approverId", "approverName", "approvalTime", OA_REQUEST_TOKEN);
    private static final Pattern TOKEN = Pattern.compile("F:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");
    private static final ObjectMapper JSON = new ObjectMapper().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private WorkflowCallbackMetadata() {
    }

    public static Map<String, Object> variables(String businessType, Map<String, ?> source) {
        Object token = source == null ? null : source.get(OA_REQUEST_TOKEN);
        if (token == null && !CONSUMABLE_REQUEST.equals(businessType) && !MEETING_BOOKING.equals(businessType)) return Map.of();
        if (!(token instanceof String value) || !TOKEN.matcher(value).matches()) {
            throw new IllegalArgumentException("审批提交令牌缺失或格式无效");
        }
        return Map.of(OA_REQUEST_TOKEN, token);
    }

    public static String decodeStreamValue(String value) {
        if (value == null) return null;
        String decoded = value;
        for (int depth = 0; depth < 3; depth++) {
            String candidate = decoded.trim();
            if (!candidate.startsWith("\"")) return decoded;
            try {
                JsonNode parsed = JSON.readTree(candidate);
                if (parsed == null || !parsed.isTextual()) throw new IllegalArgumentException("回调字段编码无效");
                decoded = parsed.textValue();
            } catch (java.io.IOException exception) {
                throw new IllegalArgumentException("回调字段编码无效");
            }
        }
        if (decoded.trim().startsWith("\"")) throw new IllegalArgumentException("回调字段编码层数无效");
        return decoded;
    }
}

package com.cloudflow.common.core.exception;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/** Recognizes the storage admission failure without exposing remote diagnostics. */
public final class StorageCapacityError {
    public static final int CODE = 409;
    public static final String MESSAGE = "租户可用存储空间不足，无法新增文件";
    private static final ObjectMapper JSON = new ObjectMapper()
            .enable(DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY)
            .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS);

    private StorageCapacityError() { }

    public static boolean matches(int status, String body) {
        if (status != CODE || body == null || body.length() > 4096) return false;
        try {
            JsonNode response = JSON.readTree(body);
            return response != null && response.isObject() && response.path("code").isIntegralNumber()
                    && response.path("code").canConvertToInt() && response.path("code").intValue() == CODE
                    && response.path("msg").isTextual() && MESSAGE.equals(response.path("msg").textValue())
                    && (response.path("data").isMissingNode() || response.path("data").isNull());
        } catch (JsonProcessingException malformed) { return false; }
    }

    public static ServiceException exception() { return new ServiceException(MESSAGE, CODE); }
}

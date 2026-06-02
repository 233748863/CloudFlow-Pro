package com.cloudflow.common.core.exception;

import org.slf4j.MDC;

import java.util.UUID;

public final class SafeErrorResponse {

    private SafeErrorResponse() {
    }

    public static String withTraceId(String message) {
        String traceId = MDC.get("traceId");
        if (traceId == null || traceId.isBlank()) {
            traceId = UUID.randomUUID().toString();
        }
        return message + "，traceId=" + traceId;
    }
}

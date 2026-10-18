package com.cloudflow.common.core.exception;

import com.cloudflow.common.core.context.TraceContext;

public final class SafeErrorResponse {

    private SafeErrorResponse() {
    }

    public static String withTraceId(String message) {
        return message + "，traceId=" + TraceContext.currentOrCreate();
    }
}

package com.cloudflow.common.core.domain;

import java.time.LocalDateTime;

public record GatewayRequestLog(Long tenantId, String traceId, String userName, String requestMethod,
                                String requestUrl, long durationMs, int resultCode, String clientIp,
                                String userAgent, LocalDateTime startedAt, String exceptionClass,
                                String exceptionMessage, String exceptionStack) {
}

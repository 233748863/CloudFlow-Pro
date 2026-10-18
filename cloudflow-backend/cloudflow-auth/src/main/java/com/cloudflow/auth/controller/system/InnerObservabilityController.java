package com.cloudflow.auth.controller.system;

import com.cloudflow.common.core.context.TraceContext;
import com.cloudflow.common.core.domain.GatewayRequestLog;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysApiErrorLog;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.ApiErrorLogEvent;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.security.annotation.Inner;
import lombok.RequiredArgsConstructor;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.bind.annotation.*;
import java.time.LocalDateTime;

@RestController
@RequestMapping("/inner/auth/observability")
@RequiredArgsConstructor
public class InnerObservabilityController {
    private final ApplicationEventPublisher publisher;
    private final CloudFlowLogProperties properties;

    @PostMapping("/access")
    @Inner(allowedServices = "cloudflow-gateway")
    @RepeatSubmit.Disabled
    public R<Void> capture(@RequestBody GatewayRequestLog request) {
        if (!TraceContext.isValid(request.traceId()) || request.tenantId() == null || request.tenantId() < 0 || request.durationMs() < 0) {
            throw new ServiceException("网关日志格式不正确");
        }
        SysLogEntity entry = new SysLogEntity();
        entry.setTenantId(request.tenantId());
        entry.setTraceId(request.traceId());
        entry.setServiceName("cloudflow-gateway");
        entry.setServiceId(entry.getServiceName());
        entry.setTitle("网关访问");
        entry.setLogType(request.resultCode() >= 400 ? "9" : "0");
        entry.setResultCode(request.resultCode());
        entry.setDurationMs(request.durationMs());
        entry.setTime(request.durationMs());
        entry.setSlowFlag(request.durationMs() > Math.max(1, properties.getSlowThresholdMs()) ? 1 : 0);
        entry.setRequestMethod(LogSanitizer.limit(request.requestMethod(), 10));
        entry.setMethod(entry.getRequestMethod());
        entry.setRequestUrl(LogSanitizer.limit(request.requestUrl(), 500));
        entry.setRequestUri(LogSanitizer.limit(request.requestUrl(), 255));
        entry.setClientIp(LogSanitizer.limit(request.clientIp(), 64));
        entry.setRemoteAddr(entry.getClientIp());
        entry.setUserAgent(LogSanitizer.limit(request.userAgent(), 500));
        entry.setCreateBy(LogSanitizer.limit(request.userName(), 64));
        entry.setCreateTime(request.startedAt() == null ? LocalDateTime.now() : request.startedAt());
        entry.setException(LogSanitizer.limit(request.exceptionMessage(), 2000));
        publisher.publishEvent(new SysLogEvent(entry));
        if (request.exceptionClass() != null) {
            SysApiErrorLog error = new SysApiErrorLog();
            error.setTenantId(entry.getTenantId());
            error.setTraceId(entry.getTraceId());
            error.setServiceName(entry.getServiceName());
            error.setUserName(entry.getCreateBy());
            error.setRequestMethod(entry.getRequestMethod());
            error.setRequestUrl(entry.getRequestUrl());
            error.setExceptionClass(LogSanitizer.limit(request.exceptionClass(), 200));
            error.setExceptionMessage(entry.getException());
            error.setExceptionStack(LogSanitizer.limit(request.exceptionStack(), 15000));
            error.setClientIp(entry.getClientIp());
            error.setUserAgent(entry.getUserAgent());
            error.setOccurTime(entry.getCreateTime());
            error.setCreateTime(LocalDateTime.now());
            error.setProcessStatus("TODO");
            publisher.publishEvent(new ApiErrorLogEvent(error));
        }
        return R.ok();
    }
}

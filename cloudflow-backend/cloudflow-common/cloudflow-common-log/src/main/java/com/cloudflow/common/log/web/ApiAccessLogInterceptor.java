package com.cloudflow.common.log.web;

import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.web.servlet.HandlerInterceptor;
import java.util.concurrent.TimeUnit;

@Slf4j
@RequiredArgsConstructor
public class ApiAccessLogInterceptor implements HandlerInterceptor {
    private static final String START = ApiAccessLogInterceptor.class.getName() + ".start";
    private static final String SNAPSHOT = ApiAccessLogInterceptor.class.getName() + ".snapshot";
    private final ApplicationEventPublisher publisher;
    private final CloudFlowLogProperties properties;

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        request.setAttribute(START, System.nanoTime());
        request.setAttribute(SNAPSHOT, SysLogUtils.buildSysLog(request, SensitiveLogPolicy.isSensitive(request, handler)));
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception exception) {
        if (Boolean.TRUE.equals(request.getAttribute(SysLogUtils.OPERATION_LOGGED))) return;
        if (!(request.getAttribute(SNAPSHOT) instanceof SysLogEntity entry)) return;
        long duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - (Long) request.getAttribute(START));
        entry.setTitle("API访问");
        entry.setTime(duration);
        entry.setDurationMs(duration);
        entry.setSlowFlag(duration > Math.max(1, properties.getSlowThresholdMs()) ? 1 : 0);
        Object code = request.getAttribute(SysLogUtils.RESULT_CODE);
        entry.setResultCode(code instanceof Integer number ? number : response.getStatus());
        entry.setLogType(exception != null || entry.getResultCode() >= 400 ? "9" : "0");
        boolean sensitive = SensitiveLogPolicy.isSensitive(request, handler) || SensitiveLogPolicy.isSensitive(request);
        if (sensitive) {
            request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
            entry.setParams(null);
        } else {
            entry.setParams(SysLogUtils.requestParams(request));
        }
        if (exception != null) {
            entry.setException(sensitive ? exception.getClass().getName() : LogSanitizer.limit(exception.getMessage(), 2000));
        }
        try {
            publisher.publishEvent(new SysLogEvent(entry));
        } catch (Exception publishFailure) {
            log.error("访问日志投递失败: {}", publishFailure.getClass().getSimpleName());
        }
    }
}

package com.cloudflow.common.log.aspect;

import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.log.config.CloudFlowLogProperties;
import com.cloudflow.common.log.domain.SysLogEntity;
import com.cloudflow.common.log.event.SysLogEvent;
import com.cloudflow.common.log.util.SysLogUtils;
import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.validation.BindingResult;
import org.springframework.web.multipart.MultipartFile;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.TimeUnit;

@Aspect
@Slf4j
@RequiredArgsConstructor
public class SysLogAspect {
    private final ApplicationEventPublisher eventPublisher;
    private final ObjectMapper objectMapper;
    private final CloudFlowLogProperties properties;

    @Around("@annotation(sysLog)")
    public Object around(ProceedingJoinPoint point, SysLog sysLog) throws Throwable {
        MethodSignature signature = (MethodSignature) point.getSignature();
        HttpServletRequest request = SysLogUtils.currentRequest();
        Class<?> targetClass = point.getTarget() == null ? signature.getDeclaringType() : point.getTarget().getClass();
        boolean sensitive = !sysLog.logParams() || SensitiveLogPolicy.isSensitive(request)
                || SensitiveLogPolicy.isSensitive(signature.getMethod(), targetClass);
        SysLogEntity entry = SysLogUtils.buildSysLog(request, sensitive);
        String title = sysLog.value();
        if (!sensitive && !sysLog.expression().isBlank()) {
            try {
                title = SysLogUtils.getValue(SysLogUtils.getContext(point.getArgs(), signature.getMethod()), sysLog.expression(), String.class);
            } catch (Exception exception) {
                log.warn("操作日志描述解析失败: {}", exception.getClass().getSimpleName());
            }
        }
        entry.setTitle(LogSanitizer.limit(title, 255));
        entry.setParams(null);
        if (!sensitive && properties.isRequestEnabled()) {
            Map<String, Object> arguments = new LinkedHashMap<>();
            String[] names = signature.getParameterNames();
            Object[] values = point.getArgs();
            for (int index = 0; index < values.length; index++) {
                Object value = values[index];
                if (value instanceof ServletRequest || value instanceof ServletResponse || value instanceof BindingResult
                        || value instanceof MultipartFile || value instanceof MultipartFile[]) continue;
                String name = names == null ? "argument" + index : names[index];
                arguments.put(name, LogSanitizer.sensitiveKey(name) ? "[REDACTED]" : value);
            }
            entry.setParams(LogSanitizer.json(SensitiveUtils.maskObject(arguments), objectMapper, Math.min(16000, Math.max(256, properties.getMaxLength()))));
        }
        long started = System.nanoTime();
        try {
            Object result = point.proceed();
            entry.setResultCode(result instanceof R<?> response ? response.getCode() : 200);
            if (entry.getResultCode() >= 400) entry.setLogType("9");
            return result;
        } catch (Throwable exception) {
            entry.setLogType("9");
            entry.setResultCode(exception instanceof com.cloudflow.common.core.exception.ServiceException business && business.getCode() != null ? business.getCode() : 500);
            entry.setException(sensitive ? exception.getClass().getName() : LogSanitizer.limit(exception.getMessage(), 2000));
            throw exception;
        } finally {
            long duration = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - started);
            entry.setTime(duration);
            entry.setDurationMs(duration);
            entry.setSlowFlag(duration > Math.max(1, properties.getSlowThresholdMs()) ? 1 : 0);
            if (request != null) {
                request.setAttribute(SysLogUtils.OPERATION_LOGGED, true);
                if (sensitive) request.removeAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE);
            }
            try {
                eventPublisher.publishEvent(new SysLogEvent(entry));
            } catch (Exception exception) {
                log.error("操作日志投递失败: {}", exception.getClass().getSimpleName());
            }
        }
    }
}

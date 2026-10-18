package com.cloudflow.common.core.aspect;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.cloudflow.common.core.utils.LogSanitizer;
import com.cloudflow.common.core.utils.SensitiveLogPolicy;
import org.aspectj.lang.reflect.MethodSignature;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.annotation.Pointcut;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.multipart.MultipartFile;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.util.LinkedHashMap;
import java.util.Map;

@Aspect
@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RequestLogAspect {

    private static final Logger log = LoggerFactory.getLogger(RequestLogAspect.class);
    private final ObjectMapper objectMapper;

    public RequestLogAspect(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Pointcut("execution(public * com.cloudflow..*(..)) && @within(org.springframework.web.bind.annotation.RestController)")
    public void controllerLog() {
    }

    @Before("controllerLog()")
    public void doBefore(JoinPoint joinPoint) {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return;
        }
        HttpServletRequest request = attributes.getRequest();

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Class<?> targetClass = joinPoint.getTarget() == null ? signature.getDeclaringType() : joinPoint.getTarget().getClass();
        if (SensitiveLogPolicy.isSensitive(request) || SensitiveLogPolicy.isSensitive(signature.getMethod(), targetClass)) {
            SensitiveLogPolicy.logRequest(log, request);
            return;
        }

        String requestBody = null;
        try {
            Object[] args = joinPoint.getArgs();
            Map<String, Object> logArgs = new LinkedHashMap<>();
            String[] names = ((MethodSignature) joinPoint.getSignature()).getParameterNames();
            for (int index = 0; index < args.length; index++) {
                Object arg = args[index];
                if (arg instanceof HttpServletRequest || arg instanceof HttpServletResponse || arg instanceof MultipartFile) {
                    continue;
                }
                String name = names != null && index < names.length ? names[index] : "argument" + index;
                logArgs.put(name, LogSanitizer.sensitiveKey(name) ? "[REDACTED]" : arg);
            }

            if (!logArgs.isEmpty()) {
                requestBody = LogSanitizer.json(logArgs, objectMapper, 2000);
                request.setAttribute(LogSanitizer.REQUEST_PARAMS_ATTRIBUTE, requestBody);
            }
        } catch (Exception e) {
            log.warn("请求参数无法安全记录");
        }
        log.info("请求 URL: {}; HTTP 方法: {}; 类方法: {}.{}; 来源 IP: {}; 请求参数: {}",
                LogSanitizer.limit(request.getRequestURI(), 500), request.getMethod(),
                signature.getDeclaringTypeName(), signature.getName(), request.getRemoteAddr(), requestBody);
    }
}

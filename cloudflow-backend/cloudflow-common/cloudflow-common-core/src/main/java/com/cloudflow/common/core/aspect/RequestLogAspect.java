package com.cloudflow.common.core.aspect;

import com.cloudflow.common.sensitive.utils.SensitiveUtils;
import com.fasterxml.jackson.databind.ObjectMapper;
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
import java.util.ArrayList;
import java.util.List;

@Aspect
@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class RequestLogAspect {

    private static final Logger log = LoggerFactory.getLogger(RequestLogAspect.class);
    private final ObjectMapper objectMapper;

    public RequestLogAspect(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
    }

    @Pointcut("execution(public * com.cloudflow..controller..*.*(..))")
    public void controllerLog() {
    }

    @Before("controllerLog()")
    public void doBefore(JoinPoint joinPoint) {
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return;
        }
        HttpServletRequest request = attributes.getRequest();

        log.info("========================================== 开始 ==========================================");
        log.info("请求 URL     : {}", request.getRequestURL().toString());
        log.info("HTTP 方法    : {}", request.getMethod());
        log.info("类方法       : {}.{}", joinPoint.getSignature().getDeclaringTypeName(), joinPoint.getSignature().getName());
        log.info("来源 IP      : {}", request.getRemoteAddr());

        try {
            Object[] args = joinPoint.getArgs();
            List<Object> logArgs = new ArrayList<>();
            for (Object arg : args) {
                if (arg instanceof HttpServletRequest || arg instanceof HttpServletResponse || arg instanceof MultipartFile) {
                    continue;
                }
                logArgs.add(arg);
            }

            if (!logArgs.isEmpty()) {
                String requestBody = objectMapper.writeValueAsString(logArgs);
                log.info("请求参数 :\n{}", requestBody);
            }
        } catch (Exception e) {
            log.warn("解析请求体失败: {}", e.getMessage());
        }
        log.info("=========================================== 结束 ===========================================");
    }
}

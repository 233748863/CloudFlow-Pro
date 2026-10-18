package com.cloudflow.common.core.aspect;

import com.cloudflow.common.core.context.TraceContext;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 20)
public class ScheduledTraceAspect {
    @Around("@annotation(org.springframework.scheduling.annotation.Scheduled)")
    public Object trace(ProceedingJoinPoint invocation) throws Throwable {
        try (TraceContext.Scope scope = TraceContext.scope()) {
            return invocation.proceed();
        }
    }
}

package com.cloudflow.common.audit.aop;

import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.handle.ICompareHandle;
import com.cloudflow.common.audit.support.SpelParser;
import lombok.RequiredArgsConstructor;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.util.StringUtils;

/**
 * 审计日志切面
 * <p>
 * 拦截 {@link Audit} 注解标记的方法，在方法执行前获取旧值，
 * 执行后通过 {@link ICompareHandle} 比较差异并记录审计日志。
 * </p>
 *
 * @author CloudFlow
 */
@Aspect
@RequiredArgsConstructor
public class AuditAspect {

    private final ICompareHandle compareHandle;

    @Around("@annotation(audit)")
    public Object auditLog(ProceedingJoinPoint joinPoint, Audit audit) throws Throwable {
        // 方法执行前：通过 SPEL 获取旧值
        Object oldVal = SpelParser.parser(joinPoint,
                StringUtils.hasText(audit.oldVal()) ? audit.oldVal() : audit.spel());

        // 执行目标方法
        Object result = joinPoint.proceed();

        // 方法执行后：比较新旧值差异并记录审计日志
        compareHandle.compare(oldVal, joinPoint, audit);

        return result;
    }
}

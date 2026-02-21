package com.cloudflow.common.tenant.aspect;

import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.annotation.TenantIgnore;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * 租户忽略切面
 * 拦截标注了 @TenantIgnore 的方法，在执行期间自动跳过租户过滤
 * 执行完毕后恢复原始租户上下文，确保不影响后续操作
 * 
 * 优先级设置为 Ordered.HIGHEST_PRECEDENCE + 1，确保在事务切面之前执行
 * 
 * @author CloudFlow
 */
@Slf4j
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class TenantIgnoreAspect {

    /**
     * 拦截方法级 @TenantIgnore 注解
     */
    @Around("@annotation(tenantIgnore)")
    public Object aroundMethod(ProceedingJoinPoint joinPoint, TenantIgnore tenantIgnore) throws Throwable {
        return doIgnore(joinPoint);
    }

    /**
     * 拦截类级 @TenantIgnore 注解（类上所有方法都跳过租户过滤）
     */
    @Around("@within(tenantIgnore)")
    public Object aroundClass(ProceedingJoinPoint joinPoint, TenantIgnore tenantIgnore) throws Throwable {
        return doIgnore(joinPoint);
    }

    /**
     * 核心逻辑：设置跳过标识 → 执行方法 → 恢复上下文
     */
    private Object doIgnore(ProceedingJoinPoint joinPoint) throws Throwable {
        // 保存原始状态
        Boolean originalSkip = TenantContext.getTenantSkip();
        try {
            // 设置跳过租户过滤
            TenantContext.setTenantSkip();
            log.debug("@TenantIgnore 生效，跳过租户过滤: {}.{}",
                    joinPoint.getTarget().getClass().getSimpleName(),
                    joinPoint.getSignature().getName());
            return joinPoint.proceed();
        } finally {
            // 恢复原始状态（如果之前没有设置跳过，则清除跳过标识）
            if (!Boolean.TRUE.equals(originalSkip)) {
                TenantContext.clearTenantSkip();
            }
            log.debug("@TenantIgnore 结束，恢复租户过滤");
        }
    }
}

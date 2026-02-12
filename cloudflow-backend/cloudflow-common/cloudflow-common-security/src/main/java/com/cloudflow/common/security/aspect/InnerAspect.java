package com.cloudflow.common.security.aspect;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.security.annotation.Inner;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.nio.file.AccessDeniedException;
import java.util.Arrays;

/**
 * 内部调用保护切面
 * 拦截标记了 @Inner 注解的 Controller 方法，校验请求是否来自内部服务调用
 * 
 * 工作原理：
 * 1. 网关在转发内部服务间调用时，会在请求头中添加 X-Inner-Call: true
 * 2. 本切面检查该请求头，如果不存在或值不匹配，则拒绝访问
 * 3. 外部请求直接访问标记了 @Inner 的接口会被拦截返回 403
 * 
 * 注意：网关需要配置剥离外部请求中的 X-Inner-Call 头，防止伪造
 * 
 * @author CloudFlow
 */
@Slf4j
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 1)
public class InnerAspect {

    /**
     * 拦截标记了 @Inner 注解的方法
     */
    @Around("@annotation(inner)")
    public Object around(ProceedingJoinPoint point, Inner inner) throws Throwable {
        // 如果注解标记为不需要内部调用校验，直接放行
        if (!inner.value()) {
            return point.proceed();
        }

        // 获取当前请求
        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            log.warn("@Inner 校验失败：无法获取请求上下文，方法: {}", point.getSignature().getName());
            throw new AccessDeniedException("内部调用校验失败：无法获取请求上下文");
        }

        HttpServletRequest request = attributes.getRequest();

        // 校验内部调用标识头
        String innerCallHeader = request.getHeader(SecurityConstants.INNER_CALL_HEADER);
        if (!SecurityConstants.INNER_CALL_VALUE.equals(innerCallHeader)) {
            String method = point.getSignature().getDeclaringTypeName() + "." + point.getSignature().getName();
            log.warn("@Inner 校验失败：接口 {} 仅允许内部调用，来源IP: {}", method, request.getRemoteAddr());
            throw new AccessDeniedException("该接口仅允许内部服务调用");
        }

        // 校验来源服务（如果指定了 allowedServices）
        String[] allowedServices = inner.allowedServices();
        if (allowedServices.length > 0) {
            String fromService = request.getHeader(SecurityConstants.FROM_SERVICE_HEADER);
            if (fromService == null || Arrays.stream(allowedServices).noneMatch(s -> s.equals(fromService))) {
                log.warn("@Inner 校验失败：来源服务 {} 不在允许列表中", fromService);
                throw new AccessDeniedException("该接口不允许来自 " + fromService + " 的调用");
            }
        }

        return point.proceed();
    }

    /**
     * 拦截标记了 @Inner 注解的类（类级别注解，对类中所有方法生效）
     */
    @Around("@within(inner)")
    public Object aroundClass(ProceedingJoinPoint point, Inner inner) throws Throwable {
        return around(point, inner);
    }
}

package com.cloudflow.common.tenant;

import com.cloudflow.common.core.context.UserContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 租户拦截器 - 从 UserContext 中获取租户ID并同步设置到 TenantContext
 * 确保 MyBatis-Plus TenantLineHandler 能正确获取租户ID
 * 
 * 执行顺序：UserContextInterceptor（设置 UserContext）→ TenantInterceptor（同步到 TenantContext）
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class TenantInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        // 从 UserContext 获取租户ID（由 UserContextInterceptor 从请求头中解析）
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            TenantContext.setTenantId(tenantId);
            log.debug("同步租户ID到 TenantContext: {}", tenantId);
        } else {
            log.debug("未获取到租户ID，TenantContext 不设置（SQL 将跳过租户过滤）");
        }
        return true;
    }

    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 清除租户上下文，避免内存泄漏
        TenantContext.clear();
    }
}

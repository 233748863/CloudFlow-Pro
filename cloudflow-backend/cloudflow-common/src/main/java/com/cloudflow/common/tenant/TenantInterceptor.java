package com.cloudflow.common.tenant;

import com.cloudflow.common.core.utils.SecurityUtils;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.HandlerInterceptor;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

/**
 * 租户拦截器 - 从请求中提取租户ID并设置到TenantContext
 * 
 * @author CloudFlow
 */
@Slf4j
@Component
public class TenantInterceptor implements HandlerInterceptor {
    
    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        try {
            // 从SecurityUtils获取当前用户的租户ID
            Long tenantId = SecurityUtils.getTenantId();
            if (tenantId != null) {
                TenantContext.setTenantId(tenantId);
                log.debug("设置租户ID: {}", tenantId);
            } else {
                // 如果获取不到租户ID，使用默认租户
                TenantContext.setTenantId(100000L);
                log.debug("使用默认租户ID: 100000");
            }
        } catch (Exception e) {
            log.warn("获取租户ID失败，使用默认租户: {}", e.getMessage());
            TenantContext.setTenantId(100000L);
        }
        return true;
    }
    
    @Override
    public void afterCompletion(HttpServletRequest request, HttpServletResponse response, Object handler, Exception ex) {
        // 清除租户上下文，避免内存泄漏
        TenantContext.clear();
    }
}

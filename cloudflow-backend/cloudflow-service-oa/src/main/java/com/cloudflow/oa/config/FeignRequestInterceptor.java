package com.cloudflow.oa.config;

import com.cloudflow.common.core.context.UserContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Feign 请求拦截器
 * 
 * 改造说明：
 * - 只传递 X-Auth-Token（Token UUID）和 X-User-Tenant-Id
 * - 下游服务通过 X-Auth-Token 从 Redis 读取完整用户信息
 * - 不再传递 X-User-Id、X-User-Name、X-User-Roles 等明文 Header
 * 
 * @author CloudFlow
 */
@Configuration
public class FeignRequestInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        // 优先从 UserContext 获取 authToken（由 UserContextInterceptor 从 Redis 解析后存入）
        String authToken = UserContext.getAuthToken();
        if (authToken != null) {
            template.header("X-Auth-Token", authToken);
        }

        // 传递租户ID
        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header("X-User-Tenant-Id", String.valueOf(tenantId));
        }

        // 回退：如果 UserContext 中没有 authToken，尝试从原始请求 Header 中获取
        if (authToken == null) {
            ServletRequestAttributes attributes =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String headerToken = request.getHeader("X-Auth-Token");
                if (headerToken != null) {
                    template.header("X-Auth-Token", headerToken);
                }
                String headerTenant = request.getHeader("X-User-Tenant-Id");
                if (headerTenant != null && tenantId == null) {
                    template.header("X-User-Tenant-Id", headerTenant);
                }
            }
        }
    }
}

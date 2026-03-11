package com.cloudflow.workflow.config;

import com.cloudflow.common.core.context.UserContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Feign 请求拦截器。
 *
 * 统一透传 Bearer Token 和租户头，保证 workflow 调用其它服务时能够复用当前登录态。
 */
@Configuration
public class FeignRequestInterceptor implements RequestInterceptor {

    @Override
    public void apply(RequestTemplate template) {
        String authToken = UserContext.getAuthToken();
        if (StringUtils.hasText(authToken)) {
            template.header("Authorization", "Bearer " + authToken);
        }

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header("X-Tenant-Id", String.valueOf(tenantId));
        }

        if (!StringUtils.hasText(authToken)) {
            ServletRequestAttributes attributes =
                    (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
            if (attributes != null) {
                HttpServletRequest request = attributes.getRequest();
                String authorization = request.getHeader("Authorization");
                if (StringUtils.hasText(authorization)) {
                    template.header("Authorization", authorization);
                }
                String headerTenant = request.getHeader("X-Tenant-Id");
                if (StringUtils.hasText(headerTenant) && tenantId == null) {
                    template.header("X-Tenant-Id", headerTenant);
                }
            }
        }
    }
}

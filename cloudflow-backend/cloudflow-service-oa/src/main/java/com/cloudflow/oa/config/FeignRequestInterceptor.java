package com.cloudflow.oa.config;

import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.UserContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.context.annotation.Configuration;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.util.StringUtils;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Feign 请求拦截器
 *
 * 改造说明：
 * - 服务间统一透传 Authorization: Bearer <token>
 * - 租户信息继续通过 X-Tenant-Id 透传
 *
 * @author CloudFlow
 */
@Configuration
public class FeignRequestInterceptor implements RequestInterceptor {

    private final String applicationName;

    public FeignRequestInterceptor(@Value("${spring.application.name}") String applicationName) {
        this.applicationName = applicationName;
    }

    @Override
    public void apply(RequestTemplate template) {
        template.header(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        template.header(SecurityConstants.FROM_SERVICE_HEADER, applicationName);

        String authToken = UserContext.getAuthToken();
        if (StringUtils.hasText(authToken)) {
            template.header("Authorization", "Bearer " + authToken);
        }

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header(SecurityConstants.TENANT_ID_HEADER, String.valueOf(tenantId));
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
                String headerTenant = request.getHeader(SecurityConstants.TENANT_ID_HEADER);
                if (StringUtils.hasText(headerTenant) && tenantId == null) {
                    template.header(SecurityConstants.TENANT_ID_HEADER, headerTenant);
                }
            }
        }
    }
}

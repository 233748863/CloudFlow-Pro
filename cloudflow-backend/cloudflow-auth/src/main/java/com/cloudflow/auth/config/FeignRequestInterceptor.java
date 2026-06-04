package com.cloudflow.auth.config;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.core.context.UserContext;
import feign.RequestInterceptor;
import feign.RequestTemplate;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

/**
 * Auth Feign 请求拦截器。
 * 统一透传内部调用头、租户和当前登录态，供 HR / OA 等内部接口校验来源服务。
 */
@Slf4j
@Component
public class FeignRequestInterceptor implements RequestInterceptor {

    private static final String USER_ID_HEADER = "X-User-Id";
    private static final String AUTHORIZATION_HEADER = "Authorization";

    private final String applicationName;

    public FeignRequestInterceptor(@Value("${spring.application.name}") String applicationName) {
        this.applicationName = applicationName;
    }

    @Override
    public void apply(RequestTemplate template) {
        template.header(SecurityConstants.INNER_CALL_HEADER, SecurityConstants.INNER_CALL_VALUE);
        template.header(SecurityConstants.FROM_SERVICE_HEADER, applicationName);

        Long tenantId = UserContext.getTenantId();
        if (tenantId != null) {
            template.header(SecurityConstants.TENANT_ID_HEADER, String.valueOf(tenantId));
        }

        try {
            if (StpUtil.isLogin()) {
                template.header(USER_ID_HEADER, String.valueOf(StpUtil.getLoginIdAsLong()));
            }
        } catch (Exception e) {
            log.debug("Auth Feign 透传用户 ID 失败: {}", e.getMessage());
        }

        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return;
        }
        HttpServletRequest request = attributes.getRequest();
        if (request == null) {
            return;
        }
        String token = request.getHeader(AUTHORIZATION_HEADER);
        if (token != null && !token.isEmpty()) {
            template.header(AUTHORIZATION_HEADER, token);
        }
    }
}

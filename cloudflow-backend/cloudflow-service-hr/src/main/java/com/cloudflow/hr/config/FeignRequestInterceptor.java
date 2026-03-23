package com.cloudflow.hr.config;

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
 * HR Feign 请求拦截器。
 * 统一透传租户、用户、Token 和内部调用头，保证内部调用与用户态调用都能正常落到下游服务。
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
            log.debug("Feign 请求透传租户 ID: {}", tenantId);
        }

        try {
            if (StpUtil.isLogin()) {
                Long userId = StpUtil.getLoginIdAsLong();
                template.header(USER_ID_HEADER, String.valueOf(userId));
                log.debug("Feign 请求透传用户 ID: {}", userId);
            }
        } catch (Exception e) {
            log.debug("获取用户 ID 失败，可能当前没有登录态: {}", e.getMessage());
        }

        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            String token = request.getHeader(AUTHORIZATION_HEADER);
            if (token != null && !token.isEmpty()) {
                template.header(AUTHORIZATION_HEADER, token);
                log.debug("Feign 请求透传 Authorization");
            }
        }
    }
}

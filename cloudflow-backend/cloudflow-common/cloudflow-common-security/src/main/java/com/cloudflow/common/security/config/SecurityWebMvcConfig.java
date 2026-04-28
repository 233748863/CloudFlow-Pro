package com.cloudflow.common.security.config;

import cn.dev33.satoken.interceptor.SaInterceptor;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.constant.SecurityConstants;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.tenant.TenantInterceptor;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Arrays;

/**
 * MVC 安全配置。
 * 统一接入 Sa-Token 登录校验，并在鉴权通过后同步用户和租户上下文。
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityWebMvcConfig implements WebMvcConfigurer {

    private static final String[] EXCLUDE_PATHS = {
            "/login",
            "/register",
            "/captcha/**",
            "/doc.html",
            "/webjars/**",
            "/swagger-resources/**",
            "/v3/api-docs/**",
            "/swagger-ui/**",
            "/swagger-ui.html",
            "/ws/**",
            "/error-report"
    };

    @Autowired
    private UserContextInterceptor userContextInterceptor;

    @Autowired
    private TenantInterceptor tenantInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new SaInterceptor(handler -> {
                    if (isTrustedInnerRequest()) {
                        return;
                    }
                    StpUtil.checkLogin();
                }))
                .addPathPatterns("/**")
                .excludePathPatterns(Arrays.asList(EXCLUDE_PATHS))
                .order(-100);

        registry.addInterceptor(userContextInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(Arrays.asList(EXCLUDE_PATHS))
                .order(0);

        registry.addInterceptor(tenantInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(Arrays.asList(EXCLUDE_PATHS))
                .order(1);
    }

    /**
     * 仅对显式约定的 `/inner/**` 内部接口放行登录校验，后续再由 `@Inner` 切面做来源校验。
     */
    private boolean isTrustedInnerRequest() {
        ServletRequestAttributes attributes =
                (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return false;
        }

        HttpServletRequest request = attributes.getRequest();
        if (request == null) {
            return false;
        }

        return request.getRequestURI().startsWith("/inner/")
                && SecurityConstants.INNER_CALL_VALUE.equals(
                request.getHeader(SecurityConstants.INNER_CALL_HEADER));
    }
}

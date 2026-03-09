package com.cloudflow.auth.config;

import com.cloudflow.auth.security.AuthJwtUserContextInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * auth 服务 MVC 配置。
 *
 * 这里为 auth 服务补 Bearer JWT -> UserContext 的同步逻辑，
 * 让 @HasPermission 和基于 UserContext 的租户过滤在 auth 自身接口上也能正常工作。
 */
@Configuration
public class AuthUserContextWebMvcConfig implements WebMvcConfigurer {

    private final AuthJwtUserContextInterceptor authJwtUserContextInterceptor;

    public AuthUserContextWebMvcConfig(AuthJwtUserContextInterceptor authJwtUserContextInterceptor) {
        this.authJwtUserContextInterceptor = authJwtUserContextInterceptor;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authJwtUserContextInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns(
                        "/login",
                        "/register",
                        "/captcha/**",
                        "/doc.html",
                        "/webjars/**",
                        "/swagger-resources/**",
                        "/v3/api-docs/**"
                )
                .order(-1);
    }
}

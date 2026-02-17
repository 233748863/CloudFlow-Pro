package com.cloudflow.common.security.config;

import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.tenant.TenantInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置（安全增强版）
 * 
 * 位于 common-security 模块，UserContextInterceptor 可直接注入 RedisCache，
 * 从 Redis 读取用户信息，无需 Header 传递。
 * 
 * 拦截器执行顺序：UserContextInterceptor(order=0) → TenantInterceptor(order=1)
 * 
 * @author CloudFlow
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class SecurityWebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private UserContextInterceptor userContextInterceptor;

    @Autowired
    private TenantInterceptor tenantInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 1. 用户上下文拦截器（从 Redis 读取用户信息）
        registry.addInterceptor(userContextInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/auth/login", "/auth/register", "/doc.html", "/webjars/**", "/swagger-resources/**")
                .order(0);

        // 2. 租户拦截器（从 UserContext 同步 tenantId 到 TenantContext）
        registry.addInterceptor(tenantInterceptor)
                .addPathPatterns("/**")
                .excludePathPatterns("/auth/login", "/auth/register", "/doc.html", "/webjars/**", "/swagger-resources/**")
                .order(1);
    }
}

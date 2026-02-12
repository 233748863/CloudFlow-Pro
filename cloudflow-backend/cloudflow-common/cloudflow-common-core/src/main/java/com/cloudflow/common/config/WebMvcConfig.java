package com.cloudflow.common.config;

import com.cloudflow.common.core.interceptor.UserContextInterceptor;
import com.cloudflow.common.tenant.TenantInterceptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

/**
 * Web MVC 配置
 * 拦截器执行顺序：UserContextInterceptor(order=0) → TenantInterceptor(order=1)
 * 
 * @author CloudFlow
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebMvcConfig implements WebMvcConfigurer {

    @Autowired
    private TenantInterceptor tenantInterceptor;

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        // 1. 用户上下文拦截器（从请求头解析用户信息，包括 tenantId）
        registry.addInterceptor(new UserContextInterceptor())
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

package com.cloudflow.common.config;

import com.cloudflow.common.core.interceptor.UserContextInterceptor;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebMvcConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(new UserContextInterceptor())
                .addPathPatterns("/**")
                .excludePathPatterns("/auth/login", "/auth/register", "/doc.html", "/webjars/**", "/swagger-resources/**");
    }
}

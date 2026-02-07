package com.cloudflow.workflow.config;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;

/**
 * 启用方法级安全性 (RBAC)
 * 使用标准 Spring Security 过滤器链 (Spring Boot 3.x / Security 6.x)
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class WebSecurityConfig {

    @Autowired
    private SecurityContextFilter securityContextFilter;

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            // 禁用 CSRF（因为使用 JWT/Token）
            .csrf(csrf -> csrf.disable())
            
            // 设置为无状态会话（微服务/Token 模式）
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            
            // 授权请求
            .authorizeHttpRequests(auth -> auth
                // 放行 WebSocket 端点
                .requestMatchers("/ws/**").permitAll()
                // 放行 Swagger 相关端点 (可选)
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                // 其他所有请求需要认证
                .anyRequest().authenticated()
            )
            
            // 将自定义过滤器添加到 UsernamePasswordAuthenticationFilter 之前
            .addFilterBefore(securityContextFilter, UsernamePasswordAuthenticationFilter.class);
            
        return http.build();
    }
}

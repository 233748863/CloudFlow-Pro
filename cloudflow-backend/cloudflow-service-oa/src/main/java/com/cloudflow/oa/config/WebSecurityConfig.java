package com.cloudflow.oa.config;

import com.cloudflow.common.security.filter.SecurityContextFilter;
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
 * OA 服务 Spring Security 配置
 * 
 * 禁用默认的表单登录（防止重定向到 /login），使用无状态会话模式。
 * 认证由网关 AuthFilter 统一处理，下游服务通过 SecurityContextFilter
 * 从 X-Auth-Token + Redis 读取用户信息并填充 Spring Security Context。
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
            // 禁用 CSRF（微服务使用 Token 认证，不需要 CSRF）
            .csrf(csrf -> csrf.disable())
            
            // 设置为无状态会话（微服务/Token 模式，不创建 HttpSession）
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            
            // 授权请求
            .authorizeHttpRequests(auth -> auth
                // 放行 WebSocket 端点
                .requestMatchers("/ws/**").permitAll()
                // 放行健康检查端点
                .requestMatchers("/actuator/**").permitAll()
                // 放行 Swagger 相关端点
                .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                // 放行前端错误上报端点（错误可能在未登录时发生，必须允许匿名访问）
                .requestMatchers("/error-report").permitAll()
                // 其他所有请求需要认证（由 SecurityContextFilter 从网关请求头中设置）
                .anyRequest().authenticated()
            )
            
            // 将自定义过滤器添加到 UsernamePasswordAuthenticationFilter 之前
            // 这样 SecurityContextFilter 会先从请求头中提取用户信息并设置 SecurityContext
            // Spring Security 就不会触发默认的表单登录重定向
            .addFilterBefore(securityContextFilter, UsernamePasswordAuthenticationFilter.class);
            
        return http.build();
    }
}

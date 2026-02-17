package com.cloudflow.common.security.config;

import com.cloudflow.common.security.filter.SecurityContextFilter;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * SecurityContextFilter 条件化自动配置
 * 
 * 仅在 classpath 存在 Spring Security 时才注册 SecurityContextFilter Bean。
 * 使用字符串形式的 @ConditionalOnClass 避免类加载阶段的 NoClassDefFoundError。
 * 
 * 这样 auth 服务（无 spring-security 依赖）不会加载此配置类，
 * 而 OA、workflow 服务（有 spring-security 依赖）会正常注册 Bean。
 * 
 * @author CloudFlow
 */
@Configuration
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnClass(name = "org.springframework.security.core.context.SecurityContextHolder")
public class SecurityFilterAutoConfig {

    /**
     * 注册 SecurityContextFilter Bean
     * 仅在 Spring Security 存在时创建
     */
    @Bean
    public SecurityContextFilter securityContextFilter() {
        return new SecurityContextFilter();
    }
}

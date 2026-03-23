package com.cloudflow.hr.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.EnableAspectJAutoProxy;

/**
 * 审计日志配置。
 * 这里只保留 AOP 开关，ObjectMapper 直接复用 Spring Boot 默认配置，
 * 避免覆盖 JavaTimeModule 等全局序列化能力。
 */
@Configuration
@EnableAspectJAutoProxy
public class AuditLogConfig {
}

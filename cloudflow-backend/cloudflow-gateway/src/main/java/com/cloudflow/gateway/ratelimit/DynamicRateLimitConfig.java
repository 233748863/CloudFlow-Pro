package com.cloudflow.gateway.ratelimit;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.ReactiveRedisConnectionFactory;
import org.springframework.data.redis.listener.ReactiveRedisMessageListenerContainer;

/**
 * GOV-P1-1 网关侧动态限流相关 Bean 注册。
 *
 * <p>Spring Boot 默认未自动注册 {@link ReactiveRedisMessageListenerContainer}，
 * 这里显式声明，由 {@link DynamicRateLimitFilter} 订阅规则变更通道。
 */
@Configuration
public class DynamicRateLimitConfig {

    @Bean
    public ReactiveRedisMessageListenerContainer reactiveRedisMessageListenerContainer(
            ReactiveRedisConnectionFactory connectionFactory) {
        return new ReactiveRedisMessageListenerContainer(connectionFactory);
    }
}

package com.cloudflow.hr.config;

import org.redisson.config.SingleServerConfig;
import org.redisson.spring.starter.RedissonAutoConfigurationCustomizer;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
public class HrRedisConfiguration {

    @Bean
    public RedissonAutoConfigurationCustomizer hrRedisPoolCustomizer(
            @Value("${cloudflow.hr.redis.minimum-idle-connections:4}") int minimumIdleConnections) {
        return configuration -> {
            if (configuration.isSingleConfig()) {
                SingleServerConfig server = configuration.useSingleServer();
                if (minimumIdleConnections < 0 || minimumIdleConnections > server.getConnectionPoolSize()) {
                    throw new IllegalArgumentException("HR Redis 最小空闲连接数必须介于 0 与连接池上限之间");
                }
                server.setConnectionMinimumIdleSize(minimumIdleConnections);
            }
        };
    }
}

package com.cloudflow.common.event.config;

import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.outbox.OutboxScheduler;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.core.env.Environment;
import org.springframework.scheduling.annotation.EnableScheduling;

import jakarta.annotation.PostConstruct;

/**
 * 事件总线自动配置。
 * <ul>
 *   <li>注册 OutboxPublisher / OutboxScheduler Bean；</li>
 *   <li>启动期创建 Redis Stream 消费组（若不存在）；</li>
 *   <li>启用 @Scheduled 支持（OutboxScheduler 需要）。</li>
 * </ul>
 */
@Slf4j
@AutoConfiguration
@EnableScheduling
@EnableConfigurationProperties(OutboxProperties.class)
@ComponentScan(basePackages = "com.cloudflow.common.event")
@MapperScan(basePackageClasses = OutboxEventMapper.class)
@ConditionalOnProperty(prefix = "cloudflow.outbox", name = "enabled", havingValue = "true", matchIfMissing = true)
public class EventAutoConfiguration {

    private final RedisStreamUtil redisStreamUtil;
    private final OutboxProperties properties;
    private final Environment environment;

    public EventAutoConfiguration(RedisStreamUtil redisStreamUtil, OutboxProperties properties, Environment environment) {
        this.redisStreamUtil = redisStreamUtil;
        this.properties = properties;
        this.environment = environment;
    }

    @PostConstruct
    public void initStreamGroup() {
        try {
            String consumerGroup = resolveConsumerGroup();
            redisStreamUtil.createGlobalGroup(properties.getStreamKey(), consumerGroup);
            log.info("Outbox Redis Stream 消费组已初始化: streamKey={}, group={}",
                    properties.getStreamKey(), consumerGroup);
        } catch (Exception e) {
            log.warn("Outbox Redis Stream 消费组初始化失败（可能已存在）: {}", e.getMessage());
        }
    }

    private String resolveConsumerGroup() {
        String configured = properties.getConsumerGroup();
        String applicationName = environment.getProperty("spring.application.name", "application");
        if (configured == null || configured.isBlank() || "cloudflow-event-consumer-group".equals(configured)) {
            return "cloudflow-event-consumer-group:" + applicationName;
        }
        return configured;
    }
}

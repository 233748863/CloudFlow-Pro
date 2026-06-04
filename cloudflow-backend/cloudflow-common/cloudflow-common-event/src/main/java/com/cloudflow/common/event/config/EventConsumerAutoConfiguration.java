package com.cloudflow.common.event.config;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventDispatcher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.event.core.BusinessEventIdempotentStore;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.connection.stream.Consumer;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.ReadOffset;
import org.springframework.data.redis.connection.stream.StreamOffset;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.stream.StreamMessageListenerContainer;
import org.springframework.data.redis.stream.Subscription;
import org.springframework.core.env.Environment;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * 业务事件消费自动配置。
 */
@Slf4j
@AutoConfiguration
@ConditionalOnProperty(prefix = "cloudflow.outbox", name = "consumer-enabled", havingValue = "true", matchIfMissing = true)
public class EventConsumerAutoConfiguration {

    @Bean
    @ConditionalOnBean(BusinessEventConsumer.class)
    public BusinessEventDispatcher businessEventDispatcher(List<BusinessEventConsumer> consumers) {
        return new BusinessEventDispatcher(consumers);
    }

    @Bean
    public DeadLetterPublisher deadLetterPublisher(com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil,
                                                   OutboxProperties properties) {
        return new DeadLetterPublisher(redisStreamUtil, properties.getDlqStreamKey());
    }

    @Bean
    public BusinessEventIdempotentStore businessEventIdempotentStore(StringRedisTemplate stringRedisTemplate) {
        return new BusinessEventIdempotentStore(stringRedisTemplate);
    }

    @Bean
    public StreamMessageListenerContainer<String, MapRecord<String, String, String>> businessEventContainer(
            RedisConnectionFactory factory) {
        StreamMessageListenerContainer.StreamMessageListenerContainerOptions<String, MapRecord<String, String, String>> options =
                StreamMessageListenerContainer.StreamMessageListenerContainerOptions.builder()
                        .pollTimeout(Duration.ofSeconds(1))
                        .build();
        StreamMessageListenerContainer<String, MapRecord<String, String, String>> container =
                StreamMessageListenerContainer.create(factory, options);
        container.start();
        return container;
    }

    @Bean
    @ConditionalOnBean(BusinessEventDispatcher.class)
    public Subscription businessEventSubscription(
            StreamMessageListenerContainer<String, MapRecord<String, String, String>> businessEventContainer,
            com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil,
            BusinessEventDispatcher dispatcher,
            DeadLetterPublisher deadLetterPublisher,
            BusinessEventIdempotentStore callbackIdempotentStore,
            ObjectMapper objectMapper,
            OutboxProperties properties,
            Environment environment) {
        String applicationName = environment.getProperty("spring.application.name", "application");
        String consumerGroup = resolveConsumerGroup(properties, applicationName);
        redisStreamUtil.createGlobalGroup(properties.getStreamKey(), consumerGroup);
        String consumerName = properties.getConsumerPrefix() + "-" + applicationName + "-" + UUID.randomUUID().toString().substring(0, 8);
        return businessEventContainer.receive(
                Consumer.from(consumerGroup, consumerName),
                StreamOffset.create(properties.getStreamKey(), ReadOffset.lastConsumed()),
                message -> onMessage(message, dispatcher, deadLetterPublisher, callbackIdempotentStore,
                        objectMapper, properties, redisStreamUtil, consumerGroup, applicationName)
        );
    }

    private void onMessage(MapRecord<String, String, String> message,
                           BusinessEventDispatcher dispatcher,
                           DeadLetterPublisher deadLetterPublisher,
                           BusinessEventIdempotentStore callbackIdempotentStore,
                           ObjectMapper objectMapper,
                           OutboxProperties properties,
                           com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil,
                           String consumerGroup,
                           String applicationName) {
        String msgId = message.getId().getValue();
        try {
            Map<String, String> body = message.getValue();
            BusinessEventEnvelope envelope = objectMapper.readValue(body.get("payload"), BusinessEventEnvelope.class);
            if (!callbackIdempotentStore.acquire(consumerGroup, envelope.getEventId(),
                    Duration.ofHours(properties.getIdempotentTtlHours()))) {
                redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
                return;
            }
            final boolean[] handled = {false};
            TenantBroker.runAs(envelope.getTenantId(), ignored -> {
                try {
                    handled[0] = dispatcher.dispatch(envelope);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            if (!handled[0]) {
                log.debug("当前应用未注册该事件消费者，直接确认消息: app={}, eventType={}, msgId={}",
                        applicationName, envelope.getEventType(), msgId);
            }
            redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
        } catch (Exception ex) {
            log.error("业务事件消费失败: msgId={}", msgId, ex);
            try {
                BusinessEventEnvelope envelope = objectMapper.readValue(message.getValue().get("payload"), BusinessEventEnvelope.class);
                deadLetterPublisher.publish(envelope, ex.getMessage(), 1);
            } catch (Exception ignored) {
                log.error("业务事件写入 DLQ 失败: msgId={}", msgId, ignored);
            }
            redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
        }
    }

    private String resolveConsumerGroup(OutboxProperties properties, String applicationName) {
        String configured = properties.getConsumerGroup();
        if (configured == null || configured.isBlank() || "cloudflow-event-consumer-group".equals(configured)) {
            return "cloudflow-event-consumer-group:" + applicationName;
        }
        return configured;
    }
}

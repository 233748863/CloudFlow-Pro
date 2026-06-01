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
            OutboxProperties properties) {
        redisStreamUtil.createGlobalGroup(properties.getStreamKey(), properties.getConsumerGroup());
        String consumerName = properties.getConsumerPrefix() + "-" + UUID.randomUUID().toString().substring(0, 8);
        return businessEventContainer.receive(
                Consumer.from(properties.getConsumerGroup(), consumerName),
                StreamOffset.create(properties.getStreamKey(), ReadOffset.lastConsumed()),
                message -> onMessage(message, dispatcher, deadLetterPublisher, callbackIdempotentStore, objectMapper, properties, redisStreamUtil)
        );
    }

    private void onMessage(MapRecord<String, String, String> message,
                           BusinessEventDispatcher dispatcher,
                           DeadLetterPublisher deadLetterPublisher,
                           BusinessEventIdempotentStore callbackIdempotentStore,
                           ObjectMapper objectMapper,
                           OutboxProperties properties,
                           com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil) {
        String msgId = message.getId().getValue();
        try {
            Map<String, String> body = message.getValue();
            BusinessEventEnvelope envelope = objectMapper.readValue(body.get("payload"), BusinessEventEnvelope.class);
            if (!callbackIdempotentStore.acquire(envelope.getEventId(), Duration.ofHours(properties.getIdempotentTtlHours()))) {
                redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getConsumerGroup(), msgId);
                redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
                return;
            }
            TenantBroker.runAs(envelope.getTenantId(), ignored -> {
                try {
                    dispatcher.dispatch(envelope);
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            });
            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getConsumerGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
        } catch (Exception ex) {
            log.error("业务事件消费失败: msgId={}", msgId, ex);
            try {
                BusinessEventEnvelope envelope = objectMapper.readValue(message.getValue().get("payload"), BusinessEventEnvelope.class);
                deadLetterPublisher.publish(envelope, ex.getMessage(), 1);
            } catch (Exception ignored) {
                log.error("业务事件写入 DLQ 失败: msgId={}", msgId, ignored);
            }
            redisStreamUtil.ackGlobal(properties.getStreamKey(), properties.getConsumerGroup(), msgId);
            redisStreamUtil.deleteGlobal(properties.getStreamKey(), msgId);
        }
    }
}

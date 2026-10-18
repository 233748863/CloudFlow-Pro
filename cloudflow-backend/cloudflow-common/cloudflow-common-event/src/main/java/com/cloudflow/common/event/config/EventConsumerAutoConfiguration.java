package com.cloudflow.common.event.config;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventDispatcher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.event.core.BusinessEventIdempotentStore;
import com.cloudflow.common.event.core.BusinessEventPendingReclaimer;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.DependsOn;
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
import java.util.UUID;
import java.util.concurrent.ScheduledFuture;

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

    @Bean(destroyMethod = "close")
    public BusinessEventIdempotentStore businessEventIdempotentStore(StringRedisTemplate stringRedisTemplate) {
        return new BusinessEventIdempotentStore(stringRedisTemplate);
    }

    @Bean(destroyMethod = "stop")
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
        properties.validateConsumer();
        String applicationName = environment.getProperty("spring.application.name", "application");
        String consumerGroup = resolveConsumerGroup(properties, applicationName);
        redisStreamUtil.createGlobalGroup(properties.getStreamKey(), consumerGroup);
        String consumerName = properties.getConsumerPrefix() + "-" + applicationName + "-" + UUID.randomUUID().toString().substring(0, 8);
        StreamMessageListenerContainer.ConsumerStreamReadRequest<String> request = StreamMessageListenerContainer.StreamReadRequest.builder(
                        StreamOffset.create(properties.getStreamKey(), ReadOffset.lastConsumed()))
                .consumer(Consumer.from(consumerGroup, consumerName))
                .autoAcknowledge(false)
                .cancelOnError(failure -> false)
                .errorHandler(failure -> log.warn("业务事件读取暂不可用，继续重试: app={}, type={}", applicationName, failure.getClass().getSimpleName()))
                .build();
        return businessEventContainer.register(request,
                message -> onMessage(message, dispatcher, deadLetterPublisher, callbackIdempotentStore,
                        objectMapper, properties, redisStreamUtil, consumerGroup, applicationName)
        );
    }

    @Bean(initMethod = "start", destroyMethod = "close")
    @DependsOn("businessEventSubscription")
    @ConditionalOnBean(BusinessEventDispatcher.class)
    public BusinessEventPendingReclaimer businessEventPendingReclaimer(StringRedisTemplate redis,
            com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil, BusinessEventDispatcher dispatcher,
            DeadLetterPublisher deadLetterPublisher, BusinessEventIdempotentStore idempotentStore,
            ObjectMapper objectMapper, OutboxProperties properties, Environment environment) {
        String application = environment.getProperty("spring.application.name", "application");
        String group = resolveConsumerGroup(properties, application);
        return new BusinessEventPendingReclaimer(redis, properties, group,
                message -> onMessage(message, dispatcher, deadLetterPublisher, idempotentStore,
                        objectMapper, properties, redisStreamUtil, group, application));
    }

    void onMessage(MapRecord<String, String, String> message,
                   BusinessEventDispatcher dispatcher,
                   DeadLetterPublisher deadLetterPublisher,
                   BusinessEventIdempotentStore callbackIdempotentStore,
                   ObjectMapper objectMapper,
                   OutboxProperties properties,
                   com.cloudflow.common.redis.core.RedisStreamUtil redisStreamUtil,
                   String consumerGroup,
                   String applicationName) {
        String msgId = message.getId().getValue();
        BusinessEventEnvelope envelope;
        try {
            envelope = readEnvelopePayload(message.getValue() == null ? null : message.getValue().get("payload"), objectMapper);
            if (envelope.getTenantId() == null || envelope.getTenantId() <= 0) {
                throw new IllegalArgumentException("业务事件租户无效");
            }
        } catch (Exception failure) {
            quarantine(message, null, deadLetterPublisher, callbackIdempotentStore, properties, redisStreamUtil, consumerGroup, failure, 1);
            return;
        }
        if (!dispatcher.supports(envelope.getEventType())) {
            try {
                redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
            } catch (Exception unavailable) {
                log.warn("未订阅事件确认未成功，保持待处理: msgId={}, type={}", msgId, unavailable.getClass().getSimpleName());
            }
            return;
        }
        Duration processingTtl = Duration.ofSeconds(properties.getConsumerProcessingLeaseSeconds());
        Duration retentionTtl = Duration.ofHours(properties.getIdempotentTtlHours());
        BusinessEventIdempotentStore.Lease lease;
        try {
            lease = callbackIdempotentStore.acquire(consumerGroup, envelope, processingTtl, retentionTtl);
        } catch (Exception unavailable) {
            log.warn("业务事件处理租约未取得，保留待处理消息: app={}, msgId={}, type={}", applicationName, msgId, unavailable.getClass().getSimpleName());
            return;
        }
        if (lease.state() == BusinessEventIdempotentStore.State.PROCESSING) return;
        if (lease.state() == BusinessEventIdempotentStore.State.CONFLICT) {
            quarantine(message, null, deadLetterPublisher, callbackIdempotentStore, properties, redisStreamUtil, consumerGroup,
                    new IllegalArgumentException("BUSINESS_EVENT_PAYLOAD_CONFLICT"), 1);
            return;
        }
        if (lease.state() == BusinessEventIdempotentStore.State.DONE) {
            acknowledgeDone(message, lease, callbackIdempotentStore, properties, consumerGroup);
            return;
        }
        ScheduledFuture<?> renewal = null;
        try {
            renewal = callbackIdempotentStore.keepAlive(lease, processingTtl, retentionTtl);
            TenantBroker.runAs(envelope.getTenantId(), ignored -> {
                try {
                    dispatcher.dispatch(envelope);
                } catch (Exception failure) {
                    throw new RuntimeException(failure);
                }
            });
            if (callbackIdempotentStore.complete(lease, retentionTtl)) {
                acknowledgeDone(message, lease, callbackIdempotentStore, properties, consumerGroup);
            } else {
                log.warn("业务事件旧租约不能标记完成，保留待处理消息: app={}, msgId={}", applicationName, msgId);
            }
        } catch (Exception failure) {
            log.error("业务事件消费未完成: app={}, msgId={}, attempt={}, type={}", applicationName, msgId, lease.attempts(), failure.getClass().getSimpleName());
            try {
                if (callbackIdempotentStore.renew(lease, processingTtl, retentionTtl)
                        && lease.attempts() >= properties.getConsumerMaxRetry()) {
                    quarantine(message, lease, deadLetterPublisher, callbackIdempotentStore, properties, redisStreamUtil,
                            consumerGroup, failure, (int) Math.min(Integer.MAX_VALUE, lease.attempts()));
                }
            } catch (Exception unavailable) {
                log.warn("业务事件失败状态未确认，消息仍待处理: msgId={}, type={}", msgId, unavailable.getClass().getSimpleName());
            } finally {
                try {
                    callbackIdempotentStore.release(lease);
                } catch (Exception unavailable) {
                    log.warn("业务事件租约未释放，等待到期后接管: msgId={}, type={}", msgId, unavailable.getClass().getSimpleName());
                }
            }
        } finally {
            if (renewal != null) renewal.cancel(false);
        }
    }

    static BusinessEventEnvelope readEnvelopePayload(String rawPayload, ObjectMapper objectMapper) throws Exception {
        return BusinessEventEnvelopeCodec.read(rawPayload, objectMapper);
    }

    private void acknowledgeDone(MapRecord<String, String, String> message, BusinessEventIdempotentStore.Lease lease,
            BusinessEventIdempotentStore idempotentStore, OutboxProperties properties, String group) {
        try {
            idempotentStore.acknowledgeDone(lease, properties.getStreamKey(), group, message.getId().getValue());
        } catch (Exception failure) {
            log.warn("业务事件已完成，消息确认失败将由重领恢复: msgId={}, type={}", message.getId().getValue(), failure.getClass().getSimpleName());
        }
    }

    private void quarantine(MapRecord<String, String, String> message, BusinessEventIdempotentStore.Lease lease,
            DeadLetterPublisher deadLetterPublisher, BusinessEventIdempotentStore idempotentStore, OutboxProperties properties,
            com.cloudflow.common.redis.core.RedisStreamUtil streams, String group, Exception failure, int attempts) {
        String messageId = message.getId().getValue();
        try {
            String category = "BUSINESS_EVENT_PAYLOAD_CONFLICT".equals(failure.getMessage())
                    ? "BUSINESS_EVENT_PAYLOAD_CONFLICT" : failure.getClass().getName();
            deadLetterPublisher.publishRaw(messageId, properties.getStreamKey(), group, message.getValue(), category, attempts);
            if (lease == null) {
                streams.ackGlobal(properties.getStreamKey(), group, messageId);
            } else {
                idempotentStore.acknowledgeFailure(lease, properties.getStreamKey(), group, messageId);
            }
            log.warn("业务事件已转存失败队列: group={}, msgId={}, reason={}", group, messageId, category);
        } catch (Exception unavailable) {
            log.error("业务事件失败消息尚未安全转存，保留待处理: msgId={}, type={}", messageId, unavailable.getClass().getSimpleName());
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

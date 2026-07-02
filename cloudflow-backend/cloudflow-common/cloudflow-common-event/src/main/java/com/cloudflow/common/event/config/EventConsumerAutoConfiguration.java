package com.cloudflow.common.event.config;

import com.cloudflow.common.event.core.BusinessEventConsumer;
import com.cloudflow.common.event.core.BusinessEventDispatcher;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.event.core.BusinessEventIdempotentStore;
import com.cloudflow.common.tenant.TenantBroker;
import com.fasterxml.jackson.databind.JsonNode;
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

import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.Duration;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
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
        Map<String, String> body = message.getValue();
        BusinessEventEnvelope envelope = null;
        try {
            envelope = readEnvelopePayload(body != null ? body.get("payload") : null, objectMapper);
            if (!callbackIdempotentStore.acquire(consumerGroup, envelope.getEventId(),
                    Duration.ofHours(properties.getIdempotentTtlHours()))) {
                redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
                return;
            }
            final boolean[] handled = {false};
            BusinessEventEnvelope eventEnvelope = envelope;
            TenantBroker.runAs(eventEnvelope.getTenantId(), ignored -> {
                try {
                    handled[0] = dispatcher.dispatch(eventEnvelope);
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
            if (publishDeadLetter(deadLetterPublisher, envelope, body, msgId, consumerGroup,
                    properties.getStreamKey(), ex)) {
                redisStreamUtil.ackGlobal(properties.getStreamKey(), consumerGroup, msgId);
            }
        }
    }

    static BusinessEventEnvelope readEnvelopePayload(String rawPayload, ObjectMapper objectMapper) throws Exception {
        if (rawPayload == null || rawPayload.isBlank()) {
            throw new IllegalArgumentException("business event payload is blank");
        }

        JsonNode node = objectMapper.readTree(rawPayload);
        if (node != null && node.isTextual()) {
            String nestedPayload = node.asText();
            if (nestedPayload == null || nestedPayload.isBlank()) {
                throw new IllegalArgumentException("business event payload text is blank");
            }
            node = objectMapper.readTree(nestedPayload);
        }
        if (node == null || !node.isObject()) {
            throw new IllegalArgumentException("business event payload must be a JSON object");
        }

        BusinessEventEnvelope envelope = toEnvelope(node, objectMapper);
        if (envelope.getEventId() == null || envelope.getEventId().isBlank()) {
            throw new IllegalArgumentException("business event eventId is blank");
        }
        if (envelope.getEventType() == null || envelope.getEventType().isBlank()) {
            throw new IllegalArgumentException("business event eventType is blank");
        }
        return envelope;
    }

    private static BusinessEventEnvelope toEnvelope(JsonNode node, ObjectMapper objectMapper) throws Exception {
        BusinessEventEnvelope envelope = new BusinessEventEnvelope();
        envelope.setEventId(textValue(node, "eventId"));
        envelope.setEventType(textValue(node, "eventType"));
        envelope.setSourceModule(textValue(node, "sourceModule"));
        envelope.setSourceId(longValue(node, "sourceId"));
        envelope.setPayload(payloadValue(node.get("payload"), objectMapper));
        envelope.setOccurredAt(localDateTimeValue(node, "occurredAt"));
        envelope.setTenantId(longValue(node, "tenantId"));
        return envelope;
    }

    private static String textValue(JsonNode node, String fieldName) {
        JsonNode value = node.get(fieldName);
        if (value == null || value.isNull()) {
            return null;
        }
        return value.asText();
    }

    private static Long longValue(JsonNode node, String fieldName) {
        JsonNode value = node.get(fieldName);
        if (value == null || value.isNull() || (value.isTextual() && value.asText().isBlank())) {
            return null;
        }
        return value.asLong();
    }

    private static String payloadValue(JsonNode payload, ObjectMapper objectMapper) throws Exception {
        if (payload == null || payload.isNull()) {
            return null;
        }
        if (payload.isTextual()) {
            return payload.asText();
        }
        return objectMapper.writeValueAsString(payload);
    }

    private static LocalDateTime localDateTimeValue(JsonNode node, String fieldName) {
        String value = textValue(node, fieldName);
        if (value == null || value.isBlank()) {
            return null;
        }
        return parseLocalDateTime(value);
    }

    private static LocalDateTime parseLocalDateTime(String value) {
        String text = value.trim();
        try {
            return LocalDateTime.parse(text, DateTimeFormatter.ISO_LOCAL_DATE_TIME);
        } catch (DateTimeParseException ignored) {
            // Fall through to legacy formats.
        }
        try {
            return OffsetDateTime.parse(text, DateTimeFormatter.ISO_OFFSET_DATE_TIME).toLocalDateTime();
        } catch (DateTimeParseException ignored) {
            // Fall through to legacy formats.
        }
        try {
            return LocalDateTime.parse(text, DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
        } catch (DateTimeParseException ex) {
            throw new IllegalArgumentException("business event occurredAt is invalid: " + text, ex);
        }
    }

    private boolean publishDeadLetter(DeadLetterPublisher deadLetterPublisher,
                                      BusinessEventEnvelope envelope,
                                      Map<String, String> body,
                                      String msgId,
                                      String consumerGroup,
                                      String streamKey,
                                      Exception ex) {
        try {
            String lastError = truncate(ex.getMessage(), 500);
            if (envelope != null) {
                deadLetterPublisher.publish(envelope, lastError, 1);
            } else {
                deadLetterPublisher.publishRaw(msgId, streamKey, consumerGroup, body, lastError, 1);
            }
            return true;
        } catch (Exception dlqEx) {
            log.error("业务事件写入 DLQ 失败，消息保留待重试: msgId={}", msgId, dlqEx);
            return false;
        }
    }

    private String truncate(String str, int maxLen) {
        if (str == null || str.length() <= maxLen) {
            return str;
        }
        return str.substring(0, maxLen);
    }

    private String resolveConsumerGroup(OutboxProperties properties, String applicationName) {
        String configured = properties.getConsumerGroup();
        if (configured == null || configured.isBlank() || "cloudflow-event-consumer-group".equals(configured)) {
            return "cloudflow-event-consumer-group:" + applicationName;
        }
        return configured;
    }
}

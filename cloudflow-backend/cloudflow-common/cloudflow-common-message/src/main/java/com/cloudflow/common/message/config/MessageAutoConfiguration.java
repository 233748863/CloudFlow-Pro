package com.cloudflow.common.message.config;

import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.constant.MessageEventType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.core.env.Environment;

import java.util.List;
import java.util.Locale;
import java.util.UUID;
import java.nio.charset.StandardCharsets;

/**
 * 统一消息 SDK 自动配置。
 */
@AutoConfiguration
public class MessageAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean(com.cloudflow.common.message.push.MessagePushGateway.class)
    public com.cloudflow.common.message.push.MessagePushGateway noOpMessagePushGateway() {
        return (userId, message) -> { };
    }

    @Bean
    @ConditionalOnMissingBean(MessageSender.class)
    public MessageSender messageSender(OutboxPublisher outboxPublisher,
                                       ObjectMapper objectMapper,
                                       Environment environment) {
        return request -> publish(request, outboxPublisher, objectMapper, environment);
    }

    @Bean
    @ConditionalOnMissingBean(MessageSecretCipher.class)
    public MessageSecretCipher messageSecretCipher(Environment environment) {
        return new MessageSecretCipher(environment.getProperty("cloudflow.message.secret-key",
                environment.getProperty("CLOUDFLOW_MESSAGE_SECRET_KEY", "")));
    }

    private void publish(MessageSendRequest request, OutboxPublisher outboxPublisher,
                          ObjectMapper objectMapper, Environment environment) {
        if (request == null) {
            return;
        }
        List<com.cloudflow.common.message.api.MessageReceiver> validReceivers = request.safeReceivers().stream()
                .filter(this::isValidReceiver)
                .toList();
        if (validReceivers.isEmpty()) return;
        try {
            String sourceModule = environment.getProperty("spring.application.name", "cloudflow-unknown");
            Long sourceId = null;
            if (request.getBizId() != null) {
                try {
                    sourceId = Long.valueOf(request.getBizId());
                } catch (NumberFormatException ignored) {
                    // 非数字业务号保留在 payload，聚合 ID 使用 0 占位。
                }
            }
            if (sourceId == null) {
                sourceId = 0L;
            }
            MessageSendRequest payload = request.toBuilder().receivers(validReceivers).build();
            Long tenantId = UserContext.getTenantId();
            if (tenantId == null) tenantId = TenantContext.getTenantId();
            if (tenantId == null) tenantId = 100000L;
            BusinessEventEnvelope envelope = BusinessEventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType(MessageEventType.SEND)
                    .sourceModule(sourceModule)
                    .sourceId(sourceId)
                    .tenantId(tenantId)
                    .build();
            boolean stableIdentity = request.getDeduplicationKey() != null && !request.getDeduplicationKey().isBlank()
                    && request.getResendFromId() == null
                    && (request.getRetryAttempt() == null || request.getRetryAttempt() == 0);
            if (stableIdentity) {
                envelope.setEventId(UUID.nameUUIDFromBytes((sourceModule + ":" + tenantId + ":" + request.getDeduplicationKey())
                        .getBytes(StandardCharsets.UTF_8)).toString());
            }
            MessagePayloadCodec.encode(envelope, payload, objectMapper, messageSecretCipher(environment));
            if (stableIdentity) {
                outboxPublisher.publishOnceAt(envelope, request.getScheduleTime());
            } else {
                outboxPublisher.publishAt(envelope, request.getScheduleTime());
            }
        } catch (Exception e) {
            throw new IllegalArgumentException("消息事件序列化失败", e);
        }
    }

    private boolean isValidReceiver(com.cloudflow.common.message.api.MessageReceiver receiver) {
        if (receiver == null) return false;
        String type = receiver.getReceiverType() == null
                ? "USER" : receiver.getReceiverType().trim().toUpperCase(Locale.ROOT);
        return switch (type) {
            case "USER", "ROLE", "DEPT" -> receiver.getReceiverId() != null;
            case "PHONE", "EMAIL" -> receiver.getReceiverAddress() != null
                    && !receiver.getReceiverAddress().isBlank();
            default -> false;
        };
    }
}

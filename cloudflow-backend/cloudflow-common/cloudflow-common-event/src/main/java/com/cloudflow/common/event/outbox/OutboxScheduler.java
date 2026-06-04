package com.cloudflow.common.event.outbox;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.event.config.OutboxProperties;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Outbox 调度器。每 5s 扫 outbox_event 表 PENDING 记录，发到 Redis Stream。
 * <ul>
 *   <li>成功：status → PUBLISHED，publishedAt = now</li>
 *   <li>失败：retryCount++，nextRetryAt = now + 指数退避（base * 2^retryCount，max 1h）</li>
 *   <li>超过 maxRetry=8：status → FAILED，lastError 记录原因</li>
 * </ul>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxScheduler {

    private final OutboxEventMapper outboxEventMapper;
    private final RedisStreamUtil redisStreamUtil;
    private final OutboxProperties properties;
    private final ObjectMapper objectMapper;
    private final DeadLetterPublisher deadLetterPublisher;
    private final String ownerId = UUID.randomUUID().toString().substring(0, 8);

    @Scheduled(fixedDelayString = "${cloudflow.outbox.scan-interval-ms:5000}")
    public void scanAndPublish() {
        LocalDateTime now = LocalDateTime.now();
        String owner = properties.getOwner() + "-" + ownerId;
        outboxEventMapper.claimBatch(owner, now, now.plusSeconds(properties.getLockSeconds()), properties.getBatchSize());
        List<OutboxEvent> pending = outboxEventMapper.selectClaimedEvents(owner, properties.getBatchSize());
        if (pending == null || pending.isEmpty()) {
            return;
        }

        log.debug("Outbox 扫描到 {} 条待发布事件", pending.size());
        for (OutboxEvent event : pending) {
            try {
                publishToStream(event);
                markPublished(event, owner);
            } catch (Exception e) {
                handleFailure(event, owner, e);
            }
        }
    }

    private void publishToStream(OutboxEvent event) {
        Map<String, Object> content = new HashMap<>();
        content.put("eventId", extractEventId(event));
        content.put("eventType", event.getEventType());
        content.put("payload", event.getPayloadJson());
        content.put("tenantId", event.getTenantId());

        String msgId = redisStreamUtil.publishGlobal(properties.getStreamKey(), content);
        if (properties.getStreamMaxLen() > 0) {
            redisStreamUtil.trimGlobal(properties.getStreamKey(), properties.getStreamMaxLen(), true);
        }
        log.info("Outbox 事件已发布到 Redis Stream: eventType={}, msgId={}, outboxId={}",
                event.getEventType(), msgId, event.getId());
    }

    private void markPublished(OutboxEvent event, String owner) {
        outboxEventMapper.markPublished(event.getId(), owner, LocalDateTime.now());
    }

    private void handleFailure(OutboxEvent event, String owner, Exception e) {
        int newRetryCount = event.getRetryCount() + 1;
        log.error("Outbox 事件发布失败(第{}次): eventType={}, outboxId={}",
                newRetryCount, event.getEventType(), event.getId(), e);

        if (newRetryCount >= properties.getMaxRetry()) {
            outboxEventMapper.markFailed(event.getId(), owner, newRetryCount, LocalDateTime.now(),
                    truncate(e.getMessage(), 500), "DLQ");
            deadLetterPublisher.publish(readEnvelope(event), truncate(e.getMessage(), 500), newRetryCount);
            log.error("Outbox 事件超过最大重试次数，标记 DLQ: eventType={}, outboxId={}",
                    event.getEventType(), event.getId());
        } else {
            LocalDateTime nextRetry = calculateNextRetry(newRetryCount);
            outboxEventMapper.markFailed(event.getId(), owner, newRetryCount, nextRetry,
                    truncate(e.getMessage(), 500), "FAILED");
        }
    }

    private LocalDateTime calculateNextRetry(int retryCount) {
        // 指数退避：base * 2^retryCount，max 1h
        long delaySeconds = Math.min(properties.getRetryBaseSeconds() * (1L << retryCount), 3600);
        return LocalDateTime.now().plusSeconds(delaySeconds);
    }

    private String extractEventId(OutboxEvent event) {
        try {
            Map<?, ?> map = objectMapper.readValue(event.getPayloadJson(), Map.class);
            return (String) map.get("eventId");
        } catch (Exception e) {
            return "unknown";
        }
    }

    private com.cloudflow.common.event.core.BusinessEventEnvelope readEnvelope(OutboxEvent event) {
        try {
            return objectMapper.readValue(event.getPayloadJson(), com.cloudflow.common.event.core.BusinessEventEnvelope.class);
        } catch (Exception e) {
            com.cloudflow.common.event.core.BusinessEventEnvelope envelope = new com.cloudflow.common.event.core.BusinessEventEnvelope();
            envelope.setEventId(event.getEventId());
            envelope.setEventType(event.getEventType());
            envelope.setSourceId(event.getAggregateId());
            envelope.setSourceModule(event.getAggregateType());
            envelope.setTenantId(event.getTenantId());
            return envelope;
        }
    }

    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}

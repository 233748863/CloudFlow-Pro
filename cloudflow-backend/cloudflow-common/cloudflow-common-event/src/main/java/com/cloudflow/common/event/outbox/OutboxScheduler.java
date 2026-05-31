package com.cloudflow.common.event.outbox;

import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.cloudflow.common.event.config.OutboxProperties;
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

    @Scheduled(fixedDelayString = "${cloudflow.outbox.scan-interval-ms:5000}")
    public void scanAndPublish() {
        LocalDateTime now = LocalDateTime.now();
        List<OutboxEvent> pending = outboxEventMapper.selectPendingEvents(now, properties.getBatchSize());
        if (pending.isEmpty()) {
            return;
        }

        log.debug("Outbox 扫描到 {} 条待发布事件", pending.size());
        for (OutboxEvent event : pending) {
            try {
                publishToStream(event);
                markPublished(event);
            } catch (Exception e) {
                handleFailure(event, e);
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
        log.info("Outbox 事件已发布到 Redis Stream: eventType={}, msgId={}, outboxId={}",
                event.getEventType(), msgId, event.getId());
    }

    private void markPublished(OutboxEvent event) {
        outboxEventMapper.update(null, new LambdaUpdateWrapper<OutboxEvent>()
                .eq(OutboxEvent::getId, event.getId())
                .set(OutboxEvent::getStatus, "PUBLISHED")
                .set(OutboxEvent::getPublishedAt, LocalDateTime.now()));
    }

    private void handleFailure(OutboxEvent event, Exception e) {
        int newRetryCount = event.getRetryCount() + 1;
        log.error("Outbox 事件发布失败(第{}次): eventType={}, outboxId={}",
                newRetryCount, event.getEventType(), event.getId(), e);

        if (newRetryCount >= properties.getMaxRetry()) {
            outboxEventMapper.update(null, new LambdaUpdateWrapper<OutboxEvent>()
                    .eq(OutboxEvent::getId, event.getId())
                    .set(OutboxEvent::getStatus, "FAILED")
                    .set(OutboxEvent::getRetryCount, newRetryCount)
                    .set(OutboxEvent::getLastError, truncate(e.getMessage(), 500)));
            log.error("Outbox 事件超过最大重试次数，标记 FAILED: eventType={}, outboxId={}",
                    event.getEventType(), event.getId());
        } else {
            LocalDateTime nextRetry = calculateNextRetry(newRetryCount);
            outboxEventMapper.update(null, new LambdaUpdateWrapper<OutboxEvent>()
                    .eq(OutboxEvent::getId, event.getId())
                    .set(OutboxEvent::getRetryCount, newRetryCount)
                    .set(OutboxEvent::getNextRetryAt, nextRetry)
                    .set(OutboxEvent::getLastError, truncate(e.getMessage(), 500)));
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

    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}

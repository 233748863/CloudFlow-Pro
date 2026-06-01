package com.cloudflow.common.event.outbox;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Outbox 发布器。业务方法内调用 publish，写 outbox_event 表（PENDING）。
 * OutboxScheduler 异步扫表发到 Redis Stream。
 * <p>
 * 线程安全：每次调用都是独立事务，无共享状态。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxPublisher {

    private final OutboxEventMapper outboxEventMapper;
    private final ObjectMapper objectMapper;

    /**
     * 发布事件到 outbox 表。必须在业务事务内调用，保证原子性。
     * <p>
     * 示例：
     * <pre>
     * &#64;Transactional
     * public void submitExpenseClaim(Long id) {
     *     // 1. 更新业务表
     *     expenseClaimMapper.updateById(...);
     *     // 2. 写 outbox
     *     outboxPublisher.publish(BusinessEventEnvelope.builder()
     *         .eventType("ExpenseClaimSubmittedEvent")
     *         .sourceModule("cloudflow-oa")
     *         .sourceId(id)
     *         .payload(toJson(dto))
     *         .build());
     * }
     * </pre>
     */
    @Transactional(rollbackFor = Exception.class)
    public void publish(BusinessEventEnvelope envelope) {
        if (envelope.getEventId() == null) {
            envelope.setEventId(UUID.randomUUID().toString());
        }
        if (envelope.getOccurredAt() == null) {
            envelope.setOccurredAt(LocalDateTime.now());
        }
        if (envelope.getTenantId() == null) {
            envelope.setTenantId(UserContext.getTenantId());
        }

        OutboxEvent outbox = new OutboxEvent();
        outbox.setAggregateType(envelope.getSourceModule());
        outbox.setAggregateId(envelope.getSourceId());
        outbox.setEventType(envelope.getEventType());
        outbox.setEventId(envelope.getEventId());
        try {
            outbox.setPayloadJson(objectMapper.writeValueAsString(envelope));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("事件序列化失败: " + envelope.getEventType(), e);
        }
        outbox.setStatus("PENDING");
        outbox.setRetryCount(0);
        outbox.setNextRetryAt(LocalDateTime.now());
        outbox.setCreatedAt(LocalDateTime.now());
        outbox.setTenantId(envelope.getTenantId());
        outbox.setLockedBy(null);
        outbox.setLockedUntil(null);

        outboxEventMapper.insert(outbox);
        log.debug("Outbox 事件已写入: eventType={}, eventId={}, aggregateId={}",
                envelope.getEventType(), envelope.getEventId(), envelope.getSourceId());
    }
}

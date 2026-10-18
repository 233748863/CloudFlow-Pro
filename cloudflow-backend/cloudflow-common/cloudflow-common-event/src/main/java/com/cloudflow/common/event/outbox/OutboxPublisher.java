package com.cloudflow.common.event.outbox;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.BusinessEventEnvelopeCodec;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import org.springframework.dao.DuplicateKeyException;

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

    @Transactional(rollbackFor = Exception.class)
    public void publishOnceAt(BusinessEventEnvelope envelope, LocalDateTime nextAttemptAt) {
        if (envelope.getEventId() == null || envelope.getTenantId() == null) {
            throw new IllegalArgumentException("幂等事件必须提供事件ID与租户ID");
        }
        LambdaQueryWrapper<OutboxEvent> existing = new LambdaQueryWrapper<OutboxEvent>()
                .eq(OutboxEvent::getEventId, envelope.getEventId()).eq(OutboxEvent::getTenantId, envelope.getTenantId());
        OutboxEvent existingEvent = outboxEventMapper.selectOne(existing);
        if (existingEvent != null) {
            verifyIdentity(envelope, existingEvent);
            return;
        }
        try {
            publishAt(envelope, nextAttemptAt);
        } catch (DuplicateKeyException duplicate) {
            OutboxEvent winner = outboxEventMapper.lockExistingPayload(envelope.getEventId(), envelope.getTenantId());
            if (winner == null) throw duplicate;
            verifyIdentity(envelope, winner);
        }
    }

    private void verifyIdentity(BusinessEventEnvelope envelope, OutboxEvent existing) {
        if (envelope.getPayloadDigest() == null) return;
        try {
            BusinessEventEnvelope original = BusinessEventEnvelopeCodec.read(existing.getPayloadJson(), objectMapper);
            if (!java.util.Objects.equals(envelope.getPayloadDigest(), original.getPayloadDigest())
                    || !java.util.Objects.equals(envelope.getEventType(), original.getEventType())
                    || !java.util.Objects.equals(envelope.getSourceModule(), original.getSourceModule())
                    || !java.util.Objects.equals(envelope.getSourceId(), original.getSourceId())) {
                throw new IllegalArgumentException("同源消息内容不一致");
            }
        } catch (JsonProcessingException failure) {
            throw new IllegalArgumentException("既有消息事件摘要无法核验");
        }
    }

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
        publishAt(envelope, null);
    }

    /**
     * 发布可延迟扫描的事件。未来时间用于消息免打扰、渠道限流与失败重试；
     * 仍写同一张 outbox 表并参与调用方当前事务。
     */
    @Transactional(rollbackFor = Exception.class)
    public void publishAt(BusinessEventEnvelope envelope, LocalDateTime nextAttemptAt) {
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
        outbox.setAggregateType(envelope.getSourceModule() == null || envelope.getSourceModule().isBlank()
                ? "cloudflow-unknown" : envelope.getSourceModule());
        // 表结构要求 aggregate_id NOT NULL；没有数值业务主键的事件统一用 0 作占位，
        // 真正业务标识仍完整保留在 payload 中。
        outbox.setAggregateId(envelope.getSourceId() == null ? 0L : envelope.getSourceId());
        outbox.setEventType(envelope.getEventType());
        outbox.setEventId(envelope.getEventId());
        try {
            outbox.setPayloadJson(objectMapper.writeValueAsString(envelope));
        } catch (JsonProcessingException e) {
            throw new IllegalArgumentException("事件序列化失败: " + envelope.getEventType(), e);
        }
        outbox.setStatus("PENDING");
        outbox.setRetryCount(0);
        LocalDateTime now = LocalDateTime.now();
        outbox.setNextRetryAt(nextAttemptAt != null && nextAttemptAt.isAfter(now) ? nextAttemptAt : now);
        outbox.setCreatedAt(LocalDateTime.now());
        outbox.setTenantId(envelope.getTenantId());
        outbox.setLockedBy(null);
        outbox.setLockedUntil(null);

        if (outboxEventMapper.insert(outbox) != 1) throw new IllegalStateException("事件来源未成功保存");
        log.debug("Outbox 事件已写入: eventType={}, eventId={}, aggregateId={}",
                envelope.getEventType(), envelope.getEventId(), envelope.getSourceId());
    }
}

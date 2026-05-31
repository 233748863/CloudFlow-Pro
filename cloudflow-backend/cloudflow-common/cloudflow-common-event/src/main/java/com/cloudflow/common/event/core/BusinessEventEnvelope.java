package com.cloudflow.common.event.core;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 业务事件信封。所有跨模块事件统一用该结构发布到 Redis Stream。
 * <p>
 * 发布方：业务方法内调 outboxPublisher.publish(envelope)，写 outbox_event 表（PENDING）；
 * OutboxScheduler 每 5s 扫 PENDING → 发到 Redis Stream → 改 PUBLISHED。
 * <p>
 * 订阅方：实现 StreamListener&lt;String, MapRecord&gt;，从 Redis Stream 消费，
 * 反序列化 payload 后调业务 handler。
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class BusinessEventEnvelope implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 事件唯一 ID（UUID），用于幂等去重 */
    private String eventId;

    /** 事件类型（如 ExpenseClaimSubmittedEvent / OfferAcceptedEvent），订阅方按此路由 */
    private String eventType;

    /** 源模块（如 cloudflow-oa / cloudflow-hr），用于日志追踪 */
    private String sourceModule;

    /** 源实体 ID（如报销单 ID / Offer ID），用于日志追踪与幂等 key */
    private Long sourceId;

    /** 事件负载 JSON（业务自定义结构），订阅方反序列化为具体 DTO */
    private String payload;

    /** 事件发生时间（业务时间，非 outbox 写入时间） */
    private LocalDateTime occurredAt;

    /** 租户 ID（多租户场景，订阅方需显式 TenantBroker.runAs） */
    private Long tenantId;
}

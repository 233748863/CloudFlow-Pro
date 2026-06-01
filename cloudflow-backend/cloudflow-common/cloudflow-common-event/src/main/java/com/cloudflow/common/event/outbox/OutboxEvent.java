package com.cloudflow.common.event.outbox;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Outbox 事件表实体。业务事务内写 PENDING，OutboxScheduler 异步发到 Redis Stream 后改 PUBLISHED。
 * <p>
 * 表结构见 Vxxx__create_outbox_event.sql（M0 交付物之一）。
 */
@Data
@TableName("outbox_event")
public class OutboxEvent {

    @TableId(type = IdType.AUTO)
    private Long id;

    /** 聚合根类型（如 BizExpenseClaim / HrOffer），用于日志与监控 */
    private String aggregateType;

    /** 聚合根 ID */
    private Long aggregateId;

    /** 事件类型（与 BusinessEventEnvelope.eventType 对齐） */
    private String eventType;

    /** 事件负载 JSON（BusinessEventEnvelope 序列化后的完整 JSON） */
    private String payloadJson;

    /** 状态：PENDING / PUBLISHED / FAILED */
    private String status;

    /** 业务事件唯一 ID */
    private String eventId;

    /** 重试次数（失败时累加） */
    private Integer retryCount;

    /** 下次重试时间（指数退避计算） */
    private LocalDateTime nextRetryAt;

    /** 创建时间 */
    private LocalDateTime createdAt;

    /** 发布成功时间 */
    private LocalDateTime publishedAt;

    /** 最后错误信息（失败时记录） */
    private String lastError;

    /** 租户 ID */
    private Long tenantId;

    /** 抢占 owner */
    private String lockedBy;

    /** 抢占超时时间 */
    private LocalDateTime lockedUntil;
}

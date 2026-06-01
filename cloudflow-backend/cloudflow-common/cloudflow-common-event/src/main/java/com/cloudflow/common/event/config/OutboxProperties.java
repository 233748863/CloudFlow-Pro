package com.cloudflow.common.event.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Outbox 配置属性。
 */
@Data
@ConfigurationProperties(prefix = "cloudflow.outbox")
public class OutboxProperties {

    /** Redis Stream key（全局，不拼租户前缀） */
    private String streamKey = "cloudflow:event:stream";

    /** 消费组名称 */
    private String consumerGroup = "cloudflow-event-consumer-group";

    /** 每次扫描批量大小 */
    private int batchSize = 100;

    /** 最大重试次数（超过后标记 FAILED） */
    private int maxRetry = 8;

    /** 重试基础延迟秒数（指数退避 base） */
    private long retryBaseSeconds = 5;

    /** 扫描间隔毫秒（默认 5000ms = 5s） */
    private long scanIntervalMs = 5000;

    /** 调度实例 owner 前缀 */
    private String owner = "outbox";

    /** 抢占锁超时时间秒 */
    private long lockSeconds = 30;

    /** DLQ Stream key */
    private String dlqStreamKey = "cloudflow:event:dlq";

    /** Consumer 是否启用 */
    private boolean consumerEnabled = true;

    /** Consumer 前缀 */
    private String consumerPrefix = "event-consumer";

    /** 幂等 TTL 小时 */
    private long idempotentTtlHours = 24;
}

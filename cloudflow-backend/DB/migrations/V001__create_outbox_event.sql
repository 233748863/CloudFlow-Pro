-- M0-2: Outbox 事件表
-- 用途：业务事务内写 PENDING，OutboxScheduler 异步发到 Redis Stream 后改 PUBLISHED
-- 索引：status + next_retry_at（扫表查询）、aggregate_type + aggregate_id（日志追踪）

CREATE TABLE IF NOT EXISTS `outbox_event` (
    `id` BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    `aggregate_type` VARCHAR(100) NOT NULL COMMENT '聚合根类型（如 BizExpenseClaim / HrOffer）',
    `aggregate_id` BIGINT NOT NULL COMMENT '聚合根 ID',
    `event_type` VARCHAR(100) NOT NULL COMMENT '事件类型（如 ExpenseClaimSubmittedEvent）',
    `payload_json` TEXT NOT NULL COMMENT '事件负载 JSON（BusinessEventEnvelope 完整序列化）',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING / PUBLISHED / FAILED',
    `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数',
    `next_retry_at` DATETIME NOT NULL COMMENT '下次重试时间（指数退避计算）',
    `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `published_at` DATETIME NULL COMMENT '发布成功时间',
    `last_error` VARCHAR(500) NULL COMMENT '最后错误信息',
    `tenant_id` BIGINT NULL COMMENT '租户 ID',
    PRIMARY KEY (`id`),
    INDEX `idx_status_retry` (`status`, `next_retry_at`),
    INDEX `idx_aggregate` (`aggregate_type`, `aggregate_id`),
    INDEX `idx_tenant` (`tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Outbox 事件表';

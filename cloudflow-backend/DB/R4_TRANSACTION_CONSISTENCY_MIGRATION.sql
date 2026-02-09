-- ============================================
-- R.4: 数据一致性保证 - 本地消息表迁移脚本
-- 轻量化方案：无需 Seata，使用本地消息表模式
-- 执行时间：约 10 秒
-- ============================================

-- 创建本地消息表
CREATE TABLE IF NOT EXISTS `wf_transaction_message` (
    `message_id` VARCHAR(64) NOT NULL COMMENT '消息ID',
    `business_type` VARCHAR(50) NOT NULL COMMENT '业务类型 (PROCESS_START, TASK_COMPLETE, NOTIFICATION, SNAPSHOT)',
    `business_id` VARCHAR(64) NOT NULL COMMENT '业务ID (instanceId, taskId, etc.)',
    `content` TEXT COMMENT '消息内容 (JSON格式)',
    `status` VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '消息状态 (PENDING, PROCESSING, SUCCESS, FAILED)',
    `retry_count` INT NOT NULL DEFAULT 0 COMMENT '重试次数',
    `max_retry_count` INT NOT NULL DEFAULT 5 COMMENT '最大重试次数',
    `next_retry_time` DATETIME NOT NULL COMMENT '下次重试时间',
    `create_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_time` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    `error_message` VARCHAR(500) COMMENT '错误信息',
    `tenant_id` BIGINT COMMENT '租户ID',
    PRIMARY KEY (`message_id`),
    INDEX `idx_status_retry_time` (`status`, `next_retry_time`),
    INDEX `idx_business` (`business_type`, `business_id`),
    INDEX `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地消息表-用于保证分布式事务最终一致性';

-- ============================================
-- 说明
-- ============================================
-- 
-- 本地消息表模式工作原理：
-- 1. 业务操作和消息写入在同一个本地事务中完成
-- 2. 如果业务操作失败，消息也会回滚
-- 3. 定时任务扫描 PENDING 状态的消息进行重试
-- 4. 采用指数退避策略：30秒、60秒、120秒、240秒、480秒
-- 5. 最多重试 5 次，超过后标记为 FAILED
-- 
-- 相比 Seata 的优势：
-- - 无需引入额外中间件（TC、TM、RM）
-- - 不依赖事务协调器
-- - 性能开销极小（仅本地数据库操作）
-- - 实现简单，易于维护和排查
-- - 支持最终一致性，满足大部分业务场景
-- 
-- 使用场景：
-- - 流程启动后的通知发送
-- - 任务完成后的流程流转
-- - 快照保存失败的补偿
-- - 跨服务的数据同步
-- 
-- 监控指标：
-- - PENDING 消息数量（应该很少）
-- - FAILED 消息数量（需要人工介入）
-- - 平均重试次数
-- - 消息处理延迟
-- 
-- ============================================

-- 插入测试数据（可选，用于验证）
-- INSERT INTO wf_transaction_message (message_id, business_type, business_id, content, status, next_retry_time)
-- VALUES ('test-msg-001', 'PROCESS_START', 'test-instance-001', '{"processKey":"leave"}', 'PENDING', NOW());

-- 查询统计信息
SELECT 
    status,
    COUNT(*) as count,
    AVG(retry_count) as avg_retry_count
FROM wf_transaction_message
GROUP BY status;

-- 查询待重试的消息
SELECT 
    message_id,
    business_type,
    business_id,
    status,
    retry_count,
    next_retry_time,
    error_message
FROM wf_transaction_message
WHERE status = 'PENDING'
  AND next_retry_time <= NOW()
  AND retry_count < max_retry_count
ORDER BY create_time
LIMIT 10;

-- 查询失败的消息（需要人工介入）
SELECT 
    message_id,
    business_type,
    business_id,
    retry_count,
    error_message,
    create_time
FROM wf_transaction_message
WHERE status = 'FAILED'
ORDER BY create_time DESC
LIMIT 10;

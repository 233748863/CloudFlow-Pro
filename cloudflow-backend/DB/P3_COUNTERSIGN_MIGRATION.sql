-- 5.I: 会签并发审批冲突解决 - 数据库迁移脚本
-- 执行时间: 2026-02-08

-- ============================================
-- 会签任务主表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_countersign_task` (
  `countersign_id` VARCHAR(64) NOT NULL COMMENT '会签任务ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `node_key` VARCHAR(100) NOT NULL COMMENT '节点Key',
  `node_name` VARCHAR(200) COMMENT '节点名称',
  `sign_type` VARCHAR(20) NOT NULL COMMENT '会签类型: ALL/ANY/PERCENT',
  `pass_percent` INT DEFAULT 100 COMMENT '通过比例(百分比)',
  `total_count` INT NOT NULL DEFAULT 0 COMMENT '总人数',
  `voted_count` INT NOT NULL DEFAULT 0 COMMENT '已投票人数',
  `approve_count` INT NOT NULL DEFAULT 0 COMMENT '同意人数',
  `reject_count` INT NOT NULL DEFAULT 0 COMMENT '拒绝人数',
  `status` VARCHAR(20) NOT NULL DEFAULT 'VOTING' COMMENT '状态: VOTING/PASSED/REJECTED',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `complete_time` DATETIME COMMENT '完成时间',
  PRIMARY KEY (`countersign_id`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_node_key` (`instance_id`, `node_key`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签任务表';

-- ============================================
-- 会签投票记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_countersign_vote` (
  `vote_id` VARCHAR(64) NOT NULL COMMENT '投票ID',
  `countersign_id` VARCHAR(64) NOT NULL COMMENT '会签任务ID',
  `task_id` VARCHAR(64) COMMENT '关联的任务ID',
  `voter_id` BIGINT NOT NULL COMMENT '投票人ID',
  `voter_name` VARCHAR(100) COMMENT '投票人名称',
  `vote_result` VARCHAR(20) NOT NULL COMMENT '投票结果: APPROVE/REJECT',
  `comment` TEXT COMMENT '投票意见',
  `vote_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
  PRIMARY KEY (`vote_id`),
  KEY `idx_countersign_id` (`countersign_id`),
  KEY `idx_voter_id` (`voter_id`),
  UNIQUE KEY `uk_countersign_voter` (`countersign_id`, `voter_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签投票记录表';

COMMIT;

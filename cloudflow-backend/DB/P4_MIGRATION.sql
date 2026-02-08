-- P4 高价值功能数据库迁移脚本
-- 执行时间: 2026-02-08
-- 包含28项功能的所有数据库变更

-- ============================================
-- 1. 任务委托/转办/代理表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_task_delegation` (
  `delegation_id` VARCHAR(64) NOT NULL COMMENT '委托ID',
  `task_id` VARCHAR(64) NOT NULL COMMENT '原任务ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `delegation_type` VARCHAR(20) NOT NULL COMMENT '委托类型: DELEGATE/PROXY',
  `from_user_id` BIGINT NOT NULL COMMENT '原处理人ID',
  `from_user_name` VARCHAR(100) COMMENT '原处理人名称',
  `to_user_id` BIGINT NOT NULL COMMENT '目标处理人ID',
  `to_user_name` VARCHAR(100) COMMENT '目标处理人名称',
  `reason` TEXT COMMENT '委托原因',
  `status` VARCHAR(20) DEFAULT 'ACTIVE' COMMENT '状态: ACTIVE/COMPLETED/CANCELLED',
  `start_time` DATETIME COMMENT '代理开始时间',
  `end_time` DATETIME COMMENT '代理结束时间',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`delegation_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_from_user` (`from_user_id`),
  KEY `idx_to_user` (`to_user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务委托/代理记录表';

-- ============================================
-- 2. 加签记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_task_add_sign` (
  `add_sign_id` VARCHAR(64) NOT NULL COMMENT '加签ID',
  `task_id` VARCHAR(64) NOT NULL COMMENT '原任务ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `sign_type` VARCHAR(20) NOT NULL COMMENT '加签类型: BEFORE/AFTER/PARALLEL',
  `sign_user_ids` TEXT COMMENT '加签人ID列表(逗号分隔)',
  `sign_user_names` TEXT COMMENT '加签人名称列表(逗号分隔)',
  `initiator_id` BIGINT NOT NULL COMMENT '发起人ID',
  `initiator_name` VARCHAR(100) COMMENT '发起人名称',
  `reason` TEXT COMMENT '加签原因',
  `status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '状态: PENDING/COMPLETED/CANCELLED',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `complete_time` DATETIME COMMENT '完成时间',
  PRIMARY KEY (`add_sign_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加签记录表';

-- ============================================
-- 3. 候选人记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_task_candidate` (
  `candidate_id` VARCHAR(64) NOT NULL COMMENT '候选ID',
  `task_id` VARCHAR(64) NOT NULL COMMENT '任务ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `user_id` BIGINT NOT NULL COMMENT '候选人ID',
  `user_name` VARCHAR(100) COMMENT '候选人名称',
  `candidate_type` VARCHAR(20) COMMENT '候选类型: USER/ROLE/DEPT',
  `status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '状态: PENDING/CLAIMED/CANCELLED',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `claim_time` DATETIME COMMENT '认领时间',
  PRIMARY KEY (`candidate_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='候选人记录表';

-- ============================================
-- 4. 任务附件表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_task_attachment` (
  `attachment_id` VARCHAR(64) NOT NULL COMMENT '附件ID',
  `task_id` VARCHAR(64) COMMENT '任务ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `file_name` VARCHAR(255) NOT NULL COMMENT '文件名',
  `file_url` VARCHAR(500) NOT NULL COMMENT '文件URL',
  `file_type` VARCHAR(50) COMMENT '文件类型',
  `file_size` BIGINT COMMENT '文件大小(字节)',
  `uploader_id` BIGINT NOT NULL COMMENT '上传人ID',
  `uploader_name` VARCHAR(100) COMMENT '上传人名称',
  `upload_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (`attachment_id`),
  KEY `idx_task_id` (`task_id`),
  KEY `idx_instance_id` (`instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务附件表';

-- ============================================
-- 5. 发布记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_deploy_record` (
  `record_id` VARCHAR(64) NOT NULL COMMENT '记录ID',
  `definition_id` VARCHAR(64) NOT NULL COMMENT '流程定义ID',
  `process_key` VARCHAR(100) NOT NULL COMMENT '流程Key',
  `version` INT NOT NULL COMMENT '版本号',
  `deployer_id` BIGINT NOT NULL COMMENT '发布人ID',
  `deployer_name` VARCHAR(100) COMMENT '发布人名称',
  `deploy_note` TEXT COMMENT '发布说明',
  `change_log` TEXT COMMENT '变更日志',
  `deploy_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  PRIMARY KEY (`record_id`),
  KEY `idx_definition_id` (`definition_id`),
  KEY `idx_process_key` (`process_key`),
  KEY `idx_deploy_time` (`deploy_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布记录表';

-- ============================================
-- 6. 通知配置表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_notification_config` (
  `config_id` VARCHAR(64) NOT NULL COMMENT '配置ID',
  `event_type` VARCHAR(50) NOT NULL COMMENT '事件类型: PROCESS_START/TASK_ASSIGN/TASK_COMPLETE等',
  `notify_channel` VARCHAR(20) NOT NULL COMMENT '通知渠道: EMAIL/SMS/WEBSOCKET/SYSTEM',
  `template_id` VARCHAR(64) COMMENT '模板ID',
  `recipient_type` VARCHAR(20) COMMENT '接收人类型: INITIATOR/ASSIGNEE/ROLE/DEPT',
  `recipient_value` VARCHAR(200) COMMENT '接收人值',
  `enabled` TINYINT(1) DEFAULT 1 COMMENT '是否启用',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `update_time` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`config_id`),
  KEY `idx_event_type` (`event_type`),
  KEY `idx_enabled` (`enabled`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知配置表';

-- ============================================
-- 7. 通知日志表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_notification_log` (
  `log_id` VARCHAR(64) NOT NULL COMMENT '日志ID',
  `event_type` VARCHAR(50) NOT NULL COMMENT '事件类型',
  `notify_channel` VARCHAR(20) NOT NULL COMMENT '通知渠道',
  `recipient_id` BIGINT NOT NULL COMMENT '接收人ID',
  `recipient_name` VARCHAR(100) COMMENT '接收人名称',
  `title` VARCHAR(200) COMMENT '标题',
  `content` TEXT COMMENT '内容',
  `status` VARCHAR(20) DEFAULT 'PENDING' COMMENT '状态: PENDING/SENT/FAILED',
  `error_msg` TEXT COMMENT '错误信息',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `sent_time` DATETIME COMMENT '发送时间',
  PRIMARY KEY (`log_id`),
  KEY `idx_recipient_id` (`recipient_id`),
  KEY `idx_status` (`status`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知日志表';

-- ============================================
-- 8. 催办效果记录表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_urge_effect` (
  `effect_id` VARCHAR(64) NOT NULL COMMENT '效果ID',
  `urge_id` VARCHAR(64) NOT NULL COMMENT '催办ID(关联wf_task_urge)',
  `task_id` VARCHAR(64) NOT NULL COMMENT '任务ID',
  `before_duration` BIGINT COMMENT '催办前已耗时(秒)',
  `after_duration` BIGINT COMMENT '催办后完成耗时(秒)',
  `effectiveness` INT COMMENT '有效性评分 1-5',
  `urge_time` DATETIME NOT NULL COMMENT '催办时间',
  `complete_time` DATETIME COMMENT '完成时间',
  PRIMARY KEY (`effect_id`),
  KEY `idx_urge_id` (`urge_id`),
  KEY `idx_task_id` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='催办效果记录表';

-- ============================================
-- 9. 修改现有表 - wf_task 添加字段
-- ============================================
ALTER TABLE `wf_task` 
ADD COLUMN `priority` VARCHAR(20) DEFAULT 'NORMAL' COMMENT '优先级: URGENT/HIGH/NORMAL/LOW' AFTER `status`,
ADD COLUMN `is_timeout` TINYINT(1) DEFAULT 0 COMMENT '是否超时' AFTER `priority`,
ADD COLUMN `proxy_user_id` BIGINT COMMENT '代理人ID' AFTER `is_timeout`,
ADD INDEX `idx_priority` (`priority`),
ADD INDEX `idx_timeout` (`is_timeout`);

-- ============================================
-- 10. 修改现有表 - wf_process_instance 添加字段
-- ============================================
ALTER TABLE `wf_process_instance`
ADD COLUMN `priority` VARCHAR(20) DEFAULT 'NORMAL' COMMENT '优先级: URGENT/HIGH/NORMAL/LOW' AFTER `status`,
ADD INDEX `idx_priority` (`priority`);

-- ============================================
-- 11. 修改现有表 - wf_process_definition 添加字段
-- ============================================
ALTER TABLE `wf_process_definition`
ADD COLUMN `export_config` TEXT COMMENT '导出配置JSON' AFTER `model_json`;

COMMIT;

-- ============================================
-- 数据初始化 - 插入默认通知配置
-- ============================================
INSERT INTO `wf_notification_config` (`config_id`, `event_type`, `notify_channel`, `recipient_type`, `enabled`) VALUES
(UUID(), 'PROCESS_START', 'SYSTEM', 'INITIATOR', 1),
(UUID(), 'TASK_ASSIGN', 'SYSTEM', 'ASSIGNEE', 1),
(UUID(), 'TASK_COMPLETE', 'SYSTEM', 'INITIATOR', 1),
(UUID(), 'PROCESS_COMPLETE', 'SYSTEM', 'INITIATOR', 1),
(UUID(), 'TASK_TIMEOUT', 'SYSTEM', 'ASSIGNEE', 1),
(UUID(), 'TASK_URGE', 'SYSTEM', 'ASSIGNEE', 1);

COMMIT;

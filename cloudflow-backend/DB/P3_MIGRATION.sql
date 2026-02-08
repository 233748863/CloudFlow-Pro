-- P3 优先级修复数据库迁移脚本
-- 执行时间: 2026-02-08

-- ============================================
-- 9.C: 流程实例快照表
-- ============================================
CREATE TABLE IF NOT EXISTS `wf_process_snapshot` (
  `snapshot_id` VARCHAR(64) NOT NULL COMMENT '快照ID',
  `instance_id` VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  `node_key` VARCHAR(100) COMMENT '节点Key',
  `node_name` VARCHAR(200) COMMENT '节点名称',
  `status` VARCHAR(20) COMMENT '快照时的流程状态',
  `variables` TEXT COMMENT '快照时的变量(JSON)',
  `active_tasks` TEXT COMMENT '快照时的活动任务(JSON)',
  `create_time` DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`snapshot_id`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程实例快照表';

-- ============================================
-- 4.D: businessKey 唯一性约束
-- ============================================
-- 为 wf_process_instance 表添加联合唯一索引
ALTER TABLE `wf_process_instance` 
ADD UNIQUE KEY `uk_process_business` (`process_def_key`, `business_key`);

-- ============================================
-- 4.I: 流程定义版本锁定
-- ============================================
-- 为 wf_process_instance 表添加 definition_id 字段
ALTER TABLE `wf_process_instance` 
ADD COLUMN `definition_id` VARCHAR(64) COMMENT '流程定义ID(版本锁定)' AFTER `process_def_key`;

-- 为已存在的实例填充 definition_id（使用最新版本）
UPDATE `wf_process_instance` pi
INNER JOIN (
    SELECT process_key, definition_id
    FROM `wf_process_definition`
    WHERE (process_key, version) IN (
        SELECT process_key, MAX(version)
        FROM `wf_process_definition`
        GROUP BY process_key
    )
) pd ON pi.process_def_key = pd.process_key
SET pi.definition_id = pd.definition_id
WHERE pi.definition_id IS NULL;

-- ============================================
-- 1.B/3.E: 并发编辑冲突（乐观锁）
-- ============================================
-- 为 wf_process_definition 表添加 version_lock 字段
ALTER TABLE `wf_process_definition` 
ADD COLUMN `version_lock` INT DEFAULT 0 COMMENT '乐观锁版本号' AFTER `version`;

-- 为 wf_form_definition 表添加 version_lock 字段
ALTER TABLE `wf_form_definition` 
ADD COLUMN `version_lock` INT DEFAULT 0 COMMENT '乐观锁版本号' AFTER `version`;

-- ============================================
-- 5.H: 审批耗时统计
-- ============================================
-- 为 wf_task_history 表添加耗时字段
ALTER TABLE `wf_task_history` 
ADD COLUMN `duration_seconds` INT COMMENT '处理耗时(秒)' AFTER `create_time`;

-- 为 wf_task 表添加创建时间索引（用于计算耗时）
ALTER TABLE `wf_task` 
ADD KEY `idx_create_time` (`create_time`);

-- ============================================
-- 12.A/14.C: 版本管理优化
-- ============================================
-- 为 wf_process_definition 添加 is_latest 字段
ALTER TABLE `wf_process_definition` 
ADD COLUMN `is_latest` TINYINT(1) DEFAULT 0 COMMENT '是否最新版本' AFTER `status`;

-- 更新现有数据，标记最新版本
UPDATE `wf_process_definition` pd1
INNER JOIN (
    SELECT process_key, MAX(version) as max_version
    FROM `wf_process_definition`
    GROUP BY process_key
) pd2 ON pd1.process_key = pd2.process_key AND pd1.version = pd2.max_version
SET pd1.is_latest = 1;

-- 为 wf_form_definition 添加 is_latest 字段
ALTER TABLE `wf_form_definition` 
ADD COLUMN `is_latest` TINYINT(1) DEFAULT 0 COMMENT '是否最新版本' AFTER `version`;

-- 更新现有数据，标记最新版本
UPDATE `wf_form_definition` fd1
INNER JOIN (
    SELECT form_id, MAX(version) as max_version
    FROM `wf_form_definition`
    GROUP BY form_id
) fd2 ON fd1.form_id = fd2.form_id AND fd1.version = fd2.max_version
SET fd1.is_latest = 1;

-- ============================================
-- 索引优化
-- ============================================
-- 为常用查询字段添加索引
ALTER TABLE `wf_process_definition` 
ADD KEY `idx_is_latest` (`is_latest`),
ADD KEY `idx_status` (`status`);

ALTER TABLE `wf_form_definition` 
ADD KEY `idx_is_latest` (`is_latest`);

ALTER TABLE `wf_process_instance` 
ADD KEY `idx_definition_id` (`definition_id`);

-- ============================================
-- 数据完整性约束
-- ============================================
-- 确保关键字段不为空
ALTER TABLE `wf_process_definition` 
MODIFY COLUMN `process_key` VARCHAR(100) NOT NULL,
MODIFY COLUMN `process_name` VARCHAR(200) NOT NULL;

ALTER TABLE `wf_form_definition` 
MODIFY COLUMN `form_name` VARCHAR(200) NOT NULL;

-- ============================================
-- 清理脚本（可选）
-- ============================================
-- 15.D: 清理已完成任务的已读记录
-- 注意：这是一个维护脚本，建议定期执行
-- DELETE tr FROM wf_task_read tr
-- LEFT JOIN wf_task t ON tr.task_id = t.task_id
-- WHERE t.task_id IS NULL;

COMMIT;

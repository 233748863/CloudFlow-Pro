-- ============================================
-- P2 高价值修复项数据库迁移脚本
-- 创建时间: 2026-02-08
-- 说明: 为第一批核心功能增强添加必要的数据库字段
-- ============================================

-- 1. 为 wf_process_definition 表添加启动权限字段
-- 用途: 4.C - 启动权限校验（按角色/部门限制）
ALTER TABLE wf_process_definition 
ADD COLUMN start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT '启动权限类型：ALL/ROLE/DEPT/USER',
ADD COLUMN start_permission_value TEXT COMMENT '权限值（JSON格式，存储角色ID/部门ID/用户ID列表）';

-- 2. 为 wf_task_history 表添加变量变更记录字段
-- 用途: 5.G - 变量合并逻辑（记录审批时修改的变量）
ALTER TABLE wf_task_history 
ADD COLUMN variables_changed TEXT COMMENT '本次修改的变量（JSON格式）';

-- 3. 创建索引以优化查询性能（P.3 - 数据库索引审查）

-- wf_task 表索引
CREATE INDEX idx_assignee_status ON wf_task(assignee, status) 
COMMENT '优化按处理人和状态查询待办任务';

CREATE INDEX idx_instance_status ON wf_task(instance_id, status) 
COMMENT '优化按实例ID和状态查询任务';

-- wf_process_instance 表索引
CREATE INDEX idx_start_user_status ON wf_process_instance(start_user_id, status) 
COMMENT '优化按发起人和状态查询流程实例';

CREATE INDEX idx_process_key_status ON wf_process_instance(process_def_key, status) 
COMMENT '优化按流程定义Key和状态查询实例';

CREATE INDEX idx_start_time ON wf_process_instance(start_time) 
COMMENT '优化按启动时间排序和范围查询';

-- wf_task_history 表索引
CREATE INDEX idx_instance_create_time ON wf_task_history(instance_id, create_time) 
COMMENT '优化按实例ID查询历史记录并按时间排序';

CREATE INDEX idx_operator_create_time ON wf_task_history(operator_id, create_time) 
COMMENT '优化按操作人查询历史记录并按时间排序';

-- 4. 验证脚本执行结果
-- 执行以下查询验证字段是否添加成功
-- SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_COMMENT 
-- FROM INFORMATION_SCHEMA.COLUMNS 
-- WHERE TABLE_SCHEMA = DATABASE() 
--   AND TABLE_NAME IN ('wf_process_definition', 'wf_task_history')
--   AND COLUMN_NAME IN ('start_permission_type', 'start_permission_value', 'variables_changed');

-- 5. 验证索引是否创建成功
-- SHOW INDEX FROM wf_task;
-- SHOW INDEX FROM wf_process_instance;
-- SHOW INDEX FROM wf_task_history;

-- ============================================
-- 回滚脚本（如需回滚，请执行以下语句）
-- ============================================
-- ALTER TABLE wf_process_definition 
-- DROP COLUMN start_permission_type,
-- DROP COLUMN start_permission_value;

-- ALTER TABLE wf_task_history 
-- DROP COLUMN variables_changed;

-- DROP INDEX idx_assignee_status ON wf_task;
-- DROP INDEX idx_instance_status ON wf_task;
-- DROP INDEX idx_start_user_status ON wf_process_instance;
-- DROP INDEX idx_process_key_status ON wf_process_instance;
-- DROP INDEX idx_start_time ON wf_process_instance;
-- DROP INDEX idx_instance_create_time ON wf_task_history;
-- DROP INDEX idx_operator_create_time ON wf_task_history;

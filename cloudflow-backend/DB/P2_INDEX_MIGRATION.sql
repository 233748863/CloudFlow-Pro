-- P2 复合索引优化迁移脚本
-- 创建时间: 2026-02-09
-- 说明: 添加复合索引以优化联合查询性能

-- ==================== wf_task 表复合索引 ====================

-- 优化按审批人和状态查询（待办任务列表）
CREATE INDEX IF NOT EXISTS idx_assignee_status ON wf_task(assignee, status);

-- 优化按实例ID和状态查询（实例的活动任务）
CREATE INDEX IF NOT EXISTS idx_instance_status ON wf_task(instance_id, status);

-- ==================== wf_process_instance 表复合索引 ====================

-- 优化按发起人和状态查询（我的流程列表）
CREATE INDEX IF NOT EXISTS idx_start_user_status ON wf_process_instance(start_user_id, status);

-- 优化按流程类型和状态查询（流程统计）
CREATE INDEX IF NOT EXISTS idx_process_key_status ON wf_process_instance(process_def_key, status);

-- 优化按时间范围查询（时间维度统计）
CREATE INDEX IF NOT EXISTS idx_start_time ON wf_process_instance(start_time);

-- ==================== wf_task_history 表复合索引 ====================

-- 优化按实例ID和时间查询（流程轨迹）
CREATE INDEX IF NOT EXISTS idx_instance_create_time ON wf_task_history(instance_id, create_time);

-- 优化按操作人和时间查询（个人操作历史）
CREATE INDEX IF NOT EXISTS idx_operator_create_time ON wf_task_history(operator_id, create_time);

-- ==================== 索引说明 ====================
-- 1. idx_assignee_status: 加速 getTodoTasks 查询，WHERE assignee = ? AND status = 'TODO'
-- 2. idx_instance_status: 加速查询实例的活动任务，WHERE instance_id = ? AND status = 'TODO'
-- 3. idx_start_user_status: 加速 getMyInstances 查询，WHERE start_user_id = ? AND status = ?
-- 4. idx_process_key_status: 加速流程统计查询，WHERE process_def_key = ? AND status = ?
-- 5. idx_start_time: 加速时间范围查询，WHERE start_time BETWEEN ? AND ?
-- 6. idx_instance_create_time: 加速流程轨迹查询，WHERE instance_id = ? ORDER BY create_time
-- 7. idx_operator_create_time: 加速个人历史查询，WHERE operator_id = ? ORDER BY create_time

-- ==================== 执行说明 ====================
-- 1. 在生产环境执行前，先在测试环境验证
-- 2. 建议在业务低峰期执行（如凌晨）
-- 3. 执行后监控查询性能提升效果
-- 4. 如需回滚，执行以下命令：
--    DROP INDEX IF EXISTS idx_assignee_status;
--    DROP INDEX IF EXISTS idx_instance_status;
--    DROP INDEX IF EXISTS idx_start_user_status;
--    DROP INDEX IF EXISTS idx_process_key_status;
--    DROP INDEX IF EXISTS idx_start_time;
--    DROP INDEX IF EXISTS idx_instance_create_time;
--    DROP INDEX IF EXISTS idx_operator_create_time;

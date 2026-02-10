-- =========================================================
-- CloudFlow Pro - 多租户字段补全迁移脚本
-- 为所有缺少 tenant_id 的业务表添加租户字段
-- 版本：v1.1
-- 创建日期：2026-02-10
-- =========================================================

SET NAMES utf8mb4;

-- =========================================================
-- 一、01.cloudflow-common.sql 补全
-- =========================================================

-- sys_file 添加 tenant_id
ALTER TABLE sys_file ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER file_id;
ALTER TABLE sys_file ADD INDEX idx_file_tenant (tenant_id);

-- =========================================================
-- 二、02.cloudflow-workflow.sql 补全
-- =========================================================

-- wf_form_definition 添加 tenant_id
ALTER TABLE wf_form_definition ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER form_id;
ALTER TABLE wf_form_definition ADD INDEX idx_form_tenant (tenant_id);

-- sys_notice 添加 tenant_id
ALTER TABLE sys_notice ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER notice_id;
ALTER TABLE sys_notice ADD INDEX idx_notice_tenant (tenant_id);

-- wf_task_read 添加 tenant_id
ALTER TABLE wf_task_read ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_task_read ADD INDEX idx_task_read_tenant (tenant_id);

-- wf_task_urge 添加 tenant_id
ALTER TABLE wf_task_urge ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_task_urge ADD INDEX idx_task_urge_tenant (tenant_id);

-- wf_task_attachment 添加 tenant_id
ALTER TABLE wf_task_attachment ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER attachment_id;
ALTER TABLE wf_task_attachment ADD INDEX idx_attachment_tenant (tenant_id);

-- wf_task_delegation 添加 tenant_id
ALTER TABLE wf_task_delegation ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER delegation_id;
ALTER TABLE wf_task_delegation ADD INDEX idx_delegation_tenant (tenant_id);

-- wf_task_candidate 添加 tenant_id
ALTER TABLE wf_task_candidate ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_task_candidate ADD INDEX idx_candidate_tenant (tenant_id);

-- wf_task_add_sign 添加 tenant_id
ALTER TABLE wf_task_add_sign ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER add_sign_id;
ALTER TABLE wf_task_add_sign ADD INDEX idx_add_sign_tenant (tenant_id);

-- wf_countersign_task 添加 tenant_id
ALTER TABLE wf_countersign_task ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER countersign_id;
ALTER TABLE wf_countersign_task ADD INDEX idx_countersign_tenant (tenant_id);

-- wf_countersign_vote 添加 tenant_id
ALTER TABLE wf_countersign_vote ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER vote_id;
ALTER TABLE wf_countersign_vote ADD INDEX idx_vote_tenant (tenant_id);

-- wf_process_snapshot 添加 tenant_id
ALTER TABLE wf_process_snapshot ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER snapshot_id;
ALTER TABLE wf_process_snapshot ADD INDEX idx_snapshot_tenant (tenant_id);

-- wf_notification_log 添加 tenant_id
ALTER TABLE wf_notification_log ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER log_id;
ALTER TABLE wf_notification_log ADD INDEX idx_notif_log_tenant (tenant_id);

-- wf_notification_config 添加 tenant_id
ALTER TABLE wf_notification_config ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER config_id;
ALTER TABLE wf_notification_config ADD INDEX idx_notif_config_tenant (tenant_id);

-- wf_urge_effect 添加 tenant_id
ALTER TABLE wf_urge_effect ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_urge_effect ADD INDEX idx_urge_effect_tenant (tenant_id);

-- =========================================================
-- 三、03.cloudflow-workflow-deploy.sql 补全
-- =========================================================

-- wf_deploy_record 添加 tenant_id
ALTER TABLE wf_deploy_record ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_record ADD INDEX idx_deploy_record_tenant (tenant_id);

-- wf_deploy_window 添加 tenant_id
ALTER TABLE wf_deploy_window ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_window ADD INDEX idx_deploy_window_tenant (tenant_id);

-- wf_deploy_notification 添加 tenant_id
ALTER TABLE wf_deploy_notification ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_notification ADD INDEX idx_deploy_notif_tenant (tenant_id);

-- wf_deploy_approval 添加 tenant_id
ALTER TABLE wf_deploy_approval ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_approval ADD INDEX idx_deploy_approval_tenant (tenant_id);

-- wf_deploy_approval_step 添加 tenant_id
ALTER TABLE wf_deploy_approval_step ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_approval_step ADD INDEX idx_approval_step_tenant (tenant_id);

-- wf_process_version_snapshot 添加 tenant_id
ALTER TABLE wf_process_version_snapshot ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_process_version_snapshot ADD INDEX idx_version_snapshot_tenant (tenant_id);

-- wf_deploy_rollback_history 添加 tenant_id
ALTER TABLE wf_deploy_rollback_history ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_rollback_history ADD INDEX idx_rollback_hist_tenant (tenant_id);

-- wf_deploy_impact 添加 tenant_id
ALTER TABLE wf_deploy_impact ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER id;
ALTER TABLE wf_deploy_impact ADD INDEX idx_deploy_impact_tenant (tenant_id);

-- =========================================================
-- 四、04.cloudflow-oa.sql 补全
-- =========================================================

-- sys_vehicle 添加 tenant_id
ALTER TABLE sys_vehicle ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER vehicle_id;
ALTER TABLE sys_vehicle ADD INDEX idx_vehicle_tenant (tenant_id);

-- sys_vehicle_usage 添加 tenant_id
ALTER TABLE sys_vehicle_usage ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER usage_id;
ALTER TABLE sys_vehicle_usage ADD INDEX idx_vehicle_usage_tenant (tenant_id);

-- sys_vehicle_expense 添加 tenant_id
ALTER TABLE sys_vehicle_expense ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER expense_id;
ALTER TABLE sys_vehicle_expense ADD INDEX idx_vehicle_expense_tenant (tenant_id);

-- sys_consumable 添加 tenant_id (已有但位置不对，检查是否存在)
-- ALTER TABLE sys_consumable ADD COLUMN tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID' AFTER consumable_id;

-- =========================================================
-- 五、更新现有数据的 tenant_id（默认租户 100000）
-- =========================================================

-- 所有新增的 tenant_id 列默认值已设为 100000，
-- 现有数据会自动获得默认值，无需额外 UPDATE。

-- =========================================================
-- 迁移脚本执行完成
-- =========================================================

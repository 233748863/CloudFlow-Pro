-- M0-4: 业务实体加 @Version 乐观锁字段
-- 用途：并发控制，update 时自动校验 version，失败抛 OptimisticLockingFailureException → 409
-- 存量数据：version=1

-- OA 模块（9 个表）
ALTER TABLE `biz_expense_claim` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_payment_request` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_budget_plan` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_budget_adjustment` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `sys_asset` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_seal` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_license` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `sys_announcement` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_work_task` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `oa_project` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;

-- CRM 模块（11 个表）
ALTER TABLE `crm_lead` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_customer` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_opportunity` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_quote` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_receivable` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_renewal` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_service_ticket` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_product` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_price_book` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_assignment_rule` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_handover_task` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `crm_approval` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;

-- HR 模块（8 个表）
ALTER TABLE `hr_time_request` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_attendance_record` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_employee_contract` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_candidate` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_offer` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_salary_slip` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_performance_result` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `hr_certificate_request` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;

-- Workflow 模块（3 个表）
ALTER TABLE `wf_process_definition` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `wf_process_instance` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `wf_task` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;
ALTER TABLE `wf_callback_dead_letter` ADD COLUMN `version` INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER `deleted`;

-- 说明：
-- 1. 存量数据 version=1（DEFAULT 1 自动填充）
-- 2. 业务侧 update 路径若收 OptimisticLockingFailureException，包装 409 ERR.CONCURRENT_MODIFICATION
-- 3. 新增实体类需同步加 @Version private Integer version; 字段

-- =========================================================
-- CloudFlow Pro - 统一种子数据脚本
-- 依赖：01.cloudflow-common.sql、02.cloudflow-workflow.sql、
--       03.cloudflow-hr.sql、04.cloudflow-oa.sql 已先执行
-- 说明：原 01~04 中的初始化/演示数据已统一迁移到本文件
-- 导入顺序：全量初始化时最后执行；如已清库，可在 05 后直接执行本文件
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;
USE cloud_flow_db;

-- Cross-database routing:
-- cloud_flow_db -> sys_ / wf_ / workflow_ / biz_
-- cloud_flow_db -> hr_

-- Seed reset for rerun in dev
DELETE FROM cloud_flow_db.sys_user_post
WHERE tenant_id = 100000
  AND user_id BETWEEN 1 AND 20;

DELETE FROM cloud_flow_db.sys_user_role
WHERE tenant_id = 100000
  AND user_id BETWEEN 1 AND 20;

DELETE FROM cloud_flow_db.sys_role_menu
WHERE tenant_id = 100000
  AND role_id BETWEEN 1 AND 5;

DELETE FROM cloud_flow_db.sys_menu
WHERE menu_id IN (1, 2, 3, 4, 5, 6, 7)
   OR menu_id BETWEEN 100 AND 214
   OR menu_id BETWEEN 300 AND 399
   OR menu_id BETWEEN 400 AND 404
   OR menu_id BETWEEN 500 AND 513
   OR menu_id BETWEEN 600 AND 632
   OR menu_id BETWEEN 700 AND 739;

DELETE FROM cloud_flow_db.sys_business_rule
WHERE tenant_id = 100000
  AND rule_code IN ('hr.leave.quota.limit', 'oa.expense.amount.limit', 'oa.contract.risk.threshold');

DELETE FROM cloud_flow_db.sys_post
WHERE post_id BETWEEN 1 AND 11;

DELETE FROM cloud_flow_db.sys_user
WHERE user_id BETWEEN 1 AND 20;

DELETE FROM cloud_flow_db.sys_role
WHERE role_id BETWEEN 1 AND 5;

DELETE FROM cloud_flow_db.sys_dept
WHERE dept_id BETWEEN 100 AND 119;

DELETE FROM cloud_flow_db.sys_tenant
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.sys_dict_data
WHERE dict_type IN (
  'sys_user_sex',
  'sys_normal_disable',
  'sys_yes_no',
  'sys_notice_type',
  'oa_approval_status',
  'hr_leave_type',
  'hr_overtime_type',
  'oa_trip_status',
  'oa_expense_type'
);

DELETE FROM cloud_flow_db.sys_dict_type
WHERE dict_type IN (
  'sys_user_sex',
  'sys_normal_disable',
  'sys_yes_no',
  'sys_notice_type',
  'oa_approval_status',
  'hr_leave_type',
  'hr_overtime_type',
  'oa_trip_status',
  'oa_expense_type'
);

DELETE FROM cloud_flow_db.sys_config
WHERE config_id BETWEEN 1 AND 92;

DELETE FROM cloud_flow_db.wf_form_definition
WHERE form_id IN (
  'form_reimburse',
  'form_payment',
  'form_leave',
  'form_contract',
  'form_recruit',
  'form_attendance_appeal',
  'form_overtime_request',
  'form_expense_claim',
  'form_leave_request',
  'form_offer_approval',
  'form_onboarding_approval',
  'form_probation_confirmation',
  'form_resignation_approval',
  'form_salary_adjustment',
  'form_performance_plan',
  'form_performance_result',
  'form_transfer_approval',
  'form_payment_request',
  'form_purchase_request',
  'form_business_trip',
  'form_vehicle_approval',
  'form_seal_application',
  'form_license_borrow',
  'form_license_renewal',
  'form_knowledge_publish'
);

DELETE FROM cloud_flow_db.wf_process_definition
WHERE definition_id IN (
  'wf_reimburse',
  'wf_leave',
  'wf_contract',
  'wf_recruit',
  'wf_payment',
  'wf_attendance_appeal',
  'wf_overtime_request',
  'wf_expense_claim',
  'wf_leave_request',
  'wf_offer_approval',
  'wf_onboarding_approval',
  'wf_probation_confirmation_approval',
  'wf_resignation_approval',
  'wf_salary_adjustment_approval',
  'wf_performance_plan_approval',
  'wf_performance_result_approval',
  'wf_transfer_approval',
  'wf_payment_request',
  'wf_purchase_request',
  'wf_business_trip',
  'wf_vehicle_approval',
  'wf_knowledge_publish',
  'wf_seal_application',
  'wf_license_borrow',
  'wf_license_renewal'
);

DELETE FROM cloud_flow_db.oa_knowledge_read;
DELETE FROM cloud_flow_db.oa_knowledge_document;
DELETE FROM cloud_flow_db.oa_borrow_reminder_log WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_license_expiry_reminder_log WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_seal_handover_log WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_license_handover_log WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_seal_application WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_license_borrow WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_license_renewal WHERE id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_seal WHERE seal_id BETWEEN 9000 AND 9999;
DELETE FROM cloud_flow_db.oa_license WHERE license_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.wf_process_category
WHERE category_id IN (1, 2, 3, 4, 5, 10, 11, 12, 13, 14, 20, 21, 22, 30, 31, 32);

DELETE FROM cloud_flow_db.workflow_template
WHERE id LIKE 'tpl-%';

DELETE FROM cloud_flow_db.template_category
WHERE id LIKE 'cat-%'
  AND tenant_id IS NULL;

DELETE FROM cloud_flow_db.wf_task_read
WHERE task_id LIKE 'test_task_%'
   OR task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_task_urge
WHERE task_id LIKE 'test_task_%'
   OR task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_task_attachment
WHERE attachment_id LIKE 'demo_att_%'
   OR attachment_id LIKE 'seed_att_%';

DELETE FROM cloud_flow_db.wf_task_candidate
WHERE task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_task_delegation
WHERE delegation_id LIKE 'demo_delegate_%'
   OR delegation_id LIKE 'seed_delegate_%';

DELETE FROM cloud_flow_db.wf_task_add_sign
WHERE add_sign_id LIKE 'demo_addsign_%'
   OR add_sign_id LIKE 'seed_addsign_%';

DELETE FROM cloud_flow_db.wf_countersign_vote
WHERE vote_id LIKE 'demo_vote_%'
   OR vote_id LIKE 'seed_vote_%'
   OR countersign_id LIKE 'demo_cs_%'
   OR countersign_id LIKE 'seed_cs_%'
   OR countersign_id LIKE 'cs_inst_%';

DELETE FROM cloud_flow_db.wf_countersign_task
WHERE countersign_id LIKE 'demo_cs_%'
   OR countersign_id LIKE 'seed_cs_%'
   OR countersign_id LIKE 'cs_inst_%';

DELETE FROM cloud_flow_db.wf_process_snapshot
WHERE snapshot_id LIKE 'demo_snap_%'
   OR snapshot_id LIKE 'seed_snap_%';

DELETE FROM cloud_flow_db.wf_node_record
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_process_copy
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_task_history
WHERE history_id LIKE 'test_hist_%'
   OR history_id LIKE 'demo_hist_%'
   OR history_id LIKE 'seed_hist_%';

DELETE FROM cloud_flow_db.wf_task
WHERE task_id LIKE 'test_task_%'
   OR task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%'
   OR instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_process_instance
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id LIKE 'demo_msg_%'
   OR message_id LIKE 'seed_msg_%';

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id LIKE 'demo_notice_%'
   OR log_id LIKE 'seed_notice_%';

DELETE FROM cloud_flow_db.wf_urge_effect
WHERE task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_notification_config
WHERE config_id LIKE 'demo_notify_%'
   OR config_id LIKE 'seed_notify_%';

DELETE FROM cloud_flow_db.wf_deploy_impact
WHERE id BETWEEN 98001 AND 98007;

DELETE FROM cloud_flow_db.wf_deploy_rollback_history
WHERE id BETWEEN 98001 AND 98007;

DELETE FROM cloud_flow_db.wf_deploy_record
WHERE id BETWEEN 98001 AND 98007;

DELETE FROM cloud_flow_db.wf_audit_log
WHERE id LIKE 'demo_audit_%'
   OR id LIKE 'seed_audit_%';

DELETE FROM cloud_flow_db.workflow_version
WHERE id LIKE 'demo_%'
   OR id LIKE 'seed_%';

DELETE FROM cloud_flow_db.workflow_archive
WHERE id LIKE 'demo_%'
   OR id LIKE 'seed_%';

DELETE FROM cloud_flow_db.workflow_template
WHERE id LIKE 'demo_%'
   OR id LIKE 'seed_%';

DELETE FROM cloud_flow_db.sys_notice
WHERE notice_id BETWEEN 9900 AND 9999;

DELETE FROM cloud_flow_db.sys_announcement_read
WHERE announcement_id BETWEEN 9600 AND 9999;

DELETE FROM cloud_flow_db.sys_announcement
WHERE announcement_id BETWEEN 9600 AND 9999;

DELETE FROM cloud_flow_db.sys_schedule_event
WHERE event_id BETWEEN 9500 AND 9999;

DELETE FROM cloud_flow_db.sys_work_task
WHERE task_id BETWEEN 9400 AND 9999;

DELETE FROM cloud_flow_db.sys_vehicle_expense
WHERE expense_id BETWEEN 9100 AND 9999;

DELETE FROM cloud_flow_db.sys_vehicle_usage
WHERE usage_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.sys_vehicle
WHERE vehicle_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.sys_asset_log
WHERE log_id BETWEEN 9200 AND 9999;

DELETE FROM cloud_flow_db.sys_asset
WHERE asset_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.sys_consumable
WHERE consumable_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.sys_supplier
WHERE supplier_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.sys_visitor
WHERE visitor_id BETWEEN 9700 AND 9999;

DELETE FROM cloud_flow_db.sys_duty_schedule
WHERE schedule_id BETWEEN 9800 AND 9999;

DELETE FROM cloud_flow_db.sys_frontend_error_log
WHERE id BETWEEN 9901 AND 99599;

DELETE FROM cloud_flow_db.sys_file
WHERE file_id BETWEEN 91000 AND 99999;

DELETE FROM cloud_flow_db.sys_log
WHERE log_id BETWEEN 91000 AND 99999;

DELETE FROM cloud_flow_db.sys_audit_log
WHERE audit_id BETWEEN 91000 AND 99999;

DELETE FROM cloud_flow_db.sys_meeting_room
WHERE room_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_expense_item
WHERE claim_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_expense_claim
WHERE id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_payment_request
WHERE id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_purchase_receipt
WHERE purchase_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_purchase_item
WHERE purchase_id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_purchase_request
WHERE id BETWEEN 9000 AND 9999;

DELETE FROM cloud_flow_db.biz_business_trip
WHERE id BETWEEN 9000 AND 9999;

CREATE TABLE IF NOT EXISTS cloud_flow_db.hr_employee_contract_attachment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  contract_id BIGINT NOT NULL COMMENT '合同ID',
  file_name VARCHAR(255) DEFAULT NULL COMMENT '附件名称',
  file_url VARCHAR(500) NOT NULL COMMENT '附件URL',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_contract_id (contract_id),
  KEY idx_tenant_contract_id (tenant_id, contract_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工合同附件表';

CREATE TABLE IF NOT EXISTS cloud_flow_db.hr_employee_document_attachment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  document_id BIGINT NOT NULL COMMENT '证件ID',
  file_name VARCHAR(255) DEFAULT NULL COMMENT '附件名称',
  file_url VARCHAR(500) NOT NULL COMMENT '附件URL',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_document_id (document_id),
  KEY idx_tenant_document_id (tenant_id, document_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工证件附件表';

CREATE TABLE IF NOT EXISTS cloud_flow_db.hr_performance_objective (
  id                         BIGINT(20)     NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id                  BIGINT(20)     NOT NULL COMMENT '租户ID',
  objective_no               VARCHAR(50)    NOT NULL COMMENT '目标编号',
  cycle_name                 VARCHAR(100)   NOT NULL COMMENT '绩效周期',
  cycle_start_date           DATE           NOT NULL COMMENT '周期开始日期',
  cycle_end_date             DATE           NOT NULL COMMENT '周期结束日期',
  objective_name             VARCHAR(200)   NOT NULL COMMENT '目标名称',
  total_target_amount        DECIMAL(18,4)  NOT NULL DEFAULT 0.0000 COMMENT '总目标值，单指标兼容字段',
  category_codes             VARCHAR(255)   NOT NULL COMMENT '允许考核类型编码，逗号分隔',
  category_config            TEXT           DEFAULT NULL COMMENT '考核类型配置JSON',
  metric_config              TEXT           DEFAULT NULL COMMENT '绩效指标配置JSON，含名称、单位、默认权重',
  score_cap                  DECIMAL(5,2)   NOT NULL DEFAULT 120.00 COMMENT '单项计分封顶百分比',
  archived_actual_amount     DECIMAL(18,4)  DEFAULT NULL COMMENT '归档实际完成值快照',
  archived_completion_rate   DECIMAL(8,2)   DEFAULT NULL COMMENT '归档原始达成率快照',
  archived_capped_rate       DECIMAL(8,2)   DEFAULT NULL COMMENT '归档封顶达成率快照',
  archived_score             DECIMAL(8,2)   DEFAULT NULL COMMENT '归档得分快照',
  archived_grade             VARCHAR(10)    DEFAULT NULL COMMENT '归档等级快照',
  archived_time              DATETIME       DEFAULT NULL COMMENT '归档时间',
  archive_snapshot           MEDIUMTEXT     DEFAULT NULL COMMENT '归档完整绩效快照JSON',
  plan_process_instance_id   VARCHAR(100)   DEFAULT NULL COMMENT '计划审批流程实例ID',
  result_process_instance_id VARCHAR(100)   DEFAULT NULL COMMENT '结果审批流程实例ID',
  status                     VARCHAR(30)    NOT NULL DEFAULT 'DRAFT' COMMENT '状态',
  create_time                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time                DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by                  VARCHAR(64)    DEFAULT '' COMMENT '创建者',
  update_by                  VARCHAR(64)    DEFAULT '' COMMENT '更新者',
  deleted                    TINYINT(1)     NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_objective_no (tenant_id, objective_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_cycle (cycle_start_date, cycle_end_date),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='绩效目标表';

CREATE TABLE IF NOT EXISTS cloud_flow_db.hr_performance_assignment (
  id                BIGINT(20)     NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)     NOT NULL COMMENT '租户ID',
  objective_id      BIGINT(20)     NOT NULL COMMENT '绩效目标ID',
  parent_id         BIGINT(20)     DEFAULT NULL COMMENT '父分配节点ID',
  node_key          VARCHAR(255)   NOT NULL COMMENT '节点唯一键',
  assignee_type     VARCHAR(20)    NOT NULL COMMENT '分配对象类型',
  assignee_id       BIGINT(20)     NOT NULL COMMENT '分配对象ID',
  assignee_name     VARCHAR(100)   DEFAULT NULL COMMENT '分配对象名称快照',
  category_code     VARCHAR(50)    DEFAULT NULL COMMENT '考核类型编码',
  category_name     VARCHAR(100)   DEFAULT NULL COMMENT '考核类型名称',
  metric_code       VARCHAR(50)    DEFAULT NULL COMMENT '指标编码',
  metric_name       VARCHAR(100)   DEFAULT NULL COMMENT '指标名称',
  metric_unit       VARCHAR(20)    DEFAULT NULL COMMENT '指标单位',
  metric_value_type VARCHAR(20)    DEFAULT NULL COMMENT '指标数值类型：DECIMAL/INTEGER/PERCENT',
  metric_precision  INT            DEFAULT 2 COMMENT '指标小数位',
  metric_weight     DECIMAL(8,2)   DEFAULT 100.00 COMMENT '类型指标权重',
  target_amount     DECIMAL(18,4)  NOT NULL DEFAULT 0.0000 COMMENT '目标值',
  actual_amount     DECIMAL(18,4)  NOT NULL DEFAULT 0.0000 COMMENT '实际完成值',
  quota_source      VARCHAR(20)    NOT NULL DEFAULT 'MANAGER' COMMENT '额度来源',
  locked            TINYINT(1)     NOT NULL DEFAULT 0 COMMENT '是否经理锁定额度',
  owner_employee_id BIGINT(20)     DEFAULT NULL COMMENT '负责拆解的部门负责人员工ID',
  sort_order        INT            NOT NULL DEFAULT 0 COMMENT '排序',
  status            VARCHAR(30)    NOT NULL DEFAULT 'DRAFT' COMMENT '状态',
  create_time       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)    DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)    DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)     NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  UNIQUE KEY uk_objective_node_key (tenant_id, objective_id, node_key, deleted),
  KEY idx_objective_id (objective_id),
  KEY idx_parent_id (parent_id),
  KEY idx_assignee (assignee_type, assignee_id),
  KEY idx_category_metric (category_code, metric_code),
  KEY idx_owner_employee_id (owner_employee_id),
  CONSTRAINT fk_performance_assignment_objective FOREIGN KEY (objective_id) REFERENCES cloud_flow_db.hr_performance_objective(id) ON DELETE CASCADE,
  CONSTRAINT fk_performance_assignment_parent FOREIGN KEY (parent_id) REFERENCES cloud_flow_db.hr_performance_assignment(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='绩效分配树表';

DELETE FROM cloud_flow_db.hr_employee_contract_attachment
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_document_attachment
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_contract
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_document
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_emergency_contact
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_performance_assignment
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_performance_objective
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_salary_adjustment
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_salary
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_insurance
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee_tax_deduction
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_probation_confirmation
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_transfer_application
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_resignation_handover
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_resignation_application
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_onboarding_task
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_onboarding_application
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_offer
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_interview
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_candidate
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_recruitment_request
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_attendance_monthly
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_leave_application
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_leave_quota
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_overtime_application
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_attendance_record
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_schedule_plan
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_work_calendar
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_schedule_rule_assignment
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_reporting_line
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_headcount
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_employee
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_position
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_tax_config
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_insurance_scheme
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_salary_structure_item
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_salary_grade
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_salary_structure
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_salary_item
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_leave_type
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_schedule_rule
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_shift
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_job_level
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_position_family
WHERE tenant_id = 100000;

DELETE FROM cloud_flow_db.hr_audit_log
WHERE tenant_id = 100000;

-- =========================================================
-- 一、公共基础种子数据（迁移自 01.cloudflow-common.sql）
-- =========================================================

-- =========================================================
-- 初始化数据
-- =========================================================

-- 1. 初始化租户
INSERT INTO cloud_flow_db.sys_tenant (tenant_id, tenant_code, tenant_name, status, user_limit, storage_limit, storage_used, del_flag, expire_time, create_time)
VALUES (100000, 'xinyuan', '默认租户', '0', 100, 10240, 0, '0', DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW());

-- 2. 初始化部门数据
INSERT INTO cloud_flow_db.sys_dept VALUES(100,  100000, 0,   '0',          'CloudFlow 科技',   0, 'admin', '15888888888', 'admin@cloudflow.com', '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(101,  100000, 100, '0,100',      '研发部',           1, 'zhang_san', '15888888888', 'zhang_san@cloudflow.com', '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(102,  100000, 100, '0,100',      '财务部',           2, 'li_si',     '15888888888', 'li_si@cloudflow.com',     '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(103,  100000, 100, '0,100',      '人力资源部',       3, 'wang_wu',   '15888888888', 'wang_wu@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(104,  100000, 100, '0,100',      '法务部',           4, 'liu_fa',    '15888888888', 'liu_fa@cloudflow.com',    '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(105,  100000, 100, '0,100',      'IT部',             5, 'chen_it',   '15888888888', 'chen_it@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(106,  100000, 101, '0,100,101',  '前端组',           1, 'qian_duan', '15888888888', 'qian_duan@cloudflow.com', '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(107,  100000, 101, '0,100,101',  '后端组',           2, 'hou_duan',  '15888888888', 'hou_duan@cloudflow.com',  '0', '0', 'admin', NOW(), '', null);

INSERT INTO cloud_flow_db.sys_dept VALUES(108,  100000, 102, '0,100,102',  '会计组',           1, 'kuai_ji',   '15888888888', 'kuai_ji@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);

-- 3. 初始化角色数据（包含数据权限配置）
INSERT INTO cloud_flow_db.sys_role VALUES(1, 100000, 'ADMIN',   'admin',    1, '1', 0, NULL, '0', '0', 'admin', NOW(), '', null, '系统管理员，拥有最高权限');

INSERT INTO cloud_flow_db.sys_role VALUES(2, 100000, 'MANAGER', 'manager',  2, '3', 2, NULL, '0', '0', 'admin', NOW(), '', null, '部门经理，负责业务审批');

INSERT INTO cloud_flow_db.sys_role VALUES(3, 100000, 'FINANCE', 'finance',  3, '3', 3, NULL, '0', '0', 'admin', NOW(), '', null, '财务专员，负责资金相关审批');

INSERT INTO cloud_flow_db.sys_role VALUES(4, 100000, 'HR',      'hr',       4, '3', 2, NULL, '0', '0', 'admin', NOW(), '', null, '人事专员，负责人员相关审批');

INSERT INTO cloud_flow_db.sys_role VALUES(5, 100000, 'EMPLOYEE','employee', 5, '2', 4, NULL, '0', '0', 'admin', NOW(), '', null, '普通员工，仅能发起申请');

-- 4. 初始化用户数据 (密码统一为: 123456, 存储格式为 BCrypt(SHA256(明文密码)))
INSERT INTO cloud_flow_db.sys_user VALUES(1,  100000, 100, 'admin', 'Admin', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '超级管理员', '');

INSERT INTO cloud_flow_db.sys_user VALUES(2,  100000, 101, 'li', '李经理', 'li@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '研发部经理', '');

INSERT INTO cloud_flow_db.sys_user VALUES(3,  100000, 102, 'wang', '王财务', 'wang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '财务专员', '');

INSERT INTO cloud_flow_db.sys_user VALUES(4,  100000, 103, 'zhao', '赵HR', 'zhao@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, 'HR经理', '');

INSERT INTO cloud_flow_db.sys_user VALUES(5,  100000, 101, 'zhang', '张三', 'zhang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '研发工程师', '');

INSERT INTO cloud_flow_db.sys_user VALUES(6,  100000, 104, 'liu', '刘法务', 'liu@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '法务总监', '');

INSERT INTO cloud_flow_db.sys_user VALUES(7,  100000, 105, 'chen', '陈IT', 'chen@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '系统管理员', '');

INSERT INTO cloud_flow_db.sys_user VALUES(8,  100000, 106, 'test_fe', '前端测试', 'test_fe@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '前端组员工', '');

INSERT INTO cloud_flow_db.sys_user VALUES(9,  100000, 107, 'test_be', '后端测试', 'test_be@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '后端组员工', '');

-- 5. 初始化用户角色关联
INSERT INTO cloud_flow_db.sys_user_role VALUES(1, 1, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(2, 2, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(3, 3, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(4, 4, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(5, 5, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(6, 1, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(7, 1, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(8, 5, 100000);

INSERT INTO cloud_flow_db.sys_user_role VALUES(9, 5, 100000);

-- 6. 初始化菜单权限（二级菜单结构）
-- ═══════════════════════════════════════════════════
-- 一级目录（M类型）
-- ═══════════════════════════════════════════════════
INSERT INTO cloud_flow_db.sys_menu VALUES(1,   '工作台',     0, 1, 'workspace',     NULL, NULL, 0, 0, 'M', '0', '0', '', 'LayoutDashboard', 'admin', NOW(), '', null, '工作台目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(2,   '办公协同',   0, 2, 'office',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Briefcase',       'admin', NOW(), '', null, '办公协同目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(3,   '流程中心',   0, 3, 'process',       NULL, NULL, 0, 0, 'M', '0', '0', '', 'GitMerge',        'admin', NOW(), '', null, '流程中心目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(4,   '流程管理',   0, 4, 'workflow-mgmt', NULL, NULL, 0, 0, 'M', '0', '0', '', 'Settings',        'admin', NOW(), '', null, '流程管理目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(5,   '行政管理',   0, 5, 'admin-mgmt',    NULL, NULL, 0, 0, 'M', '0', '0', '', 'Building2',       'admin', NOW(), '', null, '行政管理目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(6,   '系统管理',   0, 6, 'system',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Wrench',          'admin', NOW(), '', null, '系统管理目录');

-- ═══════════════════════════════════════════════════
-- 二级菜单（C类型）
-- ═══════════════════════════════════════════════════

-- 工作台 (parent_id=1)
INSERT INTO cloud_flow_db.sys_menu VALUES(100, '仪表盘',     1, 1, '/',                    'pages/Dashboard',              NULL, 0, 0, 'C', '0', '0', 'workspace:dashboard',       'LayoutDashboard', 'admin', NOW(), '', null, '仪表盘');

INSERT INTO cloud_flow_db.sys_menu VALUES(101, '我的日程',   1, 2, '/schedule',            'pages/SchedulePage',           NULL, 0, 0, 'C', '0', '0', 'workspace:schedule',        'Calendar',        'admin', NOW(), '', null, '我的日程');

-- 办公协同 (parent_id=2)
INSERT INTO cloud_flow_db.sys_menu VALUES(200, '会议室',     2, 1, '/meeting-room',        'pages/MeetingRoomPage',        NULL, 0, 0, 'C', '0', '0', 'office:meeting',            'Monitor',         'admin', NOW(), '', null, '会议室管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(201, '公告中心',   2, 2, '/announcement',        'pages/AnnouncementPage',       NULL, 0, 0, 'C', '0', '0', 'office:announcement',       'Megaphone',       'admin', NOW(), '', null, '公告中心');

INSERT INTO cloud_flow_db.sys_menu VALUES(202, '考勤打卡',   7, 11, '/hr/attendance/checkin', 'pages/admin/attendance/AttendanceCheckIn', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:checkin', 'ClipboardCheck', 'admin', NOW(), '', null, 'HR考勤打卡');

-- 流程中心 (parent_id=3)
INSERT INTO cloud_flow_db.sys_menu VALUES(300, '发起流程',   3, 1, '/workplace',           'pages/Workplace',              NULL, 0, 0, 'C', '0', '0', 'process:start',             'PlayCircle',      'admin', NOW(), '', null, '发起流程');

INSERT INTO cloud_flow_db.sys_menu VALUES(301, '我的申请',   3, 2, '/my-apps',             'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:myapps',            'FileText',        'admin', NOW(), '', null, '我的申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(302, '审批待办',   3, 3, '/tasks',               'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:tasks',             'CheckCircle2',    'admin', NOW(), '', null, '审批待办');

INSERT INTO cloud_flow_db.sys_menu VALUES(303, '抄送我的',   3, 4, '/my-copies',           'pages/CopyListPage',           NULL, 0, 0, 'C', '0', '0', 'process:copy:list',         'MailOpen',        'admin', NOW(), '', null, '抄送我的');

-- 流程管理 (parent_id=4)
INSERT INTO cloud_flow_db.sys_menu VALUES(400, '流程设计',   4, 1, '/workflow',            'pages/WorkflowDesign',         NULL, 0, 0, 'C', '0', '0', 'workflow:model:list',        'GitMerge',        'admin', NOW(), '', null, '流程设计');

INSERT INTO cloud_flow_db.sys_menu VALUES(401, '流程监控',   4, 2, '/workflow/monitor',    'pages/WorkflowMonitor',        NULL, 0, 0, 'C', '0', '0', 'workflow:monitor:list',      'Monitor',         'admin', NOW(), '', null, '流程监控');

INSERT INTO cloud_flow_db.sys_menu VALUES(402, '发布管理',   4, 3, '/workflow/deploy',     'pages/DeployManagement',       NULL, 0, 0, 'C', '0', '0', 'workflow:deploy:list',       'Rocket',          'admin', NOW(), '', null, '发布管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(403, '表单设计',   4, 4, '/forms',              'pages/FormDesign',             NULL, 0, 0, 'C', '0', '0', 'workflow:form:list',         'FormInput',       'admin', NOW(), '', null, '表单设计');

INSERT INTO cloud_flow_db.sys_menu VALUES(404, '批量编辑',   4, 5, '/workflow/management', 'pages/admin/ProcessManagement', NULL, 0, 0, 'C', '0', '0', 'workflow:process:manage',    'Settings',        'admin', NOW(), '', null, '流程批量管理（分类、标签）');

-- 行政管理 (parent_id=5)
INSERT INTO cloud_flow_db.sys_menu VALUES(500, '组织架构',   5, 1, '/users',              'pages/OrgStructurePage',       NULL, 0, 0, 'C', '0', '0', 'admin:org:list',             'Users',           'admin', NOW(), '', null, '组织架构');

INSERT INTO cloud_flow_db.sys_menu VALUES(501, '资产管理',   5, 2, '/admin/asset',        'pages/admin/asset/AssetList',  NULL, 0, 0, 'C', '0', '0', 'admin:asset:list',           'Package',         'admin', NOW(), '', null, '资产管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(502, '车辆管理',   5, 3, '/admin/vehicle/list', 'pages/admin/vehicle/VehicleList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:list',      'Car',             'admin', NOW(), '', null, '车辆管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(503, '用车申请',   5, 4, '/admin/vehicle/booking', 'pages/admin/vehicle/VehicleBooking', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:booking', 'Car',          'admin', NOW(), '', null, '用车申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(504, '用车记录',   5, 5, '/admin/vehicle/usage', 'pages/admin/vehicle/VehicleUsageList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:usage',   'Car',             'admin', NOW(), '', null, '用车记录');

INSERT INTO cloud_flow_db.sys_menu VALUES(505, '考勤规则',   7, 12, '/hr/attendance/rule', 'pages/admin/attendance/AttendanceRule', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:rule', 'ClipboardCheck', 'admin', NOW(), '', null, 'HR考勤规则设置');

-- 系统管理 (parent_id=6)
INSERT INTO cloud_flow_db.sys_menu VALUES(600, '用户管理',   6, 1, '/system/users',       'pages/system/UserList',        NULL, 0, 0, 'C', '0', '0', 'system:user:list',           'Users',           'admin', NOW(), '', null, '用户管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(601, '角色管理',   6, 2, '/system/roles',       'pages/system/RoleList',        NULL, 0, 0, 'C', '0', '0', 'system:role:list',           'ShieldCheck',     'admin', NOW(), '', null, '角色管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(618, '角色查询',   601, 1, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:role:query',          '#',               'admin', NOW(), '', null, '角色查询权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(619, '角色新增',   601, 2, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:role:add',            '#',               'admin', NOW(), '', null, '角色新增权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(620, '角色编辑',   601, 3, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:role:edit',           '#',               'admin', NOW(), '', null, '角色编辑权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(621, '角色删除',   601, 4, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:role:remove',         '#',               'admin', NOW(), '', null, '角色删除权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(602, '菜单管理',   6, 3, '/system/menus',       'pages/system/MenuList',        NULL, 0, 0, 'C', '0', '0', 'system:menu:list',           'LayoutDashboard', 'admin', NOW(), '', null, '菜单管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(603, '文件管理',   6, 4, '/system/files',       'pages/system/FileList',        NULL, 0, 0, 'C', '0', '0', 'system:file:list',           'FileArchive',     'admin', NOW(), '', null, '文件管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(604, '源码生成',   6, 5, '/code',               'pages/CodeGeneration',         NULL, 0, 0, 'C', '0', '0', 'system:code:list',           'Code',            'admin', NOW(), '', null, '源码生成');

INSERT INTO cloud_flow_db.sys_menu VALUES(605, '租户管理',   6, 6, '/system/tenant',      'pages/system/TenantList',      NULL, 0, 0, 'C', '0', '0', 'system:tenant:list',         'Building2',       'admin', NOW(), '', null, '租户管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(606, '操作日志',   6, 7, '/system/log',         'pages/system/OperationLogPage', NULL, 0, 0, 'C', '0', '0', 'system:log:list',           'ScrollText',      'admin', NOW(), '', null, '操作日志');

INSERT INTO cloud_flow_db.sys_menu VALUES(607, '审计日志',   6, 8, '/system/audit-log',   'pages/system/AuditLogPage',    NULL, 0, 0, 'C', '0', '0', 'system:audit:list',          'ClipboardList',   'admin', NOW(), '', null, '审计日志');

INSERT INTO cloud_flow_db.sys_menu VALUES(608, '岗位管理',   6, 9, '/system/post',        'pages/system/PostList',        NULL, 0, 0, 'C', '0', '0', 'system:post:list',           'Landmark',        'admin', NOW(), '', null, '岗位管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(609, '参数配置',   6, 10, '/system/config',     'pages/system/ConfigList',      NULL, 0, 0, 'C', '0', '0', 'system:config:list',         'SlidersHorizontal','admin', NOW(), '', null, '参数配置');

INSERT INTO cloud_flow_db.sys_menu VALUES(610, '缓存监控',   6, 11, '/system/cache',      'pages/system/CacheMonitor',    NULL, 0, 0, 'C', '0', '0', 'system:cache:list',          'DatabaseZap',     'admin', NOW(), '', null, '缓存监控');

INSERT INTO cloud_flow_db.sys_menu VALUES(611, '字典管理',   6, 12, '/system/dict',       'pages/admin/DictPage',         NULL, 0, 0, 'C', '0', '0', 'system:dict:list',           'BookOpen',        'admin', NOW(), '', null, '字典管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(612, '流程分类',   4, 6, '/workflow/category',  'pages/admin/ProcessCategoryPage', NULL, 0, 0, 'C', '0', '0', 'workflow:category:list',  'FolderTree',      'admin', NOW(), '', null, '流程分类管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(613, '模板库',     3, 5, '/templates',          'pages/TemplateLibrary',        NULL, 0, 0, 'C', '0', '0', 'workflow:template:list',  'Sparkles',        'admin', NOW(), '', null, '流程模板库');

INSERT INTO cloud_flow_db.sys_menu VALUES(614, '流程导入',   4, 7, '/workflow/import',    'pages/admin/WorkflowImport',   NULL, 0, 0, 'C', '0', '0', 'workflow:import:manage',  'Upload',          'admin', NOW(), '', null, '流程导入');

INSERT INTO cloud_flow_db.sys_menu VALUES(615, '归档管理',   4, 8, '/workflow/archived',  'pages/admin/ArchivedWorkflows', NULL, 0, 0, 'C', '0', '0', 'workflow:archive:manage', 'Archive',         'admin', NOW(), '', null, '归档流程管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(616, '登录日志',   6, 13, '/system/login-log',   'pages/system/LoginLogPage',     NULL, 0, 0, 'C', '0', '0', 'system:login-log:list',    'LogIn',           'admin', NOW(), '', null, '登录日志');

INSERT INTO cloud_flow_db.sys_menu VALUES(617, '在线用户',   6, 14, '/system/online',      'pages/system/OnlineUserPage',   NULL, 0, 0, 'C', '0', '0', 'system:online:list',       'Monitor',         'admin', NOW(), '', null, '在线用户管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(630, '规则中心',   6, 15, '/system/rules',       'pages/system/BusinessRulePage', NULL, 0, 0, 'C', '0', '0', 'system:rule:list',         'ListChecks',      'admin', NOW(), '', null, '业务规则阈值配置');

INSERT INTO cloud_flow_db.sys_menu VALUES(631, '规则编辑',   630, 1, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:rule:edit',         '#',               'admin', NOW(), '', null, '业务规则编辑权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(632, '规则启停',   630, 2, '',                   NULL,                             NULL, 0, 0, 'F', '0', '0', 'system:rule:enabled',      '#',               'admin', NOW(), '', null, '业务规则启停权限');

INSERT INTO cloud_flow_db.sys_menu VALUES(7,   '人力资源',   0, 7, 'hr',                   NULL,                             NULL, 0, 0, 'M', '0', '0', '',                     'Users',           'admin', NOW(), '', null, '人力资源目录');

INSERT INTO cloud_flow_db.sys_menu VALUES(720, 'HR工作台',   7, 1, '/hr/dashboard',       'pages/hr/HrDashboardPage',      NULL, 0, 0, 'C', '0', '0', 'hr:dashboard:view',    'LayoutDashboard', 'admin', NOW(), '', null, 'HR桌面端工作台');

INSERT INTO cloud_flow_db.sys_menu VALUES(721, '员工档案',   7, 2, '/hr/employees',       'pages/hr/HrEmployeePage',       NULL, 0, 0, 'C', '0', '0', 'hr:employee:list',     'Users',           'admin', NOW(), '', null, '员工档案管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(722, '招聘中心',   7, 3, '/hr/recruitment',     'pages/hr/HrRecruitmentPage',    NULL, 0, 0, 'C', '0', '0', 'hr:recruitment:list',  'Briefcase',       'admin', NOW(), '', null, '招聘与候选人管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(728, '编制管理',   7, 4, '/hr/headcount',       'pages/hr/HrHeadcountPage',      NULL, 0, 0, 'C', '0', '0', 'hr:headcount:list',    'Layers3',         'admin', NOW(), '', null, '部门与岗位编制管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(729, '薪酬管理',   7, 5, '/hr/salary',          'pages/hr/HrSalaryPage',         NULL, 0, 0, 'C', '0', '0', 'hr:salary:list',       'Landmark',        'admin', NOW(), '', null, '薪资项目、结构、现薪与调薪管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(727, 'Offer管理',  7, 6, '/hr/offer',           'pages/hr/HrOfferPage',          NULL, 0, 0, 'C', '0', '0', 'hr:offer:list',        'Send',            'admin', NOW(), '', null, 'Offer审批、发送与转入职');

INSERT INTO cloud_flow_db.sys_menu VALUES(723, '入职办理',   7, 7, '/hr/onboarding',      'pages/hr/HrOnboardingPage',     NULL, 0, 0, 'C', '0', '0', 'hr:onboarding:list',   'ClipboardCheck',  'admin', NOW(), '', null, '入职申请与任务办理');

INSERT INTO cloud_flow_db.sys_menu VALUES(724, '转正申请',   7, 8, '/hr/probation',       'pages/hr/HrProbationPage',      NULL, 0, 0, 'C', '0', '0', 'hr:probation:list',    'ShieldCheck',     'admin', NOW(), '', null, '转正申请管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(725, '调岗管理',   7, 9, '/hr/transfer',        'pages/hr/HrTransferPage',       NULL, 0, 0, 'C', '0', '0', 'hr:transfer:list',     'GitMerge',        'admin', NOW(), '', null, '调岗申请管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(726, '离职办理',   7, 10, '/hr/resignation',    'pages/hr/HrResignationPage',    NULL, 0, 0, 'C', '0', '0', 'hr:resignation:list',  'LogOut',          'admin', NOW(), '', null, '离职申请与交接办理');

-- 办公协同(parent_id=2)扩展菜单：出差申请、通讯录
INSERT INTO cloud_flow_db.sys_menu VALUES(203, '考勤补录',   7, 13, '/hr/attendance/supplement', 'pages/AttendanceSupplementPage', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:supplement:list', 'ClipboardEdit', 'admin', NOW(), '', null, 'HR考勤补录申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(204, '加班申请',   7, 14, '/hr/overtime/applications',  'pages/OvertimeApplicationPage',  NULL, 0, 0, 'C', '0', '0', 'hr:overtime:application:list',  'Clock',         'admin', NOW(), '', null, 'HR加班申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(205, '出差申请',   2, 6, '/office/business-trip',     'pages/BusinessTripPage',       NULL, 0, 0, 'C', '0', '0', 'office:trip:list',          'Plane',           'admin', NOW(), '', null, '出差申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(206, '通讯录',     2, 7, '/office/contact',           'pages/ContactPage',            NULL, 0, 0, 'C', '0', '0', 'office:contact:list',       'BookUser',        'admin', NOW(), '', null, '企业通讯录');

INSERT INTO cloud_flow_db.sys_menu VALUES(207, '请假申请',   7, 15, '/hr/leave/application',    'pages/LeaveApplicationPage',   NULL, 0, 0, 'C', '0', '0', 'hr:leave:application:list', 'CalendarRange',   'admin', NOW(), '', null, 'HR请假申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(208, '报销申请',   2, 8, '/expense/claim',            'pages/ExpenseClaimPage',       NULL, 0, 0, 'C', '0', '0', 'office:expense:list',       'Receipt',         'admin', NOW(), '', null, '报销申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(209, '付款申请',   2, 9, '/payment/request',          'pages/PaymentRequestPage',     NULL, 0, 0, 'C', '0', '0', 'office:payment:list',       'WalletCards',     'admin', NOW(), '', null, '付款申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(210, '知识库',     2, 10, '/office/knowledge',        'pages/KnowledgePage',          NULL, 0, 0, 'C', '0', '0', 'office:knowledge:list',     'BookOpen',        'admin', NOW(), '', null, '制度文档知识库');

INSERT INTO cloud_flow_db.sys_menu VALUES(211, '采购申请',   2, 11, '/office/purchase-request', 'pages/PurchaseRequestPage',   NULL, 0, 0, 'C', '0', '0', 'office:purchase:list',      'ShoppingCart',    'admin', NOW(), '', null, '行政采购申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(212, '用印申请',   2, 12, '/office/seal-application', 'pages/SealApplicationPage',   NULL, 0, 0, 'C', '0', '0', 'office:seal:list',          'Stamp',           'admin', NOW(), '', null, '用印申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(213, '证照借用',   2, 13, '/office/license-borrow',   'pages/LicenseBorrowPage',     NULL, 0, 0, 'C', '0', '0', 'office:license:list',       'BadgeCheck',      'admin', NOW(), '', null, '证照借用申请');

INSERT INTO cloud_flow_db.sys_menu VALUES(214, '合同台账',   2, 14, '/office/contracts',        'pages/ContractPage',          NULL, 0, 0, 'C', '0', '0', 'office:contract:list',      'FileSignature',   'admin', NOW(), '', null, '合同审批、用印与归档台账');

-- 行政管理(parent_id=5)扩展菜单：访客管理、值班排班、供应商、耗材
INSERT INTO cloud_flow_db.sys_menu VALUES(506, '访客管理',   5, 7, '/admin/visitor',            'pages/VisitorPage',            NULL, 0, 0, 'C', '0', '0', 'admin:visitor:list',        'UserCheck',       'admin', NOW(), '', null, '访客预约管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(507, '值班排班',   5, 8, '/admin/duty-schedule',      'pages/DutySchedulePage',       NULL, 0, 0, 'C', '0', '0', 'admin:duty:list',           'CalendarClock',   'admin', NOW(), '', null, '值班排班管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(508, '供应商管理', 5, 9, '/admin/supplier',           'pages/admin/supplier/SupplierPage', NULL, 0, 0, 'C', '0', '0', 'admin:supplier:list', 'Handshake',       'admin', NOW(), '', null, '行政采购供应商管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(509, '耗材管理',   5, 10, '/admin/consumable',         'pages/admin/consumable/ConsumablePage', NULL, 0, 0, 'C', '0', '0', 'admin:consumable:list', 'Package',       'admin', NOW(), '', null, '行政采购耗材目录与库存管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(510, '印章台账',   5, 11, '/admin/seal',               'pages/admin/seal-license/SealListPage', NULL, 0, 0, 'C', '0', '0', 'admin:seal:list',       'Stamp',           'admin', NOW(), '', null, '印章台账管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(511, '证照台账',   5, 12, '/admin/license',            'pages/admin/seal-license/LicenseListPage', NULL, 0, 0, 'C', '0', '0', 'admin:license:list', 'BadgeCheck',      'admin', NOW(), '', null, '证照台账管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(512, '借还管理',   5, 13, '/admin/borrow-management',  'pages/admin/seal-license/BorrowManagementPage', NULL, 0, 0, 'C', '0', '0', 'admin:borrow:list', 'RotateCcw',     'admin', NOW(), '', null, '用印证照借还管理');

INSERT INTO cloud_flow_db.sys_menu VALUES(513, '风险中心',   5, 14, '/admin/risk-alerts',        'pages/admin/RiskAlertPage',    NULL, 0, 0, 'C', '0', '0', 'admin:risk:list',          'ShieldAlert',     'admin', NOW(), '', null, '合同、审批与用印风险中心');

-- 流程管理(parent_id=4)扩展菜单：Phase 2 监控告警功能（2026-02-22新增）
INSERT INTO cloud_flow_db.sys_menu VALUES(700, '告警管理',   4, 7, '/workflow/alerts',          'pages/AlertList',              NULL, 0, 0, 'C', '0', '0', 'workflow:alert:list',       'Bell',            'admin', NOW(), '', null, '查看和处理超时告警和异常告警');

INSERT INTO cloud_flow_db.sys_menu VALUES(701, '性能统计',   4, 8, '/workflow/performance',     'pages/PerformanceStats',       NULL, 0, 0, 'C', '0', '0', 'workflow:performance:view', 'BarChart3',       'admin', NOW(), '', null, '查看流程执行性能统计和趋势分析');

-- 7. 初始化岗位数据
INSERT INTO cloud_flow_db.sys_post VALUES(1, 100000, 'ceo',      '董事长',     1, '0', 'admin', NOW(), '', null, '公司最高管理者');

INSERT INTO cloud_flow_db.sys_post VALUES(2, 100000, 'manager',   '部门经理',   2, '0', 'admin', NOW(), '', null, '部门负责人');

INSERT INTO cloud_flow_db.sys_post VALUES(3, 100000, 'director',  '总监',       3, '0', 'admin', NOW(), '', null, '业务线总监');

INSERT INTO cloud_flow_db.sys_post VALUES(4, 100000, 'staff',     '普通员工',   4, '0', 'admin', NOW(), '', null, '普通岗位');

-- 8. 初始化用户岗位关联
INSERT INTO cloud_flow_db.sys_user_post VALUES(1, 1, 100000);

-- admin → 董事长
INSERT INTO cloud_flow_db.sys_user_post VALUES(2, 2, 100000);

-- 李经理 → 部门经理
INSERT INTO cloud_flow_db.sys_user_post VALUES(3, 2, 100000);

-- 王财务 → 部门经理（财务主管）
INSERT INTO cloud_flow_db.sys_user_post VALUES(4, 2, 100000);

-- 赵HR → 部门经理（人事经理）
INSERT INTO cloud_flow_db.sys_user_post VALUES(5, 4, 100000);

-- 张三 → 普通员工
INSERT INTO cloud_flow_db.sys_user_post VALUES(6, 3, 100000);

-- 刘法务 → 总监
INSERT INTO cloud_flow_db.sys_user_post VALUES(7, 4, 100000);

-- 陈IT → 普通员工
INSERT INTO cloud_flow_db.sys_user_post VALUES(8, 4, 100000);

-- 前端测试 → 普通员工
INSERT INTO cloud_flow_db.sys_user_post VALUES(9, 4, 100000);

-- 后端测试 → 普通员工

-- 9. 初始化角色菜单关联（新二级菜单结构）
-- ═══════════════════════════════════════════════════
-- ADMIN (role_id=1): keep explicit sys_role_menu mappings for permission aggregation
-- ═══════════════════════════════════════════════════

-- MANAGER (role_id=2): 工作台 + 办公协同 + 流程中心 + 流程管理 + 行政管理
-- 一级目录
-- Ensure ADMIN keeps full menu-permission mappings for auth permission checks.
INSERT IGNORE INTO cloud_flow_db.sys_role_menu (role_id, menu_id, tenant_id)
SELECT 1, menu_id, 100000 FROM sys_menu;

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 1, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 2, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 3, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 4, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 5, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 7, 100000);

-- 工作台子菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 100, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 101, 100000);

-- 办公协同子菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 200, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 201, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 202, 100000);

-- 流程中心子菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 300, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 301, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 302, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 303, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 613, 100000);

-- 模板库
-- 流程管理子菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 400, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 401, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 402, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 403, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 404, 100000);

-- 批量编辑
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 612, 100000);

-- 流程分类
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 614, 100000);

-- 流程导入
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 615, 100000);

-- 归档管理
-- 行政管理子菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 500, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 501, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 502, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 503, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 504, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 505, 100000);

-- 办公协同扩展菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 203, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 204, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 205, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 206, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 207, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 208, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 209, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 210, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 211, 100000);

-- 行政管理扩展菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 506, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 507, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 508, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 509, 100000);

-- Phase 2 监控告警菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 700, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 701, 100000);

-- FINANCE (role_id=3): 工作台 + 办公协同 + 流程中心
INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 1, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 2, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 3, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 7, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 100, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 101, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 200, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 201, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 202, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 203, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 204, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 205, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 206, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 207, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 208, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 209, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 210, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 300, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 301, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 302, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 303, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 613, 100000);

-- 模板库
-- Phase 2 监控告警菜单（仅查看）
INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 4, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 401, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(3, 701, 100000);

-- HR (role_id=4): 工作台 + 办公协同 + 流程中心 + 流程管理 + 行政管理
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 1, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 2, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 3, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 4, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 5, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 100, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 101, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 200, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 201, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 202, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 300, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 301, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 302, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 303, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 613, 100000);

-- 模板库
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 400, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 401, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 402, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 403, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 404, 100000);

-- 批量编辑
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 612, 100000);

-- 流程分类
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 614, 100000);

-- 流程导入
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 615, 100000);

-- 归档管理
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 500, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 505, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 203, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 204, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 205, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 206, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 207, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 208, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 209, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 210, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 211, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 212, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 213, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 506, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 507, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 510, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 511, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 512, 100000);

-- Phase 2 监控告警菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 700, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 701, 100000);

-- HR 菜单
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 7, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 720, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 721, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 722, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 728, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 729, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 723, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 724, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 725, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 726, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 727, 100000);

-- EMPLOYEE (role_id=5): 工作台 + 办公协同 + 流程中心（仅基础功能）
INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 1, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 2, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 3, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 7, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 100, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 101, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 200, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 201, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 202, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 300, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 301, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 302, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 303, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 613, 100000);

-- 模板库（普通用户可查看）
INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 203, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 204, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 205, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 206, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 207, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 208, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 209, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 210, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 211, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 212, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 213, 100000);

-- Phase 2 监控告警菜单（仅查看流程监控）
INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 4, 100000);

INSERT INTO cloud_flow_db.sys_role_menu VALUES(5, 401, 100000);

-- HR salary sidebar split: keep /hr/salary, add 4 foundation entries and reorder siblings
UPDATE cloud_flow_db.sys_menu SET order_num = 10 WHERE menu_id = 727;
UPDATE cloud_flow_db.sys_menu SET order_num = 11 WHERE menu_id = 723;
UPDATE cloud_flow_db.sys_menu SET order_num = 12 WHERE menu_id = 724;
UPDATE cloud_flow_db.sys_menu SET order_num = 13 WHERE menu_id = 725;
UPDATE cloud_flow_db.sys_menu SET order_num = 14 WHERE menu_id = 726;
UPDATE cloud_flow_db.sys_menu SET order_num = 15 WHERE menu_id = 202;
UPDATE cloud_flow_db.sys_menu SET order_num = 16 WHERE menu_id = 505;
UPDATE cloud_flow_db.sys_menu SET order_num = 17 WHERE menu_id = 203;
UPDATE cloud_flow_db.sys_menu SET order_num = 18 WHERE menu_id = 204;
UPDATE cloud_flow_db.sys_menu SET order_num = 19 WHERE menu_id = 207;
UPDATE cloud_flow_db.sys_menu SET remark = '员工现薪与调薪管理' WHERE menu_id = 729;

INSERT INTO cloud_flow_db.sys_menu VALUES(730, '薪资项目',   7, 6, '/hr/salary/items',      'pages/hr/HrSalaryPage', NULL, 0, 0, 'C', '0', '0', 'hr:salary:item:list',      'FileText',    'admin', NOW(), '', null, '薪资项目配置');
INSERT INTO cloud_flow_db.sys_menu VALUES(731, '薪资结构',   7, 7, '/hr/salary/structures', 'pages/hr/HrSalaryPage', NULL, 0, 0, 'C', '0', '0', 'hr:salary:structure:list', 'Layers3',     'admin', NOW(), '', null, '薪资结构配置');
INSERT INTO cloud_flow_db.sys_menu VALUES(732, '薪资等级',   7, 8, '/hr/salary/grades',     'pages/hr/HrSalaryPage', NULL, 0, 0, 'C', '0', '0', 'hr:salary:grade:list',     'Landmark',    'admin', NOW(), '', null, '薪资等级配置');
INSERT INTO cloud_flow_db.sys_menu VALUES(733, '社保方案',   7, 9, '/hr/salary/insurance',  'pages/hr/HrSalaryPage', NULL, 0, 0, 'C', '0', '0', 'hr:salary:insurance:list', 'ShieldCheck', 'admin', NOW(), '', null, '社保方案配置');
INSERT INTO cloud_flow_db.sys_menu VALUES(734, '绩效管理',   7, 11, '/hr/performance',      'pages/hr/HrPerformancePage', NULL, 0, 0, 'C', '0', '0', 'hr:performance:list', 'Target',      'admin', NOW(), '', null, '绩效目标、分解、填报与归档');
INSERT INTO cloud_flow_db.sys_menu VALUES(735, '新建绩效目标', 734, 1, '', NULL, NULL, 0, 0, 'F', '0', '0', 'hr:performance:create', '#', 'admin', NOW(), '', null, '新建绩效目标权限');
INSERT INTO cloud_flow_db.sys_menu VALUES(736, '绩效目标分解', 734, 2, '', NULL, NULL, 0, 0, 'F', '0', '0', 'hr:performance:split', '#', 'admin', NOW(), '', null, '绩效目标分解权限');
INSERT INTO cloud_flow_db.sys_menu VALUES(737, '绩效结果填报', 734, 3, '', NULL, NULL, 0, 0, 'F', '0', '0', 'hr:performance:result', '#', 'admin', NOW(), '', null, '绩效结果填报权限');
INSERT INTO cloud_flow_db.sys_menu VALUES(738, '绩效提交审批', 734, 4, '', NULL, NULL, 0, 0, 'F', '0', '0', 'hr:performance:submit', '#', 'admin', NOW(), '', null, '绩效提交审批权限');
INSERT INTO cloud_flow_db.sys_menu VALUES(739, '绩效调薪联动', 734, 5, '', NULL, NULL, 0, 0, 'F', '0', '0', 'hr:performance:salary', '#', 'admin', NOW(), '', null, '绩效调薪联动权限');

INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 730, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 731, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 732, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 733, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 734, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 735, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 736, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 737, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 738, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(1, 739, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 730, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 731, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 732, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(4, 733, 100000);
INSERT INTO cloud_flow_db.sys_role_menu VALUES(2, 734, 100000);

-- 10. 初始化字典类型数据
INSERT INTO cloud_flow_db.sys_dict_type (`dict_name`, `dict_type`, `remark`) VALUES
('用户性别', 'sys_user_sex', '用户性别列表'),
('系统状态', 'sys_normal_disable', '系统开关状态'),
('是否', 'sys_yes_no', '系统是否列表'),
('通知类型', 'sys_notice_type', '通知类型列表'),
('审批状态', 'oa_approval_status', 'OA审批状态'),
('请假类型', 'hr_leave_type', '请假类型列表'),
('加班类型', 'hr_overtime_type', '加班类型列表'),
('出差状态', 'oa_trip_status', '出差状态列表'),
('费用类型', 'oa_expense_type', '费用报销类型');

-- 11. 初始化字典数据
-- 用户性别
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '男', '0', 'sys_user_sex', 'default'),
(2, '女', '1', 'sys_user_sex', 'default'),
(3, '未知', '2', 'sys_user_sex', 'default');

-- 系统状态
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '正常', '0', 'sys_normal_disable', 'success'),
(2, '停用', '1', 'sys_normal_disable', 'danger');

-- 是否
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '是', 'Y', 'sys_yes_no', 'success'),
(2, '否', 'N', 'sys_yes_no', 'danger');

-- 通知类型
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '通知', '1', 'sys_notice_type', 'warning'),
(2, '公告', '2', 'sys_notice_type', 'success');

-- 审批状态
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待审批', 'PENDING', 'oa_approval_status', 'warning'),
(2, '审批中', 'IN_PROGRESS', 'oa_approval_status', 'processing'),
(3, '已通过', 'APPROVED', 'oa_approval_status', 'success'),
(4, '已驳回', 'REJECTED', 'oa_approval_status', 'danger'),
(5, '已撤销', 'CANCELLED', 'oa_approval_status', 'default');

-- 请假类型
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '年假', 'ANNUAL', 'hr_leave_type', 'success'),
(2, '事假', 'PERSONAL', 'hr_leave_type', 'default'),
(3, '病假', 'SICK', 'hr_leave_type', 'warning'),
(4, '婚假', 'MARRIAGE', 'hr_leave_type', 'success'),
(5, '产假', 'MATERNITY', 'hr_leave_type', 'success'),
(6, '丧假', 'BEREAVEMENT', 'hr_leave_type', 'default');

-- 加班类型
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '工作日加班', 'WORKDAY', 'hr_overtime_type', 'default'),
(2, '周末加班', 'WEEKEND', 'hr_overtime_type', 'warning'),
(3, '节假日加班', 'HOLIDAY', 'hr_overtime_type', 'danger');

-- 出差状态
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待出发', 'NOT_STARTED', 'oa_trip_status', 'default'),
(2, '出差中', 'IN_PROGRESS', 'oa_trip_status', 'processing'),
(3, '已返回', 'COMPLETED', 'oa_trip_status', 'success');

-- 费用类型
INSERT INTO cloud_flow_db.sys_dict_data (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '差旅费', 'TRAVEL', 'oa_expense_type', 'default'),
(2, '交通费', 'TRANSPORT', 'oa_expense_type', 'default'),
(3, '餐饮费', 'MEAL', 'oa_expense_type', 'default'),
(4, '住宿费', 'ACCOMMODATION', 'oa_expense_type', 'default'),
(5, '办公用品', 'OFFICE', 'oa_expense_type', 'default'),
(6, '其他', 'OTHER', 'oa_expense_type', 'default');

-- 12. 初始化系统参数数据
-- config_scope: 0=全局（所有租户共享） 1=租户（每个租户可独立配置）
-- 用户管理配置（租户级：不同租户可设不同密码策略）
INSERT INTO cloud_flow_db.sys_config VALUES(1, 100000, '用户管理-账号初始密码',       'sys.user.initPassword',        '123456',   'Y', '1', 'admin', NOW(), '', null, '初始化密码 123456');

INSERT INTO cloud_flow_db.sys_config VALUES(2, 100000, '用户管理-密码最小长度',       'sys.user.password.minLength',   '6',        'Y', '1', 'admin', NOW(), '', null, '密码最小长度限制');

INSERT INTO cloud_flow_db.sys_config VALUES(3, 100000, '用户管理-密码最大长度',       'sys.user.password.maxLength',   '20',       'Y', '1', 'admin', NOW(), '', null, '密码最大长度限制');

INSERT INTO cloud_flow_db.sys_config VALUES(4, 100000, '用户管理-登录失败锁定次数',   'sys.user.login.maxRetry',       '5',        'Y', '1', 'admin', NOW(), '', null, '登录失败超过此次数将锁定账号');

INSERT INTO cloud_flow_db.sys_config VALUES(5, 100000, '用户管理-登录锁定时间(分钟)', 'sys.user.login.lockTime',       '10',       'Y', '1', 'admin', NOW(), '', null, '账号锁定持续时间');

-- 系统安全配置（全局：安全策略统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(6, 100000, '系统管理-是否开启验证码',     'sys.captcha.enabled',           'true',     'Y', '0', 'admin', NOW(), '', null, '是否开启登录验证码功能');

-- 注册开关（租户级：不同租户可独立控制）
INSERT INTO cloud_flow_db.sys_config VALUES(7, 100000, '系统管理-是否开启用户注册',   'sys.account.registerUser',      'false',    'Y', '1', 'admin', NOW(), '', null, '是否开启注册用户功能');

-- 文件上传配置（全局：安全策略统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(8, 100000, '文件上传-单文件大小限制(MB)', 'sys.upload.maxFileSize',        '50',       'Y', '0', 'admin', NOW(), '', null, '单个文件上传大小限制');

INSERT INTO cloud_flow_db.sys_config VALUES(9, 100000, '文件上传-允许的文件类型',     'sys.upload.allowedTypes',       'jpg,jpeg,png,gif,bmp,doc,docx,xls,xlsx,ppt,pptx,pdf,txt,zip,rar', 'Y', '0', 'admin', NOW(), '', null, '允许上传的文件扩展名');

-- 验证码配置（全局：安全策略统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(10, 100000, '验证码-滑块容错值(像素)',       'sys.captcha.tolerance',         '8',        'Y', '0', 'admin', NOW(), '', null, '滑块验证码允许的像素偏差范围');

INSERT INTO cloud_flow_db.sys_config VALUES(11, 100000, '验证码-有效期(秒)',             'sys.captcha.ttl',               '300',      'Y', '0', 'admin', NOW(), '', null, '验证码生成后的有效时间');

INSERT INTO cloud_flow_db.sys_config VALUES(12, 100000, '验证码-每日单IP验证次数限制',   'sys.captcha.dailyLimit',        '100',      'Y', '0', 'admin', NOW(), '', null, '同一IP每天最多验证次数');

INSERT INTO cloud_flow_db.sys_config VALUES(13, 100000, '验证码-通过Token有效期(秒)',    'sys.captcha.passTokenTtl',      '120',      'Y', '0', 'admin', NOW(), '', null, '验证通过后Token的有效时间');

-- 考勤配置（租户级：不同租户上下班时间不同）
INSERT INTO cloud_flow_db.sys_config VALUES(14, 100000, '考勤管理-上班时间',             'sys.attendance.workStartTime',  '09:00',    'Y', '1', 'admin', NOW(), '', null, '每日上班打卡时间，格式 HH:mm');

INSERT INTO cloud_flow_db.sys_config VALUES(15, 100000, '考勤管理-下班时间',             'sys.attendance.workEndTime',    '18:00',    'Y', '1', 'admin', NOW(), '', null, '每日下班打卡时间，格式 HH:mm');

INSERT INTO cloud_flow_db.sys_config VALUES(16, 100000, '考勤管理-迟到阈值(分钟)',       'sys.attendance.lateThreshold',  '15',       'Y', '1', 'admin', NOW(), '', null, '超过上班时间多少分钟算迟到');

INSERT INTO cloud_flow_db.sys_config VALUES(17, 100000, '考勤管理-早退阈值(分钟)',       'sys.attendance.earlyLeaveThreshold', '15',  'Y', '1', 'admin', NOW(), '', null, '早于下班时间多少分钟算早退');

INSERT INTO cloud_flow_db.sys_config VALUES(18, 100000, '考勤管理-加班阈值(分钟)',       'sys.attendance.overtimeThreshold',   '30',  'Y', '1', 'admin', NOW(), '', null, '超过下班时间多少分钟算加班');

INSERT INTO cloud_flow_db.sys_config VALUES(19, 100000, '考勤管理-打卡半径(米)',         'sys.attendance.checkInRadius',  '500',      'Y', '1', 'admin', NOW(), '', null, '允许打卡的地理围栏半径');

-- 公告配置（租户级）
INSERT INTO cloud_flow_db.sys_config VALUES(20, 100000, '公告管理-默认过期天数',         'sys.announcement.defaultExpireDays', '30',  'Y', '1', 'admin', NOW(), '', null, '公告默认过期天数');

INSERT INTO cloud_flow_db.sys_config VALUES(21, 100000, '公告管理-最大附件大小(MB)',     'sys.announcement.maxAttachmentSize', '10',  'Y', '1', 'admin', NOW(), '', null, '公告附件最大上传大小');

-- 车辆管理配置（租户级）
INSERT INTO cloud_flow_db.sys_config VALUES(22, 100000, '车辆管理-最大预订天数',         'sys.vehicle.maxBookingDays',    '7',        'Y', '1', 'admin', NOW(), '', null, '单次车辆预订最大天数');

INSERT INTO cloud_flow_db.sys_config VALUES(23, 100000, '车辆管理-提前预订小时数',       'sys.vehicle.advanceBookingHours', '2',      'Y', '1', 'admin', NOW(), '', null, '需提前多少小时预订车辆');

-- 会议室配置（租户级）
INSERT INTO cloud_flow_db.sys_config VALUES(24, 100000, '会议室-最大预订小时数',         'sys.meetingRoom.maxBookingHours', '4',      'Y', '1', 'admin', NOW(), '', null, '单次会议室预订最大小时数');

INSERT INTO cloud_flow_db.sys_config VALUES(25, 100000, '会议室-自动释放分钟数',         'sys.meetingRoom.autoReleaseMinutes', '15',  'Y', '1', 'admin', NOW(), '', null, '预订开始后未签到自动释放的分钟数');

-- 资产管理配置（租户级）
INSERT INTO cloud_flow_db.sys_config VALUES(26, 100000, '资产管理-二维码前缀',           'sys.asset.qrCodePrefix',        'ASSET-',   'Y', '1', 'admin', NOW(), '', null, '资产二维码编号前缀');

INSERT INTO cloud_flow_db.sys_config VALUES(27, 100000, '资产管理-折旧方法',             'sys.asset.depreciationMethod',  'STRAIGHT_LINE', 'Y', '1', 'admin', NOW(), '', null, '资产折旧计算方法：STRAIGHT_LINE(直线法)');

-- 工作流配置（全局：引擎级参数统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(28, 100000, '工作流-流程最大深度',           'sys.workflow.maxDepth',         '500',      'Y', '0', 'admin', NOW(), '', null, '流程执行最大深度，防止循环流程导致堆栈溢出');

INSERT INTO cloud_flow_db.sys_config VALUES(29, 100000, '工作流-撤回时间窗口(小时)',     'sys.workflow.recallTimeoutHours', '24',     'Y', '1', 'admin', NOW(), '', null, '流程提交后允许撤回的时间窗口，0表示不限制');

INSERT INTO cloud_flow_db.sys_config VALUES(30, 100000, '工作流-失败最大重试次数',       'sys.workflow.maxRetryCount',    '5',        'Y', '0', 'admin', NOW(), '', null, '工作流节点执行失败后的最大重试次数');

-- 日志配置（全局：基础设施统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(31, 100000, '日志管理-请求参数最大长度',     'sys.log.maxLength',             '2000',     'Y', '0', 'admin', NOW(), '', null, '操作日志记录请求参数的最大字符长度');

INSERT INTO cloud_flow_db.sys_config VALUES(32, 100000, '日志管理-是否开启操作日志',     'sys.log.enabled',               'true',     'Y', '0', 'admin', NOW(), '', null, '是否开启操作日志记录功能');

INSERT INTO cloud_flow_db.sys_config VALUES(33, 100000, '日志管理-是否记录请求报文体',   'sys.log.requestEnabled',        'true',     'Y', '0', 'admin', NOW(), '', null, '是否记录请求参数到日志中');

-- 安全认证配置（全局：Token策略统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(34, 100000, '安全认证-Token过期时间(分钟)',   'sys.security.token.expiration', '30',       'Y', '0', 'admin', NOW(), '', null, '登录 Token 过期时间，单位分钟');

INSERT INTO cloud_flow_db.sys_config VALUES(35, 100000, '安全认证-Token刷新时间(分钟)',   'sys.security.token.refreshTime','20',       'Y', '0', 'admin', NOW(), '', null, 'Token距过期不足此时间时自动刷新');

-- 滑块验证码图片配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(36, 100000, '验证码-背景图宽度(像素)',       'sys.captcha.width',             '300',      'Y', '0', 'admin', NOW(), '', null, '滑块验证码背景图宽度');

INSERT INTO cloud_flow_db.sys_config VALUES(37, 100000, '验证码-背景图高度(像素)',       'sys.captcha.height',            '150',      'Y', '0', 'admin', NOW(), '', null, '滑块验证码背景图高度');

INSERT INTO cloud_flow_db.sys_config VALUES(38, 100000, '验证码-拼图块大小(像素)',       'sys.captcha.puzzleSize',        '44',       'Y', '0', 'admin', NOW(), '', null, '滑块验证码拼图块逻辑宽度');

INSERT INTO cloud_flow_db.sys_config VALUES(39, 100000, '验证码-圆弧半径(像素)',         'sys.captcha.circleRadius',      '8',        'Y', '0', 'admin', NOW(), '', null, '滑块验证码凸出圆弧半径');

-- 工作流引擎扩展配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(40, 100000, '工作流-定时器扫描最大重试次数', 'sys.workflow.timerMaxRetry',     '3',        'Y', '0', 'admin', NOW(), '', null, '定时器节点执行失败后的最大重试次数');

INSERT INTO cloud_flow_db.sys_config VALUES(41, 100000, '工作流-定时器重试间隔(分钟)',   'sys.workflow.timerRetryInterval','2',        'Y', '0', 'admin', NOW(), '', null, '定时器节点重试间隔时间');

INSERT INTO cloud_flow_db.sys_config VALUES(42, 100000, '工作流-事务重试基数(秒)',       'sys.workflow.retryBaseInterval', '30',       'Y', '0', 'admin', NOW(), '', null, '事务一致性重试间隔基数，采用指数退避');

INSERT INTO cloud_flow_db.sys_config VALUES(43, 100000, '工作流-异步状态过期(分钟)',     'sys.workflow.asyncStatusExpire', '10',       'Y', '0', 'admin', NOW(), '', null, '异步工作流状态在Redis中的过期时间');

INSERT INTO cloud_flow_db.sys_config VALUES(44, 100000, '工作流-Nonce防重放过期(分钟)',  'sys.workflow.nonceExpireMinutes','5',        'Y', '0', 'admin', NOW(), '', null, '请求Nonce防重放攻击的过期时间');

-- 分布式锁配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(45, 100000, '分布式锁-会签锁等待(秒)',       'sys.workflow.lock.countersignWait',  '10',   'Y', '0', 'admin', NOW(), '', null, '会签操作获取分布式锁的等待超时');

INSERT INTO cloud_flow_db.sys_config VALUES(46, 100000, '分布式锁-会签锁持有(秒)',       'sys.workflow.lock.countersignLease', '30',   'Y', '0', 'admin', NOW(), '', null, '会签操作分布式锁的自动释放时间');

INSERT INTO cloud_flow_db.sys_config VALUES(47, 100000, '分布式锁-死锁检测超时(秒)',     'sys.workflow.lock.deadlockTimeout', '60',   'Y', '0', 'admin', NOW(), '', null, '锁持有超过此时间视为可能死锁');

INSERT INTO cloud_flow_db.sys_config VALUES(48, 100000, '分布式锁-死锁牺牲记录上限',     'sys.workflow.lock.maxVictimRecords',     '100',      'Y', '0', 'admin', NOW(), '', null, '死锁牺牲记录最大保留数量');

INSERT INTO cloud_flow_db.sys_config VALUES(91, 100000, '工作流-是否启用进程内脚本',     'sys.workflow.script.enabled', 'false', 'Y', '0', 'admin', NOW(), '', null, '是否允许工作流服务进程内执行 Groovy/JavaScript 脚本，生产环境默认关闭');

INSERT INTO cloud_flow_db.sys_config VALUES(92, 100000, '证照管理-到期提醒天数',     'sys.oa.license.expiryReminderDays', '30,15,7,0', 'Y', '1', 'admin', NOW(), '', null, '证照到期提醒提前天数，多个值用逗号分隔');

-- SSE实时推送配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(49, 100000, 'SSE-连接超时时间(毫秒)',        'sys.sse.timeout',               '0',        'Y', '0', 'admin', NOW(), '', null, 'SSE连接超时时间，0表示永不超时');

-- 分页配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(50, 100000, '分页-默认页码',                 'sys.page.defaultPageNum',       '1',        'Y', '0', 'admin', NOW(), '', null, '分页查询默认起始页码');

INSERT INTO cloud_flow_db.sys_config VALUES(51, 100000, '分页-默认每页条数',             'sys.page.defaultPageSize',      '10',       'Y', '0', 'admin', NOW(), '', null, '分页查询默认每页显示条数');

-- 租户配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(52, 100000, '租户-默认租户ID',               'sys.tenant.defaultId',          '100000',   'Y', '0', 'admin', NOW(), '', null, '系统默认租户ID');

INSERT INTO cloud_flow_db.sys_config VALUES(53, 100000, '租户-默认用户数量限制',         'sys.tenant.defaultUserLimit',   '100',      'Y', '0', 'admin', NOW(), '', null, '新建租户默认用户数量上限');

INSERT INTO cloud_flow_db.sys_config VALUES(54, 100000, '租户-默认存储空间(MB)',         'sys.tenant.defaultStorageLimit','10240',    'Y', '0', 'admin', NOW(), '', null, '新建租户默认存储空间限制');

-- OA补充配置（租户级）
INSERT INTO cloud_flow_db.sys_config VALUES(55, 100000, '公告管理-是否允许匿名阅读',     'sys.announcement.allowAnonymous','false',   'Y', '1', 'admin', NOW(), '', null, '是否允许未登录用户查看公告');

INSERT INTO cloud_flow_db.sys_config VALUES(56, 100000, '资产管理-二维码大小(像素)',     'sys.asset.qrCodeSize',          '200',      'Y', '1', 'admin', NOW(), '', null, '资产二维码图片尺寸');

INSERT INTO cloud_flow_db.sys_config VALUES(57, 100000, '资产管理-是否启用二维码',       'sys.asset.enableQrCode',        'true',     'Y', '1', 'admin', NOW(), '', null, '是否为资产自动生成二维码');

INSERT INTO cloud_flow_db.sys_config VALUES(58, 100000, '车辆管理-是否允许并发预订',     'sys.vehicle.allowConcurrent',   'false',    'Y', '1', 'admin', NOW(), '', null, '同一车辆是否允许时间段重叠预订');

INSERT INTO cloud_flow_db.sys_config VALUES(59, 100000, '车辆管理-油价更新Cron表达式',   'sys.vehicle.fuelPriceUpdateCron','0 0 2 * * ?','Y','1','admin', NOW(), '', null, '油价自动更新定时任务Cron表达式');

INSERT INTO cloud_flow_db.sys_config VALUES(60, 100000, '会议室-提前预订小时数',         'sys.meetingRoom.advanceBookingHours','1',    'Y', '1', 'admin', NOW(), '', null, '需提前多少小时预订会议室');

INSERT INTO cloud_flow_db.sys_config VALUES(61, 100000, '会议室-是否允许并发预订',       'sys.meetingRoom.allowConcurrent','false',   'Y', '1', 'admin', NOW(), '', null, '同一会议室是否允许时间段重叠预订');

-- 加密配置（全局：安全策略统一管控）
INSERT INTO cloud_flow_db.sys_config VALUES(62, 100000, '加密-是否启用字段加密',         'sys.encrypt.enabled',           'true',     'Y', '0', 'admin', NOW(), '', null, '是否启用数据库字段加密功能');

-- 数据权限配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(63, 100000, '数据权限-部门字段名',           'sys.datascope.deptColumn',      'dept_id',  'Y', '0', 'admin', NOW(), '', null, '数据权限过滤使用的部门字段名');

INSERT INTO cloud_flow_db.sys_config VALUES(64, 100000, '数据权限-用户字段名',           'sys.datascope.userColumn',      'create_by','Y', '0', 'admin', NOW(), '', null, '数据权限过滤使用的用户字段名');

-- 工作流Stream配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(65, 100000, '工作流-Stream Key',             'sys.workflow.stream.key',       'workflow:stream:timeout', 'Y', '0', 'admin', NOW(), '', null, 'Redis Stream消息队列Key名称');

INSERT INTO cloud_flow_db.sys_config VALUES(66, 100000, '工作流-Stream消费组',           'sys.workflow.stream.group',     'group:workflow:engine',   'Y', '0', 'admin', NOW(), '', null, 'Redis Stream消费者组名称');

-- 网关配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(67, 100000, '网关-默认租户ID',               'sys.gateway.defaultTenantId',   '100000',   'Y', '0', 'admin', NOW(), '', null, '请求未携带租户ID时使用的默认值');

-- OSS对象存储配置（全局）
INSERT INTO cloud_flow_db.sys_config VALUES(68, 100000, 'OSS-是否启用HTTPS',             'sys.oss.isHttps',               'N',        'Y', '0', 'admin', NOW(), '', null, '对象存储是否使用HTTPS协议');

INSERT INTO cloud_flow_db.sys_config VALUES(69, 100000, 'OSS-默认访问策略',              'sys.oss.accessPolicy',          '1',        'Y', '0', 'admin', NOW(), '', null, '桶默认访问策略：0私有 1公共读 2公共读写');

-- 13. 初始化业务规则数据
INSERT INTO cloud_flow_db.sys_business_rule
(tenant_id, rule_code, rule_name, module, threshold_value, effect, enabled, priority, remark, create_by, create_time, update_by, update_time)
VALUES
(100000, 'hr.leave.quota.limit', '请假时长阈值', 'HR', 5.00, 'WARN', 1, 10, '请假提交时超过阈值按规则效果处理', 'admin', NOW(), '', NULL),
(100000, 'oa.expense.amount.limit', '报销金额阈值', 'OA', 5000.00, 'WARN', 1, 10, '报销提交时超过阈值按规则效果处理', 'admin', NOW(), '', NULL),
(100000, 'oa.contract.risk.threshold', '合同高额风险阈值', 'OA', 100000.00, 'WARN', 1, 10, '合同风险扫描高额合同附件检查阈值', 'admin', NOW(), '', NULL);

-- =========================================================
-- Phase 2: 性能优化与监控告警配置（全局）
-- =========================================================

-- 异步线程池配置 - 工作流执行器
INSERT INTO cloud_flow_db.sys_config VALUES(70, 100000, '异步-工作流核心线程数',         'sys.workflow.async.workflow.corePoolSize',    '10',  'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器核心线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(71, 100000, '异步-工作流最大线程数',         'sys.workflow.async.workflow.maxPoolSize',     '20',  'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器最大线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(72, 100000, '异步-工作流队列容量',           'sys.workflow.async.workflow.queueCapacity',   '200', 'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器队列容量');

-- 异步线程池配置 - 通知执行器
INSERT INTO cloud_flow_db.sys_config VALUES(73, 100000, '异步-通知核心线程数',           'sys.workflow.async.notification.corePoolSize', '5',  'Y', '0', 'admin', NOW(), '', null, '通知异步执行器核心线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(74, 100000, '异步-通知最大线程数',           'sys.workflow.async.notification.maxPoolSize',  '10', 'Y', '0', 'admin', NOW(), '', null, '通知异步执行器最大线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(75, 100000, '异步-通知队列容量',             'sys.workflow.async.notification.queueCapacity','100','Y', '0', 'admin', NOW(), '', null, '通知异步执行器队列容量');

-- 异步线程池配置 - 审计执行器
INSERT INTO cloud_flow_db.sys_config VALUES(76, 100000, '异步-审计核心线程数',           'sys.workflow.async.audit.corePoolSize',       '3',  'Y', '0', 'admin', NOW(), '', null, '审计异步执行器核心线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(77, 100000, '异步-审计最大线程数',           'sys.workflow.async.audit.maxPoolSize',        '5',  'Y', '0', 'admin', NOW(), '', null, '审计异步执行器最大线程数');

INSERT INTO cloud_flow_db.sys_config VALUES(78, 100000, '异步-审计队列容量',             'sys.workflow.async.audit.queueCapacity',      '500','Y', '0', 'admin', NOW(), '', null, '审计异步执行器队列容量');

-- Redis缓存配置
INSERT INTO cloud_flow_db.sys_config VALUES(79, 100000, '缓存-流程定义TTL(秒)',          'sys.workflow.cache.definition.ttl',           '3600','Y', '0', 'admin', NOW(), '', null, '流程定义缓存过期时间（1小时）');

INSERT INTO cloud_flow_db.sys_config VALUES(80, 100000, '缓存-表单定义TTL(秒)',          'sys.workflow.cache.form.ttl',                 '3600','Y', '0', 'admin', NOW(), '', null, '表单定义缓存过期时间（1小时）');

INSERT INTO cloud_flow_db.sys_config VALUES(81, 100000, '缓存-用户信息TTL(秒)',          'sys.workflow.cache.user.ttl',                 '1800','Y', '0', 'admin', NOW(), '', null, '用户信息缓存过期时间（30分钟）');

-- 流程监控配置
INSERT INTO cloud_flow_db.sys_config VALUES(82, 100000, '监控-数据保留天数',             'sys.workflow.monitor.retentionDays',          '90',  'Y', '0', 'admin', NOW(), '', null, '流程监控数据保留天数');

INSERT INTO cloud_flow_db.sys_config VALUES(83, 100000, '监控-采样间隔(秒)',             'sys.workflow.monitor.sampleInterval',         '60',  'Y', '0', 'admin', NOW(), '', null, '流程监控数据采样间隔');

-- 超时告警配置
INSERT INTO cloud_flow_db.sys_config VALUES(84, 100000, '告警-超时检测间隔(分钟)',       'sys.workflow.alert.timeout.checkInterval',    '5',   'Y', '0', 'admin', NOW(), '', null, '超时任务检测间隔');

INSERT INTO cloud_flow_db.sys_config VALUES(85, 100000, '告警-超时提醒阈值(小时)',       'sys.workflow.alert.timeout.warningHours',     '24',  'Y', '0', 'admin', NOW(), '', null, '任务超时提醒阈值');

INSERT INTO cloud_flow_db.sys_config VALUES(86, 100000, '告警-超时严重阈值(小时)',       'sys.workflow.alert.timeout.criticalHours',    '72',  'Y', '0', 'admin', NOW(), '', null, '任务超时严重告警阈值');

-- 异常检测配置
INSERT INTO cloud_flow_db.sys_config VALUES(87, 100000, '告警-异常检测间隔(分钟)',       'sys.workflow.alert.anomaly.checkInterval',    '10',  'Y', '0', 'admin', NOW(), '', null, '异常流程检测间隔');

INSERT INTO cloud_flow_db.sys_config VALUES(88, 100000, '告警-失败重试阈值',             'sys.workflow.alert.anomaly.retryThreshold',   '3',   'Y', '0', 'admin', NOW(), '', null, '流程失败重试次数告警阈值');

-- 性能优化配置
INSERT INTO cloud_flow_db.sys_config VALUES(89, 100000, '性能-批量查询大小',             'sys.workflow.performance.batchSize',          '100', 'Y', '0', 'admin', NOW(), '', null, '批量查询单次最大记录数');

INSERT INTO cloud_flow_db.sys_config VALUES(90, 100000, '性能-慢查询阈值(毫秒)',         'sys.workflow.performance.slowQueryThreshold', '1000','Y', '0', 'admin', NOW(), '', null, '慢查询告警阈值');

-- =========================================================
-- 二、工作流与模板种子数据（迁移自 02.cloudflow-workflow.sql）
-- =========================================================

-- =========================================================
-- 初始化数据 - 流程分类、表单、流程定义与示例数据
-- =========================================================
INSERT INTO cloud_flow_db.wf_process_category (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA办公',       'oa',            'Briefcase',    1, '0'),
(2, 0, '人事管理',     'hr',            'Users',        2, '0'),
(3, 0, '财务管理',     'finance',       'DollarSign',   3, '0'),
(4, 0, '行政管理',     'admin',         'Building',     4, '0'),
(5, 0, '项目管理',     'project',       'FolderKanban', 5, '0'),
(10, 2, '请假管理',    'hr_leave',      'Calendar',     1, '0'),
(11, 2, '加班管理',    'hr_overtime',   'Clock',        2, '0'),
(12, 1, '出差管理',    'oa_trip',       'Plane',        3, '0'),
(13, 2, '考勤管理',    'hr_attendance', 'UserCheck',    4, '0'),
(14, 1, '访客管理',    'oa_visitor',    'UserPlus',     5, '0'),
(20, 3, '报销管理',    'fin_expense',   'Receipt',      1, '0'),
(21, 3, '付款管理',    'fin_payment',   'CreditCard',   2, '0'),
(22, 3, '预算管理',    'fin_budget',    'PieChart',     3, '0'),
(30, 4, '车辆管理',    'adm_vehicle',   'Car',          1, '0'),
(31, 4, '会议管理',    'adm_meeting',   'Video',        2, '0'),
(32, 4, '通知管理',    'adm_notice',    'Bell',         3, '0');

-- 表单定义
INSERT INTO cloud_flow_db.wf_form_definition (form_id, form_name, fields_json, create_time) VALUES
('form_reimburse', '财务报销表单', '[{"id":"f1","type":"SELECT","label":"报销类型","required":true,"options":["差旅费","招待费","办公费","团建费"]},{"id":"f2","type":"NUMBER","label":"报销金额","required":true},{"id":"f3","type":"DATE","label":"发生日期","required":true},{"id":"f4","type":"TEXTAREA","label":"费用明细说明","required":true}]', NOW()),
('form_payment', '对公付款申请表单', '[{"id":"p1","type":"TEXT","label":"收款方名称","required":true},{"id":"p2","type":"TEXT","label":"银行账号","required":true},{"id":"p3","type":"NUMBER","label":"付款金额","required":true},{"id":"p4","type":"TEXT","label":"合同编号","required":false}]', NOW()),
('form_leave', '请假申请表单', '[{"id":"l1","type":"SELECT","label":"请假类型","required":true,"options":["年假","事假","病假","婚假","产假"]},{"id":"l2","type":"DATE","label":"开始时间","required":true},{"id":"l3","type":"DATE","label":"结束时间","required":true},{"id":"l4","type":"NUMBER","label":"共计天数","required":true},{"id":"l5","type":"TEXTAREA","label":"请假事由","required":true}]', NOW()),
('form_contract', '合同审批表单', '[{"id":"c1","type":"TEXT","label":"合同名称","required":true},{"id":"c2","type":"TEXT","label":"对方单位","required":true},{"id":"c3","type":"NUMBER","label":"合同金额","required":true},{"id":"c4","type":"SELECT","label":"合同类型","required":true,"options":["采购合同","销售合同","服务协议"]},{"id":"c5","type":"TEXTAREA","label":"主要条款摘要","required":true}]', NOW()),
('form_recruit', '招聘申请表单', '[{"id":"r1","type":"TEXT","label":"招聘岗位","required":true},{"id":"r2","type":"NUMBER","label":"招聘人数","required":true},{"id":"r3","type":"SELECT","label":"职级","required":true,"options":["P5","P6","P7","P8"]},{"id":"r4","type":"TEXTAREA","label":"岗位职责","required":true},{"id":"r5","type":"NUMBER","label":"预算薪资（千元）","required":true}]', NOW());

-- 通用流程表单定义
INSERT INTO cloud_flow_db.wf_form_definition (form_id, form_name, fields_json, create_time) VALUES
('form_attendance_appeal', '补卡/外勤审批表单', '[{"id":"appealType","type":"SELECT","label":"申请类型","required":true,"options":["补卡","外勤"]},{"id":"appealDate","type":"DATE","label":"申请日期","required":true},{"id":"timePoint","type":"TEXT","label":"异常时间点","required":true},{"id":"reason","type":"TEXTAREA","label":"申请说明","required":true}]', NOW()),
('form_overtime_request', '加班审批表单', '[{"id":"overtimeDate","type":"DATE","label":"加班日期","required":true},{"id":"hours","type":"NUMBER","label":"加班时长（小时）","required":true},{"id":"workContent","type":"TEXTAREA","label":"加班内容","required":true},{"id":"compensationType","type":"SELECT","label":"补偿方式","required":true,"options":["调休","加班费"]}]', NOW()),
('form_expense_claim', '报销审批表单', '[{"id":"expenseType","type":"SELECT","label":"费用类型","required":true,"options":["差旅费","交通费","招待费","办公费","其他"]},{"id":"amount","type":"NUMBER","label":"报销金额","required":true},{"id":"occurDate","type":"DATE","label":"发生日期","required":true},{"id":"description","type":"TEXTAREA","label":"费用说明","required":true}]', NOW()),
('form_leave_request', '请假审批表单', '[{"id":"leaveType","type":"SELECT","label":"请假类型","required":true,"options":["年假","事假","病假","婚假","产假","调休"]},{"id":"startDate","type":"DATE","label":"开始日期","required":true},{"id":"endDate","type":"DATE","label":"结束日期","required":true},{"id":"days","type":"NUMBER","label":"请假天数","required":true},{"id":"reason","type":"TEXTAREA","label":"请假事由","required":true}]', NOW()),
('form_offer_approval', 'Offer审批表单', '[{"id":"candidateName","type":"TEXT","label":"候选人姓名","required":true},{"id":"positionName","type":"TEXT","label":"拟聘岗位","required":true},{"id":"salary","type":"NUMBER","label":"月薪（元）","required":true},{"id":"expectedOnboardDate","type":"DATE","label":"预计入职日期","required":true},{"id":"remark","type":"TEXTAREA","label":"审批说明","required":false}]', NOW()),
('form_onboarding_approval', '入职审批表单', '[{"id":"employeeName","type":"TEXT","label":"入职人姓名","required":true},{"id":"deptName","type":"TEXT","label":"入职部门","required":true},{"id":"positionName","type":"TEXT","label":"入职岗位","required":true},{"id":"onboardDate","type":"DATE","label":"入职日期","required":true},{"id":"remark","type":"TEXTAREA","label":"入职说明","required":false}]', NOW()),
('form_probation_confirmation', '转正审批表单', '[{"id":"employeeName","type":"TEXT","label":"员工姓名","required":true},{"id":"deptName","type":"TEXT","label":"所属部门","required":true},{"id":"probationEndDate","type":"DATE","label":"试用期结束日期","required":true},{"id":"selfSummary","type":"TEXTAREA","label":"试用期总结","required":true}]', NOW()),
('form_resignation_approval', '离职审批表单', '[{"id":"employeeName","type":"TEXT","label":"离职人姓名","required":true},{"id":"resignationDate","type":"DATE","label":"拟离职日期","required":true},{"id":"resignationType","type":"SELECT","label":"离职类型","required":true,"options":["主动离职","协商解除","合同到期"]},{"id":"reason","type":"TEXTAREA","label":"离职原因","required":true}]', NOW()),
('form_salary_adjustment', '调薪审批表单', '[{"id":"employeeName","type":"TEXT","label":"员工姓名","required":true},{"id":"currentSalary","type":"NUMBER","label":"当前月薪（元）","required":true},{"id":"newSalary","type":"NUMBER","label":"调整后月薪（元）","required":true},{"id":"effectiveDate","type":"DATE","label":"生效日期","required":true},{"id":"reason","type":"TEXTAREA","label":"调薪原因","required":true}]', NOW()),
('form_performance_plan', '绩效计划审批表单', '[{"id":"planName","type":"TEXT","label":"计划名称","required":true},{"id":"period","type":"TEXT","label":"绩效周期","required":true},{"id":"ownerName","type":"TEXT","label":"负责人","required":true},{"id":"objective","type":"TEXTAREA","label":"绩效目标","required":true}]', NOW()),
('form_performance_result', '绩效结果审批表单', '[{"id":"period","type":"TEXT","label":"绩效周期","required":true},{"id":"employeeName","type":"TEXT","label":"员工姓名","required":true},{"id":"score","type":"NUMBER","label":"绩效得分","required":true},{"id":"resultLevel","type":"SELECT","label":"绩效等级","required":true,"options":["A","B","C","D"]},{"id":"summary","type":"TEXTAREA","label":"结果说明","required":true}]', NOW()),
('form_transfer_approval', '调岗审批表单', '[{"id":"employeeName","type":"TEXT","label":"员工姓名","required":true},{"id":"fromDept","type":"TEXT","label":"原部门","required":true},{"id":"toDept","type":"TEXT","label":"目标部门","required":true},{"id":"toPosition","type":"TEXT","label":"目标岗位","required":true},{"id":"effectiveDate","type":"DATE","label":"生效日期","required":true},{"id":"reason","type":"TEXTAREA","label":"调岗原因","required":true}]', NOW()),
('form_payment_request', '付款审批表单', '[{"id":"payeeName","type":"TEXT","label":"收款方名称","required":true},{"id":"bankAccount","type":"TEXT","label":"银行账号","required":true},{"id":"amount","type":"NUMBER","label":"付款金额","required":true},{"id":"contractNo","type":"TEXT","label":"合同编号","required":false},{"id":"purpose","type":"TEXTAREA","label":"付款用途","required":true}]', NOW()),
('form_purchase_request', '采购审批表单', '[{"id":"itemName","type":"TEXT","label":"采购物品","required":true},{"id":"quantity","type":"NUMBER","label":"采购数量","required":true},{"id":"amount","type":"NUMBER","label":"采购金额","required":true},{"id":"expectedDate","type":"DATE","label":"期望到货日期","required":false},{"id":"reason","type":"TEXTAREA","label":"采购原因","required":true}]', NOW()),
('form_business_trip', '出差审批表单', '[{"id":"destination","type":"TEXT","label":"出差地点","required":true},{"id":"startDate","type":"DATE","label":"开始日期","required":true},{"id":"endDate","type":"DATE","label":"结束日期","required":true},{"id":"budget","type":"NUMBER","label":"预算金额","required":true},{"id":"purpose","type":"TEXTAREA","label":"出差事由","required":true}]', NOW()),
('form_vehicle_approval', '用车审批表单', '[{"id":"vehiclePurpose","type":"TEXT","label":"用车事由","required":true},{"id":"destination","type":"TEXT","label":"目的地","required":true},{"id":"startTime","type":"DATE","label":"用车日期","required":true},{"id":"passengerCount","type":"NUMBER","label":"乘车人数","required":true},{"id":"remark","type":"TEXTAREA","label":"备注","required":false}]', NOW()),
('form_seal_application', '用印审批表单', '[{"id":"sealName","type":"TEXT","label":"印章名称","required":true},{"id":"documentName","type":"TEXT","label":"用印文件","required":true},{"id":"useCount","type":"NUMBER","label":"用印份数","required":true},{"id":"expectedReturnDate","type":"DATE","label":"预计归还日期","required":false},{"id":"purpose","type":"TEXTAREA","label":"用印事由","required":true}]', NOW()),
('form_license_borrow', '证照借用审批表单', '[{"id":"licenseName","type":"TEXT","label":"证照名称","required":true},{"id":"borrowDate","type":"DATE","label":"借用日期","required":true},{"id":"expectedReturnDate","type":"DATE","label":"预计归还日期","required":true},{"id":"purpose","type":"TEXTAREA","label":"借用事由","required":true}]', NOW()),
('form_license_renewal', '证照续期审批表单', '[{"id":"licenseName","type":"TEXT","label":"证照名称","required":true},{"id":"oldExpireDate","type":"DATE","label":"原到期日期","required":true},{"id":"newExpireDate","type":"DATE","label":"新到期日期","required":true},{"id":"reason","type":"TEXTAREA","label":"续期原因","required":true}]', NOW()),
('form_knowledge_publish', '知识库发布审批表单', '[{"id":"documentTitle","type":"TEXT","label":"文档标题","required":true},{"id":"categoryName","type":"TEXT","label":"知识分类","required":true},{"id":"publishScope","type":"SELECT","label":"发布范围","required":true,"options":["全员","部门","指定角色"]},{"id":"summary","type":"TEXTAREA","label":"发布说明","required":true}]', NOW());

-- 核心流程定义（nodes + edges）
INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"nodes":[{"id":"root","type":"START","title":"提交报销"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount >= 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_leave', '员工请假流程', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"nodes":[{"id":"root","type":"START","title":"提交请假"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw_leave","type":"CONDITION","title":"天数校验"},{"id":"b1","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr","condition":"days <= 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"days > 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw_leave","source":"n1","target":"gw_leave"},{"id":"gw_leave->b1","source":"gw_leave","target":"b1"},{"id":"gw_leave->b2","source":"gw_leave","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_contract', '合同审批流程', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"nodes":[{"id":"root","type":"START","title":"发起合同"},{"id":"n1","type":"APPROVAL","title":"法务与财务会签","signType":"ALL","approverType":"USERS","approverValue":"3,6","props":{"buttons":["APPROVE","REJECT"]}},{"id":"n2","type":"APPROVAL","title":"总经理签发","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_recruit', '招聘申请流程', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"nodes":[{"id":"root","type":"START","title":"提交招聘需求"},{"id":"n1","type":"APPROVAL","title":"部门总监审批","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"n2","type":"APPROVAL","title":"HR审核","approverType":"ROLE","approverValue":"hr","props":{"buttons":["APPROVE","REJECT","DELEGATE"]}},{"id":"n3","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_payment', '对公付款流程', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"nodes":[{"id":"root","type":"START","title":"提交付款申请"},{"id":"n1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","RETURN","DELEGATE"]}},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

-- 通用 OA 流程定义
INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_attendance_appeal', '补卡/外勤审批流程', 'attendance_appeal', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_overtime_request', '加班审批流程', 'overtime_request', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交加班申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_expense_claim', '报销审批流程', 'expense_claim', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交报销"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"财务审核","approverType":"ROLE","approverValue":"finance"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_leave_request', '请假审批流程', 'leave_request', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交请假"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

-- HR 审批流程定义
INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_offer_approval', 'Offer审批流程', 'offer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交Offer审批"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_onboarding_approval', '入职审批流程', 'onboarding_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交入职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_probation_confirmation_approval', '转正审批流程', 'probation_confirmation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交转正申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_resignation_approval', '离职审批流程', 'resignation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交离职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_salary_adjustment_approval', '调薪审批流程', 'salary_adjustment_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交调薪申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_performance_plan_approval', '绩效计划审批流程', 'performance_plan_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交绩效计划"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_performance_result_approval', '绩效结果审批流程', 'performance_result_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交绩效结果"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_transfer_approval', '调岗审批流程', 'transfer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交调岗申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_payment_request', '付款审批流程', 'payment_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交付款申请"},{"id":"n1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance"},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000"},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000"},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_purchase_request', '采购审批流程', 'purchase_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交采购申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"采购经理审批","approverType":"ROLE","approverValue":"manager"},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"END","title":"流程结束","condition":"amount < 50000"},{"id":"b2","type":"APPROVAL","title":"管理员审批","approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000"},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->gw1","source":"n2","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_business_trip', '出差审批流程', 'business_trip', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交出差申请"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_vehicle_approval', '用车审批流程', 'vehicle_approval', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交用车申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政确认派车","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_seal_application', '用印审批流程', 'seal_application', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交用印申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政审批","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_license_borrow', '证照借用审批流程', 'license_borrow', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交证照借用"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政审批","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_license_renewal', '证照续期审批流程', 'license_renewal', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交证照续期"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政审批","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO cloud_flow_db.wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_knowledge_publish', '知识库发布审批', 'knowledge_publish', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交知识文档"},{"id":"n1","type":"APPROVAL","title":"直属领导审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"管理员/HR发布审批","approverType":"ROLE","approverValue":"admin,hr","signType":"ANY"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

UPDATE cloud_flow_db.wf_process_definition
SET form_id = CASE definition_id
  WHEN 'wf_attendance_appeal' THEN 'form_attendance_appeal'
  WHEN 'wf_overtime_request' THEN 'form_overtime_request'
  WHEN 'wf_expense_claim' THEN 'form_expense_claim'
  WHEN 'wf_leave_request' THEN 'form_leave_request'
  WHEN 'wf_offer_approval' THEN 'form_offer_approval'
  WHEN 'wf_onboarding_approval' THEN 'form_onboarding_approval'
  WHEN 'wf_probation_confirmation_approval' THEN 'form_probation_confirmation'
  WHEN 'wf_resignation_approval' THEN 'form_resignation_approval'
  WHEN 'wf_salary_adjustment_approval' THEN 'form_salary_adjustment'
  WHEN 'wf_performance_plan_approval' THEN 'form_performance_plan'
  WHEN 'wf_performance_result_approval' THEN 'form_performance_result'
  WHEN 'wf_transfer_approval' THEN 'form_transfer_approval'
  WHEN 'wf_payment_request' THEN 'form_payment_request'
  WHEN 'wf_purchase_request' THEN 'form_purchase_request'
  WHEN 'wf_business_trip' THEN 'form_business_trip'
  WHEN 'wf_vehicle_approval' THEN 'form_vehicle_approval'
  WHEN 'wf_seal_application' THEN 'form_seal_application'
  WHEN 'wf_license_borrow' THEN 'form_license_borrow'
  WHEN 'wf_license_renewal' THEN 'form_license_renewal'
  WHEN 'wf_knowledge_publish' THEN 'form_knowledge_publish'
  ELSE form_id
END
WHERE definition_id IN (
  'wf_attendance_appeal',
  'wf_overtime_request',
  'wf_expense_claim',
  'wf_leave_request',
  'wf_offer_approval',
  'wf_onboarding_approval',
  'wf_probation_confirmation_approval',
  'wf_resignation_approval',
  'wf_salary_adjustment_approval',
  'wf_performance_plan_approval',
  'wf_performance_result_approval',
  'wf_transfer_approval',
  'wf_payment_request',
  'wf_purchase_request',
  'wf_business_trip',
  'wf_vehicle_approval',
  'wf_seal_application',
  'wf_license_borrow',
  'wf_license_renewal',
  'wf_knowledge_publish'
);

-- 测试数据
-- 用于开发和测试环境
-- 插入测试流程实例
DELETE FROM cloud_flow_db.wf_process_copy
WHERE instance_id LIKE 'test_inst_%';

DELETE FROM cloud_flow_db.wf_task_history
WHERE instance_id LIKE 'test_inst_%';

DELETE FROM cloud_flow_db.wf_countersign_vote
WHERE countersign_id LIKE 'cs_inst_%';

DELETE FROM cloud_flow_db.wf_countersign_task
WHERE countersign_id LIKE 'cs_inst_%';

DELETE FROM cloud_flow_db.wf_task
WHERE instance_id LIKE 'test_inst_%';

DELETE FROM cloud_flow_db.wf_process_instance
WHERE instance_id LIKE 'test_inst_%';

INSERT INTO cloud_flow_db.wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key,
  title, start_user_id, start_user_name, status, start_time, end_time, variables, priority
) VALUES
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001', '张三的差旅费报销', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, '{"f1":"差旅费","f2":1500,"f3":"2026-02-08","f4":"北京客户拜访差旅报销"}', 'NORMAL'),
('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002', '张三的年假申请', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 'URGENT'),
('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003', 'XX科技采购合同审批', 2, '李经理', 'RUNNING', DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 'HIGH'),
('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004', '合同付款申请', 3, '王财务', 'RUNNING', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 'NORMAL'),
('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005', '李经理的客户招待费报销', 2, '李经理', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), '{"f1":"招待费","f2":2500,"f3":"2026-02-09","f4":"客户商务宴请"}', 'URGENT'),
('test_inst_006', 100000, 'biz_leave', 'wf_leave', 'BIZ_006', '赵HR的病假申请', 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 'NORMAL'),
('test_inst_007', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_007', '高级Java开发工程师招聘申请', 4, '赵HR', 'RUNNING', DATE_SUB(NOW(), INTERVAL 8 HOUR), NULL, '{"r1":"高级Java开发工程师","r2":2,"r3":"P7","r4":"负责核心业务系统开发","r5":35}', 'HIGH');

-- 插入待办任务
INSERT INTO cloud_flow_db.wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES
('test_task_001', 100000, 'test_inst_001', 'n1', '直属上级审批', 2, '李经理', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_002', 100000, 'test_inst_002', 'n1', '部门经理审批', 2, '李经理', 'TODO', 'URGENT', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('test_task_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 6, '刘法务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_004', 100000, 'test_inst_003', 'n1', '法务与财务会签', 3, '王财务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_005', 100000, 'test_inst_004', 'n1', '财务主管审批', 3, '王财务', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_006', 100000, 'test_inst_007', 'n2', 'HR审核', 4, '赵HR', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 插入会签任务记录
INSERT INTO cloud_flow_db.wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 'ALL', 2, 0, 0, 0, 'VOTING', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 插入任务历史记录
INSERT INTO cloud_flow_db.wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES
('test_hist_001', 100000, 'test_task_done_001', 'test_inst_005', '直属上级审批', 'n1', 2, '李经理', 'APPROVE', '同意报销', 300, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('test_hist_002', 100000, 'test_task_done_002', 'test_inst_005', '财务主管审批', 'b1', 3, '王财务', 'APPROVE', '财务已审核', 600, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('test_hist_003', 100000, 'test_task_done_003', 'test_inst_006', '部门经理审批', 'n1', 2, '李经理', 'APPROVE', '同意请假', 180, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('test_hist_004', 100000, 'test_task_done_004', 'test_inst_006', 'HR备案', 'b1', 4, '赵HR', 'APPROVE', '已备案', 120, DATE_SUB(NOW(), INTERVAL 4 DAY));

-- 插入流程抄送记录
INSERT INTO cloud_flow_db.wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
(100000, 'test_inst_002', 'biz_leave', '张三的年假申请', 'n1', '部门经理审批', 5, '张三', 1, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'test_inst_003', 'biz_contract', 'XX科技采购合同审批', 'n1', '法务与财务会签', 2, '李经理', 1, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 'test_inst_004', 'biz_payment', '合同付款申请', 'n1', '财务主管审批', 3, '王财务', 1, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'test_inst_006', 'biz_leave', '赵HR的病假申请', 'b1', 'HR备案', 4, '赵HR', 1, '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));

-- =========================================================
--
-- =========================================================
-- 统一的系统模板分类（平台级，tenant_id 为空）
INSERT INTO cloud_flow_db.template_category (id, name, description, order_num, tenant_id) VALUES
('cat-office', '行政办公', '日常行政、通用审批与办公协同流程模板', 1, NULL),
('cat-finance', '财务', '费用、付款、预算等财务流程模板', 2, NULL),
('cat-hr', '人事', '入转调离、培训成长等人事流程模板', 3, NULL),
('cat-sales', '销售业务', '报价、折扣、合同等销售流程模板', 4, NULL),
('cat-it', 'IT运维', '权限、发布、故障等 IT 运维流程模板', 5, NULL),
('cat-industry', '行业专属', '行业场景下的专业流程模板', 6, NULL),
('cat-other', '其他', '项目、清单等通用补充流程模板', 7, NULL);

-- 统一的系统模板库（平台级，tenant_id 为空）
INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', '请假审批', '员工提交 → 部门经理审批 → 完成', 'cat-hr',
'["请假","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交请假"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-contract-001', '合同审批', '起草 → 法务审核 → 总经理签发 → 盖章归档', 'cat-office',
'["合同","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "起草合同"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "法务审核",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理签发",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "盖章归档",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-seal-001', '用印申请', '申请用印 → 部门审批 → 行政盖章 → 完成', 'cat-office',
'["用印","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请用印"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "行政盖章",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-travel-001', '出差申请', '提交出差 → 部门审批 → 总经理审批 → 完成', 'cat-office',
'["出差","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交出差申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-vehicle-001', '用车申请', '申请用车 → 行政审批 → 车辆调度 → 完成', 'cat-office',
'["用车","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请用车"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "行政审批",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "车辆调度确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-reimbursement-001', '报销审批', '提交报销 → 部门经理 → 财务审核 → 完成', 'cat-finance',
'["报销","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报销"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase-001', '采购审批', '提交采购 → 金额判断 → 分级审批 → 完成', 'cat-finance',
'["采购","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交采购申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "金额 > 5000",
      "condition": "amount > 5000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end",
      "isDefault": true
    },
    {
      "id": "n1->b2",
      "source": "n1",
      "target": "b2",
      "condition": "amount > 5000"
    },
    {
      "id": "b2->n2",
      "source": "b2",
      "target": "n2"
    },
    {
      "id": "n2->end_high",
      "source": "n2",
      "target": "end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-payment-001', '付款申请', '提交付款 → 财务审核 → 总经理审批 → 出纳付款', 'cat-finance',
'["付款","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交付款申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "财务审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "出纳付款",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-budget-001', '预算审批', '编制预算 → 部门审核 → 财务审核 → 总经理批准', 'cat-finance',
'["预算","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "编制预算"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务部审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "总经理批准",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-onboarding-001', '入职审批', '提交入职 → HR审核 → 部门确认 → IT开通账号', 'cat-hr',
'["入职","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交入职申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "部门负责人确认",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "IT开通账号",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-resignation-001', '离职审批', '提交离职 → 部门审批 → HR审核 → 资产交接', 'cat-hr',
'["离职","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交离职申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "资产交接确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-promotion-001', '晋升审批', '提名推荐 → 部门审核 → HR评估 → 总经理批准', 'cat-hr',
'["晋升","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提名推荐"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR评估",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "总经理批准",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-training-001', '培训申请', '提交培训 → 部门审批 → HR审核 → 完成', 'cat-hr',
'["培训","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交培训申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-quote-001', '报价审批', '提交报价 → 销售主管 → 金额判断 → 分级审批', 'cat-sales',
'["报价","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报价单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "销售主管审核",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "金额 > 10万",
      "condition": "amount > 100000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end",
      "isDefault": true
    },
    {
      "id": "n1->b2",
      "source": "n1",
      "target": "b2",
      "condition": "amount > 100000"
    },
    {
      "id": "b2->n2",
      "source": "b2",
      "target": "n2"
    },
    {
      "id": "n2->end_high",
      "source": "n2",
      "target": "end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-discount-001', '折扣审批', '申请折扣 → 销售总监 → 财务确认 → 完成', 'cat-sales',
'["折扣","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请折扣"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "销售总监审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务确认",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-server-001', '服务器申请', '提交申请 → IT审核 → 安全审查 → 运维部署', 'cat-it',
'["服务器","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交服务器申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "IT主管审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "安全审查",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "运维部署",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-permission-001', '权限申请', '提交权限 → 部门审批 → IT审核 → 安全确认', 'cat-it',
'["权限","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交权限申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "IT审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "安全确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-change-001', '变更发布', '提交变更 → 技术评审 → 测试验证 → 上线审批', 'cat-it',
'["变更发布","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交变更申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "技术评审",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "测试验证",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "上线审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-medical-001', '医疗器械采购', '科室申请 → 设备科审核 → 院长审批 → 招标采购', 'cat-industry',
'["医疗器械采购","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "科室提交申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "设备科审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "院长审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "招标采购",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-construction-001', '工程验收', '提交验收 → 监理审核 → 质检验收 → 甲方确认', 'cat-industry',
'["工程验收","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交验收申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "监理审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "质检验收",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "甲方确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-education-001', '课程审批', '教师提交 → 教研组审核 → 教务处审批 → 完成', 'cat-industry',
'["课程","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交课程方案"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "教研组审核",
      "approverType": "DIRECT_LEADER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "教务处审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-maintenance-001', '设备维修', '报修 → 维修主管派单 → 维修完成 → 验收确认', 'cat-industry',
'["设备维修","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报修"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "维修主管派单",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "维修完成确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "报修人验收",
      "approverType": "INITIATOR"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-logistics-001', '发货审批', '创建发货单 → 仓库确认 → 物流安排 → 完成', 'cat-industry',
'["发货","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "创建发货单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "仓库确认库存",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "物流安排",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-checklist-001', '审核清单', '提交清单 → 逐项审核 → 最终确认 → 完成', 'cat-other',
'["审核清单","其他","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交审核清单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "逐项审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "最终确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase_advanced-001', '大额采购全流程', '部门审批 → 金额分级 → 多级审批 → 通知结果', 'cat-finance',
'["大额采购","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交采购申请"
    },
    {
      "id": "pa_n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "pa_n5",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "pa_b2",
      "type": "CONDITION",
      "title": "5000 < 金额 ≤ 50000",
      "condition": "amount > 5000 && amount <= 50000"
    },
    {
      "id": "pa_n2",
      "type": "APPROVAL",
      "title": "财务总监审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_b3",
      "type": "CONDITION",
      "title": "金额 > 50000",
      "condition": "amount > 50000"
    },
    {
      "id": "pa_n3",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "pa_n4",
      "type": "APPROVAL",
      "title": "财务总监审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_n5_mid",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end_mid",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "pa_n5_high",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->pa_n1",
      "source": "start",
      "target": "pa_n1"
    },
    {
      "id": "pa_n1->pa_n5",
      "source": "pa_n1",
      "target": "pa_n5",
      "isDefault": true
    },
    {
      "id": "pa_n5->pa_end",
      "source": "pa_n5",
      "target": "pa_end"
    },
    {
      "id": "pa_n1->pa_b2",
      "source": "pa_n1",
      "target": "pa_b2",
      "condition": "amount > 5000 && amount <= 50000"
    },
    {
      "id": "pa_b2->pa_n2",
      "source": "pa_b2",
      "target": "pa_n2"
    },
    {
      "id": "pa_n1->pa_b3",
      "source": "pa_n1",
      "target": "pa_b3",
      "condition": "amount > 50000"
    },
    {
      "id": "pa_b3->pa_n3",
      "source": "pa_b3",
      "target": "pa_n3"
    },
    {
      "id": "pa_n3->pa_n4",
      "source": "pa_n3",
      "target": "pa_n4"
    },
    {
      "id": "pa_n2->pa_n5_mid",
      "source": "pa_n2",
      "target": "pa_n5_mid"
    },
    {
      "id": "pa_n5_mid->pa_end_mid",
      "source": "pa_n5_mid",
      "target": "pa_end_mid"
    },
    {
      "id": "pa_n4->pa_n5_high",
      "source": "pa_n4",
      "target": "pa_n5_high"
    },
    {
      "id": "pa_n5_high->pa_end_high",
      "source": "pa_n5_high",
      "target": "pa_end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-project_approval-001', '项目立项审批', '部门审核 → 技术+财务并行评审 → 总经理审批 → 通知', 'cat-other',
'["项目立项","其他","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交立项申请"
    },
    {
      "id": "proj_n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "proj_n2",
      "type": "PARALLEL",
      "title": "并行评审（技术+财务）",
      "approverType": "ROLE",
      "approverValue": "admin,finance",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "proj_n5",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "proj_n6",
      "type": "NOTIFICATION",
      "title": "通知立项结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "项目立项结果",
        "notificationContent": "您的项目立项申请已完成审批，请登录系统查看详情。"
      }
    },
    {
      "id": "proj_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "proj_b1",
      "type": "CONDITION",
      "title": "技术可行性评审"
    },
    {
      "id": "proj_n3",
      "type": "APPROVAL",
      "title": "技术委员会评审",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "proj_b2",
      "type": "CONDITION",
      "title": "财务预算评估"
    },
    {
      "id": "proj_n4",
      "type": "APPROVAL",
      "title": "财务部预算评估",
      "approverType": "ROLE",
      "approverValue": "finance"
    }
  ],
  "edges": [
    {
      "id": "start->proj_n1",
      "source": "start",
      "target": "proj_n1"
    },
    {
      "id": "proj_n1->proj_n2",
      "source": "proj_n1",
      "target": "proj_n2"
    },
    {
      "id": "proj_n2->proj_n5",
      "source": "proj_n2",
      "target": "proj_n5",
      "isDefault": true
    },
    {
      "id": "proj_n5->proj_n6",
      "source": "proj_n5",
      "target": "proj_n6"
    },
    {
      "id": "proj_n6->proj_end",
      "source": "proj_n6",
      "target": "proj_end"
    },
    {
      "id": "proj_n2->proj_b1",
      "source": "proj_n2",
      "target": "proj_b1"
    },
    {
      "id": "proj_b1->proj_n3",
      "source": "proj_b1",
      "target": "proj_n3"
    },
    {
      "id": "proj_n2->proj_b2",
      "source": "proj_n2",
      "target": "proj_b2"
    },
    {
      "id": "proj_b2->proj_n4",
      "source": "proj_b2",
      "target": "proj_n4"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-regularization-001', '员工转正审批', '定时提醒 → 部门评估 → HR审核 → 并行办理 → 通知', 'cat-hr',
'["员工转正","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "发起转正流程"
    },
    {
      "id": "reg_n1",
      "type": "TIMER",
      "title": "试用期到期提醒",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "reg_n2",
      "type": "APPROVAL",
      "title": "部门负责人评估",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "reg_n3",
      "type": "APPROVAL",
      "title": "HR综合审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "reg_n4",
      "type": "PARALLEL",
      "title": "并行办理（IT+行政）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "reg_n7",
      "type": "NOTIFICATION",
      "title": "通知转正结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "转正审批结果",
        "notificationContent": "恭喜！您的转正申请已通过，欢迎成为正式员工。"
      }
    },
    {
      "id": "reg_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "reg_b1",
      "type": "CONDITION",
      "title": "IT权限开通"
    },
    {
      "id": "reg_n5",
      "type": "MANUAL",
      "title": "IT开通正式权限",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "为转正员工开通正式员工系统权限、邮箱等",
        "priority": "HIGH"
      }
    },
    {
      "id": "reg_b2",
      "type": "CONDITION",
      "title": "行政手续办理"
    },
    {
      "id": "reg_n6",
      "type": "MANUAL",
      "title": "行政办理工牌社保",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "办理正式工牌、更新社保信息、签订正式合同",
        "priority": "MEDIUM"
      }
    }
  ],
  "edges": [
    {
      "id": "start->reg_n1",
      "source": "start",
      "target": "reg_n1"
    },
    {
      "id": "reg_n1->reg_n2",
      "source": "reg_n1",
      "target": "reg_n2"
    },
    {
      "id": "reg_n2->reg_n3",
      "source": "reg_n2",
      "target": "reg_n3"
    },
    {
      "id": "reg_n3->reg_n4",
      "source": "reg_n3",
      "target": "reg_n4"
    },
    {
      "id": "reg_n4->reg_n7",
      "source": "reg_n4",
      "target": "reg_n7",
      "isDefault": true
    },
    {
      "id": "reg_n7->reg_end",
      "source": "reg_n7",
      "target": "reg_end"
    },
    {
      "id": "reg_n4->reg_b1",
      "source": "reg_n4",
      "target": "reg_b1"
    },
    {
      "id": "reg_b1->reg_n5",
      "source": "reg_b1",
      "target": "reg_n5"
    },
    {
      "id": "reg_n4->reg_b2",
      "source": "reg_n4",
      "target": "reg_b2"
    },
    {
      "id": "reg_b2->reg_n6",
      "source": "reg_b2",
      "target": "reg_n6"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-incident-001', 'IT故障处理', '自动分级 → 按级别分流 → 处理 → 验证确认', 'cat-it',
'["IT故障","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交故障报告"
    },
    {
      "id": "inc_n1",
      "type": "SCRIPT",
      "title": "自动故障分级",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def level = severity >= 8 ? \\\"P1\\\" : severity >= 5 ? \\\"P2\\\" : \\\"P3\\\"; return [incidentLevel: level]",
        "continueOnError": false
      },
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "inc_n7",
      "type": "MANUAL",
      "title": "报修人验证确认",
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "请确认故障是否已修复，如未修复请退回重新处理",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_n8",
      "type": "NOTIFICATION",
      "title": "通知故障关闭",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "故障处理完成",
        "notificationContent": "您提交的故障报告已处理完成并关闭。"
      }
    },
    {
      "id": "inc_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "inc_b1",
      "type": "CONDITION",
      "title": "P1 紧急故障",
      "condition": "incidentLevel == \\\"P1\\\""
    },
    {
      "id": "inc_n2",
      "type": "NOTIFICATION",
      "title": "紧急通知管理层",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "【紧急】P1级故障告警",
        "notificationContent": "系统发生P1级紧急故障，请立即关注！故障描述: ${description}"
      }
    },
    {
      "id": "inc_n3",
      "type": "MANUAL",
      "title": "紧急修复处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P1级紧急故障，需立即响应并修复",
        "priority": "HIGH"
      }
    },
    {
      "id": "inc_b2",
      "type": "CONDITION",
      "title": "P2 重要故障",
      "condition": "incidentLevel == \\\"P2\\\""
    },
    {
      "id": "inc_n4",
      "type": "APPROVAL",
      "title": "运维主管派单",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "inc_n5",
      "type": "MANUAL",
      "title": "运维工程师处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P2级故障，请在4小时内完成修复",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_b3",
      "type": "CONDITION",
      "title": "P3 一般故障",
      "condition": "incidentLevel == \\\"P3\\\""
    },
    {
      "id": "inc_n6",
      "type": "MANUAL",
      "title": "运维工程师处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P3级一般故障，请在24小时内处理",
        "priority": "LOW"
      }
    }
  ],
  "edges": [
    {
      "id": "start->inc_n1",
      "source": "start",
      "target": "inc_n1"
    },
    {
      "id": "inc_n1->inc_n7",
      "source": "inc_n1",
      "target": "inc_n7",
      "isDefault": true
    },
    {
      "id": "inc_n7->inc_n8",
      "source": "inc_n7",
      "target": "inc_n8"
    },
    {
      "id": "inc_n8->inc_end",
      "source": "inc_n8",
      "target": "inc_end"
    },
    {
      "id": "inc_n1->inc_b1",
      "source": "inc_n1",
      "target": "inc_b1",
      "condition": "incidentLevel == \\\"P1\\\""
    },
    {
      "id": "inc_b1->inc_n2",
      "source": "inc_b1",
      "target": "inc_n2"
    },
    {
      "id": "inc_n2->inc_n3",
      "source": "inc_n2",
      "target": "inc_n3"
    },
    {
      "id": "inc_n3->inc_n7",
      "source": "inc_n3",
      "target": "inc_n7"
    },
    {
      "id": "inc_n1->inc_b2",
      "source": "inc_n1",
      "target": "inc_b2",
      "condition": "incidentLevel == \\\"P2\\\""
    },
    {
      "id": "inc_b2->inc_n4",
      "source": "inc_b2",
      "target": "inc_n4"
    },
    {
      "id": "inc_n4->inc_n5",
      "source": "inc_n4",
      "target": "inc_n5"
    },
    {
      "id": "inc_n5->inc_n7",
      "source": "inc_n5",
      "target": "inc_n7"
    },
    {
      "id": "inc_n1->inc_b3",
      "source": "inc_n1",
      "target": "inc_b3",
      "condition": "incidentLevel == \\\"P3\\\""
    },
    {
      "id": "inc_b3->inc_n6",
      "source": "inc_b3",
      "target": "inc_n6"
    },
    {
      "id": "inc_n6->inc_n7",
      "source": "inc_n6",
      "target": "inc_n7"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-sales_contract-001', '销售合同全流程', '销售审核 → 金额分级 → 法务审核 → 并行盖章 → 通知', 'cat-sales',
'["销售合同","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交合同审批"
    },
    {
      "id": "sc_n1",
      "type": "APPROVAL",
      "title": "销售主管审核",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "sc_n5",
      "type": "APPROVAL",
      "title": "法务合规审核",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "sc_n6",
      "type": "PARALLEL",
      "title": "并行办理（财务+行政）",
      "approverType": "ROLE",
      "approverValue": "finance,admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sc_n9",
      "type": "NOTIFICATION",
      "title": "通知合同签署完成",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "合同审批完成",
        "notificationContent": "您提交的合同（金额: ${amount}）已完成全部审批流程，请及时跟进签署。"
      }
    },
    {
      "id": "sc_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "sc_b3",
      "type": "CONDITION",
      "title": "财务确认"
    },
    {
      "id": "sc_n7",
      "type": "APPROVAL",
      "title": "财务确认收款条款",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "sc_b4",
      "type": "CONDITION",
      "title": "行政盖章"
    },
    {
      "id": "sc_n8",
      "type": "MANUAL",
      "title": "行政盖章归档",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "合同盖章并归档原件",
        "priority": "HIGH"
      }
    },
    {
      "id": "sc_b1",
      "type": "CONDITION",
      "title": "金额 ≤ 10万",
      "condition": "amount <= 100000"
    },
    {
      "id": "sc_n2",
      "type": "APPROVAL",
      "title": "销售总监审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_b2",
      "type": "CONDITION",
      "title": "金额 > 10万",
      "condition": "amount > 100000"
    },
    {
      "id": "sc_n3",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_n4",
      "type": "APPROVAL",
      "title": "董事会审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    }
  ],
  "edges": [
    {
      "id": "start->sc_n1",
      "source": "start",
      "target": "sc_n1"
    },
    {
      "id": "sc_n1->sc_n5",
      "source": "sc_n1",
      "target": "sc_n5",
      "isDefault": true
    },
    {
      "id": "sc_n5->sc_n6",
      "source": "sc_n5",
      "target": "sc_n6"
    },
    {
      "id": "sc_n6->sc_n9",
      "source": "sc_n6",
      "target": "sc_n9",
      "isDefault": true
    },
    {
      "id": "sc_n9->sc_end",
      "source": "sc_n9",
      "target": "sc_end"
    },
    {
      "id": "sc_n6->sc_b3",
      "source": "sc_n6",
      "target": "sc_b3"
    },
    {
      "id": "sc_b3->sc_n7",
      "source": "sc_b3",
      "target": "sc_n7"
    },
    {
      "id": "sc_n6->sc_b4",
      "source": "sc_n6",
      "target": "sc_b4"
    },
    {
      "id": "sc_b4->sc_n8",
      "source": "sc_b4",
      "target": "sc_n8"
    },
    {
      "id": "sc_n1->sc_b1",
      "source": "sc_n1",
      "target": "sc_b1",
      "condition": "amount <= 100000"
    },
    {
      "id": "sc_b1->sc_n2",
      "source": "sc_b1",
      "target": "sc_n2"
    },
    {
      "id": "sc_n2->sc_n5",
      "source": "sc_n2",
      "target": "sc_n5"
    },
    {
      "id": "sc_n1->sc_b2",
      "source": "sc_n1",
      "target": "sc_b2",
      "condition": "amount > 100000"
    },
    {
      "id": "sc_b2->sc_n3",
      "source": "sc_b2",
      "target": "sc_n3"
    },
    {
      "id": "sc_n3->sc_n4",
      "source": "sc_n3",
      "target": "sc_n4"
    },
    {
      "id": "sc_n4->sc_n5",
      "source": "sc_n4",
      "target": "sc_n5"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-bidding-001', '招标采购流程', '需求审核 → 生成标书 → 等待投标 → 并行评标 → 审批', 'cat-industry',
'["招标采购","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交招标需求"
    },
    {
      "id": "bid_n1",
      "type": "APPROVAL",
      "title": "采购部审核需求",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_n2",
      "type": "SCRIPT",
      "title": "自动生成招标文件",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def tenderNo = \\\"TENDER-\\\" + System.currentTimeMillis(); return [tenderGenerated: true, tenderNo: tenderNo, tenderProjectName: projectName, tenderBudget: budget]",
        "continueOnError": false
      }
    },
    {
      "id": "bid_n3",
      "type": "TIMER",
      "title": "等待投标截止（7天）",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "bid_n4",
      "type": "PARALLEL",
      "title": "并行评标",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "bid_n7",
      "type": "APPROVAL",
      "title": "评标委员会定标",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "bid_n8",
      "type": "NOTIFICATION",
      "title": "通知中标结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "招标结果通知",
        "notificationContent": "招标项目「${projectName}」已完成评标，请查看中标结果。"
      }
    },
    {
      "id": "bid_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "bid_b1",
      "type": "CONDITION",
      "title": "技术评标"
    },
    {
      "id": "bid_n5",
      "type": "APPROVAL",
      "title": "技术专家评标",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_b2",
      "type": "CONDITION",
      "title": "商务评标"
    },
    {
      "id": "bid_n6",
      "type": "APPROVAL",
      "title": "商务专家评标",
      "approverType": "ROLE",
      "approverValue": "finance"
    }
  ],
  "edges": [
    {
      "id": "start->bid_n1",
      "source": "start",
      "target": "bid_n1"
    },
    {
      "id": "bid_n1->bid_n2",
      "source": "bid_n1",
      "target": "bid_n2"
    },
    {
      "id": "bid_n2->bid_n3",
      "source": "bid_n2",
      "target": "bid_n3"
    },
    {
      "id": "bid_n3->bid_n4",
      "source": "bid_n3",
      "target": "bid_n4"
    },
    {
      "id": "bid_n4->bid_n7",
      "source": "bid_n4",
      "target": "bid_n7",
      "isDefault": true
    },
    {
      "id": "bid_n7->bid_n8",
      "source": "bid_n7",
      "target": "bid_n8"
    },
    {
      "id": "bid_n8->bid_end",
      "source": "bid_n8",
      "target": "bid_end"
    },
    {
      "id": "bid_n4->bid_b1",
      "source": "bid_n4",
      "target": "bid_b1"
    },
    {
      "id": "bid_b1->bid_n5",
      "source": "bid_b1",
      "target": "bid_n5"
    },
    {
      "id": "bid_n4->bid_b2",
      "source": "bid_n4",
      "target": "bid_b2"
    },
    {
      "id": "bid_b2->bid_n6",
      "source": "bid_b2",
      "target": "bid_n6"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-safety_incident-001', '安全事故处理', '自动记录 → 并行处置+通知 → 事故调查 → 整改审批', 'cat-industry',
'["安全事故","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "报告安全事故"
    },
    {
      "id": "sf_n1",
      "type": "SCRIPT",
      "title": "自动记录事故信息",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def summary = (accidentType ?: \\\"未知事故\\\") + \\\"@\\\" + (location ?: \\\"未知地点\\\"); return [accidentRecorded: true, accidentSummary: summary]",
        "continueOnError": true
      }
    },
    {
      "id": "sf_n2",
      "type": "PARALLEL",
      "title": "并行处置（现场+通知）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sf_n5",
      "type": "APPROVAL",
      "title": "事故调查报告审核",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n6",
      "type": "APPROVAL",
      "title": "整改方案审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n7",
      "type": "MANUAL",
      "title": "执行整改措施",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "按照整改方案执行安全整改措施",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_n8",
      "type": "APPROVAL",
      "title": "整改验收确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "sf_b1",
      "type": "CONDITION",
      "title": "现场处置"
    },
    {
      "id": "sf_n3",
      "type": "MANUAL",
      "title": "现场紧急处置",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "立即前往事故现场进行紧急处置，确保人员安全",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_b2",
      "type": "CONDITION",
      "title": "上报通知"
    },
    {
      "id": "sf_n4",
      "type": "NOTIFICATION",
      "title": "通知安全管理层",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "【紧急】安全事故报告",
        "notificationContent": "发生安全事故，地点: ${location}，请立即关注。"
      }
    }
  ],
  "edges": [
    {
      "id": "start->sf_n1",
      "source": "start",
      "target": "sf_n1"
    },
    {
      "id": "sf_n1->sf_n2",
      "source": "sf_n1",
      "target": "sf_n2"
    },
    {
      "id": "sf_n2->sf_n5",
      "source": "sf_n2",
      "target": "sf_n5",
      "isDefault": true
    },
    {
      "id": "sf_n5->sf_n6",
      "source": "sf_n5",
      "target": "sf_n6"
    },
    {
      "id": "sf_n6->sf_n7",
      "source": "sf_n6",
      "target": "sf_n7"
    },
    {
      "id": "sf_n7->sf_n8",
      "source": "sf_n7",
      "target": "sf_n8"
    },
    {
      "id": "sf_n8->sf_end",
      "source": "sf_n8",
      "target": "sf_end"
    },
    {
      "id": "sf_n2->sf_b1",
      "source": "sf_n2",
      "target": "sf_b1"
    },
    {
      "id": "sf_b1->sf_n3",
      "source": "sf_b1",
      "target": "sf_n3"
    },
    {
      "id": "sf_n2->sf_b2",
      "source": "sf_n2",
      "target": "sf_b2"
    },
    {
      "id": "sf_b2->sf_n4",
      "source": "sf_b2",
      "target": "sf_n4"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave_advanced-001', '请假全流程', '天数判断 → 分级审批 → 交接确认 → 定时提醒 → 通知', 'cat-hr',
'["请假","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交请假申请"
    },
    {
      "id": "la_n1",
      "type": "APPROVAL",
      "title": "直属上级审批",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "la_n5",
      "type": "MANUAL",
      "title": "发起人确认工作交接",
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "请在休假前完成工作交接，并确认交接安排已同步给相关同事。",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "la_n6",
      "type": "TIMER",
      "title": "假期结束前1天提醒",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "la_n7",
      "type": "NOTIFICATION",
      "title": "通知请假结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "请假审批结果",
        "notificationContent": "您的请假申请（${days}天）已审批通过，请做好工作交接。"
      }
    },
    {
      "id": "la_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "la_b1",
      "type": "CONDITION",
      "title": "请假 ≤ 3天",
      "condition": "days <= 3"
    },
    {
      "id": "la_b2",
      "type": "CONDITION",
      "title": "3天 < 请假 ≤ 7天",
      "condition": "days > 3 && days <= 7"
    },
    {
      "id": "la_n2",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_b3",
      "type": "CONDITION",
      "title": "请假 > 7天",
      "condition": "days > 7"
    },
    {
      "id": "la_n3",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_n4",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    }
  ],
  "edges": [
    {
      "id": "start->la_n1",
      "source": "start",
      "target": "la_n1"
    },
    {
      "id": "la_n1->la_n5",
      "source": "la_n1",
      "target": "la_n5",
      "isDefault": true
    },
    {
      "id": "la_n5->la_n6",
      "source": "la_n5",
      "target": "la_n6"
    },
    {
      "id": "la_n6->la_n7",
      "source": "la_n6",
      "target": "la_n7"
    },
    {
      "id": "la_n7->la_end",
      "source": "la_n7",
      "target": "la_end"
    },
    {
      "id": "la_n1->la_b1",
      "source": "la_n1",
      "target": "la_b1",
      "condition": "days <= 3"
    },
    {
      "id": "la_n1->la_b2",
      "source": "la_n1",
      "target": "la_b2",
      "condition": "days > 3 && days <= 7"
    },
    {
      "id": "la_b1->la_n5",
      "source": "la_b1",
      "target": "la_n5"
    },
    {
      "id": "la_b2->la_n2",
      "source": "la_b2",
      "target": "la_n2"
    },
    {
      "id": "la_n2->la_n5",
      "source": "la_n2",
      "target": "la_n5"
    },
    {
      "id": "la_n1->la_b3",
      "source": "la_n1",
      "target": "la_b3",
      "condition": "days > 7"
    },
    {
      "id": "la_b3->la_n3",
      "source": "la_b3",
      "target": "la_n3"
    },
    {
      "id": "la_n3->la_n4",
      "source": "la_n3",
      "target": "la_n4"
    },
    {
      "id": "la_n4->la_n5",
      "source": "la_n4",
      "target": "la_n5"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO cloud_flow_db.workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-deployment-001', '生产环境发布', '代码审查 → 自动构建 → 等待窗口 → 并行部署+监控 → 验证', 'cat-it',
'["生产环境发布","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交发布申请"
    },
    {
      "id": "dep_n1",
      "type": "APPROVAL",
      "title": "技术负责人代码审查",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "dep_n2",
      "type": "SCRIPT",
      "title": "自动构建与测试",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [buildStatus: \\\"SUCCESS\\\", buildBranch: branch, buildVersion: version, buildFinishedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_n3",
      "type": "APPROVAL",
      "title": "发布审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "dep_n4",
      "type": "TIMER",
      "title": "等待发布窗口",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "dep_n5",
      "type": "PARALLEL",
      "title": "并行执行（部署+监控）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "dep_n8",
      "type": "MANUAL",
      "title": "发布后验证确认",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "验证发布后系统功能正常，检查关键业务指标",
        "priority": "HIGH"
      }
    },
    {
      "id": "dep_n9",
      "type": "NOTIFICATION",
      "title": "通知发布完成",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "发布完成通知",
        "notificationContent": "版本 ${version} 已成功发布到生产环境。"
      }
    },
    {
      "id": "dep_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "dep_b1",
      "type": "CONDITION",
      "title": "执行部署"
    },
    {
      "id": "dep_n6",
      "type": "SCRIPT",
      "title": "执行自动部署",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [deployStatus: \\\"SUCCESS\\\", deployedVersion: version, deployedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_b2",
      "type": "CONDITION",
      "title": "监控告警"
    },
    {
      "id": "dep_n7",
      "type": "NOTIFICATION",
      "title": "通知运维团队监控",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "admin",
        "notificationTitle": "发布监控通知",
        "notificationContent": "版本 ${version} 正在发布，请密切关注系统监控指标。"
      }
    }
  ],
  "edges": [
    {
      "id": "start->dep_n1",
      "source": "start",
      "target": "dep_n1"
    },
    {
      "id": "dep_n1->dep_n2",
      "source": "dep_n1",
      "target": "dep_n2"
    },
    {
      "id": "dep_n2->dep_n3",
      "source": "dep_n2",
      "target": "dep_n3"
    },
    {
      "id": "dep_n3->dep_n4",
      "source": "dep_n3",
      "target": "dep_n4"
    },
    {
      "id": "dep_n4->dep_n5",
      "source": "dep_n4",
      "target": "dep_n5"
    },
    {
      "id": "dep_n5->dep_n8",
      "source": "dep_n5",
      "target": "dep_n8",
      "isDefault": true
    },
    {
      "id": "dep_n8->dep_n9",
      "source": "dep_n8",
      "target": "dep_n9"
    },
    {
      "id": "dep_n9->dep_end",
      "source": "dep_n9",
      "target": "dep_end"
    },
    {
      "id": "dep_n5->dep_b1",
      "source": "dep_n5",
      "target": "dep_b1"
    },
    {
      "id": "dep_b1->dep_n6",
      "source": "dep_b1",
      "target": "dep_n6"
    },
    {
      "id": "dep_n5->dep_b2",
      "source": "dep_n5",
      "target": "dep_b2"
    },
    {
      "id": "dep_b2->dep_n7",
      "source": "dep_b2",
      "target": "dep_n7"
    }
  ]
}',
1, 'active', 'system', NULL);

-- =========================================================
-- 三、HR 业务种子数据（迁移自 03.cloudflow-hr.sql）
-- =========================================================

-- =========================================================
-- 初始化数据 - 职位族
-- =========================================================

INSERT INTO cloud_flow_db.hr_position_family (tenant_id, family_code, family_name, description, sort_order, status) VALUES
(100000, 'TECH', '技术族', '技术研发相关职位', 1, 1),
(100000, 'PRODUCT', '产品族', '产品设计与管理相关职位', 2, 1),
(100000, 'OPERATION', '运营族', '运营推广相关职位', 3, 1),
(100000, 'SALES', '销售族', '销售与客户服务相关职位', 4, 1),
(100000, 'SUPPORT', '支持族', '行政、人力、财务等支持职位', 5, 1);

-- =========================================================
-- 初始化数据 - 职级（专业序列）
-- =========================================================

INSERT INTO cloud_flow_db.hr_job_level (tenant_id, level_code, level_name, level_series, level_rank, description, status) VALUES
(100000, 'P1', '初级工程师', 'P', 1, '专业序列一级', 1),
(100000, 'P2', '工程师', 'P', 2, '专业序列二级', 1),
(100000, 'P3', '高级工程师', 'P', 3, '专业序列三级', 1),
(100000, 'P4', '资深工程师', 'P', 4, '专业序列四级', 1),
(100000, 'P5', '专家工程师', 'P', 5, '专业序列五级', 1),
(100000, 'P6', '高级专家', 'P', 6, '专业序列六级', 1),
(100000, 'P7', '资深专家', 'P', 7, '专业序列七级', 1),
(100000, 'P8', '首席专家', 'P', 8, '专业序列八级', 1);

-- =========================================================
-- 初始化数据 - 职级（管理序列）
-- =========================================================

INSERT INTO cloud_flow_db.hr_job_level (tenant_id, level_code, level_name, level_series, level_rank, description, status) VALUES
(100000, 'M1', '主管', 'M', 1, '管理序列一级', 1),
(100000, 'M2', '经理', 'M', 2, '管理序列二级', 1),
(100000, 'M3', '高级经理', 'M', 3, '管理序列三级', 1),
(100000, 'M4', '总监', 'M', 4, '管理序列四级', 1),
(100000, 'M5', '副总裁', 'M', 5, '管理序列五级', 1),
(100000, 'M6', '高级副总裁', 'M', 6, '管理序列六级', 1);

-- 插入示例班次数据
INSERT INTO cloud_flow_db.hr_shift (id, tenant_id, shift_code, shift_name, start_time, end_time, break_minutes, late_threshold, early_threshold, work_minutes, color, status) VALUES
(100, 100000, 'MORNING', '早班', '08:00:00', '17:00:00', 60, 15, 15, 480, '#1890ff', 1),
(101, 100000, 'AFTERNOON', '中班', '13:00:00', '22:00:00', 60, 15, 15, 480, '#52c41a', 1),
(102, 100000, 'NIGHT', '晚班', '22:00:00', '07:00:00', 60, 15, 15, 480, '#722ed1', 1),
(103, 100000, 'STANDARD', '标准班', '09:00:00', '18:00:00', 60, 15, 15, 480, '#1890ff', 1);

-- 插入示例排班规则数据
INSERT INTO cloud_flow_db.hr_schedule_rule (id, tenant_id, rule_name, rule_type, rule_config, description, status) VALUES
(100, 100000, '标准考勤制', 'FIXED', '{"shiftId": 103, "workDays": [1,2,3,4,5], "checkMethods": ["GPS","WIFI","FACE"], "locationPoints": [{"name":"总部园区A座","latitude":39.9042,"longitude":116.4074,"radius":500}], "wifiConfigs": [{"ssid":"CloudFlow-Office"},{"ssid":"CloudFlow-Delivery"},{"ssid":"CloudFlow-QA"}], "overtimeEnabled": true, "overtimeMinMinutes": 30, "lateToleranceCount": 0, "severeLateMinutes": 60, "absentMinutes": 240, "photoRequired": false, "radius": 500}', '默认工作日考勤规则，适用于大多数办公室员工', 1),
(101, 100000, '生产轮班制', 'ROTATION', '{"shiftId": 100, "workDays": [1,2,3,4,5,6], "checkMethods": ["GPS","WIFI"], "locationPoints": [{"name":"制造园区","latitude":31.2304,"longitude":121.4737,"radius":800}], "wifiConfigs": [{"ssid":"CloudFlow-Factory"}], "overtimeEnabled": true, "overtimeMinMinutes": 60, "lateToleranceCount": 0, "severeLateMinutes": 30, "absentMinutes": 180, "photoRequired": true, "radius": 800}', '生产和交付岗位六天排班规则', 1),
(102, 100000, '弹性工作制', 'FLEXIBLE', '{"shiftId": 103, "workDays": [1,2,3,4,5], "checkMethods": ["GPS","WIFI","FACE"], "coreTime": {"start": "10:00", "end": "16:00"}, "dailyHours": 8, "locationPoints": [{"name":"总部园区A座","latitude":39.9042,"longitude":116.4074,"radius":1000}], "wifiConfigs": [{"ssid":"CloudFlow-Office"}], "overtimeEnabled": true, "overtimeMinMinutes": 30, "lateToleranceCount": 3, "severeLateMinutes": 90, "absentMinutes": 300, "photoRequired": false, "radius": 1000}', '研发和销售岗位弹性规则', 1);

INSERT INTO cloud_flow_db.hr_schedule_rule_assignment (
  tenant_id, rule_id, target_type, target_id, effective_start, effective_end, status, create_by, update_by
) VALUES
(100000, 100, 'DEPT', 103, DATE_SUB(CURDATE(), INTERVAL 365 DAY), NULL, 1, 'admin', 'admin'),
(100000, 101, 'POST', 6, DATE_SUB(CURDATE(), INTERVAL 365 DAY), NULL, 1, 'admin', 'admin'),
(100000, 102, 'POST', 8, DATE_SUB(CURDATE(), INTERVAL 365 DAY), NULL, 1, 'admin', 'admin'),
(100000, 102, 'EMPLOYEE', 1002, DATE_SUB(CURDATE(), INTERVAL 365 DAY), NULL, 1, 'admin', 'admin');

INSERT INTO cloud_flow_db.hr_work_calendar (
  tenant_id, calendar_date, day_type, day_name, source, status, create_by, update_by
) VALUES
(100000, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'WORKDAY', '演示工作日', 'MANUAL', 1, 'admin', 'admin'),
(100000, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'WORKDAY', '演示工作日', 'MANUAL', 1, 'admin', 'admin'),
(100000, CURDATE(), 'WORKDAY', '今日工作日', 'MANUAL', 1, 'admin', 'admin'),
(100000, DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'REST', '企业休息日', 'MANUAL', 1, 'admin', 'admin'),
(100000, DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'WORKDAY', '调休上班日', 'MANUAL', 1, 'admin', 'admin'),
(100000, DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'HOLIDAY', '公司福利假', 'MANUAL', 1, 'admin', 'admin');

-- 插入示例假期类型数据
INSERT INTO cloud_flow_db.hr_leave_type (tenant_id, leave_code, leave_name, need_quota, is_paid, unit, quota_rule, expiry_rule, status) VALUES
(100000, 'ANNUAL', '年假', 1, 1, 'DAY', '{"baseQuota": 5, "incrementPerYear": 1, "maxQuota": 15}', '{"expiryType": "YEAR_END", "carryOver": false}', 1),
(100000, 'SICK', '病假', 0, 1, 'DAY', NULL, NULL, 1),
(100000, 'PERSONAL', '事假', 0, 0, 'DAY', NULL, NULL, 1),
(100000, 'MARRIAGE', '婚假', 0, 1, 'DAY', '{"quota": 3}', NULL, 1),
(100000, 'MATERNITY', '产假', 0, 1, 'DAY', '{"quota": 98}', NULL, 1),
(100000, 'PATERNITY', '陪产假', 0, 1, 'DAY', '{"quota": 15}', NULL, 1),
(100000, 'BEREAVEMENT', '丧假', 0, 1, 'DAY', '{"quota": 3}', NULL, 1),
(100000, 'COMPENSATORY', '调休', 1, 1, 'HOUR', NULL, '{"expiryType": "FIXED_DAYS", "days": 90}', 1);

-- =========================================================
-- 四、薪酬管理模块
-- =========================================================

-- 1. 薪资项目表
-- =========================================================
-- HR 假勤演示数据（从 OA 迁移）
-- =========================================================

INSERT INTO cloud_flow_db.hr_schedule_plan (
  id, tenant_id, plan_name, target_type, target_id, shift_id, schedule_date, status,
  create_time, update_time, create_by, update_by
) VALUES
(11001, 100000, '张三标准班次', 'EMPLOYEE', 1005, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11002, 100000, '张三标准班次', 'EMPLOYEE', 1005, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11003, 100000, '张三标准班次', 'EMPLOYEE', 1005, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11004, 100000, '前端测试标准班次', 'EMPLOYEE', 1002, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11005, 100000, '前端测试标准班次', 'EMPLOYEE', 1002, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11006, 100000, '前端测试标准班次', 'EMPLOYEE', 1002, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11007, 100000, '后端测试标准班次', 'EMPLOYEE', 1003, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11008, 100000, '后端测试标准班次', 'EMPLOYEE', 1003, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11009, 100000, '后端测试标准班次', 'EMPLOYEE', 1003, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1);

INSERT INTO cloud_flow_db.hr_attendance_record (
  id, tenant_id, employee_id, attendance_date, rule_id, shift_id, check_type, check_time, expected_time, deviation_minutes, check_method,
  location, status, process_instance_id, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(9301, 100000, 1005, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 100, 103, 'CHECK_IN',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR + INTERVAL 3 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR, 3, 'GPS',
 '上海市黄浦区总部园区A座', 'NORMAL', NULL, '正常上班打卡', NOW(), NOW(), 1, 1, 0),
(9302, 100000, 1005, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 100, 103, 'CHECK_OUT',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 12 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 12, 'GPS',
 '上海市黄浦区总部园区A座', 'NORMAL', NULL, '正常下班打卡', NOW(), NOW(), 1, 1, 0),
(9303, 100000, 1005, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_OUT',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR + INTERVAL 35 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 35, 'GPS',
 '上海市黄浦区总部园区A座', 'NORMAL', NULL, '项目联调后下班', NOW(), NOW(), 1, 1, 0),
(9304, 100000, 1002, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 102, 103, 'CHECK_IN',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 8 HOUR + INTERVAL 56 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR, -4, 'WIFI',
 'CloudFlow-Office', 'NORMAL', NULL, '会议前提前到岗', NOW(), NOW(), 1, 1, 0),
(9305, 100000, 1002, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 102, 103, 'CHECK_OUT',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 6 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 6, 'WIFI',
 'CloudFlow-Office', 'NORMAL', NULL, '正常签退', NOW(), NOW(), 1, 1, 0),
(9306, 100000, 1003, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_OUT',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 19 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 60, 'GPS',
 '浦东新区客户现场机房', 'NORMAL', NULL, '客户现场支持后签退', NOW(), NOW(), 1, 1, 0),
(9001, 100000, 1005, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_IN',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 3 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, 3, 'SUPPLEMENT',
 '上海市黄浦区总部园区A座', 'APPROVING', 'demo_inst_007', '因地铁故障导致漏打卡，实际已于 09:03 到达公司。', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), 5, 5, 0),
(9002, 100000, 1003, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_IN',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 42 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, 42, 'SUPPLEMENT',
 '浦东新区客户现场机房', 'SUPPLEMENT', 'demo_inst_008', '客户现场部署支持，未在公司网络范围内打卡。', DATE_SUB(NOW(), INTERVAL 30 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR), 9, 9, 0);

INSERT INTO cloud_flow_db.hr_leave_quota (
  id, tenant_id, employee_id, leave_type_id, year, total_quota, used_quota, frozen_quota, available_quota,
  expiry_date, create_time, update_time, create_by, update_by, deleted
) VALUES
(1101, 100000, 1005, 100, YEAR(CURDATE()), 10.00, 0.00, 5.00, 5.00,
 STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1102, 100000, 1002, 100, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00,
 STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1103, 100000, 1002, 107, YEAR(CURDATE()), 16.00, 4.00, 3.50, 8.50,
 DATE_ADD(CURDATE(), INTERVAL 90 DAY), NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_leave_application (
  id, tenant_id, application_no, employee_id, leave_type_id, start_time, end_time, duration, unit, reason,
  process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9001, 100000, 'QJ202603110001', 1005, 100,
 DATE_ADD(CURDATE(), INTERVAL 7 DAY) + INTERVAL 9 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 11 DAY) + INTERVAL 18 HOUR,
 5.00, 'DAY', '清明假期前后返乡探亲，已完成当前迭代开发任务交接。',
 'demo_inst_001', 'APPROVING', DATE_SUB(NOW(), INTERVAL 18 HOUR), DATE_SUB(NOW(), INTERVAL 18 HOUR), 'zhang', 'zhang', 0),
(9002, 100000, 'QJ202603110002', 1001, 101,
 DATE_SUB(CURDATE(), INTERVAL 6 DAY) + INTERVAL 9 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 4 DAY) + INTERVAL 18 HOUR,
 2.00, 'DAY', '因流感发烧请假休息，并已提供就诊证明。',
 'demo_inst_002', 'APPROVED', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_overtime_application (
  id, tenant_id, application_no, employee_id, start_time, end_time, duration, overtime_type, reason,
  compensation_type, compensation_hours, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9001, 100000, 'JB202603110001', 1002,
 CURDATE() + INTERVAL 19 HOUR,
 CURDATE() + INTERVAL 22 HOUR + INTERVAL 30 MINUTE,
 3.50, 'WORKDAY', '为客户演示修复流程详情页附件预览兼容性问题。',
 'TIME_OFF', 3.50, 'demo_inst_009', 'APPROVING', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), 'test_fe', 'test_fe', 0),
(9002, 100000, 'JB202603110002', 1003,
 DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 10 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 5 DAY) + INTERVAL 18 HOUR,
 8.00, 'WEEKEND', '周末配合客户进行灰度发布与数据迁移。',
 'PAYMENT', 8.00, 'demo_inst_010', 'APPROVED', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY), 'test_be', 'test_be', 0);

INSERT INTO cloud_flow_db.hr_attendance_monthly (
  id, tenant_id, employee_id, year, month, work_days, actual_days, late_times, early_times, absent_days,
  missing_times, leave_days, overtime_hours, attendance_rate, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(12001, 100000, 1005, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 1, 5.00, 0.00, 95.65, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12002, 100000, 1002, YEAR(CURDATE()), MONTH(CURDATE()), 23, 21, 0, 0, 0, 0, 0.00, 3.50, 91.30, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12003, 100000, 1003, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 0, 0.00, 8.00, 95.65, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0);

-- 插入示例薪资项目数据
INSERT INTO cloud_flow_db.hr_salary_item (tenant_id, item_code, item_name, item_type, category, is_taxable, sort_order, status) VALUES
(100000, 'BASIC_SALARY', '基本工资', 'FIXED', 'BASIC', 1, 1, 1),
(100000, 'POSITION_ALLOWANCE', '岗位津贴', 'FIXED', 'ALLOWANCE', 1, 2, 1),
(100000, 'MEAL_ALLOWANCE', '餐补', 'FIXED', 'ALLOWANCE', 0, 3, 1),
(100000, 'TRANSPORT_ALLOWANCE', '交通补贴', 'FIXED', 'ALLOWANCE', 0, 4, 1),
(100000, 'PERFORMANCE_BONUS', '绩效奖金', 'VARIABLE', 'BONUS', 1, 5, 1),
(100000, 'YEAR_END_BONUS', '年终奖', 'VARIABLE', 'BONUS', 1, 6, 1),
(100000, 'LATE_DEDUCTION', '迟到扣款', 'VARIABLE', 'DEDUCTION', 0, 7, 1),
(100000, 'ABSENT_DEDUCTION', '旷工扣款', 'VARIABLE', 'DEDUCTION', 0, 8, 1);

-- 插入示例薪资结构数据
INSERT INTO cloud_flow_db.hr_salary_structure (tenant_id, structure_code, structure_name, description, status) VALUES
(100000, 'STANDARD', '标准薪资结构', '适用于大部分员工的标准薪资结构', 1),
(100000, 'EXECUTIVE', '高管薪资结构', '适用于高级管理人员的薪资结构', 1),
(100000, 'SALES', '销售薪资结构', '适用于销售人员的薪资结构', 1);

-- 插入薪资结构项目关联数据（标准薪资结构）
INSERT INTO cloud_flow_db.hr_salary_structure_item (tenant_id, structure_id, item_id, sort_order) VALUES
(100000, 100, 100, 1),  -- 基本工资
(100000, 100, 101, 2),  -- 岗位津贴
(100000, 100, 102, 3),  -- 餐补
(100000, 100, 103, 4),  -- 交通补贴
(100000, 100, 104, 5);

-- 绩效奖金

-- 插入示例薪资等级数据
INSERT INTO cloud_flow_db.hr_salary_grade (
  id, tenant_id, level_id, min_salary, max_salary, mid_salary, currency,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 101, 9000.00, 15000.00, 12000.00, 'CNY',
 '2026-03-20 09:30:00', '2026-03-20 09:30:00', 'admin', 'admin', 0);

-- 插入示例员工薪资数据
INSERT INTO cloud_flow_db.hr_employee_salary (
  id, tenant_id, employee_id, structure_id, salary_data, total_salary, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 100, '{"100":8000,"101":1200,"102":300,"103":300,"104":800}', 10600.00, '2026-03-24', 'EXPIRED',
 '2026-03-24 09:00:00', '2026-03-24 12:20:00', 'admin', 'admin', 0),
(101, 100000, 1002, 100, '{"100":8000,"101":1200,"102":300,"103":300,"104":1200}', 11000.00, '2026-03-24', 'ACTIVE',
 '2026-03-24 12:21:00', '2026-03-24 12:21:00', 'admin', 'admin', 0);

-- 插入示例调薪申请数据
INSERT INTO cloud_flow_db.hr_salary_adjustment (
  id, tenant_id, application_no, employee_id, adjustment_type, adjustment_reason,
  before_salary_data, after_salary_data, before_total, after_total, adjustment_amount, adjustment_rate,
  effective_date, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 'SA202603240001', 1002, 'PERFORMANCE', '桌面端薪酬页真实联调样本：提高绩效奖金',
 '{"100":8000,"101":1200,"102":300,"103":300,"104":800}', '{"100":8000,"101":1200,"102":300,"103":300,"104":1200}',
 10600.00, 11000.00, 400.00, 3.77, '2026-03-24', '788a3482-22d2-4c2b-87f1-4d57b3175046', 'EFFECTIVE',
 '2026-03-24 11:30:00', '2026-03-24 12:22:00', 'admin', 'admin', 0);

-- 插入示例五险一金方案数据（北京地区）
INSERT INTO cloud_flow_db.hr_insurance_scheme (
  tenant_id, scheme_name, city,
  pension_company_rate, pension_personal_rate,
  medical_company_rate, medical_personal_rate,
  unemployment_company_rate, unemployment_personal_rate,
  injury_company_rate, maternity_company_rate,
  housing_fund_company_rate, housing_fund_personal_rate,
  base_min, base_max, base_rule, effective_date, status
) VALUES (
  100000, '北京标准方案', '北京',
  16.00, 8.00,  -- 养老保险
  9.80, 2.00,   -- 医疗保险
  0.50, 0.50,   -- 失业保险
  0.40, 0.80,   -- 工伤保险、生育保险
  12.00, 12.00, -- 公积金
  5869.00, 33891.00, '按上年度月平均工资计算', '2026-01-01', 1
);

-- 插入示例五险一金方案数据（上海地区）
INSERT INTO cloud_flow_db.hr_insurance_scheme (
  tenant_id, scheme_name, city,
  pension_company_rate, pension_personal_rate,
  medical_company_rate, medical_personal_rate,
  unemployment_company_rate, unemployment_personal_rate,
  injury_company_rate, maternity_company_rate,
  housing_fund_company_rate, housing_fund_personal_rate,
  base_min, base_max, base_rule, effective_date, status
) VALUES (
  100000, '上海标准方案', '上海',
  16.00, 8.00,  -- 养老保险
  10.00, 2.00,  -- 医疗保险
  0.50, 0.50,   -- 失业保险
  0.26, 1.00,   -- 工伤保险、生育保险
  7.00, 7.00,   -- 公积金
  6520.00, 36549.00, '按上年度月平均工资计算', '2026-01-01', 1
);

-- 插入示例个税配置数据（2026年标准）
INSERT INTO cloud_flow_db.hr_tax_config (
  tenant_id, threshold, tax_brackets, deduction_items, effective_date, status, create_by, update_by
) VALUES (
  100000, 5000.00,
  '[{"min":0,"max":36000,"rate":0.03,"deduction":0},{"min":36000,"max":144000,"rate":0.10,"deduction":2520},{"min":144000,"max":300000,"rate":0.20,"deduction":16920},{"min":300000,"max":420000,"rate":0.25,"deduction":31920},{"min":420000,"max":660000,"rate":0.30,"deduction":52920},{"min":660000,"max":960000,"rate":0.35,"deduction":85920},{"min":960000,"rate":0.45,"deduction":181920}]',
  '{"CHILD_EDU":1000,"CONTINUING_EDU":400,"MEDICAL":0,"HOUSING_LOAN":1000,"HOUSING_RENT":0,"ELDERLY_CARE":2000}',
  '2026-01-01', 1, NULL, NULL
);

-- 员工专项扣除依赖员工档案，初始化脚本不预置员工级数据，避免产生孤儿记录

-- =========================================================
-- 七、HR桌面端联调示例数据
-- 目的：为员工、招聘、入职、转正、调岗、离职页面提供一套可直接联调的基础样本
-- =========================================================

-- 1. 职位示例数据
INSERT INTO cloud_flow_db.hr_position (
  id, tenant_id, position_code, position_name, family_id, level_id, post_id,
  job_description, requirements, work_content, status, create_time, update_time
) VALUES
(101, 100000, 'FE_P3', '前端开发工程师', 100, 102, 4,
 '负责桌面端与流程页面交付', '熟悉 React、TypeScript、接口联调', '负责 HR 与 OA 前端功能开发', 1, '2026-03-20 09:00:00', '2026-03-20 09:00:00'),
(102, 100000, 'BE_P3', 'Java开发工程师', 100, 102, 4,
 '负责微服务与业务接口开发', '熟悉 Spring Boot、MyBatis Plus、消息队列', '负责 HR、Workflow 后端开发', 1, '2026-03-20 09:05:00', '2026-03-20 09:05:00'),
(103, 100000, 'FIN_P2', '财务专员', 104, 101, 4,
 '负责报销、核算与财务归档', '熟悉财务制度与基础报表能力', '负责日常财务支持工作', 1, '2026-03-20 09:10:00', '2026-03-20 09:10:00'),
(104, 100000, 'HRBP_M2', 'HRBP', 104, 109, 2,
 '负责招聘、组织与员工关系', '熟悉招聘、员工生命周期与制度执行', '负责 HR 全流程业务推进', 1, '2026-03-20 09:15:00', '2026-03-20 09:15:00'),
(105, 100000, 'HR_RECRUITER_P2', '招聘专员', 104, 101, 4,
 '负责人才寻访与候选人推进', '熟悉招聘渠道与面试安排', '负责招聘需求执行与候选人跟进', 1, '2026-03-20 09:20:00', '2026-03-20 09:20:00'),
(106, 100000, 'TECH_MANAGER_M2', '技术经理', 100, 109, 2,
 '负责研发团队管理与项目交付', '具备研发管理与跨团队协同能力', '负责团队管理、资源调配与项目交付', 1, '2026-03-20 09:25:00', '2026-03-20 09:25:00');

-- 2. 员工档案示例数据
INSERT INTO cloud_flow_db.hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email, dept_id, post_id, position_id,
  employee_type, employee_status, hire_date, regular_date, resign_date, user_id,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(1, 100000, 'CF20230000', 'Admin', 'MALE', '1988-01-01', '15888888888', 'admin@cloudflow.com', 100, 1, NULL,
 'FULL_TIME', 'REGULAR', '2023-01-01', '2023-07-01', NULL, 1, '2026-03-20 09:55:00', '2026-03-20 09:55:00', 'admin', 'admin', 0),
(1001, 100000, 'CF20230001', '赵HR', 'FEMALE', '1990-06-12', '13800010001', 'zhao.hr@cloudflow.com', 103, 2, 104,
 'FULL_TIME', 'REGULAR', '2023-04-10', '2023-10-10', NULL, 4, '2026-03-20 10:00:00', '2026-03-20 10:00:00', 'admin', 'admin', 0),
(1002, 100000, 'CF20260001', '前端测试', 'FEMALE', '1998-03-08', '13800010002', 'test.fe@cloudflow.com', 106, 4, 101,
 'FULL_TIME', 'PROBATION', '2026-02-10', NULL, NULL, 8, '2026-03-20 10:05:00', '2026-03-20 10:05:00', 'admin', 'admin', 0),
(1003, 100000, 'CF20240008', '后端测试', 'MALE', '1996-11-21', '13800010003', 'test.be@cloudflow.com', 107, 4, 102,
 'FULL_TIME', 'REGULAR', '2024-08-15', '2025-02-15', NULL, 9, '2026-03-20 10:10:00', '2026-03-20 10:10:00', 'admin', 'admin', 0),
(1004, 100000, 'CF20230015', '王财务', 'FEMALE', '1992-05-16', '13800010004', 'wang.finance@cloudflow.com', 102, 4, 103,
 'FULL_TIME', 'RESIGNED', '2023-03-01', '2023-09-01', '2026-03-21', 3, '2026-03-20 10:15:00', '2026-03-20 10:15:00', 'admin', 'admin', 0),
(1005, 100000, 'CF20240002', '张三', 'MALE', '1995-01-19', '13800010005', 'zhang@cloudflow.com', 105, 4, 102,
 'FULL_TIME', 'REGULAR', '2024-04-18', '2024-10-18', NULL, 5, '2026-03-20 10:20:00', '2026-03-20 10:20:00', 'admin', 'admin', 0),
(1006, 100000, 'CF20260002', '李若彤', 'FEMALE', '1999-09-09', '13800010006', 'li.ruotong@cloudflow.com', 101, 4, 101,
 'FULL_TIME', 'REGULAR', '2026-03-01', '2026-09-01', NULL, NULL, '2026-03-20 10:25:00', '2026-03-20 10:25:00', 'admin', 'admin', 0),
(1007, 100000, 'CF20250009', '周宁', 'MALE', '1997-07-14', '13800010007', 'zhou.ning@cloudflow.com', 103, 4, 105,
 'FULL_TIME', 'PROBATION', '2025-11-01', NULL, NULL, NULL, '2026-03-20 10:30:00', '2026-03-20 10:30:00', 'admin', 'admin', 0),
(1008, 100000, 'CF20240012', '陈凯', 'MALE', '1994-12-03', '13800010008', 'chen.kai@cloudflow.com', 101, 4, 101,
 'FULL_TIME', 'REGULAR', '2024-06-01', '2024-12-01', NULL, NULL, '2026-03-20 10:35:00', '2026-03-20 10:35:00', 'admin', 'admin', 0);

-- 3. 员工社保与个税联调示例数据
INSERT INTO cloud_flow_db.hr_employee_insurance (
  id, tenant_id, employee_id, scheme_id, base, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 100, 10600.00, '2026-03-24', 'ACTIVE',
 '2026-03-24 10:40:00', '2026-03-24 10:40:00', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_employee_tax_deduction (
  id, tenant_id, employee_id, deduction_type, amount, start_date, end_date, status, remark,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 'HOUSING_RENT', 1500.00, '2026-03-01', NULL, 'ACTIVE', '桌面端薪酬联调用住房租金扣除样本',
 '2026-03-24 10:45:00', '2026-03-24 10:45:00', NULL, NULL, 0),
(101, 100000, 1002, 'CONTINUING_EDU', 400.00, '2026-03-01', NULL, 'ACTIVE', '桌面端薪酬联调用继续教育扣除样本',
 '2026-03-24 10:46:00', '2026-03-24 10:46:00', NULL, NULL, 0);

-- 4. 招聘需求示例数据
INSERT INTO cloud_flow_db.hr_recruitment_request (
  id, tenant_id, request_no, dept_id, position_id, headcount, job_requirements,
  salary_min, salary_max, expected_date, process_instance_id, status, hired_count,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(2001, 100000, 'HRRQ202603230001', 101, 102, 2, '熟悉 Spring Boot、MySQL、消息驱动架构，能独立完成接口联调。',
 18000.00, 28000.00, '2026-04-15', 'wf_hr_recruit_2001', 'RECRUITING', 1, '2026-03-21 09:00:00', '2026-03-22 18:30:00', 'zhao', 'zhao', 0),
(2002, 100000, 'HRRQ202603230002', 103, 105, 1, '有招聘渠道运营经验，熟悉校园招聘与社会招聘协同推进。',
 12000.00, 18000.00, '2026-04-08', 'wf_hr_recruit_2002', 'APPROVING', 0, '2026-03-22 09:30:00', '2026-03-22 11:30:00', 'zhao', 'zhao', 0),
(2003, 100000, 'HRRQ202603150001', 106, 101, 1, '熟悉 React、组件化设计和企业应用前端开发。',
 15000.00, 22000.00, '2026-03-28', 'wf_hr_recruit_2003', 'COMPLETED', 1, '2026-03-15 10:00:00', '2026-03-20 17:00:00', 'zhao', 'zhao', 0);

-- 4. 候选人示例数据
INSERT INTO cloud_flow_db.hr_candidate (
  id, tenant_id, request_id, name, gender, phone, email, resume_attachment_urls, source, status, reject_reason,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(3001, 100000, 2001, '陈海涛', 'MALE', '13900011001', 'chen.haitao@example.com', 'https://example.com/resume/chenhaitao.pdf,https://example.com/resume/chenhaitao-portfolio.pdf', 'HEADHUNTER', 'HIRED', NULL,
 '2026-03-21 10:00:00', '2026-03-24 12:31:14', 'admin', 'admin', 0),
(3002, 100000, 2001, '孙晓雨', 'FEMALE', '13900011002', 'sun.xiaoyu@example.com', 'https://example.com/resume/sunxiaoyu.pdf', 'REFERRAL', 'OFFER', NULL,
 '2026-03-21 10:30:00', '2026-03-23 09:10:00', 'zhao', 'zhao', 0),
(3003, 100000, 2002, '林嘉琪', 'FEMALE', '13900011003', 'lin.jiaqi@example.com', 'https://example.com/resume/linjiaqi.pdf,https://example.com/resume/linjiaqi-works.pdf', 'WEBSITE', 'SCREENING', NULL,
 '2026-03-22 13:00:00', '2026-03-22 13:30:00', 'zhao', 'zhao', 0),
(3004, 100000, 2003, '李若彤', 'FEMALE', '13900011004', 'li.ruotong@example.com', 'https://example.com/resume/liruotong.pdf', 'REFERRAL', 'HIRED', NULL,
 '2026-03-15 14:00:00', '2026-03-20 18:10:00', 'zhao', 'zhao', 0),
(3005, 100000, 2001, '吴嘉豪', 'MALE', '13900011006', 'wu.jiahao@example.com', 'https://example.com/resume/wujiahao.pdf,https://example.com/resume/wujiahao-github.pdf', 'WEBSITE', 'INTERVIEW', NULL,
 '2026-03-24 12:40:00', '2026-03-24 12:40:00', 'admin', 'admin', 0);

-- 5. 面试示例数据
INSERT INTO cloud_flow_db.hr_interview (
  id, tenant_id, candidate_id, interview_round, interview_type, interview_time, location, interviewers,
  evaluation, score, result, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(4001, 100000, 3001, 'FIRST', 'VIDEO', '2026-03-24 15:00:00', 'Teams 会议链接', '[2,9]',
 NULL, NULL, 'PENDING', 'SCHEDULED', '2026-03-22 15:05:00', '2026-03-22 15:05:00', 'zhao', 'zhao', 0),
(4002, 100000, 3002, 'FINAL', 'ONSITE', '2026-03-22 10:00:00', '上海总部 5F 面试室A', '[2,4]',
 '综合表现稳定，技术深度与协作意识符合岗位要求。', 88, 'PASS', 'COMPLETED', '2026-03-21 16:00:00', '2026-03-22 12:00:00', 'zhao', 'zhao', 0),
(4003, 100000, 3003, 'FIRST', 'PHONE', '2026-03-24 11:00:00', '电话面试', '[4]',
 NULL, NULL, 'PENDING', 'SCHEDULED', '2026-03-22 14:20:00', '2026-03-22 14:20:00', 'zhao', 'zhao', 0),
(4004, 100000, 3005, 'FIRST', 'VIDEO', '2026-03-25 14:30:00', '腾讯会议 研发一组频道', '[2,5]',
 NULL, NULL, 'PENDING', 'SCHEDULED', '2026-03-24 12:45:00', '2026-03-24 12:45:00', 'admin', 'admin', 0);

-- 6. Offer 示例数据
INSERT INTO cloud_flow_db.hr_offer (
  id, tenant_id, offer_no, candidate_id, dept_id, position_id, salary, expected_date, expiry_date,
  offer_content, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 'OFFER20260324000001', 3001, 101, 102, 22000.00, '2026-04-15', '2026-04-22',
 '候选人：陈海涛\n拟录用部门：研发部\n拟录用岗位：后端开发工程师\n建议薪资：¥22,000\n预计入职日期：2026-04-15\nOffer 有效期至：2026-04-22\n\n该 Offer 已完成真实联调，后续可继续转入入职办理。',
 'a5cf659a-ab61-44a2-9a8d-5da799a304db', 'ACCEPTED', '2026-03-24 12:31:14', '2026-03-24 12:31:14', 'admin', 'admin', 0);

-- 7. 入职申请与任务示例数据
-- 5001：审批中，可直接测试“审批通过”
-- 5002：已审批，已生成任务，可测试“完成任务 / 确认入职”
-- 5003：已入职完成态，用于查看最终结果
-- 5004：由已接受 Offer 转入的入职草稿，可继续提交入职流程
INSERT INTO cloud_flow_db.hr_onboarding_application (
  id, tenant_id, application_no, candidate_id, name, gender, phone, email, dept_id, post_id, position_id,
  expected_date, process_instance_id, status, employee_id, create_time, update_time, create_by, update_by, deleted
) VALUES
(5001, 100000, 'HRON202603230001', 3002, '孙晓雨', 'FEMALE', '13900011002', 'sun.xiaoyu@example.com', 101, 4, 101,
 '2026-03-25', 'wf_hr_onboarding_5001', 'APPROVING', NULL, '2026-03-23 09:20:00', '2026-03-23 09:20:00', 'zhao', 'zhao', 0),
(5002, 100000, 'HRON202603220002', NULL, '王晨', 'MALE', '13900011005', 'wang.chen@example.com', 107, 4, 102,
 '2026-03-24', 'wf_hr_onboarding_5002', 'APPROVED', NULL, '2026-03-22 14:00:00', '2026-03-23 16:20:00', 'zhao', 'zhao', 0),
(5003, 100000, 'HRON202603010001', 3004, '李若彤', 'FEMALE', '13900011004', 'li.ruotong@example.com', 101, 4, 101,
 '2026-03-01', 'wf_hr_onboarding_5003', 'ONBOARDED', 1006, '2026-03-01 09:00:00', '2026-03-01 18:00:00', 'zhao', 'zhao', 0),
(5004, 100000, 'OB202603246303', 3001, '陈海涛', 'MALE', '13900011001', 'chen.haitao@example.com', 101, 4, 102,
 '2026-04-15', NULL, 'DRAFT', NULL, '2026-03-24 12:31:14', '2026-03-24 12:31:14', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_onboarding_task (
  id, tenant_id, application_id, task_name, task_type, task_description, assignee_id, status,
  completed_time, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(5101, 100000, 5002, '收集身份证与学历资料', 'DOCUMENT', '核验身份证、学历证书和银行卡信息。', 1001, 'COMPLETED',
 '2026-03-23 10:30:00', '身份证及学历材料已归档。', '2026-03-22 14:05:00', '2026-03-23 10:30:00', 'zhao', 'zhao', 0),
(5102, 100000, 5002, '开通账号与权限', 'ACCOUNT', '为新员工开通系统账号和基础权限。', 1001, 'PENDING',
 NULL, NULL, '2026-03-22 14:06:00', '2026-03-22 14:06:00', 'zhao', 'zhao', 0),
(5103, 100000, 5002, '准备办公设备', 'EQUIPMENT', '准备笔记本电脑、门禁与办公用品。', 1008, 'IN_PROGRESS',
 NULL, '电脑已分配，等待门禁卡。', '2026-03-22 14:07:00', '2026-03-23 11:00:00', 'zhao', 'zhao', 0),
(5104, 100000, 5002, '新人培训', 'TRAINING', '完成入职培训、制度宣导与导师对接。', 1001, 'PENDING',
 NULL, NULL, '2026-03-22 14:08:00', '2026-03-22 14:08:00', 'zhao', 'zhao', 0),
(5105, 100000, 5003, '收集身份证与学历资料', 'DOCUMENT', '核验身份证、学历证书和银行卡信息。', 1001, 'COMPLETED',
 '2026-03-01 10:00:00', '资料已归档。', '2026-03-01 09:10:00', '2026-03-01 10:00:00', 'zhao', 'zhao', 0),
(5106, 100000, 5003, '开通账号与权限', 'ACCOUNT', '为新员工开通系统账号和基础权限。', 1001, 'COMPLETED',
 '2026-03-01 11:00:00', '账号已开通并完成初始授权。', '2026-03-01 09:11:00', '2026-03-01 11:00:00', 'zhao', 'zhao', 0),
(5107, 100000, 5003, '准备办公设备', 'EQUIPMENT', '准备笔记本电脑、门禁与办公用品。', 1008, 'COMPLETED',
 '2026-03-01 13:30:00', '设备与门禁卡已发放。', '2026-03-01 09:12:00', '2026-03-01 13:30:00', 'zhao', 'zhao', 0),
(5108, 100000, 5003, '新人培训', 'TRAINING', '完成入职培训、制度宣导与导师对接。', 1001, 'COMPLETED',
 '2026-03-01 15:00:00', '培训已完成并签收资料。', '2026-03-01 09:13:00', '2026-03-01 15:00:00', 'zhao', 'zhao', 0);

-- 7. 转正申请示例数据
-- 说明：编号顺延，前一节已扩展到 Offer 与入职草稿联调样本。
INSERT INTO cloud_flow_db.hr_probation_confirmation (
  id, tenant_id, application_no, employee_id, probation_start_date, probation_end_date, expected_regular_date,
  self_evaluation, manager_evaluation, process_instance_id, status, reject_reason, extension_days,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(6001, 100000, 'HRPB202603230001', 1002, '2026-02-10', '2026-08-09', '2026-08-10',
 '已完成 HR 桌面端核心页面开发与日常需求支持，能独立完成接口联调。', '业务推进稳定，建议按计划进入审批流。', 'wf_hr_probation_6001',
 'APPROVING', NULL, NULL, '2026-03-23 10:00:00', '2026-03-23 10:00:00', 'zhao', 'zhao', 0),
(6002, 100000, 'HRPB202603010001', 1006, '2026-03-01', '2026-08-31', '2026-09-01',
 '快速适应团队节奏，交付质量稳定。', '转正建议通过，已具备独立承担任务能力。', 'wf_hr_probation_6002',
 'APPROVED', NULL, NULL, '2026-03-18 09:00:00', '2026-03-22 18:00:00', 'zhao', 'zhao', 0),
(6003, 100000, 'HRPB202602010001', 1007, '2025-11-01', '2026-05-30', '2026-05-30',
 '招聘协同推进正常，但数据复盘能力还需加强。', '建议延长试用期一个月，重点提升渠道复盘能力。', 'wf_hr_probation_6003',
 'EXTENDED', '阶段性目标完成度不足，需延长试用观察。', 30, '2026-02-15 14:00:00', '2026-03-20 16:00:00', 'zhao', 'zhao', 0);

-- 8. 调岗申请示例数据
INSERT INTO cloud_flow_db.hr_transfer_application (
  id, tenant_id, application_no, employee_id, from_dept_id, from_post_id, from_position_id,
  to_dept_id, to_post_id, to_position_id, transfer_type, reason, effective_date, salary_change,
  process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(7001, 100000, 'HRTR202603200001', 1008, 101, 4, 101,
 101, 2, 106, 'PROMOTION', '项目推进稳定，拟提升为技术经理负责小组交付。', '2026-04-01', 1,
 'wf_hr_transfer_7001', 'APPROVING', '2026-03-20 11:00:00', '2026-03-22 09:00:00', 'zhao', 'zhao', 0),
(7002, 100000, 'HRTR202603010001', 1005, 101, 4, 102,
 105, 4, 102, 'DEPT', '支援 IT 平台建设，承担内部工具服务端开发。', '2026-03-15', 0,
 'wf_hr_transfer_7002', 'EFFECTIVE', '2026-03-01 10:00:00', '2026-03-15 18:00:00', 'zhao', 'zhao', 0);

-- 9. 离职申请与交接示例数据
-- 8001：已完成，用于查看离职闭环结果
-- 8002：已审批，带交接清单，可测试“完成交接 / 确认离职”
-- 8003：审批中，可直接测试“审批通过”
INSERT INTO cloud_flow_db.hr_resignation_application (
  id, tenant_id, application_no, employee_id, resignation_type, resignation_reason, expected_date, actual_date,
  interview_content, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(8001, 100000, 'HRRE202603220001', 1004, 'VOLUNTARY', '家庭原因需要返回老家发展。', '2026-03-20', '2026-03-21',
 '已完成离职面谈，确认薪资与社保结算计划。', 'wf_hr_resignation_8001', 'COMPLETED',
 '2026-03-18 09:00:00', '2026-03-21 18:00:00', 'zhao', 'zhao', 0),
(8002, 100000, 'HRRE202603230001', 1003, 'VOLUNTARY', '计划返回家乡发展，申请按流程办理交接。', '2026-04-10', NULL,
 '已完成首次离职面谈，待资产与账号交接结束后确认离职。', 'wf_hr_resignation_8002', 'APPROVED',
 '2026-03-23 11:30:00', '2026-03-23 11:30:00', 'zhao', 'zhao', 0),
(8003, 100000, 'HRRE202603210001', 1008, 'VOLUNTARY', '计划接受外部新机会，先提交流程等待审批。', '2026-04-15', NULL,
 NULL, 'wf_hr_resignation_8003', 'APPROVING',
 '2026-03-21 16:00:00', '2026-03-22 09:30:00', 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_resignation_handover (
  id, tenant_id, application_id, handover_item, handover_type, handover_to_id, status,
  completed_time, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(9001, 100000, 8002, '代码仓库与发布权限移交', 'ACCOUNT', 1001, 'PENDING',
 NULL, NULL, '2026-03-23 11:40:00', '2026-03-23 11:40:00', 'zhao', 'zhao', 0),
(9002, 100000, 8002, '在建项目文档交接', 'DOCUMENT', 1005, 'COMPLETED',
 '2026-03-23 17:30:00', '接口文档与排期已转交张三。', '2026-03-23 11:41:00', '2026-03-23 17:30:00', 'zhao', 'zhao', 0),
(9003, 100000, 8002, '办公电脑归还', 'ASSET', 1001, 'PENDING',
 NULL, NULL, '2026-03-23 11:42:00', '2026-03-23 11:42:00', 'zhao', 'zhao', 0),
(9004, 100000, 8001, '财务资料归档', 'WORK', 1001, 'COMPLETED',
 '2026-03-21 15:00:00', '已完成票据、账号与预算资料归档。', '2026-03-18 10:00:00', '2026-03-21 15:00:00', 'zhao', 'zhao', 0);

-- =========================================================
-- 四、OA 与协同种子数据（迁移自 04.cloudflow-oa.sql）
-- =========================================================

-- =========================================================
-- 初始化数据
-- =========================================================

-- 1. 初始化公告数据
INSERT INTO cloud_flow_db.sys_announcement (title, content, type, scope_type, status, priority, sender_id, create_time, create_by) VALUES 
('关于系统OA模块升级的通知', '<p>各位同事：</p><p>系统将于本周五晚进行升级，新增任务管理和公告中心模块，请知悉。</p>', '1', 'ALL', '1', 'H', 1, NOW(), 'admin'),
('2026年春节放假安排', '<p>春节放假7天，请各位同事提前安排好工作。</p>', '2', 'ALL', '1', 'M', 1, NOW(), 'admin');

-- 1.1 初始化知识库数据
INSERT INTO cloud_flow_db.oa_knowledge_document (
  document_id, tenant_id, title, category, summary, content, attachment_url, scope_type, scope_value,
  status, submitter_id, submitter_name, dept_id, dept_name, submit_time, publish_time,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, '出差与报销衔接制度', '行政制度',
 '说明出差申请、费用归集和报销提交的基本要求。',
 '<h3>适用范围</h3><p>适用于所有提交出差申请和报销申请的员工。</p><h3>执行要求</h3><p>出差前提交申请，返回后5个工作日内完成费用报销。</p>',
 '', 'ALL', NULL, 'PUBLISHED', 1, 'admin', 100, '总经办',
 DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY),
 '0', 'admin', DATE_SUB(NOW(), INTERVAL 10 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 9 DAY)),
(9002, 100000, '会议室使用规范', '办公指南',
 '统一会议室预订、签到和取消规则。',
 '<h3>预订规则</h3><p>会议室需提前预订，无法按时使用时应及时取消。</p><h3>现场要求</h3><p>会议结束后关闭设备并恢复桌面。</p>',
 '', 'ALL', NULL, 'PUBLISHED', 1, 'admin', 100, '总经办',
 DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY),
 '0', 'admin', DATE_SUB(NOW(), INTERVAL 7 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 6 DAY));

-- 2. 初始化会议室数据
INSERT INTO cloud_flow_db.sys_meeting_room (name, capacity, location, equipment, status, create_time) VALUES 
('大会议室A', 50, '3楼东侧', '["投影仪", "音响", "白板"]', '1', NOW()),
('小会议室B', 10, '3楼西侧', '["电视", "白板"]', '1', NOW()),
('VIP接待室', 8, '4楼', '["沙发", "茶具"]', '1', NOW());

-- 3. 初始化日程数据
INSERT INTO cloud_flow_db.sys_schedule_event (title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time) VALUES 
('项目周会', '本周工作进度汇报', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL '1 1' DAY_HOUR), 0, 'MEETING', 1, 1, '[1,2]', NOW()),
('拜访客户', '去客户现场演示Demo', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), 1, 'WORK', NULL, 1, '[]', NOW());

-- 4. 初始化任务数据
INSERT INTO cloud_flow_db.sys_work_task (title, description, assignee_id, owner_id, priority, status, create_time, create_by) VALUES 
('完成OA系统任务管理模块设计', '包括数据库设计和前后端接口定义', 1, 1, 2, 'DONE', NOW(), 'admin'),
('开发任务看板功能', '前端使用 dnd-kit 实现拖拽看板', 1, 1, 2, 'DOING', NOW(), 'admin'),
('编写用户手册', '更新系统使用文档', 1, 1, 1, 'TODO', NOW(), 'admin');

-- 6. 初始化值班排班示例数据
INSERT INTO cloud_flow_db.sys_duty_schedule (title, schedule_type, duty_date, shift_type, start_time, end_time, user_id, user_name, dept_id, location, duty_content, status, create_by, create_time) VALUES
('周一日常值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'DAY', '09:00:00', '18:00:00', 1, 'admin', NULL, '前台', '负责来访接待和电话转接', 'SCHEDULED', 'admin', NOW()),
('周一夜班值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:00:00', '09:00:00', 1, 'admin', NULL, '监控室', '负责安全巡查和监控', 'SCHEDULED', 'admin', NOW());

-- =========================================================
-- 一、清理当前演示数据（仅清理本脚本使用的演示编号，避免污染原始测试数据）
-- =========================================================

-- -----------------------------
-- 1.1 工作流关联数据清理
-- -----------------------------
DELETE FROM cloud_flow_db.wf_task_read WHERE task_id IN (
  'demo_task_002','demo_task_003','demo_task_004','demo_task_007','demo_task_008','demo_task_011','demo_task_012','demo_task_013',
  'demo_task_014'
);

DELETE FROM cloud_flow_db.wf_task_urge WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM cloud_flow_db.wf_task_attachment WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM cloud_flow_db.wf_task_delegation WHERE task_id IN (
  'demo_task_004','demo_task_011'
);

DELETE FROM cloud_flow_db.wf_task_candidate WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_011','demo_task_014'
);

DELETE FROM cloud_flow_db.wf_task_add_sign WHERE add_sign_id IN (
  'demo_addsign_001','demo_addsign_002'
);

DELETE FROM cloud_flow_db.wf_countersign_vote WHERE countersign_id IN (
  'demo_cs_003','demo_cs_011'
);

DELETE FROM cloud_flow_db.wf_countersign_task WHERE countersign_id IN (
  'demo_cs_003','demo_cs_011'
);

DELETE FROM cloud_flow_db.wf_process_snapshot WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011'
);

DELETE FROM cloud_flow_db.wf_node_record WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM cloud_flow_db.wf_notification_log WHERE related_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM cloud_flow_db.wf_urge_effect WHERE task_id IN (
  'demo_task_002','demo_task_004','demo_task_007','demo_task_011','demo_task_014'
);

DELETE FROM cloud_flow_db.wf_process_copy WHERE instance_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM cloud_flow_db.wf_transaction_message WHERE business_id IN (
  'demo_inst_003','demo_inst_005','demo_inst_011','demo_inst_012'
);

DELETE FROM cloud_flow_db.wf_deploy_impact WHERE id IN (98001,98002);

DELETE FROM cloud_flow_db.wf_deploy_rollback_history WHERE id IN (98001);

DELETE FROM cloud_flow_db.wf_deploy_record WHERE id IN (98001,98002);

DELETE FROM cloud_flow_db.wf_notification_config WHERE config_id IN ('demo_notify_001','demo_notify_002');

DELETE FROM cloud_flow_db.workflow_version WHERE id IN ('demo_tpl_vehicle_001_v1');

DELETE FROM cloud_flow_db.workflow_archive WHERE id IN ('demo_archive_001');

DELETE FROM cloud_flow_db.wf_audit_log WHERE id IN ('demo_audit_001');

DELETE FROM cloud_flow_db.workflow_template WHERE id IN ('demo_tpl_vehicle_001');

DELETE FROM cloud_flow_db.wf_task_history WHERE history_id IN (
  'demo_hist_003','demo_hist_004','demo_hist_005','demo_hist_006','demo_hist_009','demo_hist_011','demo_hist_012','demo_hist_015',
  'demo_hist_016','demo_hist_017','demo_hist_018','demo_hist_021','demo_hist_022'
);

DELETE FROM cloud_flow_db.wf_task WHERE task_id IN (
  'demo_task_002','demo_task_003','demo_task_004','demo_task_007','demo_task_008','demo_task_011','demo_task_012','demo_task_013',
  'demo_task_014'
);

DELETE FROM cloud_flow_db.wf_process_instance WHERE instance_id IN (
  'demo_inst_003','demo_inst_004','demo_inst_005','demo_inst_006','demo_inst_011','demo_inst_012'
);

-- -----------------------------
-- 1.2 业务表数据清理
-- -----------------------------
DELETE FROM cloud_flow_db.biz_expense_item WHERE claim_id IN (9001,9002);

DELETE FROM cloud_flow_db.biz_expense_claim WHERE claim_no IN ('BX202603110001','BX202603110002');

DELETE FROM cloud_flow_db.biz_payment_request WHERE payment_no IN ('FK202603110001','FK202603110002');

DELETE FROM cloud_flow_db.biz_business_trip WHERE trip_no IN ('CC202603110001','CC202603110002');

DELETE FROM cloud_flow_db.sys_vehicle_expense WHERE expense_id IN (9101,9102,9103,9104,9105,9106,9107,9108);

DELETE FROM cloud_flow_db.sys_vehicle_usage WHERE usage_id IN (9001,9002,9003,9004,9005);

DELETE FROM cloud_flow_db.sys_vehicle WHERE vehicle_id IN (9001,9002,9003);

DELETE FROM cloud_flow_db.sys_asset_log WHERE log_id IN (9201,9202,9203,9204,9205,9206,9207,9208,9209,9210,9211,9212,9213,9214);

DELETE FROM cloud_flow_db.sys_asset WHERE asset_id IN (9001,9002,9003,9004,9005);

DELETE FROM cloud_flow_db.sys_consumable WHERE consumable_id IN (9001,9002,9003,9004,9005);

DELETE FROM cloud_flow_db.sys_file WHERE file_id IN (91001,91002,91003,91004);

DELETE FROM cloud_flow_db.sys_log WHERE log_id IN (91001,91002,91003,91004);

DELETE FROM cloud_flow_db.sys_audit_log WHERE audit_id IN (91001,91002);

DELETE FROM cloud_flow_db.sys_file WHERE file_id BETWEEN 92000 AND 92300;

DELETE FROM cloud_flow_db.sys_log WHERE log_id BETWEEN 92000 AND 92300;

DELETE FROM cloud_flow_db.sys_audit_log WHERE audit_id BETWEEN 92000 AND 92300;

DELETE FROM cloud_flow_db.sys_work_task WHERE task_id IN (9401,9402,9403,9404,9405,9406,9407,9408,9409,9410,9411,9412,9413,9414);

DELETE FROM cloud_flow_db.sys_schedule_event WHERE event_id IN (9501,9502,9503,9504,9505,9506,9507,9508,9509,9510);

DELETE FROM cloud_flow_db.sys_meeting_room WHERE room_id IN (9001,9002,9003,9004);

DELETE FROM cloud_flow_db.sys_announcement_read WHERE announcement_id IN (9601,9602,9603,9604,9605);

DELETE FROM cloud_flow_db.sys_announcement WHERE announcement_id IN (9601,9602,9603,9604,9605);

DELETE FROM cloud_flow_db.sys_visitor WHERE visitor_id IN (9701,9702,9703,9704,9705,9706,9707);

DELETE FROM cloud_flow_db.sys_duty_schedule WHERE schedule_id IN (9801,9802,9803,9804,9805,9806);

DELETE FROM cloud_flow_db.sys_frontend_error_log WHERE id IN (9901,9902,9903,9904,9905,9906);

DELETE FROM cloud_flow_db.sys_frontend_error_log WHERE id BETWEEN 99200 AND 99500;

DELETE FROM cloud_flow_db.sys_announcement_read WHERE announcement_id IN (9601,9602,9603,9604,9605) AND user_id IN (1,2,3,4,5,6,7,8,9) AND read_time >= DATE_SUB(NOW(), INTERVAL 40 DAY);

-- =========================================================
-- 二、OA 模块展示数据
-- =========================================================

-- -----------------------------
-- 2.1 公告与阅读记录
-- -----------------------------
INSERT INTO cloud_flow_db.sys_announcement (
  announcement_id, tenant_id, title, content, type, scope_type, scope_value, status, priority, is_top,
  sender_id, publish_time, expire_time, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9601, 100000, '2026年第一季度经营复盘会议通知',
 '<p><strong>会议主题：</strong>第一季度经营复盘与第二季度目标拆解</p><p>请研发、财务、HR、法务负责人准备汇报材料，并于会前 1 小时上传至共享盘。</p>',
 '2', 'ALL', NULL, '1', 'H', 1, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_ADD(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 4 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 3 DAY), '0'),
(9602, 100000, '差旅报销时效要求提醒',
 '<p>自本周起，出差结束后 <strong>5 个工作日内</strong> 需提交报销单，逾期需补充说明。</p>',
 '1', 'ALL', NULL, '1', 'M', 0, 3, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 30 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9603, 100000, '研发环境发布窗口调整说明',
 '<p>每周三、周五 19:00-21:00 为统一发布窗口，紧急变更需走审批流程并同步值班人员。</p>',
 '1', 'DEPT', '101', '1', 'H', 0, 7, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 15 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9604, 100000, '客户到访接待规范更新',
 '<p>行政部已更新客户到访接待 SOP，请各部门注意访客预约至少提前 2 小时提交。</p>',
 '2', 'ALL', NULL, '1', 'M', 0, 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_ADD(NOW(), INTERVAL 45 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), '0'),
(9605, 100000, '演示环境数据已刷新',
 '<p>今日 09:00 已完成演示环境模拟数据刷新，可用于客户汇报与培训演示。</p>',
 '3', 'ROLE', '1,2,3,4', '1', 'H', 1, 1, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_ADD(NOW(), INTERVAL 7 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 1 HOUR), '0');

INSERT INTO cloud_flow_db.sys_announcement_read (tenant_id, announcement_id, user_id, read_time) VALUES
(100000, 9601, 2, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 3, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 4, DATE_SUB(NOW(), INTERVAL 2 DAY)),
(100000, 9601, 5, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(100000, 9602, 3, DATE_SUB(NOW(), INTERVAL 1 DAY)),
(100000, 9602, 5, DATE_SUB(NOW(), INTERVAL 18 HOUR)),
(100000, 9603, 2, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 9603, 8, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 9604, 1, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 9604, 4, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 9605, 1, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(100000, 9605, 2, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
(100000, 9605, 3, DATE_SUB(NOW(), INTERVAL 18 MINUTE)),
(100000, 9605, 4, DATE_SUB(NOW(), INTERVAL 15 MINUTE)),
(100000, 9601, 6, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 9602, 7, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 9603, 9, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 9604, 6, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 9605, 7, DATE_SUB(NOW(), INTERVAL 12 MINUTE)),
(100000, 9605, 8, DATE_SUB(NOW(), INTERVAL 9 MINUTE));

-- -----------------------------
-- 2.2 会议室与日程
-- -----------------------------
INSERT INTO cloud_flow_db.sys_meeting_room (
  room_id, tenant_id, name, capacity, location, equipment, status, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9001, 100000, '创新协作厅', 30, '5楼东区', '["4K大屏","无线投屏","视频会议终端","电子白板"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9002, 100000, '客户演示中心', 16, '1楼展厅', '["LED屏","演示主机","音响","录播设备"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9003, 100000, '战略会议室', 12, '6楼南侧', '["视频会议终端","书写屏","保密门禁"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), '0'),
(9004, 100000, '培训教室', 60, '2楼西区', '["投影仪","扩声音响","录课摄像头","移动麦克风"]', '0', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0');

INSERT INTO cloud_flow_db.sys_schedule_event (
  event_id, tenant_id, title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time, update_time, del_flag
) VALUES
(9501, 100000, 'Q1经营复盘会', '管理层汇总 Q1 经营指标、重点项目进展与风险项。', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 1, '[1,2,3,4,6,7]', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9502, 100000, '智慧园区项目客户演示', '面向星河集团展示流程引擎、OA 协同、可视化报表。', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 3 HOUR), 0, 'MEETING', 9002, 2, '[2,5,8,9]', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9503, 100000, '研发迭代计划评审', '确认下个迭代的需求优先级、上线窗口和人力安排。', DATE_ADD(NOW(), INTERVAL 8 HOUR), DATE_ADD(DATE_ADD(NOW(), INTERVAL 8 HOUR), INTERVAL 90 MINUTE), 0, 'WORK', 9001, 2, '[2,5,8,9]', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9504, 100000, '供应商合同谈判', '与供应商讨论年度服务框架协议和 SLA 条款。', DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 6, '[3,6]', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9505, 100000, '年度团建筹备事项跟进', '行政、HR、部门经理共同确认团建预算、交通与场地。', DATE_ADD(NOW(), INTERVAL 4 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 4 DAY), INTERVAL 1 HOUR), 0, 'MEETING', 9001, 4, '[1,2,4]', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9506, 100000, '张三客户现场拜访', '陪同销售团队进行流程平台上线前培训。', DATE_ADD(NOW(), INTERVAL 5 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 5 DAY), INTERVAL 8 HOUR), 1, 'WORK', NULL, 5, '[5]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9507, 100000, '流程引擎性能评审会', '讨论流程引擎在峰值场景下的性能与优化方案。', DATE_ADD(NOW(), INTERVAL 6 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 6 DAY), INTERVAL 2 HOUR), 0, 'MEETING', 9003, 1, '[1,2,7,9]', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9508, 100000, '财务预算复核', '梳理各部门季度预算执行情况与调整建议。', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 90 MINUTE), 0, 'WORK', 9001, 3, '[3,4,6]', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), '0'),
(9509, 100000, '新人入职培训', '新员工入职流程、制度与系统培训。', DATE_ADD(NOW(), INTERVAL 3 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 3 DAY), INTERVAL 3 HOUR), 0, 'MEETING', 9004, 4, '[4,5,8]', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), '0'),
(9510, 100000, '客户远程支持', '远程协助客户完成流程配置与数据导入。', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 4 HOUR), 1, 'WORK', NULL, 7, '[7,9]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), '0');

-- -----------------------------
-- 2.3 协作任务
-- -----------------------------
INSERT INTO cloud_flow_db.sys_work_task (
  task_id, tenant_id, title, description, assignee_id, owner_id, dept_id, priority, status, due_date, tags, parent_id,
  create_by, create_time, update_by, update_time, del_flag
) VALUES
(9401, 100000, '准备客户演示环境', '确认账号、流程模板、看板数据与大屏演示脚本均可用。', 7, 1, 105, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 1 DAY), '["演示","环境","高优"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9402, 100000, '导出演示用审批截图', '截取待办、已办、抄送、流程轨迹、催办与加签场景。', 8, 7, 106, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 20 HOUR), '["前端","截图","演示"]', 9401, 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY), 'test_fe', DATE_SUB(NOW(), INTERVAL 1 HOUR), '0'),
(9403, 100000, '整理财务付款案例材料', '准备 SaaS 年框付款流程、合同附件、银行信息。', 3, 1, 102, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["财务","付款","案例"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 10 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 10 HOUR), '0'),
(9404, 100000, '完善员工出差制度 FAQ', '结合近期出差与报销问题补充常见问答。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 4 DAY), '["HR","制度","知识库"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 8 HOUR), '0'),
(9405, 100000, '合同审批模板优化', '增加法务会签说明、风险提示和附件校验规则。', 6, 1, 104, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 3 DAY), '["法务","模板","流程"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 12 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9406, 100000, '清点备用笔记本库存', '核对设备编号、领用状态、维修与借用记录。', 7, 1, 105, 1, 'DONE', DATE_SUB(NOW(), INTERVAL 1 DAY), '["资产","盘点","IT"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 3 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 20 HOUR), '0'),
(9407, 100000, '访客接待动线演练', '为大型客户到访准备接待流程与前台物料。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["访客","接待","行政"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9408, 100000, '访客通行二维码问题排查', '复现偶发二维码刷新失败与前台核验异常，输出问题清单。', 9, 7, 107, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 36 HOUR), '["访客","前台","缺陷"]', NULL, 'chen', DATE_SUB(NOW(), INTERVAL 15 HOUR), 'test_be', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9409, 100000, '更新客户演示讲解稿', '梳理本周演示流程亮点与常见问题回答。', 8, 1, 106, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 2 DAY), '["演示","讲解","前端"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9410, 100000, '完善预算执行报表', '补充财务看板数据并检查异常指标。', 3, 1, 102, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 1 DAY), '["财务","报表","看板"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9411, 100000, '整理发布回滚预案', '汇总常见回滚步骤与联系人列表。', 7, 1, 105, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 3 DAY), '["运维","发布","回滚"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 9 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9412, 100000, '修订访客接待SOP', '补充贵宾接待流程与安全检查清单。', 4, 1, 103, 1, 'TODO', DATE_ADD(NOW(), INTERVAL 5 DAY), '["行政","SOP","访客"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9413, 100000, '合同附件合规复核', '检查合同附件完整性与签署规范。', 6, 1, 104, 2, 'DOING', DATE_ADD(NOW(), INTERVAL 2 DAY), '["法务","合同","合规"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9414, 100000, '用车申请移动端体验优化', '收集试用反馈并输出移动端提交流程优化建议。', 9, 7, 107, 2, 'TODO', DATE_ADD(NOW(), INTERVAL 4 DAY), '["用车","移动端","体验"]', NULL, 'chen', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'test_be', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0');

-- -----------------------------
-- 2.5 资产、耗材与日志
-- -----------------------------
INSERT INTO cloud_flow_db.sys_asset (
  asset_id, tenant_id, asset_code, name, category, model, status, price, purchase_date, owner_id, location, remark,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'IT-LAP-2024-001', 'MacBook Pro 14 开发机', '笔记本电脑', 'Apple M3 Pro 36GB/1TB', '2', 18999.00, '2024-06-18', 8, '研发部工位A-12', '前端演示专用设备', '0', 'chen', DATE_SUB(NOW(), INTERVAL 200 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(9002, 100000, 'IT-LAP-2024-002', 'ThinkPad X1 Carbon', '笔记本电脑', 'i7/32GB/1TB', '2', 13999.00, '2024-07-01', 9, '后端组工位B-06', '后端联调与现场支持', '0', 'chen', DATE_SUB(NOW(), INTERVAL 180 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9003, 100000, 'IT-PAD-2025-001', 'iPad Pro 演示终端', '平板设备', '11英寸 512G', '1', 7999.00, '2025-01-10', NULL, 'IT资产柜 2 层', '客户接待演示备用', '0', 'chen', DATE_SUB(NOW(), INTERVAL 60 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(9004, 100000, 'OFF-PRJ-2023-001', '激光投影仪', '会议设备', 'EPSON CB-2255U', '2', 6599.00, '2023-10-20', 7, '客户演示中心', '绑定演示厅固定设备', '0', 'admin', DATE_SUB(NOW(), INTERVAL 400 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(9005, 100000, 'IT-SRV-2024-001', '应用演示服务器', '服务器', 'Dell R760 64C/256GB', '3', 46800.00, '2024-05-08', NULL, '机房 R2-08', '近期进行硬盘阵列维护', '0', 'chen', DATE_SUB(NOW(), INTERVAL 250 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR));

INSERT INTO cloud_flow_db.sys_consumable (
  consumable_id, tenant_id, name, model, unit, quantity, low_stock_threshold, default_supplier_id, target_stock, warn_enabled, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'A4打印纸', '70g/500张', '箱', 26, 8, 9001, 40, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9002, 100000, '黑色硒鼓', 'HP 138A', '支', 5, 6, 9002, 18, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9003, 100000, '便签纸', '76x76mm', '包', 18, 5, 9001, 30, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9004, 100000, '工牌挂绳', '标准蓝色', '根', 42, 10, 9001, 60, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 25 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9005, 100000, '演示用 HDMI 线', '2米 4K', '根', 3, 4, 9002, 12, 1, '0', 'chen', DATE_SUB(NOW(), INTERVAL 12 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO cloud_flow_db.sys_supplier (
  supplier_id, tenant_id, supplier_name, contact_name, contact_phone, bank_name, bank_account, status, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, '杭州云启办公用品有限公司', '周芸', '13800010001', '招商银行杭州科技园支行', '6217000012345678901', 'ACTIVE', '0', 'admin', DATE_SUB(NOW(), INTERVAL 20 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9002, 100000, '上海企采耗材供应链有限公司', '陈立', '13800010002', '中国银行上海浦东支行', '6217000012345678902', 'ACTIVE', '0', 'admin', DATE_SUB(NOW(), INTERVAL 18 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO cloud_flow_db.sys_asset_log (
  log_id, tenant_id, ref_id, ref_type, type, quantity_change, operator_id, target_id, remark, create_time
) VALUES
(9201, 100000, 9001, '1', '领用', 1, 7, 8, '前端演示负责人长期领用', DATE_SUB(NOW(), INTERVAL 40 DAY)),
(9202, 100000, 9002, '1', '领用', 1, 7, 9, '后端现场支持设备发放', DATE_SUB(NOW(), INTERVAL 35 DAY)),
(9203, 100000, 9003, '1', '盘点', 0, 7, NULL, '演示平板库存正常', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(9204, 100000, 9005, '1', '维修', 0, 7, NULL, 'RAID 卡异常，已送检', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
(9205, 100000, 9001, '2', '出库', -4, 1, NULL, '行政集中领用打印纸用于培训资料', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(9206, 100000, 9002, '2', '出库', -2, 7, NULL, '客户演示中心打印机更换硒鼓', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9207, 100000, 9005, '2', '入库', 6, 7, NULL, '补充 HDMI 线缆', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9208, 100000, 9004, '2', '盘点', 0, 1, NULL, '工牌挂绳数量正常', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9209, 100000, 9003, '1', '领用', 1, 7, 5, '演示平板借用给产品经理', DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(9210, 100000, 9002, '1', '归还', -1, 7, 9, '现场支持设备归还入库', DATE_SUB(NOW(), INTERVAL 9 HOUR)),
(9211, 100000, 9001, '1', '盘点', 0, 1, NULL, '月度资产盘点记录', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9212, 100000, 9004, '1', '维修', 0, 7, NULL, '投影仪灯泡更换', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9213, 100000, 9001, '2', '入库', 10, 1, NULL, '补充办公用品入库', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(9214, 100000, 9003, '2', '出库', -3, 7, NULL, '外勤现场备品领用', DATE_SUB(NOW(), INTERVAL 10 HOUR));

-- -----------------------------
-- 2.6 车辆、用车与费用
-- -----------------------------
INSERT INTO cloud_flow_db.sys_vehicle (
  vehicle_id, tenant_id, license_plate, brand, model, color, capacity, status, mileage, purchase_date, insurance_expiry, location,
  remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, '沪A-CF001', '别克', 'GL8 ES', '黑色', 7, '3', 28650.50, '2023-06-01', '2026-08-31', '总部地库 A 区', '客户接待与商务出行主力车辆', '0', 'admin', DATE_SUB(NOW(), INTERVAL 600 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9002, 100000, '沪A-CF002', '特斯拉', 'Model Y', '白色', 5, '1', 15280.00, '2024-03-12', '2026-03-28', '总部地库 B 区', '适合市区短途接待', '0', 'admin', DATE_SUB(NOW(), INTERVAL 360 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9003, 100000, '沪A-CF003', '大众', '帕萨特', '银色', 5, '4', 43120.00, '2022-11-20', '2026-05-16', '维修厂', '右前轮毂维修中', '0', 'admin', DATE_SUB(NOW(), INTERVAL 820 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 12 HOUR));

INSERT INTO cloud_flow_db.sys_vehicle_usage (
  usage_id, tenant_id, vehicle_id, applicant_id, driver_id, start_time, end_time, destination, return_location, is_round_trip, reason,
  passenger_count, passengers, start_mileage, end_mileage, actual_start_time, actual_end_time, attachment_url, status, process_instance_id,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 9001, 2, 7, DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 1 DAY), INTERVAL 6 HOUR), '浦东新区星河集团总部', '总部地库 A 区', 1,
 '客户高层商务拜访及产品演示', 4, '李经理,张三,前端测试,后端测试', 28650.50, NULL, NULL, NULL,
 'https://demo.cloudflow.local/files/vehicle/usage-9001-approval.pdf', '0', 'demo_inst_012', '0', 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(9002, 100000, 9002, 4, 7, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 4 HOUR, '虹桥人才中心', '总部地库 B 区', 1,
 '招聘专场宣讲与候选人面谈接送', 3, '赵HR,行政接待,候选人代表', 15140.00, 15210.00, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY) + INTERVAL 4 HOUR,
 'https://demo.cloudflow.local/files/vehicle/usage-9002-summary.pdf', '4', NULL, '0', 'zhao', DATE_SUB(NOW(), INTERVAL 3 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9003, 100000, 9003, 1, 7, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 1 HOUR, '市区维修中心', '维修厂', 0,
 '送修车辆，处理异响与刹车保养', 1, '陈IT', 43080.00, 43120.00, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY) + INTERVAL 1 HOUR,
 'https://demo.cloudflow.local/files/vehicle/maintenance/repair-order-9003.jpg', '4', NULL, '0', 'admin', DATE_SUB(NOW(), INTERVAL 8 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(9004, 100000, 9001, 5, 7, DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(DATE_ADD(NOW(), INTERVAL 2 DAY), INTERVAL 5 HOUR), '浦东新区创新园区', '总部地库 A 区', 1,
 '客户现场演示与方案沟通', 3, '张三,前端测试,后端测试', 28650.50, NULL, NULL, NULL,
 'https://demo.cloudflow.local/files/vehicle/usage-9004-approval.pdf', '0', NULL, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9005, 100000, 9002, 3, 7, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 3 HOUR, '静安区客户培训点', '总部地库 B 区', 1,
 '财务系统客户培训接送', 2, '王财务,客户代表', 15210.00, 15280.00, DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY) + INTERVAL 3 HOUR,
 'https://demo.cloudflow.local/files/vehicle/usage-9005-summary.pdf', '4', NULL, '0', 'wang', DATE_SUB(NOW(), INTERVAL 2 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO cloud_flow_db.sys_vehicle_expense (
  expense_id, tenant_id, vehicle_id, usage_id, expense_type, amount, expense_date, description, receipt_url, create_by, create_time
) VALUES
(9101, 100000, 9002, 9002, '1', 268.50, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '招聘活动往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9101.jpg', 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9102, 100000, 9002, 9002, '3', 48.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '人才中心停车费', 'https://demo.cloudflow.local/files/vehicle/receipts/park-9102.jpg', 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9103, 100000, 9003, 9003, '4', 1860.00, DATE_SUB(CURDATE(), INTERVAL 6 DAY), '刹车片与轮胎检查维修', 'https://demo.cloudflow.local/files/vehicle/receipts/repair-9103.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(9104, 100000, 9001, NULL, '5', 5200.00, DATE_SUB(CURDATE(), INTERVAL 25 DAY), '年度商业险续保', 'https://demo.cloudflow.local/files/vehicle/receipts/insurance-9104.pdf', 'admin', DATE_SUB(NOW(), INTERVAL 25 DAY)),
(9105, 100000, 9001, 9004, '1', 320.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '客户演示往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9105.jpg', 'zhang', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9106, 100000, 9001, 9004, '3', 36.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '园区停车费', 'https://demo.cloudflow.local/files/vehicle/receipts/park-9106.jpg', 'zhang', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9107, 100000, 9001, NULL, '2', 120.00, DATE_SUB(CURDATE(), INTERVAL 5 DAY), '洗车与基础保养', 'https://demo.cloudflow.local/files/vehicle/receipts/wash-9107.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 5 DAY)),
(9108, 100000, 9002, 9005, '4', 980.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '培训期间临时维修', 'https://demo.cloudflow.local/files/vehicle/receipts/repair-9108.jpg', 'wang', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- -----------------------------
-- 2.6.1 用印、证照与借还演示
-- -----------------------------
INSERT INTO cloud_flow_db.oa_seal (
  seal_id, tenant_id, seal_code, seal_name, seal_type, keeper_id, keeper_name, location, status, remark,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'SEAL-COMPANY-001', '公司公章', 'COMPANY', 1, 'Admin', '总部行政保险柜 A01', 'BORROWED', '公司主体公章，需审批后借出', '0', 'admin', DATE_SUB(NOW(), INTERVAL 120 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9002, 100000, 'SEAL-CONTRACT-001', '合同专用章', 'CONTRACT', 2, '李经理', '总部行政保险柜 A02', 'AVAILABLE', '合同签署专用', '0', 'admin', DATE_SUB(NOW(), INTERVAL 120 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9003, 100000, 'SEAL-FINANCE-001', '财务专用章', 'FINANCE', 3, '王财务', '财务部保险柜', 'AVAILABLE', '票据与财务资料用章', '0', 'admin', DATE_SUB(NOW(), INTERVAL 120 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO cloud_flow_db.oa_license (
  license_id, tenant_id, license_code, license_name, license_type, license_no, issuer, issue_date, expire_date,
  keeper_id, keeper_name, location, attachment_url, status, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'LIC-BUSINESS-001', '营业执照正本', 'BUSINESS', '91310000CFLOW001', '上海市市场监督管理局', '2022-01-01', '2032-01-01', 1, 'Admin', '总部行政保险柜 B01', 'https://demo.cloudflow.local/files/license/business-license-current.pdf', 'BORROWED', '正本原则上不外借', '0', 'admin', DATE_SUB(NOW(), INTERVAL 120 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(9002, 100000, 'LIC-QUAL-001', '软件企业证书', 'QUALIFICATION', 'SQ-2026-0001', '上海市经信委', '2024-05-12', DATE_ADD(CURDATE(), INTERVAL 15 DAY), 4, '赵HR', '总部行政保险柜 B02', 'https://demo.cloudflow.local/files/license/software-certificate-current.pdf', 'AVAILABLE', '投标资质材料常用', '0', 'admin', DATE_SUB(NOW(), INTERVAL 90 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO cloud_flow_db.oa_seal_application (
  id, tenant_id, instance_id, application_no, seal_id, seal_name, user_id, user_name, dept_id, dept_name,
  document_name, use_scene, copy_count, purpose, expected_borrow_time, expected_return_time, actual_borrow_time, actual_return_time,
  handler_id, handler_name, attachment_url, status, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, NULL, 'YY202604010001', 9002, '合同专用章', 5, '张三', 101, '研发部',
 '星河集团产品服务合同', 'CONTRACT', 2, '客户合同签署归档', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), NULL, NULL,
 NULL, NULL, 'https://demo.cloudflow.local/files/seal/contract-9001.pdf', 'APPROVED', '0', 'zhang', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'workflow-stream', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9002, 100000, NULL, 'YY202604010002', 9001, '公司公章', 8, '前端测试', 101, '研发部',
 '投标授权说明', 'PROOF', 1, '投标文件授权说明盖章', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), NULL,
 1, 'Admin', 'https://demo.cloudflow.local/files/seal/bid-auth-9002.pdf', 'OVERDUE', '0', 'test_fe', DATE_SUB(NOW(), INTERVAL 3 DAY), 'overdue-scan', DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO cloud_flow_db.oa_license_borrow (
  id, tenant_id, instance_id, borrow_no, license_id, license_name, user_id, user_name, dept_id, dept_name,
  purpose, expected_borrow_time, expected_return_time, actual_borrow_time, actual_return_time, handler_id, handler_name,
  attachment_url, status, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, NULL, 'ZZ202604010001', 9001, '营业执照正本', 6, '刘法务', 106, '法务部',
 '客户尽调现场核验证照原件', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, 1, 'Admin',
 'https://demo.cloudflow.local/files/license/business-license-9001.pdf', 'BORROWED', '0', 'liu', DATE_SUB(NOW(), INTERVAL 2 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9002, 100000, NULL, 'ZZ202604010002', 9002, '软件企业证书', 8, '前端测试', 101, '研发部',
 '投标资质材料复印件加盖骑缝章', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 3 DAY), NULL, NULL, NULL, NULL,
 NULL, 'APPROVED', '0', 'test_fe', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'workflow-stream', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO cloud_flow_db.oa_seal_handover_log (
  id, tenant_id, application_id, seal_id, action_type, operator_id, operator_name, action_time, remark, attachment_url, create_by, create_time
) VALUES
(9001, 100000, 9002, 9001, 'BORROW', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 2 DAY), '投标材料用章借出', 'https://demo.cloudflow.local/files/seal/handover-9001.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 2 DAY));

INSERT INTO cloud_flow_db.oa_license_handover_log (
  id, tenant_id, borrow_id, license_id, action_type, operator_id, operator_name, action_time, remark, attachment_url, create_by, create_time
) VALUES
(9001, 100000, 9001, 9001, 'BORROW', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 1 DAY), '客户尽调现场核验借出', 'https://demo.cloudflow.local/files/license/handover-9001.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO cloud_flow_db.oa_borrow_reminder_log (
  id, tenant_id, business_type, business_id, resource_id, resource_name, applicant_id, applicant_name,
  reminder_type, operator_id, operator_name, reminder_content, reminder_time, create_by, create_time
) VALUES
(9001, 100000, 'SEAL', 9002, 9001, '公司公章', 8, '前端测试', 'AUTO', NULL, 'system', '用印申请已超过预计归还时间，请尽快归还：公司公章', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'system', DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO cloud_flow_db.oa_license_renewal (
  id, tenant_id, instance_id, renewal_no, license_id, license_name, license_no, old_issue_date, old_expire_date,
  new_issue_date, new_expire_date, applicant_id, applicant_name, dept_id, dept_name, renewal_reason, attachment_url,
  status, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, NULL, 'XQ202604010001', 9002, '软件企业证书', 'SQ-2026-0001', '2024-05-12', DATE_ADD(CURDATE(), INTERVAL 15 DAY),
 CURDATE(), DATE_ADD(CURDATE(), INTERVAL 3 YEAR), 4, '赵HR', 104, '人力资源部', '证照即将到期，补充续期材料进入审批',
 'https://demo.cloudflow.local/files/license/renewal-9001.pdf', 'PENDING', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 3 HOUR));

INSERT INTO cloud_flow_db.oa_license_expiry_reminder_log (
  id, tenant_id, license_id, license_name, expire_date, days_before, recipient_id, recipient_name, reminder_type,
  operator_id, operator_name, reminder_content, reminder_time, create_by, create_time
) VALUES
(9001, 100000, 9002, '软件企业证书', DATE_ADD(CURDATE(), INTERVAL 15 DAY), 15, 4, '赵HR', 'AUTO',
 NULL, 'system', '证照将在 15 天后到期，请及时办理续期：软件企业证书', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'system', DATE_SUB(NOW(), INTERVAL 1 HOUR));

-- -----------------------------
-- 2.7 访客与值班
-- -----------------------------
INSERT INTO cloud_flow_db.sys_visitor (
  visitor_id, tenant_id, visitor_name, visitor_phone, visitor_company, visitor_count, id_card, visit_reason, host_id, host_name, host_dept,
  visit_date, visit_time_start, visit_time_end, actual_arrive, actual_leave, visit_area, car_plate, belongings, photo_url, pass_code,
  status, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9701, 100000, '孙总', '13900010001', '星河集团', 3, '3101********1234', '智慧园区项目合作洽谈', 2, '李经理', '研发部',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), '10:00:00', '12:30:00', NULL, NULL, '1楼展厅,6楼战略会议室', '沪B88888', '演示样册,客户名片', 'https://demo.cloudflow.local/files/visitor/9701.jpg', 'VST2026031101',
 'CONFIRMED', '需安排投影与茶歇', '0', 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9702, 100000, '何老师', '13900010002', '城市大学', 2, '3202********5678', '校企合作交流', 4, '赵HR', '人力资源部',
 DATE_ADD(CURDATE(), INTERVAL 1 DAY), '14:00:00', '16:00:00', NULL, NULL, '5楼创新协作厅', NULL, '笔记本电脑', 'https://demo.cloudflow.local/files/visitor/9702.jpg', 'VST2026031102',
 'PENDING', '需安排校招资料', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9703, 100000, '陈顾问', '13900010003', '智策咨询', 1, '3303********9012', '财务流程优化咨询', 3, '王财务', '财务部',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY), '09:30:00', '11:30:00', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 20 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 45 MINUTE,
 '3楼财务会议区', NULL, '平板电脑', 'https://demo.cloudflow.local/files/visitor/9703.jpg', 'VST2026031003',
 'COMPLETED', '已完成咨询会议', '0', 'wang', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(9704, 100000, '王经理', '13900010004', '云启科技', 2, '3404********3456', '合同谈判及法务条款确认', 6, '刘法务', '法务部',
 CURDATE(), '15:00:00', '17:00:00', CURDATE() + INTERVAL 14 HOUR + INTERVAL 50 MINUTE, NULL, '6楼战略会议室', '苏A12345', '合同草案,公司章程复印件',
 'https://demo.cloudflow.local/files/visitor/9704.jpg', 'VST2026031104', 'ARRIVED', '法务部已接待', '0', 'liu', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'liu', DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
(9705, 100000, '周总监', '13900010005', '星航科技', 2, '3105********4567', '流程平台战略合作沟通', 2, '李经理', '研发部',
 DATE_ADD(CURDATE(), INTERVAL 3 DAY), '13:30:00', '15:30:00', NULL, NULL, '5楼创新协作厅', '沪C66666', '演示方案,合同意向书', 'https://demo.cloudflow.local/files/visitor/9705.jpg', 'VST2026031105',
 'CONFIRMED', '需安排会议资料', '0', 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9706, 100000, '刘老师', '13900010006', '南方理工大学', 1, '3206********7890', '校企实习合作对接', 4, '赵HR', '人力资源部',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:00:00', '11:00:00', NULL, NULL, '2楼西区培训教室', NULL, '讲义资料', 'https://demo.cloudflow.local/files/visitor/9706.jpg', 'VST2026031106',
 'PENDING', '需准备实习岗位材料', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
(9707, 100000, '顾女士', '13900010007', '远航咨询', 1, '3307********2345', '流程优化诊断复盘', 3, '王财务', '财务部',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY), '14:00:00', '16:30:00', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 14 HOUR + INTERVAL 5 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 16 HOUR + INTERVAL 20 MINUTE,
 '3楼财务会议区', NULL, '笔记本电脑', 'https://demo.cloudflow.local/files/visitor/9707.jpg', 'VST2026031007',
 'COMPLETED', '完成流程优化复盘', '0', 'wang', DATE_SUB(NOW(), INTERVAL 50 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 40 HOUR));

INSERT INTO cloud_flow_db.sys_duty_schedule (
  schedule_id, tenant_id, title, schedule_type, duty_date, shift_type, start_time, end_time, user_id, user_name,
  backup_user_id, backup_user_name, dept_id, dept_name, location, duty_content, check_in_time, check_out_time, status,
  swap_reason, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9801, 100000, '客户演示日值班', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'DAY', '08:30:00', '18:30:00', 7, '陈IT', 9, '后端测试', 105, 'IT部',
 '客户演示中心', '保障演示网络、投屏、应用服务稳定运行', NULL, NULL, 'SCHEDULED', NULL, '重要客户演示专项保障', '0', 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9802, 100000, '发布窗口晚间值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:00:00', '23:30:00', 9, '后端测试', 7, '陈IT', 107, '后端组',
 '监控室', '负责观察发布告警、接口异常与回滚预案', NULL, NULL, 'SCHEDULED', NULL, '与周三发布窗口联动', '0', 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
(9803, 100000, '行政前台接待值班', 'DAILY', CURDATE(), 'DAY', '09:00:00', '18:00:00', 4, '赵HR', 1, 'Admin', 103, '人力资源部',
 '前台', '负责访客登记、快递签收、会议支持', CURDATE() + INTERVAL 8 HOUR + INTERVAL 55 MINUTE, NULL, 'CHECKED_IN', NULL, '今日有两批客户来访', '0', 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 5 MINUTE)),
(9804, 100000, '周末安全巡检值班', 'HOLIDAY', DATE_ADD(CURDATE(), INTERVAL 4 DAY), 'FULL', '09:00:00', '21:00:00', 1, 'Admin', 7, '陈IT', 100, 'CloudFlow 科技',
 '总部办公区', '检查机房、电源、空调与办公区门禁状态', NULL, NULL, 'SCHEDULED', NULL, '节前安全巡查', '0', 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(9805, 100000, '客户上线支持值班', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 5 DAY), 'NIGHT', '20:00:00', '02:00:00', 7, '陈IT', 9, '后端测试', 105, 'IT部',
 '客户机房', '保障客户上线期间接口与数据库稳定', NULL, NULL, 'SCHEDULED', NULL, '客户上线专项保障', '0', 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9806, 100000, '季度资产盘点值班', 'TEMP', DATE_ADD(CURDATE(), INTERVAL 6 DAY), 'DAY', '09:00:00', '17:00:00', 7, '陈IT', 8, '前端测试', 105, 'IT部',
 '资产仓库', '完成季度资产盘点与出入库核对', NULL, NULL, 'SCHEDULED', NULL, '盘点专项任务', '0', 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR));

-- -----------------------------
-- 2.8 前端错误日志（用于演示监控与排错）
-- -----------------------------
INSERT INTO cloud_flow_db.sys_frontend_error_log (
  id, tenant_id, message, stack, component_stack, context, url, user_agent, level, tags, extra, client_ip,
  user_id, user_name, client_time, create_time
) VALUES
(9901, 100000, '流程详情页渲染附件列表失败',
 'TypeError: Cannot read properties of undefined (reading ''map'')',
 'at AttachmentPanel (src/pages/workflow/ProcessDetail.tsx:128)\nat ProcessDetail',
 '流程详情页打开已办任务',
 '/workflow/process/detail/demo_inst_004',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','workflow','page','ProcessDetail','env','demo'),
 JSON_OBJECT('instanceId','demo_inst_004','taskId','demo_task_011','browser','Chrome'),
 '10.10.0.25', 8, '前端测试', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(9902, 100000, '访客预约二维码加载失败',
 'Error: geolocation permission denied',
 'at MobileVisitorPass (src/mobile/pages/VisitorPass.tsx:86)\nat VisitorPassPage',
 '访客预约页面加载通行二维码',
 '/mobile/visitor/pass',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15',
 'warning',
 JSON_OBJECT('module','visitor','page','MobileVisitorPass','env','demo'),
 JSON_OBJECT('visitorId',9702,'device','iPhone 15','network','4G'),
 '10.10.0.36', 5, '张三', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(9903, 100000, '日程页面数据加载超时',
 'AxiosError: timeout of 10000ms exceeded',
 'at SchedulePage (src/pages/SchedulePage.tsx:53)\nat App',
 '日程页面加载当日数据',
 '/schedule',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'info',
 JSON_OBJECT('module','oa','page','SchedulePage','env','demo'),
 JSON_OBJECT('queryDate',DATE_FORMAT(CURDATE(), '%Y-%m-%d'),'retry',1),
 '10.10.0.18', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 70 MINUTE), DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
(9904, 100000, '公告中心列表加载缓慢',
 'AxiosError: timeout of 5000ms exceeded',
 'at AnnouncementList (src/pages/AnnouncementPage.tsx:44)\nat App',
 '公告中心首次加载',
 '/announcement',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'warning',
 JSON_OBJECT('module','oa','page','AnnouncementPage','env','demo'),
 JSON_OBJECT('query','latest','retry',1),
 '10.10.0.22', 4, '赵HR', DATE_SUB(NOW(), INTERVAL 50 MINUTE), DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
(9905, 100000, '用车申请列表筛选异常',
 'TypeError: Cannot read properties of undefined (reading ''filter'')',
 'at VehicleUsageList (src/pages/admin/vehicle/VehicleUsageList.tsx:218)\nat Admin',
 '用车申请列表按状态筛选',
 '/admin/vehicle/usage',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','vehicle','page','VehicleUsageList','env','demo'),
 JSON_OBJECT('status','PENDING','userId',7),
 '10.10.0.23', 7, '陈IT', DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
(9906, 100000, '值班安排保存失败',
 'AxiosError: Request failed with status code 500',
 'at DutyScheduleForm (src/pages/admin/duty/DutyScheduleForm.tsx:190)\nat Admin',
 '值班安排保存',
 '/admin/duty/schedule',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','duty','page','DutyScheduleForm','env','demo'),
 JSON_OBJECT('scheduleId',9803,'action','save'),
 '10.10.0.24', 7, '陈IT', DATE_SUB(NOW(), INTERVAL 20 MINUTE), DATE_SUB(NOW(), INTERVAL 20 MINUTE));

INSERT INTO cloud_flow_db.sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
) VALUES
(91001, 100000, '年度运维合同.pdf', '/demo/workflow/payment/service-contract.pdf',
 'https://demo.cloudflow.local/files/payment/fk202603110001-contract.pdf', 'LOCAL', 1864022, 'application/pdf', 'wang', DATE_SUB(NOW(), INTERVAL 13 HOUR), '0', '付款合同存档'),
(91002, 100000, '访客接待物料清单.xlsx', '/demo/oa/visitor/reception-checklist.xlsx',
 'https://demo.cloudflow.local/files/visitor/reception-checklist.xlsx', 'LOCAL', 102400, 'application/xlsx', 'test_fe', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0', '访客接待物料准备清单'),
(91003, 100000, '客户演示议程.pdf', '/demo/workflow/trip/training-agenda.pdf',
 'https://demo.cloudflow.local/files/trip/cc202603110001-plan.pdf', 'LOCAL', 280600, 'application/pdf', 'zhang', DATE_SUB(NOW(), INTERVAL 9 HOUR), '0', '客户培训资料归档'),
(91004, 100000, '用车派车记录.docx', '/demo/workflow/vehicle/dispatch-note.docx',
 'https://demo.cloudflow.local/files/vehicle/dispatch-note.docx', 'LOCAL', 86530, 'application/docx', 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY), '0', '派车记录模板');

INSERT INTO cloud_flow_db.sys_log (
  log_id, tenant_id, log_type, title, service_id, remote_addr, user_agent, request_uri, method, params, time, exception, create_by, create_time
) VALUES
(91001, 100000, '0', '流程实例查询', 'cloudflow-workflow', '10.10.0.18',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/workflow/instance/list', 'GET', '{"status":"RUNNING","page":1}', 120, NULL, 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(91002, 100000, '9', '流程模板发布失败', 'cloudflow-workflow', '10.10.0.20',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/workflow/template/deploy', 'POST', '{"templateId":"demo_tpl_vehicle_001"}', 560, '模板校验未通过', 'admin', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(91003, 100000, '0', '用车申请列表查询', 'cloudflow-oa', '10.10.0.21',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/oa/vehicle/usage/list', 'GET', '{"status":"PENDING","page":1}', 95, NULL, 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(91004, 100000, '9', '值班安排保存失败', 'cloudflow-oa', '10.10.0.24',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
 '/api/oa/duty/schedule', 'POST', '{"scheduleId":9803}', 420, '数据库连接超时', 'chen', DATE_SUB(NOW(), INTERVAL 20 MINUTE));

INSERT INTO cloud_flow_db.sys_audit_log (
  audit_id, tenant_id, audit_name, audit_field, before_val, after_val, create_by, create_time
) VALUES
(91001, 100000, '流程模板变更', 'status', 'draft', 'published', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY)),
(91002, 100000, '值班安排变更', 'start_time', '09:00:00', '08:30:00', 'admin', DATE_SUB(NOW(), INTERVAL 9 DAY));

-- =========================================================
-- 三、业务申请表 + 工作流实例联动数据
-- =========================================================

-- -----------------------------
-- 3.1 报销申请
-- -----------------------------
INSERT INTO cloud_flow_db.biz_expense_claim (
  id, tenant_id, instance_id, user_id, user_name, claim_no, category, total_amount, description, status,
  dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_003', 5, '张三', 'BX202603110001', 'TRAVEL', 2680.50,
 '上海至杭州客户现场差旅报销，包含高铁、住宿、市内交通与餐补。',
 'PENDING', 101, '研发部', '0', 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR)),
(9002, 100000, 'demo_inst_004', 3, '王财务', 'BX202603110002', 'OFFICE', 860.00,
 '财务部采购档案盒、票据夹及打印耗材的部门报销。',
 'PAID', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 8 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 3 DAY));

INSERT INTO cloud_flow_db.biz_expense_item (
  id, tenant_id, claim_id, expense_type, amount, expense_date, description, receipt_url, vehicle_expense_id
) VALUES
(90011, 100000, 9001, 'TRANSPORT', 560.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '上海虹桥往返杭州东高铁票', 'https://demo.cloudflow.local/files/expense/bx9001-train.jpg', NULL),
(90012, 100000, 9001, 'HOTEL', 980.50, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '杭州客户附近酒店住宿一晚', 'https://demo.cloudflow.local/files/expense/bx9001-hotel.jpg', NULL),
(90013, 100000, 9001, 'MEAL', 260.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '出差期间餐补', 'https://demo.cloudflow.local/files/expense/bx9001-meal.jpg', NULL),
(90014, 100000, 9001, 'TRANSPORT', 880.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '杭州当地网约车与机场巴士', 'https://demo.cloudflow.local/files/expense/bx9001-taxi.jpg', NULL),
(90021, 100000, 9002, 'OFFICE', 320.00, DATE_SUB(CURDATE(), INTERVAL 9 DAY), '票据档案盒采购', 'https://demo.cloudflow.local/files/expense/bx9002-box.jpg', NULL),
(90022, 100000, 9002, 'OFFICE', 540.00, DATE_SUB(CURDATE(), INTERVAL 9 DAY), '打印耗材与财务标签纸', 'https://demo.cloudflow.local/files/expense/bx9002-print.jpg', NULL);

-- -----------------------------
-- 3.2 付款申请
-- -----------------------------
INSERT INTO cloud_flow_db.biz_payment_request (
  id, tenant_id, instance_id, user_id, user_name, payment_no, payee_name, payee_account, payee_bank, amount,
  payment_type, reason, expected_date, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_005', 3, '王财务', 'FK202603110001', '上海星河云服科技有限公司', '31050100012345678901', '建设银行上海分行', 128000.00,
 'SERVICE', '支付企业流程平台年度运维与驻场服务费（第一期）。', DATE_ADD(CURDATE(), INTERVAL 3 DAY),
 'https://demo.cloudflow.local/files/payment/fk202603110001-contract.pdf',
 'PENDING', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(9002, 100000, 'demo_inst_006', 3, '王财务', 'FK202603110002', '杭州云启科技有限公司', '6222020202020202020', '招商银行杭州分行', 32000.00,
 'PURCHASE', '支付客户演示中心升级所需显示设备采购尾款。', DATE_SUB(CURDATE(), INTERVAL 2 DAY),
 'https://demo.cloudflow.local/files/payment/fk202603110002-invoice.pdf',
 'PAID', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 10 DAY), 'wang', DATE_SUB(NOW(), INTERVAL 4 DAY));

-- -----------------------------
-- 3.3 出差申请
-- -----------------------------
INSERT INTO cloud_flow_db.biz_business_trip (
  id, tenant_id, instance_id, user_id, user_name, trip_no, departure, destination, start_date, end_date, trip_days,
  transport_type, estimated_cost, accommodation, contact_phone, emergency_contact, emergency_phone, project_name, companions,
  reason, itinerary, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9001, 100000, 'demo_inst_011', 5, '张三', 'CC202603110001', '上海', '杭州',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY), DATE_ADD(CURDATE(), INTERVAL 4 DAY), 3.0,
 'TRAIN', 3200.00, 'SELF', '15888880001', '李经理', '15888880002', '智慧园区二期项目', '["前端测试"]',
 '赴客户现场完成流程平台演示、用户培训与需求确认。',
 '[{"date":"第1天","plan":"到达客户现场并部署演示环境"},{"date":"第2天","plan":"开展培训与流程配置辅导"},{"date":"第3天","plan":"需求评审与返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202603110001-plan.pdf',
 'PENDING', 101, '研发部', '0', 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR), 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(9002, 100000, NULL, 4, '赵HR', 'CC202603110002', '上海', '南京',
 DATE_SUB(CURDATE(), INTERVAL 12 DAY), DATE_SUB(CURDATE(), INTERVAL 10 DAY), 3.0,
 'TRAIN', 2400.00, 'COMPANY', '15888880003', 'Admin', '15888880004', '校企合作拓展', '["Admin"]',
 '参加高校招聘双选会并洽谈校企合作。',
 '[{"date":"第1天","plan":"到达南京并布置展位"},{"date":"第2天","plan":"进行宣讲与面试"},{"date":"第3天","plan":"回访院系并返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202603110002-summary.pdf',
 'APPROVED', 103, '人力资源部', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 13 DAY), 'zhao', DATE_SUB(NOW(), INTERVAL 10 DAY));

-- -----------------------------
-- 3.4 用车审批业务（与工作流直接关联）
-- -----------------------------
-- 说明：sys_vehicle_usage.usage_id = 9001 已在上文插入，并绑定 process_instance_id = demo_inst_012

-- =========================================================
-- 四、工作流实例、任务、轨迹、通知、抄送、催办、附件等展示数据
-- =========================================================

-- -----------------------------
-- 4.1 流程实例
-- -----------------------------
DELETE FROM cloud_flow_db.wf_task_read
WHERE task_id LIKE 'demo_task_%';

DELETE FROM cloud_flow_db.wf_task_urge
WHERE task_id LIKE 'demo_task_%';

DELETE FROM cloud_flow_db.wf_task_attachment
WHERE attachment_id LIKE 'demo_att_%';

DELETE FROM cloud_flow_db.wf_task_candidate
WHERE task_id LIKE 'demo_task_%';

DELETE FROM cloud_flow_db.wf_task_delegation
WHERE delegation_id LIKE 'demo_delegate_%';

DELETE FROM cloud_flow_db.wf_task_add_sign
WHERE add_sign_id LIKE 'demo_addsign_%';

DELETE FROM cloud_flow_db.wf_countersign_vote
WHERE countersign_id LIKE 'demo_cs_%';

DELETE FROM cloud_flow_db.wf_countersign_task
WHERE countersign_id LIKE 'demo_cs_%';

DELETE FROM cloud_flow_db.wf_process_snapshot
WHERE snapshot_id LIKE 'demo_snap_%';

DELETE FROM cloud_flow_db.wf_node_record
WHERE instance_id LIKE 'demo_inst_%';

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id LIKE 'demo_msg_%';

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id LIKE 'demo_notice_%';

DELETE FROM cloud_flow_db.wf_urge_effect
WHERE task_id LIKE 'demo_task_%';

DELETE FROM cloud_flow_db.wf_process_copy
WHERE instance_id LIKE 'demo_inst_%';

DELETE FROM cloud_flow_db.wf_task_history
WHERE history_id LIKE 'demo_hist_%';

DELETE FROM cloud_flow_db.wf_task
WHERE task_id LIKE 'demo_task_%'
   OR instance_id LIKE 'demo_inst_%';

DELETE FROM cloud_flow_db.wf_process_instance
WHERE instance_id LIKE 'demo_inst_%';

INSERT INTO cloud_flow_db.wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key, title, start_user_id, start_user_name,
  status, start_time, end_time, variables, priority, process_no, dept_id, create_by, update_by, create_time, update_time,
  del_flag, parent_instance_id, parent_node_key
) VALUES
('demo_inst_003', 100000, 'biz_reimburse', 'wf_reimburse', 'EXPENSE_CLAIM:9001', '张三的杭州出差报销', 5, '张三',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 16 HOUR), NULL,
 JSON_OBJECT('claimNo','BX202603110001','amount',2680.50,'category','TRAVEL','deptName','研发部'),
 'HIGH', 'PROC-DEMO-20260311-003', 101, 'zhang', 'zhang', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), '0', NULL, NULL),

('demo_inst_004', 100000, 'biz_reimburse', 'wf_reimburse', 'EXPENSE_CLAIM:9002', '王财务的办公采购报销', 3, '王财务',
 'COMPLETED', DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY),
 JSON_OBJECT('claimNo','BX202603110002','amount',860.00,'category','OFFICE','deptName','财务部'),
 'NORMAL', 'PROC-DEMO-20260311-004', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), '0', NULL, NULL),

('demo_inst_005', 100000, 'biz_payment', 'wf_payment', 'PAYMENT_REQUEST:9001', '年度运维服务付款申请', 3, '王财务',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 14 HOUR), NULL,
 JSON_OBJECT('paymentNo','FK202603110001','amount',128000.00,'paymentType','SERVICE','deptName','财务部'),
 'URGENT', 'PROC-DEMO-20260311-005', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 30 MINUTE), '0', NULL, NULL),

('demo_inst_006', 100000, 'biz_payment', 'wf_payment', 'PAYMENT_REQUEST:9002', '显示设备采购尾款付款申请', 3, '王财务',
 'COMPLETED', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY),
 JSON_OBJECT('paymentNo','FK202603110002','amount',32000.00,'paymentType','PURCHASE','deptName','财务部'),
 'NORMAL', 'PROC-DEMO-20260311-006', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '0', NULL, NULL),

('demo_inst_011', 100000, 'business_trip', 'wf_business_trip', 'BUSINESS_TRIP:9001', '张三的杭州客户出差申请', 5, '张三',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL,
 JSON_OBJECT('tripNo','CC202603110001','destination','杭州','tripDays',3.0,'projectName','智慧园区二期项目'),
 'URGENT', 'PROC-DEMO-20260311-011', 101, 'zhang', 'zhang', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 40 MINUTE), '0', NULL, NULL),

('demo_inst_012', 100000, 'vehicle_approval', 'wf_vehicle_approval', 'VEHICLE_USAGE:9001', '李经理的客户拜访用车申请', 2, '李经理',
 'RUNNING', DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL,
 JSON_OBJECT('usageId',9001,'vehicleId',9001,'destination','浦东新区星河集团总部','passengerCount',4),
 'HIGH', 'PROC-DEMO-20260311-012', 101, 'li', 'li', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 20 MINUTE), '0', NULL, NULL);

-- -----------------------------
-- 4.2 当前待办任务
-- -----------------------------
INSERT INTO cloud_flow_db.wf_task (
  task_id, tenant_id, instance_id, node_key, node_name, assignee, assignee_name, proxy_user_id, candidate_roles,
  status, priority, is_timeout, create_time, due_time
) VALUES
('demo_task_002', 100000, 'demo_inst_003', 'b2', '财务总监审批', 3, '王财务', NULL, 'finance', 'TODO', 'HIGH', 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_ADD(NOW(), INTERVAL 6 HOUR)),
('demo_task_003', 100000, 'demo_inst_005', 'n1', '财务主管审批', 3, '王财务', NULL, 'finance', 'DONE', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 8 HOUR)),
('demo_task_004', 100000, 'demo_inst_005', 'b2', '总经理审批', 1, 'Admin', NULL, 'admin', 'TODO', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_ADD(NOW(), INTERVAL 10 HOUR)),
('demo_task_007', 100000, 'demo_inst_011', 'n1', '部门经理审批', 2, '李经理', NULL, 'manager', 'TODO', 'URGENT', 0, DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_ADD(NOW(), INTERVAL 20 HOUR)),
('demo_task_008', 100000, 'demo_inst_012', 'n1', '直属上级审批', 1, 'Admin', NULL, 'admin', 'TODO', 'HIGH', 0, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_ADD(NOW(), INTERVAL 12 HOUR)),
('demo_task_011', 100000, 'demo_inst_004', 'n1', '直属上级审批', 1, 'Admin', NULL, 'admin', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
('demo_task_012', 100000, 'demo_inst_004', 'b1', '财务主管审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY)),
('demo_task_013', 100000, 'demo_inst_006', 'n1', '财务主管审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_task_014', 100000, 'demo_inst_006', 'b1', '财务总监审批', 3, '王财务', NULL, 'finance', 'APPROVED', 'NORMAL', 0, DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

-- -----------------------------
-- 4.3 任务历史
-- -----------------------------
INSERT INTO cloud_flow_db.wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key, operator_id, operator_name, action, comment,
  duration_seconds, variables_changed, create_time
) VALUES
('demo_hist_003', 100000, 'demo_task_011', 'demo_inst_004', '直属上级审批', 'n1', 1, 'Admin', 'APPROVE', '采购事项合理，进入财务审核。', 2400,
 '{"approveNode":"leader"}', DATE_SUB(NOW(), INTERVAL 7 DAY)),
('demo_hist_004', 100000, 'demo_task_012', 'demo_inst_004', '财务主管审批', 'b1', 3, '王财务', 'APPROVE', '票据齐全，准予报销。', 3600,
 '{"status":"PAID"}', DATE_SUB(NOW(), INTERVAL 6 DAY)),

('demo_hist_005', 100000, 'demo_task_013', 'demo_inst_006', '财务主管审批', 'n1', 3, '王财务', 'APPROVE', '金额与合同一致，提交财务总监。', 2100,
 '{"amount":32000}', DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_hist_006', 100000, 'demo_task_014', 'demo_inst_006', '财务总监审批', 'b1', 3, '王财务', 'APPROVE', '尾款支付完成，已通知出纳。', 1800,
 '{"status":"PAID"}', DATE_SUB(NOW(), INTERVAL 6 DAY)),

('demo_hist_009', 100000, 'demo_task_003', 'demo_inst_005', '财务主管审批', 'n1', 3, '王财务', 'APPROVE', '预算已锁定，提交总经理终审。', 3200,
 '{"nextNode":"b2"}', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('demo_hist_011', 100000, 'demo_task_002', 'demo_inst_003', '提交报销', 'root', 5, '张三', 'SUBMIT', '已提交杭州客户拜访差旅报销。', 180,
 '{"claimNo":"BX202603110001","amount":2680.50}', DATE_SUB(NOW(), INTERVAL 16 HOUR)),
('demo_hist_012', 100000, 'demo_task_004', 'demo_inst_005', '提交付款申请', 'root', 3, '王财务', 'SUBMIT', '付款申请已发起。', 100,
 '{"paymentNo":"FK202603110001","amount":128000.00}', DATE_SUB(NOW(), INTERVAL 14 HOUR)),
('demo_hist_015', 100000, 'demo_task_007', 'demo_inst_011', '提交出差申请', 'root', 5, '张三', 'SUBMIT', '杭州客户出差申请已提交。', 120,
 '{"tripNo":"CC202603110001","destination":"杭州"}', DATE_SUB(NOW(), INTERVAL 11 HOUR)),
('demo_hist_016', 100000, 'demo_task_008', 'demo_inst_012', '提交用车申请', 'root', 2, '李经理', 'SUBMIT', '客户拜访用车申请已提交。', 90,
 '{"usageId":9001,"vehicleId":9001}', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('demo_hist_017', 100000, 'demo_task_002', 'demo_inst_003', '直属上级审批', 'n1', 2, '李经理', 'APPROVE', '差旅真实发生，票据已验真。', 2400,
 '{"amount":2680.50,"route":"财务总监审批"}', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('demo_hist_018', 100000, 'demo_task_004', 'demo_inst_005', '转办记录', 'b2', 1, 'Admin', 'DELEGATE', '总经理外出，先由本人稍后处理，保留原审批人。', 300,
 '{"delegate":"none"}', DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
('demo_hist_021', 100000, 'demo_task_007', 'demo_inst_011', '催办记录', 'n1', 5, '张三', 'URGE', '客户要求尽快确认出差安排。', 30,
 '{"urgeCount":1}', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
('demo_hist_022', 100000, 'demo_task_008', 'demo_inst_012', '催办记录', 'n1', 2, '李经理', 'URGE', '客户明日上午来访，请尽快审批派车。', 30,
 '{"urgeCount":1}', DATE_SUB(NOW(), INTERVAL 20 MINUTE));

-- -----------------------------
-- 4.4 任务已读、催办、附件、候选人、委托、加签
-- -----------------------------
INSERT INTO cloud_flow_db.wf_task_read (tenant_id, task_id, user_id, read_time) VALUES
(100000, 'demo_task_002', 3, DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
(100000, 'demo_task_004', 1, DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
(100000, 'demo_task_007', 2, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
(100000, 'demo_task_008', 1, DATE_SUB(NOW(), INTERVAL 15 MINUTE));

INSERT INTO cloud_flow_db.wf_task_urge (tenant_id, task_id, sender_id, recipient_id, reason, create_time) VALUES
(100000, 'demo_task_002', 5, 3, '报销需在本周财务结算前完成。', DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
(100000, 'demo_task_004', 3, 1, '年度服务费付款窗口临近。', DATE_SUB(NOW(), INTERVAL 35 MINUTE)),
(100000, 'demo_task_007', 5, 2, '客户已确认出差日程，请尽快审批。', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
(100000, 'demo_task_011', 3, 1, '历史报销流程演示时可展示催办记录。', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(100000, 'demo_task_014', 3, 3, '财务节点自催办测试数据。', DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO cloud_flow_db.wf_task_attachment (
  attachment_id, tenant_id, task_id, instance_id, file_name, file_path, file_size, file_type, upload_user_id, upload_time
) VALUES
('demo_att_001', 100000, 'demo_task_002', 'demo_inst_003', '杭州出差高铁票.jpg', '/demo/workflow/expense/train-ticket.jpg', 245781, 'image/jpeg', 5, DATE_SUB(NOW(), INTERVAL 15 HOUR)),
('demo_att_002', 100000, 'demo_task_002', 'demo_inst_003', '酒店发票.pdf', '/demo/workflow/expense/hotel-invoice.pdf', 538920, 'application/pdf', 5, DATE_SUB(NOW(), INTERVAL 15 HOUR)),
('demo_att_003', 100000, 'demo_task_004', 'demo_inst_005', '年度运维合同.pdf', '/demo/workflow/payment/service-contract.pdf', 1864022, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 13 HOUR)),
('demo_att_004', 100000, 'demo_task_004', 'demo_inst_005', '付款审批说明.docx', '/demo/workflow/payment/approval-note.docx', 86530, 'application/docx', 3, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
('demo_att_006', 100000, 'demo_task_007', 'demo_inst_011', '客户培训议程.pdf', '/demo/workflow/trip/training-agenda.pdf', 280600, 'application/pdf', 5, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('demo_att_007', 100000, 'demo_task_011', 'demo_inst_004', '采购报销清单.pdf', '/demo/workflow/history/office-expense-list.pdf', 221100, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 8 DAY)),
('demo_att_008', 100000, 'demo_task_014', 'demo_inst_006', '显示设备采购发票.pdf', '/demo/workflow/history/display-invoice.pdf', 401231, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 9 DAY));

INSERT INTO cloud_flow_db.wf_task_candidate (tenant_id, task_id, candidate_type, candidate_id, create_time) VALUES
(100000, 'demo_task_002', 'ROLE', 'finance', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_task_004', 'ROLE', 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'demo_task_011', 'ROLE', 'admin', DATE_SUB(NOW(), INTERVAL 8 DAY)),
(100000, 'demo_task_014', 'ROLE', 'finance', DATE_SUB(NOW(), INTERVAL 8 DAY));

INSERT INTO cloud_flow_db.wf_task_delegation (
  delegation_id, tenant_id, task_id, instance_id, from_user_id, from_user_name, to_user_id, to_user_name,
  delegation_type, reason, status, create_time
) VALUES
('demo_delegate_001', 100000, 'demo_task_004', 'demo_inst_005', 1, 'Admin', 1, 'Admin', 'DELEGATE', '模拟展示：高额付款进入终审节点后的委托记录。', 'ACTIVE', DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
('demo_delegate_002', 100000, 'demo_task_011', 'demo_inst_004', 1, 'Admin', 3, '王财务', 'TRANSFER', '历史案例：直属领导将资料核验转财务先补充。', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY));

INSERT INTO cloud_flow_db.wf_task_add_sign (
  add_sign_id, tenant_id, task_id, instance_id, sign_type, sign_user_ids, sign_user_names, initiator_id, initiator_name,
  reason, status, create_time, complete_time
) VALUES
('demo_addsign_001', 100000, 'demo_task_004', 'demo_inst_005', 'BEFORE', '6', '刘法务', 1, 'Admin',
 '高额服务付款需补充法务确认合同付款条件。', 'PENDING', DATE_SUB(NOW(), INTERVAL 30 MINUTE), NULL),
('demo_addsign_002', 100000, 'demo_task_011', 'demo_inst_004', 'AFTER', '1', 'Admin', 3, '王财务',
 '历史案例：报销完成后由管理层抽查确认。', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

-- -----------------------------
-- 4.5 会签任务与投票
-- -----------------------------
INSERT INTO cloud_flow_db.wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name, sign_type, pass_percent,
  total_count, voted_count, approve_count, reject_count, status, assignee_order, current_index, create_time, complete_time
) VALUES
('demo_cs_003', 100000, 'demo_inst_003', 'b2', '财务复核会签演示', 'ALL', 100, 2, 1, 1, 0, 'VOTING',
 '[3,6]', 1, DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL),
('demo_cs_011', 100000, 'demo_inst_011', 'n2', '出差备案会签演示', 'ANY', 50, 2, 2, 2, 0, 'COMPLETED',
 '[4,1]', 2, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 50 MINUTE));

INSERT INTO cloud_flow_db.wf_countersign_vote (
  vote_id, tenant_id, countersign_id, task_id, voter_id, voter_name, vote_result, comment, vote_time
) VALUES
('demo_vote_001', 100000, 'demo_cs_003', 'demo_task_002', 3, '王财务', 'APPROVE', '财务角度无异常。', DATE_SUB(NOW(), INTERVAL 50 MINUTE)),
('demo_vote_002', 100000, 'demo_cs_011', 'demo_task_007', 4, '赵HR', 'APPROVE', '出差计划合理，备案通过。', DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
('demo_vote_003', 100000, 'demo_cs_011', 'demo_task_007', 1, 'Admin', 'APPROVE', '同意安排客户培训与差旅。', DATE_SUB(NOW(), INTERVAL 50 MINUTE));

-- -----------------------------
-- 4.6 快照、节点轨迹、消息、通知、催办效果、抄送
-- -----------------------------
INSERT INTO cloud_flow_db.wf_process_snapshot (
  snapshot_id, tenant_id, instance_id, node_key, node_name, status, variables, active_tasks, create_time
) VALUES
('demo_snap_002', 100000, 'demo_inst_003', 'b2', '财务总监审批', 'RUNNING',
 '{"claimNo":"BX202603110001","amount":2680.5}',
 '[{"taskId":"demo_task_002","assigneeName":"王财务","status":"TODO","timeout":true}]', DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
('demo_snap_003', 100000, 'demo_inst_005', 'b2', '总经理审批', 'RUNNING',
 '{"paymentNo":"FK202603110001","amount":128000}',
 '[{"taskId":"demo_task_004","assigneeName":"Admin","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 10 MINUTE)),
('demo_snap_004', 100000, 'demo_inst_011', 'n1', '部门经理审批', 'RUNNING',
 '{"tripNo":"CC202603110001","destination":"杭州","tripDays":3}',
 '[{"taskId":"demo_task_007","assigneeName":"李经理","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 5 MINUTE));

INSERT INTO cloud_flow_db.wf_node_record (
  tenant_id, instance_id, process_def_key, node_key, node_name, node_type, status, executor_id, executor_name,
  start_time, end_time, duration_ms, extra_data, event_type, event_time, create_time
) VALUES
(100000, 'demo_inst_003', 'biz_reimburse', 'root', '提交报销', 'START', 'COMPLETED', 5, '张三',
 DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 16 HOUR) + INTERVAL 3 MINUTE, 180000, '{"amount":2680.5}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 16 HOUR)),
(100000, 'demo_inst_003', 'biz_reimburse', 'n1', '直属上级审批', 'APPROVAL', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), 3600000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR)),
(100000, 'demo_inst_003', 'biz_reimburse', 'b2', '财务总监审批', 'APPROVAL', 'RUNNING', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, NULL, '{"timeout":true}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'root', '提交付款申请', 'START', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR) + INTERVAL 2 MINUTE, 120000, '{"amount":128000}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'n1', '财务主管审批', 'APPROVAL', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 14 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), 43200000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', 'b2', '总经理审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, NULL, '{"addSign":"demo_addsign_001"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'demo_inst_011', 'business_trip', 'root', '提交出差申请', 'START', 'COMPLETED', 5, '张三',
 DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR) + INTERVAL 2 MINUTE, 120000, '{"destination":"杭州"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(100000, 'demo_inst_011', 'business_trip', 'n1', '部门经理审批', 'APPROVAL', 'RUNNING', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL, NULL, '{"urgeCount":1}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', 'root', '提交用车申请', 'START', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR) + INTERVAL 1 MINUTE, 60000, '{"vehicleId":9001}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', 'n1', '直属上级审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, NULL, '{"passengerCount":4}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR));

INSERT INTO cloud_flow_db.wf_transaction_message (
  message_id, tenant_id, business_type, business_id, content, status, retry_count, max_retry_count, next_retry_time, create_time, update_time, error_message
) VALUES
('demo_msg_002', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_003', '报销申请进入财务总监审批节点。', 'PENDING', 1, 5, DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 20 MINUTE), '短信通道短暂超时'),
('demo_msg_003', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_005', '高额付款申请等待总经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL),
('demo_msg_004', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_011', '出差申请等待部门经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 11 HOUR), DATE_SUB(NOW(), INTERVAL 11 HOUR), NULL),
('demo_msg_005', 100000, 'WORKFLOW_NOTIFY', 'demo_inst_012', '用车申请已提交，等待直属上级审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL);

INSERT INTO cloud_flow_db.wf_notification_log (
  log_id, tenant_id, notification_type, recipient_id, recipient_name, title, content, send_status, send_time, error_message,
  related_type, related_id, create_time
) VALUES
('demo_notice_002', 100000, 'INTERNAL', 3, '王财务', '待审批：张三的杭州出差报销', '报销金额 2680.50 元，已进入财务审批节点。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL, 'PROCESS_INSTANCE', 'demo_inst_003', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('demo_notice_003', 100000, 'SMS', 1, 'Admin', '待审批：年度运维服务付款申请', '付款金额 128000 元，请尽快完成总经理审批。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL, 'PROCESS_INSTANCE', 'demo_inst_005', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('demo_notice_004', 100000, 'INTERNAL', 2, '李经理', '待审批：杭州客户出差申请', '张三提交了杭州客户培训出差申请。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, 'PROCESS_INSTANCE', 'demo_inst_011', DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('demo_notice_005', 100000, 'EMAIL', 1, 'Admin', '待审批：客户拜访用车申请', '请审批明日客户拜访派车申请。', 'PENDING', NULL, NULL, 'PROCESS_INSTANCE', 'demo_inst_012', DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO cloud_flow_db.wf_urge_effect (
  tenant_id, task_id, urge_count, first_urge_time, last_urge_time, task_complete_time, response_seconds
) VALUES
(100000, 'demo_task_002', 1, DATE_SUB(NOW(), INTERVAL 55 MINUTE), DATE_SUB(NOW(), INTERVAL 55 MINUTE), NULL, 3300),
(100000, 'demo_task_004', 1, DATE_SUB(NOW(), INTERVAL 35 MINUTE), DATE_SUB(NOW(), INTERVAL 35 MINUTE), NULL, 2100),
(100000, 'demo_task_007', 1, DATE_SUB(NOW(), INTERVAL 40 MINUTE), DATE_SUB(NOW(), INTERVAL 40 MINUTE), NULL, 2400),
(100000, 'demo_task_011', 1, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 86400),
(100000, 'demo_task_014', 1, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 3600);

INSERT INTO cloud_flow_db.wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name, start_user_id, start_user_name, user_id,
  form_data, is_read, read_time, create_time
) VALUES
(100000, 'demo_inst_003', 'biz_reimburse', '张三的杭州出差报销', 'b2', '财务总监审批', 5, '张三', 2,
 '{"claimNo":"BX202603110001","amount":2680.50}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'demo_inst_005', 'biz_payment', '年度运维服务付款申请', 'b2', '总经理审批', 3, '王财务', 6,
 '{"paymentNo":"FK202603110001","amount":128000.00}', 0, NULL, DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
(100000, 'demo_inst_011', 'business_trip', '张三的杭州客户出差申请', 'n1', '部门经理审批', 5, '张三', 4,
 '{"tripNo":"CC202603110001","destination":"杭州","tripDays":3}', 1, DATE_SUB(NOW(), INTERVAL 45 MINUTE), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'demo_inst_012', 'vehicle_approval', '李经理的客户拜访用车申请', 'n1', '直属上级审批', 2, '李经理', 7,
 '{"usageId":9001,"vehicleId":9001,"destination":"浦东新区星河集团总部"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR));

INSERT INTO cloud_flow_db.wf_notification_config (
  config_id, tenant_id, config_name, event_type, notify_channel, template_id, recipient_type, recipient_value, enabled, create_time, update_time
) VALUES
('demo_notify_001', 100000, '待办生成通知', 'TASK_CREATED', 'INTERNAL', NULL, 'ROLE', 'manager', 1, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),
('demo_notify_002', 100000, '任务超时提醒', 'TASK_TIMEOUT', 'SMS', NULL, 'USER', '1', 1, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO cloud_flow_db.wf_deploy_record (
  id, tenant_id, process_def_id, process_key, version, deploy_status, deploy_by, deployer_name, deploy_time,
  deploy_note, change_log, can_rollback, rollback_from_version, rollback_reason, rollback_by, rollback_time,
  approval_id, deploy_window_id, impact_analysis, created_time, updated_time
) VALUES
(98001, 100000, 'wf_reimburse', 'biz_reimburse', 3, 'SUCCESS', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 20 DAY),
 '发布财务报销流程V3', '新增金额条件分支与加签节点', 1, NULL, NULL, NULL, NULL,
 NULL, NULL, '影响历史实例0条', DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 20 DAY)),
(98002, 100000, 'wf_reimburse', 'biz_reimburse', 2, 'SUCCESS', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 15 DAY),
 '回滚至V2', '回滚原因：条件分支误配置', 0, 3, 'V3条件判断错误', 1, DATE_SUB(NOW(), INTERVAL 15 DAY),
 NULL, NULL, '回滚影响待办2条', DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO cloud_flow_db.wf_deploy_rollback_history (
  id, tenant_id, original_deploy_id, rollback_deploy_id, process_def_id, from_version, to_version, rollback_type,
  rollback_status, rollback_reason, rollback_by, rollback_by_name, rollback_time, success, error_message
) VALUES
(98001, 100000, 98001, 98002, 'wf_reimburse', 3, 2, 'MANUAL', 'SUCCESS',
 '条件分支判断误配，回滚修复', 1, 'Admin', DATE_SUB(NOW(), INTERVAL 15 DAY), 1, NULL);

INSERT INTO cloud_flow_db.wf_deploy_impact (
  id, tenant_id, deploy_id, impact_type, impact_level, impact_count, impact_detail, mitigation_plan, create_time
) VALUES
(98001, 100000, 98001, 'TASK', 'MEDIUM', 12, '影响进行中报销任务 12 条', '通过批量通知提示重新提交审批', DATE_SUB(NOW(), INTERVAL 19 DAY)),
(98002, 100000, 98002, 'PROCESS', 'LOW', 2, '回滚后重新触发流程实例 2 条', '运维窗口内执行，已通知业务方', DATE_SUB(NOW(), INTERVAL 15 DAY));

INSERT INTO cloud_flow_db.workflow_template (
  id, name, description, category_id, tags, definition, preview_image, created_by, created_at, updated_at, usage_count, is_system, status, tenant_id
) VALUES
('demo_tpl_vehicle_001', '用车申请简化模板', '适用于短途接待用车的简化流程', 'cat-office',
 '["用车","行政","简化"]',
 '{"nodes":[{"id":"start","type":"START","title":"提交用车"},{"id":"approve","type":"APPROVAL","title":"直属上级审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"结束"}],"edges":[{"id":"start->approve","source":"start","target":"approve"},{"id":"approve->end","source":"approve","target":"end"}]}',
 '/demo/workflow/template/vehicle-simple.png', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 18, 0, 'active', 100000);

INSERT INTO cloud_flow_db.workflow_version (
  id, workflow_id, version_number, definition, change_log, change_type, created_by, created_at, is_rollback, rollback_from_version, checksum, tenant_id
) VALUES
('demo_tpl_vehicle_001_v1', 'demo_tpl_vehicle_001', 'v1',
 '{"nodes":[{"id":"start","type":"START","title":"提交用车"},{"id":"approve","type":"APPROVAL","title":"直属上级审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"结束"}],"edges":[{"id":"start->approve","source":"start","target":"approve"},{"id":"approve->end","source":"approve","target":"end"}]}',
 '初始版本', 'CREATE', 'admin', DATE_SUB(NOW(), INTERVAL 12 DAY), 0, NULL, '9f86d081884c7d659a2feaa0c55ad015', 100000);

INSERT INTO cloud_flow_db.workflow_archive (
  id, workflow_id, workflow_name, archived_by, archived_at, archive_reason, can_restore, original_data, tenant_id
) VALUES
('demo_archive_001', 'tpl-purchase-001', '采购申请', 'admin', DATE_SUB(NOW(), INTERVAL 90 DAY), '模板迁移至新版本库', 1,
 '{"status":"archived","movedTo":"demo_tpl_vehicle_001","note":"保留历史记录"}', 100000);

INSERT INTO cloud_flow_db.wf_audit_log (
  id, operation_type, target_type, target_id, target_name, operator_id, operator_name, operation_time, operation_reason,
  operation_details, operation_result, error_message, ip_address, user_agent, tenant_id
) VALUES
('demo_audit_001', 'DEPLOY', 'workflow_template', 'demo_tpl_vehicle_001', '用车申请简化模板', '1', 'Admin', DATE_SUB(NOW(), INTERVAL 12 DAY),
 '演示环境模板发布', '发布模板并生成初始版本', 'SUCCESS', NULL, '10.10.0.18',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36', 100000);

-- =========================================================
-- 五、补充系统消息（sys_notice）
-- =========================================================
INSERT INTO cloud_flow_db.sys_notice (
  tenant_id, notice_title, notice_type, notice_content, sender_id, recipient_id, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(100000, '流程待办提醒', '1', '您有一条待审批的高优先级付款申请，请尽快处理。', 1, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 30 MINUTE), 'admin', DATE_SUB(NOW(), INTERVAL 30 MINUTE), '演示数据-付款审批提醒'),
(100000, '报销审批提醒', '1', '张三提交的差旅报销已进入财务审批节点。', 5, 3, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 50 MINUTE), 'zhang', DATE_SUB(NOW(), INTERVAL 50 MINUTE), '演示数据-报销审批'),
(100000, '出差申请提醒', '1', '张三的杭州客户出差申请等待部门经理审批。', 5, 2, '0', 'zhang', DATE_SUB(NOW(), INTERVAL 40 MINUTE), 'zhang', DATE_SUB(NOW(), INTERVAL 40 MINUTE), '演示数据-出差审批'),
(100000, '用车申请提醒', '1', '明日客户拜访派车申请已提交，请确认。', 2, 1, '0', 'li', DATE_SUB(NOW(), INTERVAL 20 MINUTE), 'li', DATE_SUB(NOW(), INTERVAL 20 MINUTE), '演示数据-用车审批');

INSERT INTO cloud_flow_db.sys_log (
  log_id, tenant_id, log_type, title, service_id, remote_addr, user_agent, request_uri, method, params, time, exception, create_by, create_time
)
SELECT
  92000 + n,
  100000,
  CASE WHEN n % 10 = 0 THEN '9' ELSE '0' END,
  CONCAT('批量演示日志', n),
  'cloudflow-oa',
  CONCAT('10.10.1.', LPAD(n % 200, 2, '0')),
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
  '/api/demo/batch',
  'GET',
  CONCAT('{"page":', n, ',"size":20}'),
  50 + (n % 200),
  CASE WHEN n % 10 = 0 THEN '批量异常示例' ELSE NULL END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO cloud_flow_db.sys_audit_log (
  audit_id, tenant_id, audit_name, audit_field, before_val, after_val, create_by, create_time
)
SELECT
  92000 + n,
  100000,
  '批量审计记录',
  'status',
  'draft',
  CASE WHEN n % 2 = 0 THEN 'published' ELSE 'archived' END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO cloud_flow_db.sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
)
SELECT
  92000 + n,
  100000,
  CONCAT('批量文件_', n, CASE WHEN n % 3 = 0 THEN '.jpg' WHEN n % 3 = 1 THEN '.pdf' ELSE '.xlsx' END),
  CONCAT('/demo/batch/file-', n),
  CONCAT('https://demo.cloudflow.local/files/batch/file-', n),
  'LOCAL',
  1024 + n,
  CASE WHEN n % 3 = 0 THEN 'image/jpeg' WHEN n % 3 = 1 THEN 'application/pdf' ELSE 'application/xlsx' END,
  'admin',
  DATE_SUB(NOW(), INTERVAL n MINUTE),
  '0',
  '批量演示文件'
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT INTO cloud_flow_db.sys_frontend_error_log (
  id, tenant_id, message, stack, component_stack, context, url, user_agent, level, tags, extra, client_ip,
  user_id, user_name, client_time, create_time
)
SELECT
  99200 + n,
  100000,
  CONCAT('批量错误日志', n),
  'AxiosError: timeout of 5000ms exceeded',
  'at DemoPage (src/pages/DemoPage.tsx:88)\nat App',
  '批量演示错误上报',
  '/demo',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36',
  CASE WHEN n % 3 = 0 THEN 'error' WHEN n % 3 = 1 THEN 'warning' ELSE 'info' END,
  JSON_OBJECT('module','demo','page','DemoPage','env','demo'),
  JSON_OBJECT('batch',1,'index',n),
  CONCAT('10.10.2.', LPAD(n % 200, 2, '0')),
  (n % 9) + 1,
  CASE (n % 9) WHEN 0 THEN 'Admin' WHEN 1 THEN '李经理' WHEN 2 THEN '王财务' WHEN 3 THEN '赵HR' WHEN 4 THEN '张三' WHEN 5 THEN '刘法务' WHEN 6 THEN '陈IT' WHEN 7 THEN '前端测试' ELSE '后端测试' END,
  DATE_SUB(NOW(), INTERVAL n MINUTE),
  DATE_SUB(NOW(), INTERVAL n MINUTE)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

INSERT IGNORE INTO cloud_flow_db.sys_announcement_read (tenant_id, announcement_id, user_id, read_time)
SELECT
  100000,
  9601 + (n % 5),
  (n % 9) + 1,
  DATE_SUB(NOW(), INTERVAL (n % 20) HOUR)
FROM (
  SELECT (a.n * 100 + b.n * 10 + c.n) + 1 AS n
  FROM (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) a
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) b
  CROSS JOIN (SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3 UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6 UNION ALL SELECT 7 UNION ALL SELECT 8 UNION ALL SELECT 9) c
  WHERE (a.n * 100 + b.n * 10 + c.n) < 300
) seq;

-- =========================================================
-- 五、补充业务联动种子数据（原 06 增补）
-- =========================================================

-- =========================================================
-- 一、清理本脚本对应的补充数据，便于重复执行
-- =========================================================

DELETE FROM cloud_flow_db.wf_task_read
WHERE task_id IN (
  'seed_task_expense_ops_001',
  'seed_task_payment_ops_001',
  'seed_task_hr_att_001',
  'seed_task_hr_leave_001',
  'seed_task_hr_prob_001',
  'seed_task_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_task_urge
WHERE task_id IN (
  'seed_task_expense_ops_001',
  'seed_task_payment_ops_001',
  'seed_task_hr_leave_001',
  'seed_task_hr_prob_001',
  'seed_task_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_task_attachment
WHERE task_id IN (
  'seed_task_expense_ops_001',
  'seed_task_payment_ops_001',
  'seed_task_hr_leave_001',
  'seed_task_hr_prob_001',
  'seed_task_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_urge_effect
WHERE task_id IN (
  'seed_task_expense_ops_001',
  'seed_task_payment_ops_001',
  'seed_task_hr_leave_001',
  'seed_task_hr_prob_001',
  'seed_task_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_process_snapshot
WHERE instance_id IN (
  'seed_inst_expense_ops_001',
  'seed_inst_payment_ops_001',
  'seed_hr_inst_att_001',
  'seed_hr_inst_leave_001',
  'seed_hr_inst_prob_001',
  'seed_hr_inst_salary_001'
);

DELETE FROM cloud_flow_db.wf_node_record
WHERE instance_id IN (
  'seed_inst_trip_ops_001',
  'seed_inst_vehicle_ops_001',
  'seed_inst_expense_ops_001',
  'seed_inst_payment_ops_001',
  'seed_hr_inst_recruit_001',
  'seed_hr_inst_offer_001',
  'seed_hr_inst_onboard_001',
  'seed_hr_inst_att_001',
  'seed_hr_inst_leave_001',
  'seed_hr_inst_ot_001',
  'seed_hr_inst_prob_001',
  'seed_hr_inst_salary_001'
);

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id IN (
  'seed_notice_expense_ops_001',
  'seed_notice_payment_ops_001',
  'seed_notice_hr_att_001',
  'seed_notice_hr_leave_001',
  'seed_notice_hr_prob_001',
  'seed_notice_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id IN (
  'seed_msg_expense_ops_001',
  'seed_msg_payment_ops_001',
  'seed_msg_hr_att_001',
  'seed_msg_hr_leave_001',
  'seed_msg_hr_prob_001',
  'seed_msg_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_process_copy
WHERE instance_id IN (
  'seed_inst_trip_ops_001',
  'seed_inst_expense_ops_001',
  'seed_inst_payment_ops_001',
  'seed_hr_inst_onboard_001',
  'seed_hr_inst_leave_001',
  'seed_hr_inst_prob_001',
  'seed_hr_inst_salary_001'
);

DELETE FROM cloud_flow_db.wf_task_history
WHERE instance_id IN (
  'seed_inst_trip_ops_001',
  'seed_inst_vehicle_ops_001',
  'seed_inst_expense_ops_001',
  'seed_inst_payment_ops_001',
  'seed_hr_inst_recruit_001',
  'seed_hr_inst_offer_001',
  'seed_hr_inst_onboard_001',
  'seed_hr_inst_att_001',
  'seed_hr_inst_leave_001',
  'seed_hr_inst_ot_001',
  'seed_hr_inst_prob_001',
  'seed_hr_inst_salary_001'
);

DELETE FROM cloud_flow_db.wf_task
WHERE task_id IN (
  'seed_task_expense_ops_001',
  'seed_task_payment_ops_001',
  'seed_task_hr_att_001',
  'seed_task_hr_leave_001',
  'seed_task_hr_prob_001',
  'seed_task_hr_salary_001'
);

DELETE FROM cloud_flow_db.wf_process_instance
WHERE instance_id IN (
  'seed_inst_trip_ops_001',
  'seed_inst_vehicle_ops_001',
  'seed_inst_expense_ops_001',
  'seed_inst_payment_ops_001',
  'seed_hr_inst_recruit_001',
  'seed_hr_inst_offer_001',
  'seed_hr_inst_onboard_001',
  'seed_hr_inst_att_001',
  'seed_hr_inst_leave_001',
  'seed_hr_inst_ot_001',
  'seed_hr_inst_prob_001',
  'seed_hr_inst_salary_001'
);

DELETE FROM cloud_flow_db.sys_notice
WHERE remark IN (
  '补充种子-上线报销审批提醒',
  '补充种子-上线付款审批提醒',
  '补充种子-补卡审批提醒',
  '补充种子-调休审批提醒',
  '补充种子-转正审批提醒',
  '补充种子-调薪审批提醒'
);

DELETE FROM cloud_flow_db.sys_announcement_read
WHERE announcement_id IN (9611);

DELETE FROM cloud_flow_db.sys_announcement
WHERE announcement_id IN (9611);

DELETE FROM cloud_flow_db.sys_schedule_event
WHERE event_id IN (9511, 9512);

DELETE FROM cloud_flow_db.sys_work_task
WHERE task_id IN (9421, 9422, 9423, 9424);

DELETE FROM cloud_flow_db.sys_vehicle_expense
WHERE expense_id IN (9011, 9012);

DELETE FROM cloud_flow_db.sys_vehicle_usage
WHERE usage_id IN (9011);

DELETE FROM cloud_flow_db.sys_visitor
WHERE visitor_id IN (9711, 9712);

DELETE FROM cloud_flow_db.sys_duty_schedule
WHERE schedule_id IN (9811, 9812);

DELETE FROM cloud_flow_db.biz_expense_item
WHERE id IN (901111, 901112, 901113, 901114);

DELETE FROM cloud_flow_db.biz_expense_claim
WHERE id IN (9011);

DELETE FROM cloud_flow_db.biz_payment_request
WHERE id IN (9011);

DELETE FROM cloud_flow_db.biz_business_trip
WHERE id IN (9011);

DELETE FROM cloud_flow_db.hr_employee_contract
WHERE id IN (101);

DELETE FROM cloud_flow_db.hr_employee_document
WHERE id IN (101, 102);

DELETE FROM cloud_flow_db.hr_emergency_contact
WHERE id IN (101);

DELETE FROM cloud_flow_db.hr_salary_adjustment
WHERE id IN (101);

DELETE FROM cloud_flow_db.hr_employee_salary
WHERE id IN (102, 103);

DELETE FROM cloud_flow_db.hr_employee_insurance
WHERE id IN (101, 102);

DELETE FROM cloud_flow_db.hr_employee_tax_deduction
WHERE id IN (102, 103);

DELETE FROM cloud_flow_db.hr_probation_confirmation
WHERE id IN (6011);

DELETE FROM cloud_flow_db.hr_onboarding_task
WHERE id IN (5111, 5112, 5113, 5114);

DELETE FROM cloud_flow_db.hr_onboarding_application
WHERE id IN (5011);

DELETE FROM cloud_flow_db.hr_offer
WHERE id IN (101);

DELETE FROM cloud_flow_db.hr_interview
WHERE id IN (4011, 4012);

DELETE FROM cloud_flow_db.hr_candidate
WHERE id IN (3011);

DELETE FROM cloud_flow_db.hr_recruitment_request
WHERE id IN (2011);

DELETE FROM cloud_flow_db.hr_attendance_monthly
WHERE id IN (12011);

DELETE FROM cloud_flow_db.hr_leave_application
WHERE id IN (9003);

DELETE FROM cloud_flow_db.hr_overtime_application
WHERE id IN (9003);

DELETE FROM cloud_flow_db.hr_attendance_record
WHERE id IN (9311);

DELETE FROM cloud_flow_db.hr_employee
WHERE id IN (1009);

-- =========================================================
-- 二、客户上线保障周：公告、日程、任务、访客、值班
-- =========================================================

INSERT INTO cloud_flow_db.sys_announcement (
  announcement_id, tenant_id, title, content, type, scope_type, scope_value, status, priority, is_top,
  sender_id, publish_time, expire_time, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9611, 100000, '苏州智造项目上线保障周安排',
 '<p><strong>保障时间：</strong>本周三至周日</p><p>研发、IT、HR 需配合完成上线值班、客户接待、出差支持与费用归档，所有现场问题统一在项目群内同步。</p>',
 '2', 'ALL', NULL, '1', 'H', 1, 1, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 10 DAY),
 'admin', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0');

INSERT INTO cloud_flow_db.sys_announcement_read (tenant_id, announcement_id, user_id, read_time) VALUES
(100000, 9611, 2, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 9611, 4, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 9611, 7, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 9611, 8, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 9611, 9, DATE_SUB(NOW(), INTERVAL 90 MINUTE));

INSERT INTO cloud_flow_db.sys_schedule_event (
  event_id, tenant_id, title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time, update_time, del_flag
) VALUES
(9511, 100000, '苏州智造上线复盘与待办确认会',
 '确认现场遗留问题、差旅报销归档与周末值班安排。', DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 14 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 16 HOUR, 0, 'MEETING', 9003, 2, '[2,7,8,9]', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), '0'),
(9512, 100000, '林清禾试用期评审会',
 '汇总试用期目标完成情况、项目交付表现与转正建议。', DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 10 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 11 HOUR + INTERVAL 30 MINUTE, 0, 'MEETING', 9001, 4, '[1,2,4]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), '0');

INSERT INTO cloud_flow_db.sys_work_task (
  task_id, tenant_id, title, description, assignee_id, owner_id, dept_id, priority, status, due_date, tags, parent_id,
  create_by, create_time, update_by, update_time, del_flag
) VALUES
(9421, 100000, '复核苏州上线脚本与回滚清单',
 '确认数据库增量脚本、参数变更和回滚步骤均已在演示环境验证。', 9, 2, 107, 2, 'DOING',
 DATE_ADD(NOW(), INTERVAL 18 HOUR), '["上线","脚本","后端"]', NULL, 'li', DATE_SUB(NOW(), INTERVAL 10 HOUR), 'test_be', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9422, 100000, '整理客户培训课件终版',
 '补充苏州智造项目的权限配置、审批轨迹和移动端演示截图。', 8, 2, 106, 2, 'TODO',
 DATE_ADD(NOW(), INTERVAL 20 HOUR), '["培训","课件","前端"]', NULL, 'li', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9423, 100000, '确认上线周末值班与告警联系人',
 '同步值班手机号、系统权限和应急回滚联系人名单。', 7, 1, 105, 1, 'TODO',
 DATE_ADD(NOW(), INTERVAL 1 DAY), '["值班","告警","IT"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9424, 100000, '归档林清禾转正评审材料',
 '整理试用期目标、导师反馈、项目交付记录与评审会议纪要。', 4, 1, 103, 1, 'DOING',
 DATE_ADD(NOW(), INTERVAL 2 DAY), '["转正","归档","HR"]', NULL, 'admin', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 90 MINUTE), '0');

INSERT INTO cloud_flow_db.sys_visitor (
  visitor_id, tenant_id, visitor_name, visitor_phone, visitor_company, visitor_count, id_card, visit_reason,
  host_id, host_name, host_dept, visit_date, visit_time_start, visit_time_end, actual_arrive, actual_leave,
  visit_area, car_plate, belongings, photo_url, pass_code, status, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9711, 100000, '顾伟东', '13988880111', '苏州智造股份有限公司', 2, '320***********1234',
 '参加项目上线复盘并确认二期优化范围。', 2, '李经理', '研发部', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '13:30:00', '17:30:00',
 NULL, NULL, '6楼战略会议室,客户演示中心', '苏E-CF521', '笔记本电脑,项目资料', 'https://demo.cloudflow.local/files/visitor/guweidong.jpg',
 'PASS-SUZHOU-001', 'CONFIRMED', '需预留地库临停车位。', '0', 'zhao', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9712, 100000, '周承安', '13988880112', '苏州智造股份有限公司', 1, '320***********5678',
 '现场交接上线问题清单并完成系统验收。', 7, '陈IT', 'IT部', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '09:30:00', '12:00:00',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 28 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 46 MINUTE,
 '1楼展厅,机房', NULL, '验收资料袋', 'https://demo.cloudflow.local/files/visitor/zhouchengan.jpg',
 'PASS-SUZHOU-002', 'COMPLETED', '已完成现场交接。', '0', 'chen', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 24 HOUR));

INSERT INTO cloud_flow_db.sys_duty_schedule (
  schedule_id, tenant_id, title, schedule_type, duty_date, shift_type, start_time, end_time,
  user_id, user_name, backup_user_id, backup_user_name, dept_id, dept_name, location,
  duty_content, check_in_time, check_out_time, status, swap_reason, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9811, 100000, '苏州智造上线夜间值班', 'EMERGENCY', CURDATE(), 'NIGHT', '19:00:00', '23:30:00',
 7, '陈IT', 9, '后端测试', 105, 'IT部', '总部运维室',
 '负责客户专线、部署服务与夜间告警处置。', CURDATE() + INTERVAL 19 HOUR + INTERVAL 5 MINUTE, NULL, 'CHECKED_IN', NULL,
 '已完成值班群与告警渠道确认。', '0', 'admin', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
(9812, 100000, '苏州智造周末发布值班', 'HOLIDAY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'FULL', '09:00:00', '18:00:00',
  9, '后端测试', 7, '陈IT', 107, '后端组', '总部机房',
  '负责周末修复包发布、数据库备份与回滚演练。', NULL, NULL, 'SCHEDULED', NULL,
  '需与研发经理确认最终发布时间。', '0', 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR));

-- =========================================================
-- 三、客户上线保障周：用车、出差、报销、付款
-- =========================================================

INSERT INTO cloud_flow_db.sys_vehicle_usage (
  usage_id, tenant_id, vehicle_id, applicant_id, driver_id, start_time, end_time, destination, return_location, is_round_trip, reason,
  passenger_count, passengers, start_mileage, end_mileage, actual_start_time, actual_end_time, attachment_url, status, process_instance_id,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9011, 100000, 9002, 4, 7,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 8 HOUR + INTERVAL 30 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 12 HOUR,
 '虹桥高铁站-CloudFlow总部', '总部地库 B 区', 1, '接待苏州智造验收负责人来司参与上线复盘与系统验收。',
 3, '赵HR,李经理,周承安', 15210.00, 15256.00,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 8 HOUR + INTERVAL 35 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 50 MINUTE,
 'https://demo.cloudflow.local/files/vehicle/usage-9011-summary.pdf', '4', 'seed_inst_vehicle_ops_001',
 '0', 'zhao', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'chen', DATE_SUB(NOW(), INTERVAL 24 HOUR));

INSERT INTO cloud_flow_db.sys_vehicle_expense (
  expense_id, tenant_id, vehicle_id, usage_id, expense_type, amount, expense_date, description, receipt_url, create_by, create_time
) VALUES
(9011, 100000, 9002, 9011, '3', 48.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '虹桥站停车费', 'https://demo.cloudflow.local/files/vehicle/expense-9011-parking.jpg', 'chen', DATE_SUB(NOW(), INTERVAL 24 HOUR)),
(9012, 100000, 9002, 9011, '2', 36.00, DATE_SUB(CURDATE(), INTERVAL 1 DAY), '高架通行费', 'https://demo.cloudflow.local/files/vehicle/expense-9012-toll.jpg', 'chen', DATE_SUB(NOW(), INTERVAL 24 HOUR));

INSERT INTO cloud_flow_db.biz_business_trip (
  id, tenant_id, instance_id, user_id, user_name, trip_no, departure, destination, start_date, end_date, trip_days,
  transport_type, estimated_cost, accommodation, contact_phone, emergency_contact, emergency_phone, project_name, companions,
  reason, itinerary, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9011, 100000, 'seed_inst_trip_ops_001', 8, '前端测试', 'CC202604070011', '上海', '苏州',
 DATE_SUB(CURDATE(), INTERVAL 5 DAY), DATE_SUB(CURDATE(), INTERVAL 3 DAY), 3.0,
 'TRAIN', 5200.00, 'SELF', '13800010002', '李经理', '13800010020', '苏州智造流程上线项目', '["后端测试"]',
 '赴客户现场支持流程上线、培训管理员并完成问题清单收敛。',
 '[{"date":"第1天","plan":"部署演示环境并校验角色权限"},{"date":"第2天","plan":"组织培训并陪同验收"},{"date":"第3天","plan":"输出问题清单与返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202604070011-plan.pdf',
 'APPROVED', 106, '前端组', '0', 'test_fe', DATE_SUB(NOW(), INTERVAL 6 DAY), 'test_fe', DATE_SUB(NOW(), INTERVAL 5 DAY));

INSERT INTO cloud_flow_db.biz_expense_claim (
  id, tenant_id, instance_id, user_id, user_name, claim_no, category, total_amount, description, status,
  dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9011, 100000, 'seed_inst_expense_ops_001', 8, '前端测试', 'BX202604070011', 'TRAVEL', 4860.00,
 '苏州智造上线支持差旅报销，包含往返高铁、住宿、餐补与现场交通。',
 'PENDING', 106, '前端组', '0', 'test_fe', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 30 HOUR));

INSERT INTO cloud_flow_db.biz_expense_item (
  id, tenant_id, claim_id, expense_type, amount, expense_date, description, receipt_url, vehicle_expense_id
) VALUES
(901111, 100000, 9011, 'TRANSPORT', 860.00, DATE_SUB(CURDATE(), INTERVAL 5 DAY), '上海虹桥往返苏州北高铁票', 'https://demo.cloudflow.local/files/expense/bx9011-train.jpg', NULL),
(901112, 100000, 9011, 'HOTEL', 1880.00, DATE_SUB(CURDATE(), INTERVAL 4 DAY), '客户园区附近酒店两晚住宿', 'https://demo.cloudflow.local/files/expense/bx9011-hotel.jpg', NULL),
(901113, 100000, 9011, 'MEAL', 620.00, DATE_SUB(CURDATE(), INTERVAL 4 DAY), '上线支持期间加班餐与客户培训简餐', 'https://demo.cloudflow.local/files/expense/bx9011-meal.jpg', NULL),
(901114, 100000, 9011, 'TRANSPORT', 1500.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '苏州站点往返客户园区及临时打车费用', 'https://demo.cloudflow.local/files/expense/bx9011-local.jpg', NULL);

INSERT INTO cloud_flow_db.biz_payment_request (
  id, tenant_id, instance_id, user_id, user_name, payment_no, payee_name, payee_account, payee_bank, amount,
  payment_type, reason, expected_date, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9011, 100000, 'seed_inst_payment_ops_001', 3, '王财务', 'FK202604070011',
 '苏州云链网络科技有限公司', '6222028888001122334', '招商银行苏州分行', 56800.00,
 'SERVICE', '支付苏州智造上线保障周使用的临时网络专线、现场设备租赁与驻场服务尾款。',
 DATE_ADD(CURDATE(), INTERVAL 2 DAY),
 'https://demo.cloudflow.local/files/payment/fk202604070011-contract.pdf',
 'PENDING', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 7 HOUR));

-- =========================================================
-- 四、招聘到入职闭环：招聘、Offer、入职、员工档案、转正
-- =========================================================

INSERT INTO cloud_flow_db.hr_recruitment_request (
  id, tenant_id, request_no, dept_id, position_id, headcount, job_requirements,
  salary_min, salary_max, expected_date, process_instance_id, status, hired_count,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(2011, 100000, 'HRRQ202509140011', 106, 101, 1,
 '负责客户交付场景下的前端功能落地，熟悉 React、TypeScript、流程表单渲染与移动端适配，能够独立跟进客户培训与上线支持。',
 16000.00, 22000.00, DATE_SUB(CURDATE(), INTERVAL 174 DAY), 'seed_hr_inst_recruit_001', 'COMPLETED', 1,
 DATE_SUB(NOW(), INTERVAL 205 DAY), DATE_SUB(NOW(), INTERVAL 192 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_candidate (
  id, tenant_id, request_id, name, gender, phone, email, resume_attachment_urls, source, status, reject_reason,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(3011, 100000, 2011, '林清禾', 'FEMALE', '13900012011', 'lin.qinghe@example.com',
 'https://demo.cloudflow.local/files/hr/resume-linqinghe.pdf,https://demo.cloudflow.local/files/hr/resume-linqinghe-project.pdf', 'REFERRAL', 'HIRED', NULL,
 DATE_SUB(NOW(), INTERVAL 201 DAY), DATE_SUB(NOW(), INTERVAL 180 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_interview (
  id, tenant_id, candidate_id, interview_round, interview_type, interview_time, location, interviewers,
  evaluation, score, result, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(4011, 100000, 3011, 'FIRST', 'VIDEO', DATE_SUB(NOW(), INTERVAL 198 DAY), '腾讯会议 ID 602-889',
 '[2,8]', '基础能力扎实，能清晰说明企业工作台和流程页的组件拆分思路。', 86, 'PASS', 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 199 DAY), DATE_SUB(NOW(), INTERVAL 198 DAY), 'zhao', 'zhao', 0),
(4012, 100000, 3011, 'FINAL', 'ONSITE', DATE_SUB(NOW(), INTERVAL 190 DAY), '上海总部 5F 协作厅',
 '[2,4]', '具备客户沟通和交付意识，能够承担上线支持与培训材料整理。', 91, 'PASS', 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 191 DAY), DATE_SUB(NOW(), INTERVAL 190 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_offer (
  id, tenant_id, offer_no, candidate_id, dept_id, position_id, salary, expected_date, expiry_date,
  offer_content, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 'OFFER20250926000002', 3011, 106, 101, 18500.00, DATE_SUB(CURDATE(), INTERVAL 174 DAY), DATE_SUB(CURDATE(), INTERVAL 167 DAY),
 CONCAT(
  '候选人：林清禾\n',
  '拟入职部门：前端组\n',
  '岗位：前端开发工程师（交付方向）\n',
  '月度总包：18,500 元\n',
  '预期到岗：', DATE_FORMAT(DATE_SUB(CURDATE(), INTERVAL 174 DAY), '%Y-%m-%d'), '\n',
  '备注：承担客户上线、培训课件整理与移动端体验优化工作。'
 ),
 'seed_hr_inst_offer_001', 'ACCEPTED', DATE_SUB(NOW(), INTERVAL 193 DAY), DATE_SUB(NOW(), INTERVAL 188 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_onboarding_application (
  id, tenant_id, application_no, candidate_id, name, gender, phone, email, dept_id, post_id, position_id,
  expected_date, process_instance_id, status, employee_id, create_time, update_time, create_by, update_by, deleted
) VALUES
(5011, 100000, 'HRON202510100011', 3011, '林清禾', 'FEMALE', '13900012011', 'lin.qinghe@example.com', 106, 4, 101,
DATE_SUB(CURDATE(), INTERVAL 174 DAY), 'seed_hr_inst_onboard_001', 'ONBOARDED', 1009,
DATE_SUB(NOW(), INTERVAL 182 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_onboarding_task (
  id, tenant_id, application_id, task_name, task_type, task_description, assignee_id, status,
  completed_time, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(5111, 100000, 5011, '收集入职证件与银行卡信息', 'DOCUMENT',
 '核验身份证、学历证明、银行卡与个税专项扣除材料，确保入职与薪酬资料一次齐备。', 1001, 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 173 DAY), '资料已完成归档，后续可直接用于社保、个税与薪资建档。', DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 173 DAY), 'zhao', 'zhao', 0),
(5112, 100000, 5011, '开通研发环境与流程系统账号', 'ACCOUNT',
 '为新员工开通 CloudFlow 流程平台、代码仓库、项目文档与演示环境访问权限。', 1005, 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 173 DAY), '账号已开通并完成首日登录校验。', DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 173 DAY), 'zhao', 'zhao', 0),
(5113, 100000, 5011, '准备办公设备与门禁', 'EQUIPMENT',
 '准备笔记本电脑、VPN、门禁卡与客户现场支持所需的测试机。', 1008, 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 173 DAY), '办公电脑与门禁已发放，VPN 白名单已同步。', DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 173 DAY), 'zhao', 'zhao', 0),
(5114, 100000, 5011, '完成交付方向新人培训', 'TRAINING',
 '完成项目交付流程、客户沟通规范、上线保障值班与常用表单配置培训。', 1001, 'COMPLETED',
 DATE_SUB(NOW(), INTERVAL 172 DAY), '已安排李经理作为试用期导师，培训签到与材料已回传。', DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 172 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email, dept_id, post_id, position_id,
  employee_type, employee_status, hire_date, regular_date, resign_date, user_id,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(1009, 100000, 'CF20250021', '林清禾', 'FEMALE', '1997-04-16', '13900012011', 'lin.qinghe@cloudflow.com', 106, 4, 101,
 'FULL_TIME', 'PROBATION', DATE_SUB(CURDATE(), INTERVAL 174 DAY), DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 174 DAY), INTERVAL 180 DAY), NULL, NULL,
 DATE_SUB(NOW(), INTERVAL 174 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_contract (
  id, tenant_id, employee_id, contract_type, contract_no, sign_date, start_date, end_date, duration, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 1009, 'LABOR', 'LABOR-CF20250021-001', DATE_SUB(CURDATE(), INTERVAL 176 DAY), DATE_SUB(CURDATE(), INTERVAL 174 DAY),
 DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 174 DAY), INTERVAL 36 MONTH), 36,
 'ACTIVE',
 DATE_SUB(NOW(), INTERVAL 176 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_contract_attachment (
  id, tenant_id, contract_id, file_name, file_url, sort_order,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 101, 'contract-linqinghe.pdf', 'https://demo.cloudflow.local/files/hr/contract-linqinghe.pdf', 0,
 DATE_SUB(NOW(), INTERVAL 176 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0),
(102, 100000, 101, 'contract-linqinghe-annex.pdf', 'https://demo.cloudflow.local/files/hr/contract-linqinghe-annex.pdf', 1,
 DATE_SUB(NOW(), INTERVAL 176 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_document (
  id, tenant_id, employee_id, document_type, document_no, issue_date, expiry_date,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 1009, 'ID_CARD', '320582199704160628', '2016-05-10', '2036-05-10',
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0),
(102, 100000, 1009, 'DIPLOMA', 'DIP-2020-0216', '2020-07-01', NULL,
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_document_attachment (
  id, tenant_id, document_id, file_name, file_url, sort_order,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 101, 'linqinghe-idcard-front.pdf', 'https://demo.cloudflow.local/files/hr/linqinghe-idcard-front.pdf', 0,
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0),
(102, 100000, 101, 'linqinghe-idcard-back.pdf', 'https://demo.cloudflow.local/files/hr/linqinghe-idcard-back.pdf', 1,
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0),
(103, 100000, 102, 'linqinghe-diploma.pdf', 'https://demo.cloudflow.local/files/hr/linqinghe-diploma.pdf', 0,
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_emergency_contact (
  id, tenant_id, employee_id, contact_name, relationship, phone, address, priority,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 1009, '林建国', 'PARENT', '13800019009', '江苏省苏州市昆山市玉山镇前进西路 268 号', 1,
 DATE_SUB(NOW(), INTERVAL 181 DAY), DATE_SUB(NOW(), INTERVAL 181 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_insurance (
  id, tenant_id, employee_id, scheme_id, base, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 1009, 101, 18500.00, DATE_SUB(CURDATE(), INTERVAL 174 DAY), 'ACTIVE',
 DATE_SUB(NOW(), INTERVAL 174 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0),
(102, 100000, 1003, 101, 16800.00, DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'ACTIVE',
 DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_tax_deduction (
  id, tenant_id, employee_id, deduction_type, amount, start_date, end_date, status, remark,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 1009, 'HOUSING_RENT', 1500.00, DATE_SUB(CURDATE(), INTERVAL 174 DAY), NULL, 'ACTIVE',
 '苏州租房专项扣除，已用于新员工首月个税申报。',
 DATE_SUB(NOW(), INTERVAL 174 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0),
(103, 100000, 1003, 'HOUSING_LOAN', 1000.00, DATE_SUB(CURDATE(), INTERVAL 90 DAY), NULL, 'ACTIVE',
 '后端测试员工住房贷款专项扣除，用于调薪前后个税测算。',
 DATE_SUB(NOW(), INTERVAL 90 DAY), DATE_SUB(NOW(), INTERVAL 90 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_salary (
  id, tenant_id, employee_id, structure_id, salary_data, total_salary, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 1009, 100, '{"100":13500,"101":2500,"102":300,"103":300,"104":1900}', 18500.00,
 DATE_SUB(CURDATE(), INTERVAL 174 DAY), 'ACTIVE',
 DATE_SUB(NOW(), INTERVAL 174 DAY), DATE_SUB(NOW(), INTERVAL 174 DAY), 'zhao', 'zhao', 0),
(103, 100000, 1003, 100, '{"100":12000,"101":2000,"102":300,"103":300,"104":2200}', 16800.00,
 DATE_SUB(CURDATE(), INTERVAL 30 DAY), 'ACTIVE',
 DATE_SUB(NOW(), INTERVAL 30 DAY), DATE_SUB(NOW(), INTERVAL 30 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_probation_confirmation (
  id, tenant_id, application_no, employee_id, probation_start_date, probation_end_date, expected_regular_date,
  self_evaluation, manager_evaluation, process_instance_id, status, reject_reason, extension_days,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(6011, 100000, 'HRPB202604070011', 1009, DATE_SUB(CURDATE(), INTERVAL 174 DAY),
 DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 174 DAY), INTERVAL 180 DAY),
 DATE_ADD(DATE_SUB(CURDATE(), INTERVAL 174 DAY), INTERVAL 180 DAY),
 '已独立负责苏州智造项目移动端表单配置、上线值班手册整理和客户培训课件优化，能够在客户现场快速定位并复盘问题。',
 '试用期内交付稳定，客户反馈沟通清晰，建议按期转正并继续承担交付方向的流程前端工作。',
 'seed_hr_inst_prob_001', 'APPROVING', NULL, NULL,
 DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 'zhao', 'zhao', 0);

-- =========================================================
-- 五、员工自助与薪酬联动：补卡、加班、调休、月报、调薪
-- =========================================================

INSERT INTO cloud_flow_db.hr_attendance_record (
  id, tenant_id, employee_id, attendance_date, rule_id, shift_id, check_type, check_time, expected_time, deviation_minutes, check_method,
  location, status, process_instance_id, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(9311, 100000, 1002, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 102, 103, 'CHECK_IN',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 18 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, 18, 'SUPPLEMENT',
 '苏州智造客户园区 A2 楼', 'APPROVING', 'seed_hr_inst_att_001',
 '前一日参与客户现场晨会与上线巡检，因外勤网络限制未完成公司内网打卡，现补充签到。', DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR), 8, 8, 0);

INSERT INTO cloud_flow_db.hr_overtime_application (
  id, tenant_id, application_no, employee_id, start_time, end_time, duration, overtime_type, reason,
  compensation_type, compensation_hours, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9003, 100000, 'JB202604070003', 1002,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 19 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 22 HOUR + INTERVAL 30 MINUTE,
 3.50, 'WORKDAY', '配合苏州智造项目上线后首轮问题修复，完成移动端审批页兼容性修正与客户验收说明整理。',
 'TIME_OFF', 3.50, 'seed_hr_inst_ot_001', 'APPROVED',
 DATE_SUB(NOW(), INTERVAL 40 HOUR), DATE_SUB(NOW(), INTERVAL 34 HOUR), 'test_fe', 'test_fe', 0);

INSERT INTO cloud_flow_db.hr_leave_application (
  id, tenant_id, application_no, employee_id, leave_type_id, start_time, end_time, duration, unit, reason,
  process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9003, 100000, 'QJ202604070003', 1002, 107,
 DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 13 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 17 HOUR,
 4.00, 'HOUR', '申请使用上线保障周积累的调休时长，回家处理个人事务，确保手头客户问题已完成交接。',
 'seed_hr_inst_leave_001', 'APPROVING',
 DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR), 'test_fe', 'test_fe', 0);

INSERT INTO cloud_flow_db.hr_attendance_monthly (
  id, tenant_id, employee_id, year, month, work_days, actual_days, late_times, early_times, absent_days,
  missing_times, leave_days, overtime_hours, attendance_rate, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(12011, 100000, 1009, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 0, 0.00, 2.00, 95.65, 'CONFIRMED',
 DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_salary_adjustment (
  id, tenant_id, application_no, employee_id, adjustment_type, adjustment_reason,
  before_salary_data, after_salary_data, before_total, after_total, adjustment_amount, adjustment_rate,
  effective_date, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(101, 100000, 'SA202604070011', 1003, 'PERFORMANCE',
 '后端测试员工在苏州智造项目上线、接口联调与客户现场问题定位中承担核心支持工作，建议追加绩效奖金。',
 '{"100":12000,"101":2000,"102":300,"103":300,"104":2200}',
 '{"100":12000,"101":2000,"102":300,"103":300,"104":3200}',
16800.00, 17800.00, 1000.00, 5.95,
DATE_ADD(CURDATE(), INTERVAL 24 DAY), 'seed_hr_inst_salary_001', 'APPROVING',
DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), 'li', 'li', 0);

-- =========================================================
-- 六、工作流实例、待办、历史、快照、通知
-- =========================================================

DELETE FROM cloud_flow_db.wf_task_read
WHERE task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_task_urge
WHERE task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_task_attachment
WHERE attachment_id LIKE 'seed_att_%';

DELETE FROM cloud_flow_db.wf_process_snapshot
WHERE snapshot_id LIKE 'seed_snap_%';

DELETE FROM cloud_flow_db.wf_node_record
WHERE instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id LIKE 'seed_msg_%';

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id LIKE 'seed_notice_%';

DELETE FROM cloud_flow_db.wf_urge_effect
WHERE task_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_process_copy
WHERE instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_task_history
WHERE history_id LIKE 'seed_hist_%';

DELETE FROM cloud_flow_db.wf_task
WHERE task_id LIKE 'seed_task_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_process_instance
WHERE instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

INSERT INTO cloud_flow_db.wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key, title,
  start_user_id, start_user_name, status, start_time, end_time, variables, priority,
  process_no, dept_id, create_by, update_by, create_time, update_time, del_flag
) VALUES
('seed_inst_trip_ops_001', 100000, 'business_trip', 'wf_business_trip', 'trip_9011', '前端测试的苏州客户上线支持出差申请',
 8, '前端测试', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 170 HOUR), DATE_SUB(NOW(), INTERVAL 146 HOUR),
 '{"tripNo":"CC202604070011","destination":"苏州","tripDays":3,"project":"苏州智造流程上线"}', 'HIGH',
 'WF-CC202604070011', 106, 'test_fe', 'zhao', DATE_SUB(NOW(), INTERVAL 170 HOUR), DATE_SUB(NOW(), INTERVAL 146 HOUR), '0'),
('seed_inst_vehicle_ops_001', 100000, 'vehicle_approval', 'wf_vehicle_approval', 'vehicle_9011', '赵HR的客户接站派车申请',
 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 50 HOUR), DATE_SUB(NOW(), INTERVAL 28 HOUR),
 '{"usageId":9011,"vehicleId":9002,"destination":"虹桥高铁站-CloudFlow总部","passengerCount":3}', 'NORMAL',
 'WF-CAR-9011', 103, 'zhao', 'admin', DATE_SUB(NOW(), INTERVAL 50 HOUR), DATE_SUB(NOW(), INTERVAL 28 HOUR), '0'),
('seed_inst_expense_ops_001', 100000, 'biz_reimburse', 'wf_reimburse', 'expense_9011', '前端测试的苏州上线差旅报销',
 8, '前端测试', 'RUNNING', DATE_SUB(NOW(), INTERVAL 30 HOUR), NULL,
 '{"claimNo":"BX202604070011","amount":4860,"category":"TRAVEL","project":"苏州智造流程上线"}', 'HIGH',
 'WF-BX202604070011', 106, 'test_fe', 'wang', DATE_SUB(NOW(), INTERVAL 30 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR), '0'),
('seed_inst_payment_ops_001', 100000, 'biz_payment', 'wf_payment', 'payment_9011', '苏州智造上线保障周对公付款申请',
 3, '王财务', 'RUNNING', DATE_SUB(NOW(), INTERVAL 7 HOUR), NULL,
 '{"paymentNo":"FK202604070011","amount":56800,"payee":"苏州云链网络科技有限公司","project":"苏州智造上线保障周"}', 'URGENT',
 'WF-FK202604070011', 102, 'wang', 'wang', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
('seed_hr_inst_recruit_001', 100000, 'biz_recruit', 'wf_recruit', 'recruit_2011', '前端开发工程师（交付方向）招聘申请',
 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 205 DAY), DATE_SUB(NOW(), INTERVAL 200 DAY),
 '{"requestNo":"HRRQ202509140011","position":"前端开发工程师","headcount":1}', 'NORMAL',
 'WF-HRRQ202509140011', 106, 'zhao', 'admin', DATE_SUB(NOW(), INTERVAL 205 DAY), DATE_SUB(NOW(), INTERVAL 200 DAY), '0'),
('seed_hr_inst_offer_001', 100000, 'offer_approval', 'wf_offer_approval', 'offer_101', '林清禾 Offer 审批',
 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 193 DAY), DATE_SUB(NOW(), INTERVAL 188 DAY),
 '{"offerNo":"OFFER20250926000002","candidate":"林清禾","salary":18500}', 'NORMAL',
 'WF-OFFER20250926000002', 103, 'zhao', 'admin', DATE_SUB(NOW(), INTERVAL 193 DAY), DATE_SUB(NOW(), INTERVAL 188 DAY), '0'),
('seed_hr_inst_onboard_001', 100000, 'onboarding_approval', 'wf_onboarding_approval', 'onboard_5011', '林清禾入职审批',
 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 182 DAY), DATE_SUB(NOW(), INTERVAL 175 DAY),
 '{"applicationNo":"HRON202510100011","employeeName":"林清禾","dept":"前端组"}', 'NORMAL',
 'WF-HRON202510100011', 106, 'zhao', 'admin', DATE_SUB(NOW(), INTERVAL 182 DAY), DATE_SUB(NOW(), INTERVAL 175 DAY), '0'),
('seed_hr_inst_att_001', 100000, 'attendance_appeal', 'wf_attendance_appeal', 'attendance_9311', '前端测试的外勤补卡申请',
 8, '前端测试', 'RUNNING', DATE_SUB(NOW(), INTERVAL 20 HOUR), NULL,
 '{"employeeId":1002,"attendanceDate":"昨日","checkType":"CHECK_IN","location":"苏州智造客户园区 A2 楼"}', 'NORMAL',
 'WF-ATT-9311', 106, 'test_fe', 'test_fe', DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR), '0'),
('seed_hr_inst_leave_001', 100000, 'leave_request', 'wf_leave_request', 'leave_9003', '前端测试的调休申请',
 8, '前端测试', 'RUNNING', DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL,
 '{"applicationNo":"QJ202604070003","leaveType":"调休","duration":4,"unit":"HOUR"}', 'NORMAL',
 'WF-QJ202604070003', 106, 'test_fe', 'zhao', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), '0'),
('seed_hr_inst_ot_001', 100000, 'overtime_request', 'wf_overtime_request', 'ot_9003', '前端测试的上线保障加班申请',
 8, '前端测试', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 40 HOUR), DATE_SUB(NOW(), INTERVAL 34 HOUR),
 '{"applicationNo":"JB202604070003","duration":3.5,"compensationType":"TIME_OFF"}', 'NORMAL',
 'WF-JB202604070003', 106, 'test_fe', 'zhao', DATE_SUB(NOW(), INTERVAL 40 HOUR), DATE_SUB(NOW(), INTERVAL 34 HOUR), '0'),
('seed_hr_inst_prob_001', 100000, 'probation_confirmation_approval', 'wf_probation_confirmation_approval', 'probation_6011', '林清禾转正审批',
 4, '赵HR', 'RUNNING', DATE_SUB(NOW(), INTERVAL 72 HOUR), NULL,
 '{"applicationNo":"HRPB202604070011","employeeName":"林清禾","stage":"试用期转正"}', 'HIGH',
 'WF-HRPB202604070011', 106, 'zhao', 'zhao', DATE_SUB(NOW(), INTERVAL 72 HOUR), DATE_SUB(NOW(), INTERVAL 48 HOUR), '0'),
('seed_hr_inst_salary_001', 100000, 'salary_adjustment_approval', 'wf_salary_adjustment_approval', 'salary_101', '后端测试绩效调薪审批',
 2, '李经理', 'RUNNING', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL,
 '{"applicationNo":"SA202604070011","employeeName":"后端测试","adjustmentAmount":1000}', 'HIGH',
 'WF-SA202604070011', 107, 'li', 'li', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), '0');

INSERT INTO cloud_flow_db.wf_task (
  task_id, tenant_id, instance_id, node_key, node_name, assignee, assignee_name, status, priority, create_time, due_time
) VALUES
('seed_task_expense_ops_001', 100000, 'seed_inst_expense_ops_001', 'b2', '财务总监审批', 3, '王财务', 'TODO', 'HIGH',
 DATE_SUB(NOW(), INTERVAL 24 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('seed_task_payment_ops_001', 100000, 'seed_inst_payment_ops_001', 'b2', '总经理审批', 1, 'Admin', 'TODO', 'URGENT',
 DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_ADD(NOW(), INTERVAL 12 HOUR)),
('seed_task_hr_att_001', 100000, 'seed_hr_inst_att_001', 'n1', '直属上级审批', 2, '李经理', 'TODO', 'NORMAL',
 DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_ADD(NOW(), INTERVAL 8 HOUR)),
('seed_task_hr_leave_001', 100000, 'seed_hr_inst_leave_001', 'n2', 'HR备案', 4, '赵HR', 'TODO', 'NORMAL',
 DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('seed_task_hr_prob_001', 100000, 'seed_hr_inst_prob_001', 'n1', '总经理审批', 1, 'Admin', 'TODO', 'HIGH',
 DATE_SUB(NOW(), INTERVAL 48 HOUR), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('seed_task_hr_salary_001', 100000, 'seed_hr_inst_salary_001', 'n1', '总经理审批', 1, 'Admin', 'TODO', 'HIGH',
 DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY));

INSERT INTO cloud_flow_db.wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES
('seed_hist_trip_ops_001', 100000, 'seed_task_done_trip_ops_001', 'seed_inst_trip_ops_001', '提交出差申请', 'root',
 8, '前端测试', 'SUBMIT', '提交苏州智造项目上线支持出差申请。', 180, DATE_SUB(NOW(), INTERVAL 170 HOUR)),
('seed_hist_trip_ops_002', 100000, 'seed_task_done_trip_ops_002', 'seed_inst_trip_ops_001', '部门经理审批', 'n1',
 2, '李经理', 'APPROVE', '同意现场支持，培训与上线安排合理。', 7200, DATE_SUB(NOW(), INTERVAL 155 HOUR)),
('seed_hist_trip_ops_003', 100000, 'seed_task_done_trip_ops_003', 'seed_inst_trip_ops_001', 'HR备案', 'n2',
 4, '赵HR', 'APPROVE', '已完成出差备案并同步上线值班安排。', 1800, DATE_SUB(NOW(), INTERVAL 146 HOUR)),
('seed_hist_vehicle_ops_001', 100000, 'seed_task_done_vehicle_ops_001', 'seed_inst_vehicle_ops_001', '提交用车申请', 'root',
 4, '赵HR', 'SUBMIT', '提交客户接站与总部复盘派车申请。', 120, DATE_SUB(NOW(), INTERVAL 50 HOUR)),
('seed_hist_vehicle_ops_002', 100000, 'seed_task_done_vehicle_ops_002', 'seed_inst_vehicle_ops_001', '直属上级审批', 'n1',
 1, 'Admin', 'APPROVE', '同意安排接站车辆，访客行程已确认。', 3600, DATE_SUB(NOW(), INTERVAL 42 HOUR)),
('seed_hist_vehicle_ops_003', 100000, 'seed_task_done_vehicle_ops_003', 'seed_inst_vehicle_ops_001', '行政确认派车', 'n2',
 1, 'Admin', 'APPROVE', '已确认司机、车辆与返程停放安排。', 2400, DATE_SUB(NOW(), INTERVAL 28 HOUR)),
('seed_hist_expense_ops_001', 100000, 'seed_task_done_expense_ops_001', 'seed_inst_expense_ops_001', '提交报销', 'root',
 8, '前端测试', 'SUBMIT', '提交苏州上线保障周差旅报销单。', 180, DATE_SUB(NOW(), INTERVAL 30 HOUR)),
('seed_hist_expense_ops_002', 100000, 'seed_task_done_expense_ops_002', 'seed_inst_expense_ops_001', '直属上级审批', 'n1',
 2, '李经理', 'APPROVE', '费用与出差内容一致，同意进入财务审批。', 5400, DATE_SUB(NOW(), INTERVAL 24 HOUR)),
('seed_hist_payment_ops_001', 100000, 'seed_task_done_payment_ops_001', 'seed_inst_payment_ops_001', '提交付款申请', 'root',
 3, '王财务', 'SUBMIT', '提交上线保障周尾款付款申请。', 120, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
('seed_hist_payment_ops_002', 100000, 'seed_task_done_payment_ops_002', 'seed_inst_payment_ops_001', '财务主管审批', 'n1',
 3, '王财务', 'APPROVE', '付款资料齐全，提交总经理审批。', 1800, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('seed_hist_hr_recruit_001', 100000, 'seed_task_done_hr_recruit_001', 'seed_hr_inst_recruit_001', '提交招聘需求', 'root',
 4, '赵HR', 'SUBMIT', '提交交付方向前端工程师招聘需求。', 120, DATE_SUB(NOW(), INTERVAL 205 DAY)),
('seed_hist_hr_recruit_002', 100000, 'seed_task_done_hr_recruit_002', 'seed_hr_inst_recruit_001', '部门总监审批', 'n1',
 2, '李经理', 'APPROVE', '岗位需求明确，优先补充项目交付能力。', 21600, DATE_SUB(NOW(), INTERVAL 204 DAY)),
('seed_hist_hr_recruit_003', 100000, 'seed_task_done_hr_recruit_003', 'seed_hr_inst_recruit_001', 'HR审核', 'n2',
 4, '赵HR', 'APPROVE', '已确认编制与预算，进入总经理审批。', 10800, DATE_SUB(NOW(), INTERVAL 202 DAY)),
('seed_hist_hr_recruit_004', 100000, 'seed_task_done_hr_recruit_004', 'seed_hr_inst_recruit_001', '总经理审批', 'n3',
 1, 'Admin', 'APPROVE', '同意招聘，优先支持客户交付业务。', 3600, DATE_SUB(NOW(), INTERVAL 200 DAY)),
('seed_hist_hr_offer_001', 100000, 'seed_task_done_hr_offer_001', 'seed_hr_inst_offer_001', '提交Offer审批', 'root',
 4, '赵HR', 'SUBMIT', '提交林清禾 Offer 审批。', 120, DATE_SUB(NOW(), INTERVAL 193 DAY)),
('seed_hist_hr_offer_002', 100000, 'seed_task_done_hr_offer_002', 'seed_hr_inst_offer_001', '总经理审批', 'n1',
 1, 'Admin', 'APPROVE', '候选人匹配度高，同意发放 Offer。', 7200, DATE_SUB(NOW(), INTERVAL 188 DAY)),
('seed_hist_hr_onboard_001', 100000, 'seed_task_done_hr_onboard_001', 'seed_hr_inst_onboard_001', '提交入职申请', 'root',
 4, '赵HR', 'SUBMIT', '提交林清禾入职申请。', 120, DATE_SUB(NOW(), INTERVAL 182 DAY)),
('seed_hist_hr_onboard_002', 100000, 'seed_task_done_hr_onboard_002', 'seed_hr_inst_onboard_001', '总经理审批', 'n1',
 1, 'Admin', 'APPROVE', '同意按计划入职并同步准备账号设备。', 3600, DATE_SUB(NOW(), INTERVAL 175 DAY)),
('seed_hist_hr_att_001', 100000, 'seed_task_done_hr_att_001', 'seed_hr_inst_att_001', '提交申请', 'root',
 8, '前端测试', 'SUBMIT', '提交苏州客户现场外勤补卡申请。', 90, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
('seed_hist_hr_leave_001', 100000, 'seed_task_done_hr_leave_001', 'seed_hr_inst_leave_001', '提交请假', 'root',
 8, '前端测试', 'SUBMIT', '提交 4 小时调休申请。', 90, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
('seed_hist_hr_leave_002', 100000, 'seed_task_done_hr_leave_002', 'seed_hr_inst_leave_001', '部门经理审批', 'n1',
 2, '李经理', 'APPROVE', '项目已完成交接，同意调休并转 HR 备案。', 1800, DATE_SUB(NOW(), INTERVAL 9 HOUR)),
('seed_hist_hr_ot_001', 100000, 'seed_task_done_hr_ot_001', 'seed_hr_inst_ot_001', '提交加班申请', 'root',
 8, '前端测试', 'SUBMIT', '提交苏州上线保障周加班申请。', 90, DATE_SUB(NOW(), INTERVAL 40 HOUR)),
('seed_hist_hr_ot_002', 100000, 'seed_task_done_hr_ot_002', 'seed_hr_inst_ot_001', '直属上级审批', 'n1',
 2, '李经理', 'APPROVE', '确认上线值守记录，同意折算调休。', 2400, DATE_SUB(NOW(), INTERVAL 36 HOUR)),
('seed_hist_hr_ot_003', 100000, 'seed_task_done_hr_ot_003', 'seed_hr_inst_ot_001', 'HR备案', 'n2',
 4, '赵HR', 'APPROVE', '已确认加班记录并同步调休额度。', 900, DATE_SUB(NOW(), INTERVAL 34 HOUR)),
('seed_hist_hr_prob_001', 100000, 'seed_task_done_hr_prob_001', 'seed_hr_inst_prob_001', '提交转正申请', 'root',
 4, '赵HR', 'SUBMIT', '提交林清禾试用期转正审批。', 120, DATE_SUB(NOW(), INTERVAL 72 HOUR)),
('seed_hist_hr_salary_001', 100000, 'seed_task_done_hr_salary_001', 'seed_hr_inst_salary_001', '提交调薪申请', 'root',
 2, '李经理', 'SUBMIT', '提交后端测试绩效调薪审批。', 120, DATE_SUB(NOW(), INTERVAL 6 HOUR));

INSERT INTO cloud_flow_db.wf_task_read (tenant_id, task_id, user_id, read_time) VALUES
(100000, 'seed_task_expense_ops_001', 3, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 'seed_task_hr_leave_001', 4, DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(100000, 'seed_task_hr_prob_001', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'seed_task_hr_salary_001', 1, DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO cloud_flow_db.wf_task_urge (tenant_id, task_id, sender_id, recipient_id, reason, create_time) VALUES
(100000, 'seed_task_expense_ops_001', 8, 3, '上线项目已进入结项归档阶段，请尽快完成报销审批。', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(100000, 'seed_task_payment_ops_001', 3, 1, '客户现场网络与设备服务尾款约定本周内支付，请尽快审批。', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
(100000, 'seed_task_hr_prob_001', 4, 1, '林清禾转正评审材料已齐备，请尽快完成审批。', DATE_SUB(NOW(), INTERVAL 5 HOUR));

INSERT INTO cloud_flow_db.wf_task_attachment (
  attachment_id, tenant_id, task_id, instance_id, file_name, file_path, file_size, file_type, upload_user_id, upload_time
) VALUES
('seed_att_expense_ops_001', 100000, 'seed_task_expense_ops_001', 'seed_inst_expense_ops_001', '苏州上线差旅报销汇总.pdf',
 '/seed/workflow/expense/suzhou-go-live-expense-summary.pdf', 268420, 'application/pdf', 8, DATE_SUB(NOW(), INTERVAL 26 HOUR)),
('seed_att_payment_ops_001', 100000, 'seed_task_payment_ops_001', 'seed_inst_payment_ops_001', '上线保障周服务合同.pdf',
 '/seed/workflow/payment/suzhou-go-live-service-contract.pdf', 1864022, 'application/pdf', 3, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('seed_att_hr_prob_001', 100000, 'seed_task_hr_prob_001', 'seed_hr_inst_prob_001', '林清禾转正评审表.pdf',
 '/seed/workflow/hr/lin-qinghe-probation-review.pdf', 342180, 'application/pdf', 4, DATE_SUB(NOW(), INTERVAL 48 HOUR)),
('seed_att_hr_salary_001', 100000, 'seed_task_hr_salary_001', 'seed_hr_inst_salary_001', '后端测试绩效复盘.xlsx',
 '/seed/workflow/hr/backend-test-performance-review.xlsx', 128530, 'application/xlsx', 2, DATE_SUB(NOW(), INTERVAL 5 HOUR));

INSERT INTO cloud_flow_db.wf_process_snapshot (
  snapshot_id, tenant_id, instance_id, node_key, node_name, status, variables, active_tasks, create_time
) VALUES
('seed_snap_expense_ops_001', 100000, 'seed_inst_expense_ops_001', 'b2', '财务总监审批', 'RUNNING',
 '{"claimNo":"BX202604070011","amount":4860.00,"category":"TRAVEL"}',
 '[{"taskId":"seed_task_expense_ops_001","assigneeName":"王财务","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
('seed_snap_payment_ops_001', 100000, 'seed_inst_payment_ops_001', 'b2', '总经理审批', 'RUNNING',
 '{"paymentNo":"FK202604070011","amount":56800.00,"payee":"苏州云链网络科技有限公司"}',
 '[{"taskId":"seed_task_payment_ops_001","assigneeName":"Admin","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('seed_snap_hr_att_001', 100000, 'seed_hr_inst_att_001', 'n1', '直属上级审批', 'RUNNING',
 '{"attendanceId":9311,"employeeName":"前端测试","checkType":"CHECK_IN"}',
 '[{"taskId":"seed_task_hr_att_001","assigneeName":"李经理","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 30 MINUTE)),
('seed_snap_hr_leave_001', 100000, 'seed_hr_inst_leave_001', 'n2', 'HR备案', 'RUNNING',
 '{"leaveNo":"QJ202604070003","leaveType":"调休","duration":4.00}',
 '[{"taskId":"seed_task_hr_leave_001","assigneeName":"赵HR","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
('seed_snap_hr_prob_001', 100000, 'seed_hr_inst_prob_001', 'n1', '总经理审批', 'RUNNING',
 '{"applicationNo":"HRPB202604070011","employeeName":"林清禾"}',
 '[{"taskId":"seed_task_hr_prob_001","assigneeName":"Admin","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 40 MINUTE)),
('seed_snap_hr_salary_001', 100000, 'seed_hr_inst_salary_001', 'n1', '总经理审批', 'RUNNING',
 '{"applicationNo":"SA202604070011","employeeName":"后端测试","amount":1000.00}',
 '[{"taskId":"seed_task_hr_salary_001","assigneeName":"Admin","status":"TODO"}]', DATE_SUB(NOW(), INTERVAL 15 MINUTE));

INSERT INTO cloud_flow_db.wf_node_record (
  tenant_id, instance_id, process_def_key, node_key, node_name, node_type, status, executor_id, executor_name,
  start_time, end_time, duration_ms, extra_data, event_type, event_time, create_time
) VALUES
(100000, 'seed_inst_expense_ops_001', 'biz_reimburse', 'root', '提交报销', 'START', 'COMPLETED', 8, '前端测试',
 DATE_SUB(NOW(), INTERVAL 30 HOUR), DATE_SUB(NOW(), INTERVAL 30 HOUR) + INTERVAL 3 MINUTE, 180000, '{"amount":4860.00}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 30 HOUR), DATE_SUB(NOW(), INTERVAL 30 HOUR)),
(100000, 'seed_inst_expense_ops_001', 'biz_reimburse', 'n1', '直属上级审批', 'APPROVAL', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 27 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR), 10800000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 24 HOUR), DATE_SUB(NOW(), INTERVAL 27 HOUR)),
(100000, 'seed_inst_expense_ops_001', 'biz_reimburse', 'b2', '财务总监审批', 'APPROVAL', 'RUNNING', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 24 HOUR), NULL, NULL, '{"urgeCount":1}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 24 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', 'root', '提交付款申请', 'START', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR) + INTERVAL 2 MINUTE, 120000, '{"amount":56800.00}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', 'n1', '财务主管审批', 'APPROVAL', 'COMPLETED', 3, '王财务',
 DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), 7200000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', 'b2', '总经理审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL, NULL, '{"contract":"上线保障周服务合同"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 'seed_hr_inst_att_001', 'attendance_appeal', 'root', '提交申请', 'START', 'COMPLETED', 8, '前端测试',
 DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR) + INTERVAL 1 MINUTE, 60000, '{"type":"SUPPLEMENT"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'seed_hr_inst_att_001', 'attendance_appeal', 'n1', '直属上级审批', 'APPROVAL', 'RUNNING', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 20 HOUR), NULL, NULL, '{"location":"苏州智造客户园区 A2 楼"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 20 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'seed_hr_inst_leave_001', 'leave_request', 'root', '提交请假', 'START', 'COMPLETED', 8, '前端测试',
 DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR) + INTERVAL 1 MINUTE, 60000, '{"duration":4.00}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 'seed_hr_inst_leave_001', 'leave_request', 'n1', '部门经理审批', 'APPROVAL', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), 3600000, '{"decision":"APPROVE"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'seed_hr_inst_leave_001', 'leave_request', 'n2', 'HR备案', 'APPROVAL', 'RUNNING', 4, '赵HR',
 DATE_SUB(NOW(), INTERVAL 9 HOUR), NULL, NULL, '{"leaveType":"调休"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR)),
(100000, 'seed_hr_inst_prob_001', 'probation_confirmation_approval', 'root', '提交转正申请', 'START', 'COMPLETED', 4, '赵HR',
 DATE_SUB(NOW(), INTERVAL 72 HOUR), DATE_SUB(NOW(), INTERVAL 72 HOUR) + INTERVAL 2 MINUTE, 120000, '{"employeeName":"林清禾"}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 72 HOUR), DATE_SUB(NOW(), INTERVAL 72 HOUR)),
(100000, 'seed_hr_inst_prob_001', 'probation_confirmation_approval', 'n1', '总经理审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 48 HOUR), NULL, NULL, '{"review":"试用期评审已完成"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 48 HOUR), DATE_SUB(NOW(), INTERVAL 48 HOUR)),
(100000, 'seed_hr_inst_salary_001', 'salary_adjustment_approval', 'root', '提交调薪申请', 'START', 'COMPLETED', 2, '李经理',
 DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR) + INTERVAL 1 MINUTE, 60000, '{"employeeName":"后端测试","amount":1000.00}', 'NODE_COMPLETED', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 'seed_hr_inst_salary_001', 'salary_adjustment_approval', 'n1', '总经理审批', 'APPROVAL', 'RUNNING', 1, 'Admin',
 DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, NULL, '{"reason":"苏州项目上线绩效奖励"}', 'NODE_CREATED', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR));

INSERT INTO cloud_flow_db.wf_transaction_message (
  message_id, tenant_id, business_type, business_id, content, status, retry_count, max_retry_count, next_retry_time, create_time, update_time, error_message
) VALUES
('seed_msg_expense_ops_001', 100000, 'WORKFLOW_NOTIFY', 'seed_inst_expense_ops_001', '苏州上线差旅报销已进入财务总监审批节点。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL),
('seed_msg_payment_ops_001', 100000, 'WORKFLOW_NOTIFY', 'seed_inst_payment_ops_001', '上线保障周付款申请等待总经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 90 MINUTE), DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL),
('seed_msg_hr_att_001', 100000, 'WORKFLOW_NOTIFY', 'seed_hr_inst_att_001', '外勤补卡申请已提交，等待直属上级审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL),
('seed_msg_hr_leave_001', 100000, 'WORKFLOW_NOTIFY', 'seed_hr_inst_leave_001', '调休申请已进入 HR 备案节点。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL),
('seed_msg_hr_prob_001', 100000, 'WORKFLOW_NOTIFY', 'seed_hr_inst_prob_001', '林清禾转正申请等待总经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL),
('seed_msg_hr_salary_001', 100000, 'WORKFLOW_NOTIFY', 'seed_hr_inst_salary_001', '后端测试绩效调薪申请已提交总经理审批。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL);

INSERT INTO cloud_flow_db.wf_notification_log (
  log_id, tenant_id, notification_type, recipient_id, recipient_name, title, content, send_status, send_time, error_message,
  related_type, related_id, create_time
) VALUES
('seed_notice_expense_ops_001', 100000, 'INTERNAL', 3, '王财务', '待审批：苏州上线差旅报销', '报销金额 4860 元，请核对票据并完成审批。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, 'PROCESS_INSTANCE', 'seed_inst_expense_ops_001', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('seed_notice_payment_ops_001', 100000, 'SMS', 1, 'Admin', '待审批：上线保障周付款申请', '付款金额 56800 元，请尽快完成总经理审批。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL, 'PROCESS_INSTANCE', 'seed_inst_payment_ops_001', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('seed_notice_hr_att_001', 100000, 'INTERNAL', 2, '李经理', '待审批：前端测试补卡申请', '员工在苏州客户园区提交了外勤补卡申请。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, 'PROCESS_INSTANCE', 'seed_hr_inst_att_001', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
('seed_notice_hr_leave_001', 100000, 'INTERNAL', 4, '赵HR', '待备案：前端测试调休申请', '该申请已完成部门经理审批，请完成 HR 备案。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, 'PROCESS_INSTANCE', 'seed_hr_inst_leave_001', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('seed_notice_hr_prob_001', 100000, 'INTERNAL', 1, 'Admin', '待审批：林清禾转正申请', '试用期评审已完成，请尽快完成转正审批。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, 'PROCESS_INSTANCE', 'seed_hr_inst_prob_001', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('seed_notice_hr_salary_001', 100000, 'INTERNAL', 1, 'Admin', '待审批：后端测试绩效调薪', '建议追加绩效奖金 1000 元，请审核。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 1 HOUR), NULL, 'PROCESS_INSTANCE', 'seed_hr_inst_salary_001', DATE_SUB(NOW(), INTERVAL 1 HOUR));

INSERT INTO cloud_flow_db.wf_urge_effect (
  tenant_id, task_id, urge_count, first_urge_time, last_urge_time, task_complete_time, response_seconds
) VALUES
(100000, 'seed_task_expense_ops_001', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, 7200),
(100000, 'seed_task_payment_ops_001', 1, DATE_SUB(NOW(), INTERVAL 90 MINUTE), DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL, 5400),
(100000, 'seed_task_hr_prob_001', 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, 18000);

INSERT INTO cloud_flow_db.wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name, start_user_id, start_user_name, user_id,
  form_data, is_read, read_time, create_time
) VALUES
(100000, 'seed_inst_trip_ops_001', 'business_trip', '前端测试的苏州客户上线支持出差申请', 'n2', 'HR备案', 8, '前端测试', 2,
 '{"tripNo":"CC202604070011","destination":"苏州","tripDays":3}', 1, DATE_SUB(NOW(), INTERVAL 145 HOUR), DATE_SUB(NOW(), INTERVAL 146 HOUR)),
(100000, 'seed_inst_expense_ops_001', 'biz_reimburse', '前端测试的苏州上线差旅报销', 'b2', '财务总监审批', 8, '前端测试', 2,
 '{"claimNo":"BX202604070011","amount":4860.00}', 1, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 24 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', '苏州智造上线保障周对公付款申请', 'b2', '总经理审批', 3, '王财务', 6,
 '{"paymentNo":"FK202604070011","amount":56800.00}', 0, NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 'seed_hr_inst_onboard_001', 'onboarding_approval', '林清禾入职审批', 'n1', '总经理审批', 4, '赵HR', 7,
 '{"applicationNo":"HRON202510100011","employeeName":"林清禾"}', 1, DATE_SUB(NOW(), INTERVAL 174 DAY), DATE_SUB(NOW(), INTERVAL 175 DAY)),
(100000, 'seed_hr_inst_salary_001', 'salary_adjustment_approval', '后端测试绩效调薪审批', 'n1', '总经理审批', 2, '李经理', 4,
 '{"applicationNo":"SA202604070011","amount":1000.00}', 0, NULL, DATE_SUB(NOW(), INTERVAL 5 HOUR));

-- =========================================================
-- 七、补充系统站内消息
-- =========================================================

DELETE FROM cloud_flow_db.sys_notice
WHERE notice_id BETWEEN 9911 AND 9916
   OR remark IN (
     '补充种子-上线报销审批提醒',
     '补充种子-上线付款审批提醒',
     '补充种子-补卡审批提醒',
     '补充种子-调休审批提醒',
     '补充种子-转正审批提醒',
     '补充种子-调薪审批提醒'
   );

INSERT INTO cloud_flow_db.sys_notice (
  notice_id, tenant_id, notice_title, notice_type, notice_content, sender_id, recipient_id, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(9911, 100000, '上线报销审批提醒', '1', '前端测试提交的苏州上线差旅报销已进入财务总监审批，请尽快处理。', 8, 3, '0',
 'test_fe', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 3 HOUR), '补充种子-上线报销审批提醒'),
(9912, 100000, '上线付款审批提醒', '1', '苏州智造上线保障周对公付款申请金额为 56800 元，当前等待总经理审批。', 3, 1, '0',
 'wang', DATE_SUB(NOW(), INTERVAL 90 MINUTE), 'wang', DATE_SUB(NOW(), INTERVAL 90 MINUTE), '补充种子-上线付款审批提醒'),
(9913, 100000, '补卡审批提醒', '1', '前端测试在苏州客户园区提交了外勤补卡申请，请直属上级尽快审批。', 8, 2, '0',
 'test_fe', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 6 HOUR), '补充种子-补卡审批提醒'),
(9914, 100000, '调休备案提醒', '1', '前端测试申请 4 小时调休，部门经理已同意，当前等待 HR 备案。', 8, 4, '0',
 'test_fe', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'test_fe', DATE_SUB(NOW(), INTERVAL 2 HOUR), '补充种子-调休审批提醒'),
(9915, 100000, '转正审批提醒', '1', '林清禾试用期评审材料已齐备，当前等待总经理审批转正。', 4, 1, '0',
 'zhao', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 5 HOUR), '补充种子-转正审批提醒'),
(9916, 100000, '调薪审批提醒', '1', '后端测试绩效调薪申请已提交，建议追加绩效奖金 1000 元。', 2, 1, '0',
 'li', DATE_SUB(NOW(), INTERVAL 1 HOUR), 'li', DATE_SUB(NOW(), INTERVAL 1 HOUR), '补充种子-调薪审批提醒');

-- =========================================================
-- 六、组织基础数据扩充：部门、岗位、用户、员工
-- =========================================================

INSERT INTO cloud_flow_db.sys_dept VALUES(109, 100000, 100, '0,100',      '产品部',       6, 'sun_pm',      '15888888910', 'sun.pm@cloudflow.com',      '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(110, 100000, 100, '0,100',      '实施交付部',   7, 'wu_delivery', '15888888911', 'wu.delivery@cloudflow.com', '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(111, 100000, 100, '0,100',      '客户成功部',   8, 'zheng_cs',    '15888888912', 'zheng.cs@cloudflow.com',    '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(112, 100000, 100, '0,100',      '销售部',       9, 'he_sales',    '15888888913', 'he.sales@cloudflow.com',    '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(113, 100000, 100, '0,100',      '运维部',      10, 'tang_ops',    '15888888914', 'tang.ops@cloudflow.com',    '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(114, 100000, 109, '0,100,109',  '产品设计组',   1, 'song_product','15888888915', 'song.product@cloudflow.com','0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(115, 100000, 110, '0,100,110',  '交付一组',     1, 'gao_delivery','15888888916', 'gao.delivery@cloudflow.com','0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(116, 100000, 111, '0,100,111',  '客户成功组',   1, 'xu_cs',       '15888888917', 'xu.cs@cloudflow.com',       '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(117, 100000, 112, '0,100,112',  '华东销售组',   1, 'peng_sales',  '15888888918', 'peng.sales@cloudflow.com',  '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(118, 100000, 113, '0,100,113',  '运维保障组',   1, 'xu_ops',      '15888888919', 'xu.ops@cloudflow.com',      '0', '0', 'admin', NOW(), '', NULL);
INSERT INTO cloud_flow_db.sys_dept VALUES(119, 100000, 101, '0,100,101',  '测试组',       3, 'han_qa',      '15888888920', 'han.qa@cloudflow.com',      '0', '0', 'admin', NOW(), '', NULL);

INSERT INTO cloud_flow_db.sys_user VALUES(10, 100000, 109, 'sun_pm',      '孙雨澄', 'sun.pm@cloudflow.com',      '15888888910', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '产品部负责人', '');
INSERT INTO cloud_flow_db.sys_user VALUES(11, 100000, 110, 'wu_delivery', '吴思远', 'wu.delivery@cloudflow.com', '15888888911', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '实施交付部负责人', '');
INSERT INTO cloud_flow_db.sys_user VALUES(12, 100000, 111, 'zheng_cs',    '郑雅宁', 'zheng.cs@cloudflow.com',    '15888888912', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '客户成功部负责人', '');
INSERT INTO cloud_flow_db.sys_user VALUES(13, 100000, 112, 'he_sales',    '何嘉树', 'he.sales@cloudflow.com',    '15888888913', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '销售部负责人', '');
INSERT INTO cloud_flow_db.sys_user VALUES(14, 100000, 113, 'tang_ops',    '唐志远', 'tang.ops@cloudflow.com',    '15888888914', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '运维部负责人', '');
INSERT INTO cloud_flow_db.sys_user VALUES(15, 100000, 114, 'song_product','宋清妍', 'song.product@cloudflow.com','15888888915', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '产品经理', '');
INSERT INTO cloud_flow_db.sys_user VALUES(16, 100000, 115, 'gao_delivery','高牧',   'gao.delivery@cloudflow.com','15888888916', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '实施顾问', '');
INSERT INTO cloud_flow_db.sys_user VALUES(17, 100000, 116, 'xu_cs',       '徐珂',   'xu.cs@cloudflow.com',       '15888888917', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '客户成功专员', '');
INSERT INTO cloud_flow_db.sys_user VALUES(18, 100000, 117, 'peng_sales',  '彭骁',   'peng.sales@cloudflow.com',  '15888888918', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '销售顾问', '');
INSERT INTO cloud_flow_db.sys_user VALUES(19, 100000, 118, 'xu_ops',      '许磊',   'xu.ops@cloudflow.com',      '15888888919', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '运维工程师', '');
INSERT INTO cloud_flow_db.sys_user VALUES(20, 100000, 119, 'han_qa',      '韩悦',   'han.qa@cloudflow.com',      '15888888920', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, '测试工程师', '');

INSERT INTO cloud_flow_db.sys_user_role VALUES(10, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(11, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(12, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(13, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(14, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(15, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(16, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(17, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(18, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(19, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_role VALUES(20, 5, 100000);

INSERT INTO cloud_flow_db.sys_post VALUES(5, 100000, 'product_manager',      '产品经理',       5, '0', 'admin', NOW(), '', NULL, '负责产品规划、需求拆解与版本设计');
INSERT INTO cloud_flow_db.sys_post VALUES(6, 100000, 'delivery_consultant',  '实施顾问',       6, '0', 'admin', NOW(), '', NULL, '负责项目实施、培训与上线支持');
INSERT INTO cloud_flow_db.sys_post VALUES(7, 100000, 'customer_success',     '客户成功专员',   7, '0', 'admin', NOW(), '', NULL, '负责续约、活跃度提升与客户经营');
INSERT INTO cloud_flow_db.sys_post VALUES(8, 100000, 'sales_consultant',     '销售顾问',       8, '0', 'admin', NOW(), '', NULL, '负责商机推进、方案讲解与签约跟进');
INSERT INTO cloud_flow_db.sys_post VALUES(9, 100000, 'ops_engineer',         '运维工程师',     9, '0', 'admin', NOW(), '', NULL, '负责发布、巡检、告警与应急保障');
INSERT INTO cloud_flow_db.sys_post VALUES(10,100000, 'qa_engineer',          '测试工程师',    10, '0', 'admin', NOW(), '', NULL, '负责功能测试、回归测试与质量验收');
INSERT INTO cloud_flow_db.sys_post VALUES(11,100000, 'solution_architect',   '解决方案架构师',11, '0', 'admin', NOW(), '', NULL, '负责大客户售前方案设计与技术澄清');

INSERT INTO cloud_flow_db.sys_user_post VALUES(10, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(11, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(12, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(13, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(14, 2, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(15, 5, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(16, 6, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(17, 7, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(18, 8, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(19, 9, 100000);
INSERT INTO cloud_flow_db.sys_user_post VALUES(20, 10, 100000);

INSERT INTO cloud_flow_db.hr_position (
  id, tenant_id, position_code, position_name, family_id, level_id, post_id,
  job_description, requirements, work_content, status, create_time, update_time
) VALUES
(107, 100000, 'PRODUCT_DIRECTOR_M3', '产品总监', 101, 110, 2,
 '负责产品方向、跨部门需求优先级与版本路线图管理', '具备企业软件产品规划、B端需求分析与跨部门推进能力', '统筹产品规划、交付协同与重点客户需求决策', 1, '2026-03-21 09:00:00', '2026-03-21 09:00:00'),
(108, 100000, 'DELIVERY_MANAGER_M2', '交付经理', 102, 109, 2,
 '负责实施团队管理与重点项目上线交付', '熟悉 SaaS 项目实施、培训、验收与风险管理', '统筹交付资源、项目计划与客户上线保障', 1, '2026-03-21 09:05:00', '2026-03-21 09:05:00'),
(109, 100000, 'CS_MANAGER_M2', '客户成功经理', 103, 109, 2,
 '负责重点客户续约、活跃度与客户经营体系建设', '具备续约经营、数据复盘与客户关系管理能力', '统筹客户经营计划、续约节奏与高风险客户治理', 1, '2026-03-21 09:10:00', '2026-03-21 09:10:00'),
(110, 100000, 'SALES_MANAGER_M2', '销售经理', 103, 109, 2,
 '负责商机管理、方案推进与销售目标达成', '具备企业软件销售与方案型沟通能力', '统筹商机漏斗、重点客户拜访与签约推进', 1, '2026-03-21 09:15:00', '2026-03-21 09:15:00'),
(111, 100000, 'OPS_MANAGER_M2', '运维经理', 100, 109, 2,
 '负责运维团队管理、发布保障与应急机制建设', '熟悉 DevOps、监控告警与稳定性治理', '统筹发布窗口、巡检计划和重大故障应急响应', 1, '2026-03-21 09:20:00', '2026-03-21 09:20:00'),
(112, 100000, 'PRODUCT_MANAGER_P4', '产品经理', 101, 103, 5,
 '负责流程、OA 与 HR 产品需求设计与版本管理', '熟悉原型设计、需求拆解和数据驱动优化', '输出需求文档、原型与版本验收标准', 1, '2026-03-21 09:25:00', '2026-03-21 09:25:00'),
(113, 100000, 'DELIVERY_CONSULTANT_P3', '实施顾问', 102, 102, 6,
 '负责客户现场实施、培训和上线支持', '熟悉流程配置、权限模型与项目交付方法论', '执行实施计划、培训客户管理员并收敛问题清单', 1, '2026-03-21 09:30:00', '2026-03-21 09:30:00'),
(114, 100000, 'CUSTOMER_SUCCESS_P3', '客户成功专员', 103, 102, 7,
 '负责客户活跃度、续约推进与经营分析', '具备客户沟通、经营计划和续约跟进能力', '跟进续约、使用情况和重点客户问题闭环', 1, '2026-03-21 09:35:00', '2026-03-21 09:35:00'),
(115, 100000, 'SALES_CONSULTANT_P3', '销售顾问', 103, 102, 8,
 '负责重点商机跟进、方案讲解和合同推进', '具备企业软件销售与行业方案沟通能力', '推进客户拜访、方案演示和签约流程', 1, '2026-03-21 09:40:00', '2026-03-21 09:40:00'),
(116, 100000, 'DEVOPS_P3', '运维工程师', 100, 102, 9,
 '负责环境巡检、发布保障和性能告警处理', '熟悉 CI/CD、监控平台和故障应急处理', '执行发布、巡检、备份和告警响应', 1, '2026-03-21 09:45:00', '2026-03-21 09:45:00'),
(117, 100000, 'QA_P3', '测试工程师', 100, 102, 10,
 '负责测试计划、回归验证与上线质量把控', '熟悉 Web 测试、接口测试和自动化用例设计', '执行测试用例、输出缺陷报告与上线验收', 1, '2026-03-21 09:50:00', '2026-03-21 09:50:00'),
(118, 100000, 'SA_P5', '解决方案架构师', 100, 104, 11,
 '负责重点客户售前方案、技术澄清与行业场景设计', '具备企业架构、集成方案和技术售前经验', '输出方案蓝图、澄清接口边界并支持签约推进', 1, '2026-03-21 09:55:00', '2026-03-21 09:55:00');

INSERT INTO cloud_flow_db.hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email, dept_id, post_id, position_id,
  employee_type, employee_status, hire_date, regular_date, resign_date, user_id,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(1010, 100000, 'CF20240021', '孙雨澄', 'MALE', '1989-08-16', '13800010110', 'sun.pm@cloudflow.com', 109, 2, 107,
 'FULL_TIME', 'REGULAR', '2024-01-15', '2024-07-15', NULL, 10, '2026-03-21 10:00:00', '2026-03-21 10:00:00', 'admin', 'admin', 0),
(1011, 100000, 'CF20230112', '吴思远', 'MALE', '1990-03-09', '13800010111', 'wu.delivery@cloudflow.com', 110, 2, 108,
 'FULL_TIME', 'REGULAR', '2023-11-06', '2024-05-06', NULL, 11, '2026-03-21 10:05:00', '2026-03-21 10:05:00', 'admin', 'admin', 0),
(1012, 100000, 'CF20240018', '郑雅宁', 'FEMALE', '1992-07-23', '13800010112', 'zheng.cs@cloudflow.com', 111, 2, 109,
 'FULL_TIME', 'REGULAR', '2024-03-11', '2024-09-11', NULL, 12, '2026-03-21 10:10:00', '2026-03-21 10:10:00', 'admin', 'admin', 0),
(1013, 100000, 'CF20230019', '何嘉树', 'MALE', '1988-11-02', '13800010113', 'he.sales@cloudflow.com', 112, 2, 110,
 'FULL_TIME', 'REGULAR', '2023-08-21', '2024-02-21', NULL, 13, '2026-03-21 10:15:00', '2026-03-21 10:15:00', 'admin', 'admin', 0),
(1014, 100000, 'CF20240025', '唐志远', 'MALE', '1991-01-17', '13800010114', 'tang.ops@cloudflow.com', 113, 2, 111,
 'FULL_TIME', 'REGULAR', '2024-02-19', '2024-08-19', NULL, 14, '2026-03-21 10:20:00', '2026-03-21 10:20:00', 'admin', 'admin', 0),
(1015, 100000, 'CF20240101', '宋清妍', 'FEMALE', '1995-05-12', '13800010115', 'song.product@cloudflow.com', 114, 5, 112,
 'FULL_TIME', 'REGULAR', '2024-10-08', '2025-04-08', NULL, 15, '2026-03-21 10:25:00', '2026-03-21 10:25:00', 'admin', 'admin', 0),
(1016, 100000, 'CF20260011', '高牧', 'MALE', '1997-02-14', '13800010116', 'gao.delivery@cloudflow.com', 115, 6, 113,
 'FULL_TIME', 'PROBATION', '2026-01-15', '2026-07-15', NULL, 16, '2026-03-21 10:30:00', '2026-03-21 10:30:00', 'admin', 'admin', 0),
(1017, 100000, 'CF20250014', '徐珂', 'FEMALE', '1996-10-30', '13800010117', 'xu.cs@cloudflow.com', 116, 7, 114,
 'FULL_TIME', 'REGULAR', '2025-05-12', '2025-11-12', NULL, 17, '2026-03-21 10:35:00', '2026-03-21 10:35:00', 'admin', 'admin', 0),
(1018, 100000, 'CF20240028', '彭骁', 'MALE', '1994-09-07', '13800010118', 'peng.sales@cloudflow.com', 117, 8, 115,
 'FULL_TIME', 'REGULAR', '2024-09-09', '2025-03-09', NULL, 18, '2026-03-21 10:40:00', '2026-03-21 10:40:00', 'admin', 'admin', 0),
(1019, 100000, 'CF20240116', '许磊', 'MALE', '1995-12-19', '13800010119', 'xu.ops@cloudflow.com', 118, 9, 116,
 'FULL_TIME', 'REGULAR', '2024-12-02', '2025-06-02', NULL, 19, '2026-03-21 10:45:00', '2026-03-21 10:45:00', 'admin', 'admin', 0),
(1020, 100000, 'CF20260015', '韩悦', 'FEMALE', '1998-04-21', '13800010120', 'han.qa@cloudflow.com', 119, 10, 117,
 'FULL_TIME', 'PROBATION', '2026-02-03', '2026-08-03', NULL, 20, '2026-03-21 10:50:00', '2026-03-21 10:50:00', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_employee_insurance (
  id, tenant_id, employee_id, scheme_id, base, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(103, 100000, 1010, 101, 28000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:50:00', '2026-03-24 10:50:00', 'admin', 'admin', 0),
(104, 100000, 1011, 101, 26000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:51:00', '2026-03-24 10:51:00', 'admin', 'admin', 0),
(105, 100000, 1012, 101, 24000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:52:00', '2026-03-24 10:52:00', 'admin', 'admin', 0),
(106, 100000, 1015, 101, 21000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:53:00', '2026-03-24 10:53:00', 'admin', 'admin', 0),
(107, 100000, 1016, 101, 17500.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:54:00', '2026-03-24 10:54:00', 'admin', 'admin', 0),
(108, 100000, 1017, 101, 16500.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:55:00', '2026-03-24 10:55:00', 'admin', 'admin', 0),
(109, 100000, 1018, 101, 21500.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:56:00', '2026-03-24 10:56:00', 'admin', 'admin', 0),
(110, 100000, 1019, 101, 19000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:57:00', '2026-03-24 10:57:00', 'admin', 'admin', 0),
(111, 100000, 1020, 101, 16000.00, '2026-03-24', 'ACTIVE', '2026-03-24 10:58:00', '2026-03-24 10:58:00', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_employee_tax_deduction (
  id, tenant_id, employee_id, deduction_type, amount, start_date, end_date, status, remark,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(104, 100000, 1010, 'CHILD_EDU', 1000.00, '2026-03-01', NULL, 'ACTIVE', '产品总监子女教育专项扣除样本', '2026-03-24 11:00:00', '2026-03-24 11:00:00', 'admin', 'admin', 0),
(105, 100000, 1015, 'HOUSING_RENT', 1500.00, '2026-03-01', NULL, 'ACTIVE', '产品经理租房专项扣除样本', '2026-03-24 11:01:00', '2026-03-24 11:01:00', 'admin', 'admin', 0),
(106, 100000, 1016, 'CONTINUING_EDU', 400.00, '2026-03-01', NULL, 'ACTIVE', '实施顾问继续教育专项扣除样本', '2026-03-24 11:02:00', '2026-03-24 11:02:00', 'admin', 'admin', 0),
(107, 100000, 1017, 'ELDERLY_CARE', 2000.00, '2026-03-01', NULL, 'ACTIVE', '客户成功专员赡养老人专项扣除样本', '2026-03-24 11:03:00', '2026-03-24 11:03:00', 'admin', 'admin', 0),
(108, 100000, 1018, 'HOUSING_RENT', 1500.00, '2026-03-01', NULL, 'ACTIVE', '销售顾问租房专项扣除样本', '2026-03-24 11:04:00', '2026-03-24 11:04:00', 'admin', 'admin', 0),
(109, 100000, 1019, 'HOUSING_LOAN', 1000.00, '2026-03-01', NULL, 'ACTIVE', '运维工程师住房贷款专项扣除样本', '2026-03-24 11:05:00', '2026-03-24 11:05:00', 'admin', 'admin', 0),
(110, 100000, 1020, 'CONTINUING_EDU', 400.00, '2026-03-01', NULL, 'ACTIVE', '测试工程师继续教育专项扣除样本', '2026-03-24 11:06:00', '2026-03-24 11:06:00', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_employee_salary (
  id, tenant_id, employee_id, structure_id, salary_data, total_salary, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(104, 100000, 1010, 100, '{"100":22000,"101":2500,"102":300,"103":300,"104":2900}', 28000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:10:00', '2026-03-24 11:10:00', 'admin', 'admin', 0),
(105, 100000, 1011, 100, '{"100":20000,"101":2500,"102":300,"103":300,"104":2900}', 26000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:11:00', '2026-03-24 11:11:00', 'admin', 'admin', 0),
(106, 100000, 1012, 100, '{"100":18000,"101":2500,"102":300,"103":300,"104":2900}', 24000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:12:00', '2026-03-24 11:12:00', 'admin', 'admin', 0),
(107, 100000, 1013, 100, '{"100":20000,"101":3500,"102":300,"103":300,"104":5900}', 30000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:13:00', '2026-03-24 11:13:00', 'admin', 'admin', 0),
(108, 100000, 1014, 100, '{"100":18500,"101":2500,"102":300,"103":300,"104":3400}', 25000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:14:00', '2026-03-24 11:14:00', 'admin', 'admin', 0),
(109, 100000, 1015, 100, '{"100":15500,"101":2500,"102":300,"103":300,"104":2400}', 21000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:15:00', '2026-03-24 11:15:00', 'admin', 'admin', 0),
(110, 100000, 1016, 100, '{"100":13000,"101":2200,"102":300,"103":300,"104":1700}', 17500.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:16:00', '2026-03-24 11:16:00', 'admin', 'admin', 0),
(111, 100000, 1017, 100, '{"100":12000,"101":1800,"102":300,"103":300,"104":2100}', 16500.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:17:00', '2026-03-24 11:17:00', 'admin', 'admin', 0),
(112, 100000, 1018, 100, '{"100":13000,"101":3000,"102":300,"103":300,"104":4900}', 21500.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:18:00', '2026-03-24 11:18:00', 'admin', 'admin', 0),
(113, 100000, 1019, 100, '{"100":14500,"101":2000,"102":300,"103":300,"104":1900}', 19000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:19:00', '2026-03-24 11:19:00', 'admin', 'admin', 0),
(114, 100000, 1020, 100, '{"100":11800,"101":1700,"102":300,"103":300,"104":1900}', 16000.00, '2026-03-24', 'ACTIVE', '2026-03-24 11:20:00', '2026-03-24 11:20:00', 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_schedule_plan (
  id, tenant_id, plan_name, target_type, target_id, shift_id, schedule_date, status,
  create_time, update_time, create_by, update_by
) VALUES
(11010, 100000, '高牧标准班次', 'EMPLOYEE', 1016, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11011, 100000, '高牧标准班次', 'EMPLOYEE', 1016, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11012, 100000, '高牧标准班次', 'EMPLOYEE', 1016, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11013, 100000, '彭骁标准班次', 'EMPLOYEE', 1018, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11014, 100000, '彭骁标准班次', 'EMPLOYEE', 1018, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11015, 100000, '彭骁标准班次', 'EMPLOYEE', 1018, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11016, 100000, '许磊标准班次', 'EMPLOYEE', 1019, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11017, 100000, '许磊标准班次', 'EMPLOYEE', 1019, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11018, 100000, '许磊标准班次', 'EMPLOYEE', 1019, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11019, 100000, '韩悦标准班次', 'EMPLOYEE', 1020, 103, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11020, 100000, '韩悦标准班次', 'EMPLOYEE', 1020, 103, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 'PUBLISHED', NOW(), NOW(), 1, 1),
(11021, 100000, '韩悦标准班次', 'EMPLOYEE', 1020, 103, CURDATE(), 'PUBLISHED', NOW(), NOW(), 1, 1);

INSERT INTO cloud_flow_db.hr_attendance_record (
  id, tenant_id, employee_id, attendance_date, rule_id, shift_id, check_type, check_time, expected_time, deviation_minutes, check_method,
  location, status, process_instance_id, remark, create_time, update_time, create_by, update_by, deleted
) VALUES
(9312, 100000, 1016, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 101, 103, 'CHECK_IN', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 8 HOUR + INTERVAL 58 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR, -2, 'WIFI', 'CloudFlow-Delivery', 'NORMAL', NULL, '客户培训前到岗准备资料', NOW(), NOW(), 16, 16, 0),
(9313, 100000, 1016, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 101, 103, 'CHECK_OUT', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 22 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 22, 'WIFI', 'CloudFlow-Delivery', 'NORMAL', NULL, '完成交付培训后下班', NOW(), NOW(), 16, 16, 0),
(9314, 100000, 1018, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 102, 103, 'CHECK_IN', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR + INTERVAL 5 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, 5, 'GPS', '浦东新区客户园区', 'NORMAL', NULL, '上午外出拜访重点客户', NOW(), NOW(), 18, 18, 0),
(9315, 100000, 1018, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 102, 103, 'CHECK_OUT', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR + INTERVAL 36 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 36, 'GPS', '浦东新区客户园区', 'NORMAL', NULL, '完成续约方案讲解后签退', NOW(), NOW(), 18, 18, 0),
(9316, 100000, 1019, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_IN', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 8 HOUR + INTERVAL 41 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 9 HOUR, -19, 'GPS', '总部机房', 'NORMAL', NULL, '早间执行例行巡检', NOW(), NOW(), 19, 19, 0),
(9317, 100000, 1019, DATE_SUB(CURDATE(), INTERVAL 1 DAY), 100, 103, 'CHECK_OUT', DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 21 HOUR + INTERVAL 16 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR, 196, 'GPS', '总部机房', 'NORMAL', NULL, '配合发布窗口值守后下班', NOW(), NOW(), 19, 19, 0),
(9318, 100000, 1020, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 100, 103, 'CHECK_IN', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR + INTERVAL 2 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR, 2, 'WIFI', 'CloudFlow-QA', 'NORMAL', NULL, '执行移动端回归测试前签到', NOW(), NOW(), 20, 20, 0),
(9319, 100000, 1020, DATE_SUB(CURDATE(), INTERVAL 2 DAY), 100, 103, 'CHECK_OUT', DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 8 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR, 8, 'WIFI', 'CloudFlow-QA', 'NORMAL', NULL, '完成回归测试与报告输出', NOW(), NOW(), 20, 20, 0);

INSERT INTO cloud_flow_db.hr_leave_quota (
  id, tenant_id, employee_id, leave_type_id, year, total_quota, used_quota, frozen_quota, available_quota,
  expiry_date, create_time, update_time, create_by, update_by, deleted
) VALUES
(1104, 100000, 1016, 100, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00, STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1105, 100000, 1017, 100, YEAR(CURDATE()), 7.00, 1.00, 0.00, 6.00, STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1106, 100000, 1018, 100, YEAR(CURDATE()), 7.00, 0.00, 0.00, 7.00, STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1107, 100000, 1019, 100, YEAR(CURDATE()), 6.00, 0.00, 0.00, 6.00, STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1108, 100000, 1020, 100, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00, STR_TO_DATE(CONCAT(YEAR(CURDATE()), '-12-31'), '%Y-%m-%d'), NOW(), NOW(), 'admin', 'admin', 0),
(1109, 100000, 1019, 107, YEAR(CURDATE()), 20.00, 4.00, 2.00, 14.00, DATE_ADD(CURDATE(), INTERVAL 90 DAY), NOW(), NOW(), 'admin', 'admin', 0),
(1110, 100000, 1020, 107, YEAR(CURDATE()), 12.00, 0.00, 2.50, 9.50, DATE_ADD(CURDATE(), INTERVAL 90 DAY), NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_leave_application (
  id, tenant_id, application_no, employee_id, leave_type_id, start_time, end_time, duration, unit, reason,
  process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9004, 100000, 'QJ202604070004', 1017, 100, DATE_ADD(CURDATE(), INTERVAL 4 DAY) + INTERVAL 9 HOUR, DATE_ADD(CURDATE(), INTERVAL 4 DAY) + INTERVAL 18 HOUR, 1.00, 'DAY', '陪同重点客户续约后安排补休，相关周报与续约材料已完成交接。', NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 16 HOUR), DATE_SUB(NOW(), INTERVAL 12 HOUR), 'xu_cs', 'xu_cs', 0),
(9005, 100000, 'QJ202604070005', 1019, 107, DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 14 HOUR, DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 20 HOUR, 6.00, 'HOUR', '申请使用发布值守形成的调休额度，次日白天处理个人事务。', NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), 'xu_ops', 'xu_ops', 0);

INSERT INTO cloud_flow_db.hr_overtime_application (
  id, tenant_id, application_no, employee_id, start_time, end_time, duration, overtime_type, reason,
  compensation_type, compensation_hours, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(9004, 100000, 'JB202604070004', 1019, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR + INTERVAL 30 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 24 HOUR + INTERVAL 30 MINUTE, 6.00, 'WORKDAY', '配合季度版本发布窗口值守与数据库切换验证。', 'TIME_OFF', 6.00, NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 26 HOUR), DATE_SUB(NOW(), INTERVAL 20 HOUR), 'xu_ops', 'xu_ops', 0),
(9005, 100000, 'JB202604070005', 1020, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 30 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 21 HOUR, 2.50, 'WORKDAY', '补充执行移动端提交流程回归和访客二维码兼容性测试。', 'TIME_OFF', 2.50, NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 50 HOUR), DATE_SUB(NOW(), INTERVAL 46 HOUR), 'han_qa', 'han_qa', 0);

INSERT INTO cloud_flow_db.hr_attendance_monthly (
  id, tenant_id, employee_id, year, month, work_days, actual_days, late_times, early_times, absent_days,
  missing_times, leave_days, overtime_hours, attendance_rate, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(12012, 100000, 1016, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 0, 0.00, 1.50, 95.65, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12013, 100000, 1017, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 0, 1.00, 0.00, 95.65, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12014, 100000, 1018, YEAR(CURDATE()), MONTH(CURDATE()), 23, 23, 0, 0, 0, 0, 0.00, 0.00, 100.00, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12015, 100000, 1019, YEAR(CURDATE()), MONTH(CURDATE()), 23, 23, 0, 0, 0, 0, 0.00, 6.00, 100.00, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0),
(12016, 100000, 1020, YEAR(CURDATE()), MONTH(CURDATE()), 23, 22, 0, 0, 0, 0, 0.00, 2.50, 95.65, 'CONFIRMED', NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO cloud_flow_db.hr_salary_adjustment (
  id, tenant_id, application_no, employee_id, adjustment_type, adjustment_reason,
  before_salary_data, after_salary_data, before_total, after_total, adjustment_amount, adjustment_rate,
  effective_date, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 'SA202604070012', 1015, 'PERFORMANCE', '产品经理完成新版工作台需求梳理与交付协同闭环，追加季度绩效奖金。',
 '{"100":14800,"101":2300,"102":300,"103":300,"104":2100}', '{"100":15500,"101":2500,"102":300,"103":300,"104":2400}',
 19800.00, 21000.00, 1200.00, 6.06, DATE_SUB(CURDATE(), INTERVAL 15 DAY), NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 13 DAY), 'sun_pm', 'sun_pm', 0),
(103, 100000, 'SA202604070013', 1018, 'PERFORMANCE', '销售顾问完成重点客户续约与华东区域商机转化，追加绩效奖金。',
 '{"100":12300,"101":2800,"102":300,"103":300,"104":4300}', '{"100":13000,"101":3000,"102":300,"103":300,"104":4900}',
 20000.00, 21500.00, 1500.00, 7.50, DATE_SUB(CURDATE(), INTERVAL 10 DAY), NULL, 'APPROVED', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 9 DAY), 'he_sales', 'he_sales', 0);

INSERT INTO cloud_flow_db.hr_recruitment_request (
  id, tenant_id, request_no, dept_id, position_id, headcount, job_requirements,
  salary_min, salary_max, expected_date, process_instance_id, status, hired_count,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(2012, 100000, 'HRRQ202604070012', 110, 118, 1, '负责大客户售前方案设计、接口澄清与招投标答疑，能够独立输出行业解决方案与集成边界说明。',
 25000.00, 35000.00, DATE_ADD(CURDATE(), INTERVAL 30 DAY), NULL, 'RECRUITING', 0, DATE_SUB(NOW(), INTERVAL 20 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 'zhao', 'zhao', 0),
(2013, 100000, 'HRRQ202604070013', 119, 117, 1, '负责 Web、移动端与流程配置场景测试，熟悉接口联调、回归测试与缺陷跟踪。',
 14000.00, 20000.00, DATE_ADD(CURDATE(), INTERVAL 15 DAY), NULL, 'RECRUITING', 0, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_candidate (
  id, tenant_id, request_id, name, gender, phone, email, resume_attachment_urls, source, status, reject_reason,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(3012, 100000, 2012, '顾文韬', 'MALE', '13900012021', 'gu.wentao@example.com', 'https://demo.cloudflow.local/files/hr/resume-guwentao.pdf,https://demo.cloudflow.local/files/hr/resume-guwentao-project.pdf', 'HEADHUNTER', 'INTERVIEW', NULL, DATE_SUB(NOW(), INTERVAL 18 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), 'zhao', 'zhao', 0),
(3013, 100000, 2012, '马会', 'FEMALE', '13900012022', 'ma.hui@example.com', 'https://demo.cloudflow.local/files/hr/resume-mahui.pdf', 'REFERRAL', 'SCREENING', NULL, DATE_SUB(NOW(), INTERVAL 16 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), 'zhao', 'zhao', 0),
(3014, 100000, 2013, '冯子轩', 'MALE', '13900012023', 'feng.zixuan@example.com', 'https://demo.cloudflow.local/files/hr/resume-fengzixuan.pdf,https://demo.cloudflow.local/files/hr/resume-fengzixuan-award.pdf', 'WEBSITE', 'INTERVIEW', NULL, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), 'zhao', 'zhao', 0),
(3015, 100000, 2013, '周绮雯', 'FEMALE', '13900012024', 'zhou.qiwen@example.com', 'https://demo.cloudflow.local/files/hr/resume-zhouqiwen.pdf', 'REFERRAL', 'OFFER', NULL, DATE_SUB(NOW(), INTERVAL 9 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_interview (
  id, tenant_id, candidate_id, interview_round, interview_type, interview_time, location, interviewers,
  evaluation, score, result, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(4013, 100000, 3012, 'FIRST', 'VIDEO', DATE_SUB(NOW(), INTERVAL 7 DAY), '腾讯会议 方案组频道', '[10,11]', '方案结构完整，能清楚拆分集成边界与实施风险。', 88, 'PASS', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 8 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), 'zhao', 'zhao', 0),
(4014, 100000, 3012, 'FINAL', 'ONSITE', DATE_SUB(NOW(), INTERVAL 4 DAY), '上海总部 6F 战略会议室', '[1,10,13]', '行业场景理解较强，适合承担重点项目售前支撑。', 91, 'PASS', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), 'zhao', 'zhao', 0),
(4015, 100000, 3014, 'FIRST', 'VIDEO', DATE_SUB(NOW(), INTERVAL 3 DAY), '飞书会议 QA 频道', '[20,9]', '测试方法扎实，移动端兼容性场景经验较好。', 86, 'PASS', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY), 'zhao', 'zhao', 0),
(4016, 100000, 3015, 'FINAL', 'ONSITE', DATE_SUB(NOW(), INTERVAL 1 DAY), '上海总部 5F 面试区', '[20,2,4]', '沟通稳定，适合承担流程平台回归与发布验证工作。', 89, 'PASS', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_offer (
  id, tenant_id, offer_no, candidate_id, dept_id, position_id, salary, expected_date, expiry_date,
  offer_content, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 'OFFER20260407000003', 3015, 119, 117, 18000.00, DATE_ADD(CURDATE(), INTERVAL 10 DAY), DATE_ADD(CURDATE(), INTERVAL 17 DAY),
 CONCAT('候选人：周绮雯\n', '拟入职部门：测试组\n', '岗位：测试工程师\n', '月度总包：18,000 元\n', '备注：负责流程平台与移动端回归测试。'),
 NULL, 'SENT', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 12 HOUR), 'zhao', 'zhao', 0);

-- =========================================================
-- 七、组织扩充后的业务联动数据拓展
-- =========================================================

INSERT INTO cloud_flow_db.sys_meeting_room (
  room_id, tenant_id, name, capacity, location, equipment, status, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9005, 100000, '交付作战室', 14, '3楼东区', '["双屏投屏","远程会议终端","项目白板"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 9 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9006, 100000, '销售洽谈室', 8, '1楼西侧', '["55寸屏幕","电话会议终端","签约摄像头"]', '1', 'admin', DATE_SUB(NOW(), INTERVAL 9 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0');

INSERT INTO cloud_flow_db.sys_announcement (
  announcement_id, tenant_id, title, content, type, scope_type, scope_value, status, priority, is_top,
  sender_id, publish_time, expire_time, create_by, create_time, update_by, update_time, del_flag
) VALUES
(9612, 100000, '产品与交付协同周通知',
 '<p><strong>适用范围：</strong>产品部、实施交付部、测试组</p><p>本周统一推进工作台迭代需求梳理、交付上线风险盘点与回归用例收口，相关输出物需在周五下班前归档到项目知识库。</p>',
 '2', 'ALL', NULL, '1', 'H', 1, 10, DATE_SUB(NOW(), INTERVAL 18 HOUR), DATE_ADD(NOW(), INTERVAL 10 DAY), 'sun_pm', DATE_SUB(NOW(), INTERVAL 18 HOUR), 'sun_pm', DATE_SUB(NOW(), INTERVAL 18 HOUR), '0'),
(9613, 100000, '华东重点客户续约攻坚安排',
 '<p><strong>适用范围：</strong>销售部</p><p>华东销售组需在本周内完成续约客户风险分层、拜访路线和报价策略复核，客户成功组同步补充活跃度与历史问题台账。</p>',
 '1', 'DEPT', '112', '1', 'H', 0, 13, DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 7 DAY), 'he_sales', DATE_SUB(NOW(), INTERVAL 12 HOUR), 'he_sales', DATE_SUB(NOW(), INTERVAL 12 HOUR), '0'),
(9614, 100000, '运维应急演练计划',
 '<p>本周四晚进行运维应急演练，覆盖告警升级、数据库切换、用车联动与值班交接。运维保障组、交付一组、测试组需共同参加。</p>',
 '2', 'ALL', NULL, '1', 'M', 0, 14, DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 12 DAY), 'tang_ops', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'tang_ops', DATE_SUB(NOW(), INTERVAL 8 HOUR), '0');

INSERT INTO cloud_flow_db.sys_announcement_read (tenant_id, announcement_id, user_id, read_time) VALUES
(100000, 9612, 10, DATE_SUB(NOW(), INTERVAL 17 HOUR)),
(100000, 9612, 11, DATE_SUB(NOW(), INTERVAL 16 HOUR)),
(100000, 9612, 15, DATE_SUB(NOW(), INTERVAL 14 HOUR)),
(100000, 9612, 16, DATE_SUB(NOW(), INTERVAL 13 HOUR)),
(100000, 9612, 20, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 9613, 13, DATE_SUB(NOW(), INTERVAL 11 HOUR)),
(100000, 9613, 18, DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 9613, 12, DATE_SUB(NOW(), INTERVAL 9 HOUR)),
(100000, 9614, 14, DATE_SUB(NOW(), INTERVAL 7 HOUR)),
(100000, 9614, 19, DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 9614, 20, DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(100000, 9614, 7, DATE_SUB(NOW(), INTERVAL 4 HOUR));

INSERT INTO cloud_flow_db.sys_schedule_event (
  event_id, tenant_id, title, description, start_time, end_time, is_all_day, type, room_id, creator_id, attendees, create_time, update_time, del_flag
) VALUES
(9513, 100000, 'AI 表单能力评审会',
 '评审新工作台中的 AI 表单生成、字段推荐与交付配置边界，明确产品和实施的配合方式。', DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 10 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 11 HOUR + INTERVAL 30 MINUTE, 0, 'MEETING', 9005, 10, '[10,15,2,8]', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), '0'),
(9514, 100000, '华东交付启动会',
 '确认苏州与昆山两地项目的上线节奏、风险清单、现场支持和车辆安排。', DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR + INTERVAL 30 MINUTE,
 DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 11 HOUR + INTERVAL 30 MINUTE, 0, 'MEETING', 9005, 11, '[11,16,17,19]', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9515, 100000, '重点客户续约复盘',
 '联合客户成功和销售复核重点客户活跃度、续约障碍与本周拜访安排。', DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 15 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 16 HOUR + INTERVAL 30 MINUTE, 0, 'MEETING', 9006, 12, '[12,17,13,18,3]', DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 5 HOUR), '0'),
(9516, 100000, '月度销售漏斗评审',
 '评审华东区域商机推进节奏、演示排期与续约客户商务策略。', DATE_ADD(CURDATE(), INTERVAL 3 DAY) + INTERVAL 10 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 3 DAY) + INTERVAL 11 HOUR, 0, 'MEETING', 9006, 13, '[13,18,10]', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9517, 100000, '运维应急演练',
 '覆盖监控告警、应用回滚、数据库切换和值班升级链路。', DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 19 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 2 DAY) + INTERVAL 21 HOUR, 0, 'WORK', 9003, 14, '[14,19,7,9]', DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR), '0'),
(9518, 100000, '测试用例评审',
 '梳理移动端审批、访客预约、用车申请与差旅报销的回归范围，补齐季度版本回归池。', DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 16 HOUR,
 DATE_ADD(CURDATE(), INTERVAL 1 DAY) + INTERVAL 17 HOUR + INTERVAL 30 MINUTE, 0, 'MEETING', 9001, 20, '[20,8,9,15]', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR), '0');

INSERT INTO cloud_flow_db.sys_work_task (
  task_id, tenant_id, title, description, assignee_id, owner_id, dept_id, priority, status, due_date, tags, parent_id,
  create_by, create_time, update_by, update_time, del_flag
) VALUES
(9425, 100000, '输出新工作台版本需求清单', '梳理产品部与测试组关于工作台视觉、数据入口和审批快捷操作的核心需求。', 15, 10, 114, 2, 'TODO',
 DATE_ADD(NOW(), INTERVAL 2 DAY), '["产品","工作台","需求"]', NULL, 'sun_pm', DATE_SUB(NOW(), INTERVAL 12 HOUR), 'sun_pm', DATE_SUB(NOW(), INTERVAL 12 HOUR), '0'),
(9426, 100000, '梳理华东项目上线风险清单', '盘点交付过程中的账号、环境、培训与数据初始化风险，形成周报附件。', 16, 11, 115, 2, 'DOING',
 DATE_ADD(NOW(), INTERVAL 36 HOUR), '["交付","上线","风险"]', NULL, 'wu_delivery', DATE_SUB(NOW(), INTERVAL 11 HOUR), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0'),
(9427, 100000, '制定续约客户健康分层', '结合登录活跃、工单响应和回款情况，形成客户健康度分层名单。', 17, 12, 116, 1, 'TODO',
 DATE_ADD(NOW(), INTERVAL 3 DAY), '["客户成功","续约","健康度"]', NULL, 'zheng_cs', DATE_SUB(NOW(), INTERVAL 10 HOUR), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 10 HOUR), '0'),
(9428, 100000, '推进苏南制造客户续约方案', '准备商务报价、成功案例和现场拜访材料，支持本周重点客户续约推进。', 18, 13, 117, 2, 'DOING',
 DATE_ADD(NOW(), INTERVAL 2 DAY), '["销售","续约","客户拜访"]', NULL, 'he_sales', DATE_SUB(NOW(), INTERVAL 9 HOUR), 'he_sales', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9429, 100000, '整理季度监控告警优化项', '收敛误报告警、夜间通知和值班升级策略，提交给运维应急演练使用。', 19, 14, 118, 2, 'TODO',
 DATE_ADD(NOW(), INTERVAL 4 DAY), '["运维","监控","告警"]', NULL, 'tang_ops', DATE_SUB(NOW(), INTERVAL 8 HOUR), 'tang_ops', DATE_SUB(NOW(), INTERVAL 8 HOUR), '0'),
(9430, 100000, '维护移动端回归用例池', '补充访客预约、用车申请、差旅报销和审批催办场景的回归用例。', 20, 20, 119, 1, 'DOING',
 DATE_ADD(NOW(), INTERVAL 30 HOUR), '["测试","移动端","回归"]', NULL, 'han_qa', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'han_qa', DATE_SUB(NOW(), INTERVAL 2 HOUR), '0'),
(9431, 100000, '评审解决方案架构师 JD', '结合实施与销售协同场景，补齐解决方案架构师岗位职责与能力模型。', 10, 4, 109, 1, 'TODO',
 DATE_ADD(NOW(), INTERVAL 5 DAY), '["招聘","方案","JD"]', NULL, 'sun_pm', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 5 HOUR), '0'),
(9432, 100000, '准备交付团队培训计划', '输出交付一组新员工的产品知识、客户沟通和上线保障培训计划。', 11, 4, 110, 1, 'TODO',
 DATE_ADD(NOW(), INTERVAL 6 DAY), '["交付","培训","入职"]', NULL, 'wu_delivery', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zhao', DATE_SUB(NOW(), INTERVAL 4 HOUR), '0'),
(9433, 100000, '盘点重点客户活跃度与续约风险', '筛选近 90 天活跃下降客户，并同步历史问题和续约窗口。', 12, 1, 111, 2, 'DOING',
 DATE_ADD(NOW(), INTERVAL 2 DAY), '["客户成功","数据","续约"]', NULL, 'zheng_cs', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 90 MINUTE), '0'),
(9434, 100000, '规划二季度销售拜访路线', '结合华东制造客户和合作伙伴，输出连续两周的拜访与演示路线。', 13, 1, 112, 1, 'TODO',
 DATE_ADD(NOW(), INTERVAL 5 DAY), '["销售","路线","拜访"]', NULL, 'he_sales', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'admin', DATE_SUB(NOW(), INTERVAL 80 MINUTE), '0');

INSERT INTO cloud_flow_db.sys_asset (
  asset_id, tenant_id, asset_code, name, category, model, status, price, purchase_date, owner_id, location, remark,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9006, 100000, 'IT-LAP-2026-006', 'MacBook Air 产品设计机', '笔记本电脑', 'Apple M4 24GB/512GB', '2', 11299.00, '2026-02-18', 15, '产品设计组工位 P-03', '用于产品原型设计与评审演示', '0', 'chen', DATE_SUB(NOW(), INTERVAL 45 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(9007, 100000, 'IT-LAP-2026-007', 'Dell Latitude 交付顾问机', '笔记本电脑', 'i7/32GB/1TB', '2', 12800.00, '2026-02-20', 16, '交付一组工位 D-05', '用于客户现场实施与培训', '0', 'chen', DATE_SUB(NOW(), INTERVAL 44 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9008, 100000, 'IT-PHN-2026-008', 'iPhone 15 客户成功外勤机', '手机设备', '256G 黑色', '2', 6999.00, '2026-02-22', 17, '客户成功组储物柜 CS-02', '用于外勤回访与客户演示录屏', '0', 'chen', DATE_SUB(NOW(), INTERVAL 42 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9009, 100000, 'IT-LAP-2026-009', 'ThinkPad T14 销售演示机', '笔记本电脑', 'Ryzen7/32GB/1TB', '2', 10800.00, '2026-02-23', 18, '华东销售组工位 S-08', '预装重点客户演示环境', '0', 'chen', DATE_SUB(NOW(), INTERVAL 41 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 18 HOUR)),
(9010, 100000, 'IT-LAP-2026-010', '运维巡检笔记本', '笔记本电脑', 'i7/16GB/512GB', '2', 9200.00, '2026-02-24', 19, '运维保障组值守柜 OPS-01', '用于机房巡检和告警排查', '0', 'chen', DATE_SUB(NOW(), INTERVAL 40 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(9011, 100000, 'IT-MOB-2026-011', 'Android 测试机套装', '移动设备', 'Android 14 多机型', '2', 14600.00, '2026-02-25', 20, '测试组设备柜 QA-04', '覆盖主流安卓审批与访客扫码场景', '0', 'chen', DATE_SUB(NOW(), INTERVAL 39 DAY), 'chen', DATE_SUB(NOW(), INTERVAL 8 HOUR));

INSERT INTO cloud_flow_db.sys_consumable (
  consumable_id, tenant_id, name, model, unit, quantity, low_stock_threshold, default_supplier_id, target_stock, warn_enabled, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9006, 100000, '白板笔', '黑蓝红三色套装', '盒', 28, 6, 9001, 40, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 18 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9007, 100000, '一次性访客胸卡', '透明硬卡套', '个', 120, 30, 9001, 160, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 18 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(9008, 100000, '移动电源', '20000mAh', '个', 10, 3, 9002, 20, 1, '0', 'admin', DATE_SUB(NOW(), INTERVAL 15 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 3 HOUR));

INSERT INTO cloud_flow_db.sys_asset_log (
  log_id, tenant_id, ref_id, ref_type, type, quantity_change, operator_id, target_id, remark, create_time
) VALUES
(9215, 100000, 9006, '1', '领用', 1, 7, 15, '产品设计组新增产品经理设备发放', DATE_SUB(NOW(), INTERVAL 38 DAY)),
(9216, 100000, 9007, '1', '领用', 1, 7, 16, '交付顾问入组设备发放', DATE_SUB(NOW(), INTERVAL 37 DAY)),
(9217, 100000, 9008, '1', '领用', 1, 7, 17, '客户成功外勤手机设备发放', DATE_SUB(NOW(), INTERVAL 35 DAY)),
(9218, 100000, 9009, '1', '领用', 1, 7, 18, '销售演示设备发放', DATE_SUB(NOW(), INTERVAL 34 DAY)),
(9219, 100000, 9010, '1', '领用', 1, 7, 19, '运维巡检值守设备发放', DATE_SUB(NOW(), INTERVAL 33 DAY)),
(9220, 100000, 9011, '1', '领用', 1, 7, 20, '测试组安卓回归设备发放', DATE_SUB(NOW(), INTERVAL 32 DAY)),
(9221, 100000, 9006, '2', '出库', -6, 1, NULL, '协同周会议室与培训区补充白板笔', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(9222, 100000, 9007, '2', '出库', -20, 1, NULL, '本周访客接待与培训活动使用胸卡', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO cloud_flow_db.sys_vehicle (
  vehicle_id, tenant_id, license_plate, brand, model, color, capacity, status, mileage, purchase_date, insurance_expiry, location,
  remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9004, 100000, '沪A-CF004', '沃尔沃', 'XC60', '灰色', 5, '1', 8320.00, '2025-09-15', '2026-09-14', '总部地库 C 区', '适合重点客户拜访与管理层外勤', '0', 'admin', DATE_SUB(NOW(), INTERVAL 160 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(9005, 100000, '沪A-CF005', '江铃', '全顺', '蓝色', 9, '1', 5620.00, '2025-11-08', '2026-11-07', '总部地库 D 区', '适合交付培训与多人外勤接送', '0', 'admin', DATE_SUB(NOW(), INTERVAL 120 DAY), 'admin', DATE_SUB(NOW(), INTERVAL 1 DAY));

INSERT INTO cloud_flow_db.sys_vehicle_usage (
  usage_id, tenant_id, vehicle_id, applicant_id, driver_id, start_time, end_time, destination, return_location, is_round_trip, reason,
  passenger_count, passengers, start_mileage, end_mileage, actual_start_time, actual_end_time, attachment_url, status, process_instance_id,
  del_flag, create_by, create_time, update_by, update_time
) VALUES
(9012, 100000, 9004, 11, 19,
 DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 8 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 18 HOUR,
 '苏州工业园区客户现场', '总部地库 C 区', 1, '交付启动会后赴客户现场完成环境核验与培训准备。',
 3, '吴思远,高牧,徐珂', 8320.00, 8568.00,
 DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 8 HOUR + INTERVAL 15 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 3 DAY) + INTERVAL 17 HOUR + INTERVAL 45 MINUTE,
 'https://demo.cloudflow.local/files/vehicle/usage-9012-summary.pdf', '4', NULL, '0', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 70 HOUR), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 60 HOUR)),
(9013, 100000, 9005, 13, 19,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 19 HOUR,
 '昆山客户培训中心', '总部地库 D 区', 1, '销售与交付联合前往培训中心进行续约方案演示与培训洽谈。',
 3, '何嘉树,彭骁,客户代表', 5620.00, 5896.00,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 9 HOUR + INTERVAL 10 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 18 HOUR + INTERVAL 30 MINUTE,
 'https://demo.cloudflow.local/files/vehicle/usage-9013-summary.pdf', '4', NULL, '0', 'he_sales', DATE_SUB(NOW(), INTERVAL 52 HOUR), 'he_sales', DATE_SUB(NOW(), INTERVAL 42 HOUR)),
(9014, 100000, 9004, 12, 7,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 13 HOUR,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 18 HOUR,
 '浦东续约客户总部', '总部地库 C 区', 1, '客户成功团队拜访重点续约客户，复核问题清单与阶段里程碑。',
 2, '郑雅宁,徐珂', 8568.00, 8692.00,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 13 HOUR + INTERVAL 20 MINUTE,
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 17 HOUR + INTERVAL 40 MINUTE,
 'https://demo.cloudflow.local/files/vehicle/usage-9014-summary.pdf', '4', NULL, '0', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 28 HOUR), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 18 HOUR));

INSERT INTO cloud_flow_db.sys_vehicle_expense (
  expense_id, tenant_id, vehicle_id, usage_id, expense_type, amount, expense_date, description, receipt_url, create_by, create_time
) VALUES
(9109, 100000, 9004, 9012, '1', 318.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '苏州客户现场往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9109.jpg', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 68 HOUR)),
(9110, 100000, 9004, 9012, '3', 55.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '苏州园区停车费', 'https://demo.cloudflow.local/files/vehicle/receipts/park-9110.jpg', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 67 HOUR)),
(9111, 100000, 9005, 9013, '1', 356.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '昆山培训中心往返油费', 'https://demo.cloudflow.local/files/vehicle/receipts/fuel-9111.jpg', 'he_sales', DATE_SUB(NOW(), INTERVAL 49 HOUR)),
(9112, 100000, 9005, 9013, '2', 68.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '昆山高速通行费', 'https://demo.cloudflow.local/files/vehicle/receipts/toll-9112.jpg', 'he_sales', DATE_SUB(NOW(), INTERVAL 48 HOUR)),
(9113, 100000, 9004, NULL, '4', 1260.00, DATE_SUB(CURDATE(), INTERVAL 6 DAY), '季度保养与轮胎检测', 'https://demo.cloudflow.local/files/vehicle/receipts/repair-9113.jpg', 'admin', DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO cloud_flow_db.sys_visitor (
  visitor_id, tenant_id, visitor_name, visitor_phone, visitor_company, visitor_count, id_card, visit_reason,
  host_id, host_name, host_dept, visit_date, visit_time_start, visit_time_end, actual_arrive, actual_leave,
  visit_area, car_plate, belongings, photo_url, pass_code, status, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9713, 100000, '罗总', '13900013001', '启衡软件', 2, '310***********4561',
 '参加 AI 表单能力评审并沟通联合交付机会。', 10, '孙雨澄', '产品部', DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:00:00', '12:00:00',
 NULL, NULL, '交付作战室,客户演示中心', '沪C86321', '演示资料,合作方案', 'https://demo.cloudflow.local/files/visitor/9713.jpg', 'PASS-CF-9713',
 'CONFIRMED', '需安排联合演示账号。', '0', 'sun_pm', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'sun_pm', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(9714, 100000, '邵经理', '13900013002', '苏州联拓制造', 3, '320***********6721',
 '确认交付计划与培训排期，现场复核项目环境准备情况。', 11, '吴思远', '实施交付部', DATE_ADD(CURDATE(), INTERVAL 2 DAY), '09:30:00', '15:30:00',
 NULL, NULL, '交付作战室,培训教室', '苏E78091', '项目资料,培训电脑', 'https://demo.cloudflow.local/files/visitor/9714.jpg', 'PASS-CF-9714',
 'CONFIRMED', '需预留培训教室前排座位。', '0', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9715, 100000, '韩总监', '13900013003', '景曜科技', 2, '330***********5523',
 '就重点客户续约与客户成功联合运营方案进行复盘交流。', 12, '郑雅宁', '客户成功部', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '14:00:00', '17:00:00',
 DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 14 HOUR + INTERVAL 8 MINUTE, DATE_SUB(CURDATE(), INTERVAL 1 DAY) + INTERVAL 16 HOUR + INTERVAL 52 MINUTE,
 '销售洽谈室,6楼战略会议室', NULL, '平板电脑,项目清单', 'https://demo.cloudflow.local/files/visitor/9715.jpg', 'PASS-CF-9715',
 'COMPLETED', '已完成联合复盘。', '0', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 30 HOUR), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(9716, 100000, '戴主任', '13900013004', '华东产业园运营中心', 1, '310***********8824',
 '沟通园区客户拜访安排和联合宣讲合作。', 13, '何嘉树', '销售部', DATE_SUB(CURDATE(), INTERVAL 2 DAY), '10:30:00', '11:30:00',
 DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 10 HOUR + INTERVAL 25 MINUTE, DATE_SUB(CURDATE(), INTERVAL 2 DAY) + INTERVAL 11 HOUR + INTERVAL 40 MINUTE,
 '销售洽谈室', '沪B91320', '宣传册,客户名单', 'https://demo.cloudflow.local/files/visitor/9716.jpg', 'PASS-CF-9716',
 'COMPLETED', '已确认后续联合拜访。', '0', 'he_sales', DATE_SUB(NOW(), INTERVAL 54 HOUR), 'he_sales', DATE_SUB(NOW(), INTERVAL 46 HOUR));

INSERT INTO cloud_flow_db.sys_duty_schedule (
  schedule_id, tenant_id, title, schedule_type, duty_date, shift_type, start_time, end_time,
  user_id, user_name, backup_user_id, backup_user_name, dept_id, dept_name, location,
  duty_content, check_in_time, check_out_time, status, swap_reason, remark, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9813, 100000, '运维夜间值守', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '19:00:00', '23:30:00',
 19, '许磊', 14, '唐志远', 118, '运维保障组', '总部运维室',
 '负责发布窗口监控、告警升级与数据库切换预案确认。', NULL, NULL, 'SCHEDULED', NULL, '与运维应急演练联动。', '0', 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 HOUR), 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 HOUR)),
(9814, 100000, '交付支持值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 2 DAY), 'DAY', '09:00:00', '18:00:00',
 16, '高牧', 11, '吴思远', 115, '交付一组', '客户演示中心',
 '保障培训教室、客户账号和现场资料发放。', NULL, NULL, 'SCHEDULED', NULL, '交付启动会后续支持排班。', '0', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 6 HOUR), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(9815, 100000, '客户续约热线值班', 'DAILY', DATE_ADD(CURDATE(), INTERVAL 3 DAY), 'DAY', '09:00:00', '18:00:00',
 17, '徐珂', 12, '郑雅宁', 116, '客户成功组', '客户成功服务台',
 '负责本周重点续约客户热线答疑、问题升级和资料回传。', NULL, NULL, 'SCHEDULED', NULL, '与销售续约攻坚安排联动。', '0', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(9816, 100000, '测试回归值班', 'EMERGENCY', DATE_ADD(CURDATE(), INTERVAL 1 DAY), 'NIGHT', '18:30:00', '22:00:00',
 20, '韩悦', 14, '唐志远', 119, '测试组', '测试组工位区',
 '负责回归用例执行、冒烟结果同步和缺陷升级。', NULL, NULL, 'SCHEDULED', NULL, '配合移动端回归用例池维护任务。', '0', 'han_qa', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'han_qa', DATE_SUB(NOW(), INTERVAL 4 HOUR));

INSERT INTO cloud_flow_db.biz_business_trip (
  id, tenant_id, instance_id, user_id, user_name, trip_no, departure, destination, start_date, end_date, trip_days,
  transport_type, estimated_cost, accommodation, contact_phone, emergency_contact, emergency_phone, project_name, companions,
  reason, itinerary, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9012, 100000, NULL, 16, '高牧', 'CC202604070012', '上海', '苏州',
 DATE_SUB(CURDATE(), INTERVAL 3 DAY), DATE_SUB(CURDATE(), INTERVAL 2 DAY), 2.0,
 'TRAIN', 1680.00, 'SELF', '13800012016', '吴思远', '13800012011', '华东交付培训专项', '["徐珂"]',
 '赴苏州客户现场完成交付培训、环境复核与项目问题收口。',
 '[{"date":"第1天","plan":"上午出发，下午完成培训环境检查与资料确认"},{"date":"第2天","plan":"组织培训、收集问题并返程"}]',
 'https://demo.cloudflow.local/files/trip/cc202604070012-plan.pdf',
 'APPROVED', 115, '交付一组', '0', 'gao_delivery', DATE_SUB(NOW(), INTERVAL 20 HOUR), 'gao_delivery', DATE_SUB(NOW(), INTERVAL 16 HOUR));

INSERT INTO cloud_flow_db.biz_expense_claim (
  id, tenant_id, instance_id, user_id, user_name, claim_no, category, total_amount, description, status,
  dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9012, 100000, NULL, 16, '高牧', 'BX202604070012', 'TRAVEL', 1680.00,
 '华东交付培训专项差旅报销，包含高铁、住宿与餐补。',
 'APPROVED', 115, '交付一组', '0', 'gao_delivery', DATE_SUB(NOW(), INTERVAL 14 HOUR), 'gao_delivery', DATE_SUB(NOW(), INTERVAL 10 HOUR));

INSERT INTO cloud_flow_db.biz_expense_item (
  id, tenant_id, claim_id, expense_type, amount, expense_date, description, receipt_url, vehicle_expense_id
) VALUES
(901121, 100000, 9012, 'TRANSPORT', 620.00, DATE_SUB(CURDATE(), INTERVAL 3 DAY), '上海虹桥往返苏州高铁票', 'https://demo.cloudflow.local/files/expense/bx9012-train.jpg', NULL),
(901122, 100000, 9012, 'MEAL', 260.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '客户培训期间工作餐与加班餐', 'https://demo.cloudflow.local/files/expense/bx9012-meal.jpg', NULL),
(901123, 100000, 9012, 'HOTEL', 800.00, DATE_SUB(CURDATE(), INTERVAL 2 DAY), '客户园区附近住宿一晚', 'https://demo.cloudflow.local/files/expense/bx9012-hotel.jpg', NULL);

INSERT INTO cloud_flow_db.biz_payment_request (
  id, tenant_id, instance_id, user_id, user_name, payment_no, payee_name, payee_account, payee_bank, amount,
  payment_type, reason, expected_date, attachment_url, status, dept_id, dept_name, del_flag, create_by, create_time, update_by, update_time
) VALUES
(9012, 100000, NULL, 3, '王财务', 'FK202604070012',
 '上海澄镜培训服务有限公司', '31050100098765432100', '浦发银行上海张江支行', 26800.00,
 'SERVICE', '支付华东客户培训与续约工作坊服务费，覆盖交付顾问外部讲师、培训物料与现场统筹服务。',
 DATE_ADD(CURDATE(), INTERVAL 5 DAY),
 'https://demo.cloudflow.local/files/payment/fk202604070012-contract.pdf',
 'APPROVED', 102, '财务部', '0', 'wang', DATE_SUB(NOW(), INTERVAL 9 HOUR), 'wang', DATE_SUB(NOW(), INTERVAL 6 HOUR));

-- =========================================================
-- 八、组织扩充后的支撑数据：编制、汇报、合同、文件、通知
-- =========================================================

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id IN (
  'seed_notice_org_001',
  'seed_notice_org_002',
  'seed_notice_org_003',
  'seed_notice_org_004',
  'seed_notice_org_005',
  'seed_notice_org_006'
);

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id IN (
  'seed_msg_org_001',
  'seed_msg_org_002',
  'seed_msg_org_003',
  'seed_msg_org_004',
  'seed_msg_org_005',
  'seed_msg_org_006'
);

DELETE FROM cloud_flow_db.wf_notification_config
WHERE config_id IN ('seed_notify_003', 'seed_notify_004', 'seed_notify_005');

DELETE FROM cloud_flow_db.workflow_archive
WHERE id IN ('seed_archive_001', 'seed_archive_002');

DELETE FROM cloud_flow_db.wf_audit_log
WHERE id IN ('seed_audit_002', 'seed_audit_003');

DELETE FROM cloud_flow_db.sys_notice
WHERE notice_id BETWEEN 9917 AND 9924
   OR remark IN (
     '组织扩充-需求评审提醒',
     '组织扩充-交付启动会提醒',
     '组织扩充-续约复盘提醒',
     '组织扩充-运维演练提醒',
     '组织扩充-测试回归提醒',
     '组织扩充-报销归档提醒',
     '组织扩充-JD评审提醒',
     '组织扩充-客户接待提醒'
   );

DELETE FROM cloud_flow_db.sys_file
WHERE file_id IN (93001,93002,93003,93004,93005,93006,93007,93008,93009,93010);

DELETE FROM cloud_flow_db.sys_audit_log
WHERE audit_id IN (93001,93002,93003,93004);

DELETE FROM cloud_flow_db.hr_reporting_line
WHERE id IN (101,102,103,104,105,106,107,108,109,110,111,112);

DELETE FROM cloud_flow_db.hr_headcount
WHERE id IN (101,102,103,104,105,106,107,108,109,110,111,112,113);

DELETE FROM cloud_flow_db.hr_employee_contract
WHERE id IN (102,103,104,105,106,107,108,109,110,111,112);

DELETE FROM cloud_flow_db.hr_employee_document
WHERE id IN (103,104,105,106,107,108,109,110,111,112,113,114,115,116,117,118,119);

DELETE FROM cloud_flow_db.hr_emergency_contact
WHERE id IN (102,103,104,105,106,107,108,109,110,111,112);

-- 8.1 编制与汇报关系
INSERT INTO cloud_flow_db.hr_headcount (
  id, tenant_id, target_type, target_id, approved_count, actual_count, vacancy_count, effective_date, expiry_date, create_time, update_time
) VALUES
(101, 100000, 'DEPT', 109, 1, 1, 0, '2026-01-01', NULL, NOW(), NOW()),
(102, 100000, 'DEPT', 114, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(103, 100000, 'DEPT', 110, 1, 1, 0, '2026-01-01', NULL, NOW(), NOW()),
(104, 100000, 'DEPT', 115, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(105, 100000, 'DEPT', 111, 1, 1, 0, '2026-01-01', NULL, NOW(), NOW()),
(106, 100000, 'DEPT', 116, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(107, 100000, 'DEPT', 112, 1, 1, 0, '2026-01-01', NULL, NOW(), NOW()),
(108, 100000, 'DEPT', 117, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(109, 100000, 'DEPT', 113, 1, 1, 0, '2026-01-01', NULL, NOW(), NOW()),
(110, 100000, 'DEPT', 118, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(111, 100000, 'DEPT', 119, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW()),
(112, 100000, 'POST', 11, 1, 0, 1, '2026-01-01', NULL, NOW(), NOW()),
(113, 100000, 'POST', 10, 2, 1, 1, '2026-01-01', NULL, NOW(), NOW());

INSERT INTO cloud_flow_db.hr_reporting_line (
  id, tenant_id, employee_id, report_to_id, report_type, effective_date, expiry_date, create_time, update_time
) VALUES
(101, 100000, 1010, 1, 'DIRECT', '2024-01-15', NULL, NOW(), NOW()),
(102, 100000, 1011, 1, 'DIRECT', '2023-11-06', NULL, NOW(), NOW()),
(103, 100000, 1012, 1, 'DIRECT', '2024-03-11', NULL, NOW(), NOW()),
(104, 100000, 1013, 1, 'DIRECT', '2023-08-21', NULL, NOW(), NOW()),
(105, 100000, 1014, 1, 'DIRECT', '2024-02-19', NULL, NOW(), NOW()),
(106, 100000, 1015, 1010, 'DIRECT', '2024-10-08', NULL, NOW(), NOW()),
(107, 100000, 1016, 1011, 'DIRECT', '2026-01-15', NULL, NOW(), NOW()),
(108, 100000, 1017, 1012, 'DIRECT', '2025-05-12', NULL, NOW(), NOW()),
(109, 100000, 1018, 1013, 'DIRECT', '2024-09-09', NULL, NOW(), NOW()),
(110, 100000, 1019, 1014, 'DIRECT', '2024-12-02', NULL, NOW(), NOW()),
(111, 100000, 1020, 1014, 'DIRECT', '2026-02-03', NULL, NOW(), NOW()),
(112, 100000, 1017, 1013, 'DOTTED', '2025-09-01', NULL, NOW(), NOW());

-- 8.2 新增员工合同、证件与紧急联系人
INSERT INTO cloud_flow_db.hr_employee_contract (
  id, tenant_id, employee_id, contract_type, contract_no, sign_date, start_date, end_date, duration, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 1010, 'LABOR', 'LABOR-CF20240021-001', '2024-01-12', '2024-01-15', '2027-01-14', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(103, 100000, 1011, 'LABOR', 'LABOR-CF20230112-001', '2023-11-03', '2023-11-06', '2026-11-05', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(104, 100000, 1012, 'LABOR', 'LABOR-CF20240018-001', '2024-03-08', '2024-03-11', '2027-03-10', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(105, 100000, 1013, 'LABOR', 'LABOR-CF20230019-001', '2023-08-18', '2023-08-21', '2026-08-20', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(106, 100000, 1014, 'LABOR', 'LABOR-CF20240025-001', '2024-02-16', '2024-02-19', '2027-02-18', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(107, 100000, 1015, 'LABOR', 'LABOR-CF20240101-001', '2024-10-01', '2024-10-08', '2027-10-07', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(108, 100000, 1016, 'LABOR', 'LABOR-CF20260011-001', '2026-01-12', '2026-01-15', '2029-01-14', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(109, 100000, 1017, 'LABOR', 'LABOR-CF20250014-001', '2025-05-09', '2025-05-12', '2028-05-11', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(110, 100000, 1018, 'LABOR', 'LABOR-CF20240028-001', '2024-09-06', '2024-09-09', '2027-09-08', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(111, 100000, 1019, 'LABOR', 'LABOR-CF20240116-001', '2024-11-29', '2024-12-02', '2027-12-01', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0),
(112, 100000, 1020, 'LABOR', 'LABOR-CF20260015-001', '2026-01-29', '2026-02-03', '2029-02-02', 36, 'ACTIVE', NOW(), NOW(), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_contract_attachment (
  tenant_id, contract_id, file_name, file_url, sort_order,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100000, 102, 'contract-sunyucheng.pdf', 'https://demo.cloudflow.local/files/hr/contract-sunyucheng.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 102, 'contract-sunyucheng-annex.pdf', 'https://demo.cloudflow.local/files/hr/contract-sunyucheng-annex.pdf', 1,
 NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 103, 'contract-wusiyuan.pdf', 'https://demo.cloudflow.local/files/hr/contract-wusiyuan.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 104, 'contract-zhengyaning.pdf', 'https://demo.cloudflow.local/files/hr/contract-zhengyaning.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 105, 'contract-hejiashu.pdf', 'https://demo.cloudflow.local/files/hr/contract-hejiashu.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 106, 'contract-tangzhiyuan.pdf', 'https://demo.cloudflow.local/files/hr/contract-tangzhiyuan.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 107, 'contract-songqingyan.pdf', 'https://demo.cloudflow.local/files/hr/contract-songqingyan.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 108, 'contract-gaomu.pdf', 'https://demo.cloudflow.local/files/hr/contract-gaomu.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 109, 'contract-xuke.pdf', 'https://demo.cloudflow.local/files/hr/contract-xuke.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 110, 'contract-pengxiao.pdf', 'https://demo.cloudflow.local/files/hr/contract-pengxiao.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 111, 'contract-xulei.pdf', 'https://demo.cloudflow.local/files/hr/contract-xulei.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 112, 'contract-hanyue.pdf', 'https://demo.cloudflow.local/files/hr/contract-hanyue.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_document (
  id, tenant_id, employee_id, document_type, document_no, issue_date, expiry_date,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(103, 100000, 1010, 'ID_CARD', '310101198908162115', '2018-08-16', '2038-08-16', NOW(), NOW(), 'zhao', 'zhao', 0),
(104, 100000, 1011, 'ID_CARD', '320582199003092431', '2019-03-09', '2039-03-09', NOW(), NOW(), 'zhao', 'zhao', 0),
(105, 100000, 1012, 'ID_CARD', '310104199207231828', '2017-07-23', '2037-07-23', NOW(), NOW(), 'zhao', 'zhao', 0),
(106, 100000, 1013, 'ID_CARD', '330106198811021017', '2018-11-02', '2038-11-02', NOW(), NOW(), 'zhao', 'zhao', 0),
(107, 100000, 1014, 'ID_CARD', '320311199101170934', '2016-01-17', '2036-01-17', NOW(), NOW(), 'zhao', 'zhao', 0),
(108, 100000, 1015, 'ID_CARD', '310107199505122126', '2015-05-12', '2035-05-12', NOW(), NOW(), 'zhao', 'zhao', 0),
(109, 100000, 1016, 'ID_CARD', '320583199702143415', '2017-02-14', '2037-02-14', NOW(), NOW(), 'zhao', 'zhao', 0),
(110, 100000, 1017, 'ID_CARD', '330105199610304268', '2016-10-30', '2036-10-30', NOW(), NOW(), 'zhao', 'zhao', 0),
(111, 100000, 1018, 'ID_CARD', '320585199409073439', '2014-09-07', '2034-09-07', NOW(), NOW(), 'zhao', 'zhao', 0),
(112, 100000, 1019, 'ID_CARD', '340111199512194512', '2015-12-19', '2035-12-19', NOW(), NOW(), 'zhao', 'zhao', 0),
(113, 100000, 1020, 'ID_CARD', '320104199804212826', '2018-04-21', '2038-04-21', NOW(), NOW(), 'zhao', 'zhao', 0),
(114, 100000, 1015, 'DIPLOMA', 'DIP-2017-1015', '2017-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0),
(115, 100000, 1016, 'DIPLOMA', 'DIP-2019-1016', '2019-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0),
(116, 100000, 1017, 'DIPLOMA', 'DIP-2018-1017', '2018-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0),
(117, 100000, 1018, 'DIPLOMA', 'DIP-2016-1018', '2016-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0),
(118, 100000, 1019, 'DIPLOMA', 'DIP-2018-1019', '2018-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0),
(119, 100000, 1020, 'DIPLOMA', 'DIP-2020-1020', '2020-07-01', NULL, NOW(), NOW(), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_employee_document_attachment (
  tenant_id, document_id, file_name, file_url, sort_order,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100000, 103, 'doc-sunyucheng-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-sunyucheng-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 103, 'doc-sunyucheng-idcard-back.pdf', 'https://demo.cloudflow.local/files/hr/doc-sunyucheng-idcard-back.pdf', 1,
 NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 104, 'doc-wusiyuan-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-wusiyuan-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 105, 'doc-zhengyaning-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-zhengyaning-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 106, 'doc-hejiashu-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-hejiashu-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 107, 'doc-tangzhiyuan-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-tangzhiyuan-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 108, 'doc-songqingyan-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-songqingyan-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 109, 'doc-gaomu-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-gaomu-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 110, 'doc-xuke-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-xuke-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 111, 'doc-pengxiao-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-pengxiao-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 112, 'doc-xulei-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-xulei-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 113, 'doc-hanyue-idcard.pdf', 'https://demo.cloudflow.local/files/hr/doc-hanyue-idcard.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 114, 'doc-songqingyan-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-songqingyan-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 115, 'doc-gaomu-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-gaomu-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 116, 'doc-xuke-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-xuke-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 117, 'doc-pengxiao-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-pengxiao-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 118, 'doc-xulei-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-xulei-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0),
(100000, 119, 'doc-hanyue-diploma.pdf', 'https://demo.cloudflow.local/files/hr/doc-hanyue-diploma.pdf', 0, NOW(), NOW(), 'zhao', 'zhao', 0);

INSERT INTO cloud_flow_db.hr_emergency_contact (
  id, tenant_id, employee_id, contact_name, relationship, phone, address, priority,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(102, 100000, 1010, '陈晓雯', 'SPOUSE', '13800021010', '上海市浦东新区锦绣路 1888 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(103, 100000, 1011, '吴建平', 'PARENT', '13800021011', '江苏省苏州市工业园区星海街 118 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(104, 100000, 1012, '郑文静', 'SIBLING', '13800021012', '上海市杨浦区国顺东路 288 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(105, 100000, 1013, '何玉兰', 'SPOUSE', '13800021013', '杭州市西湖区文三路 388 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(106, 100000, 1014, '唐国强', 'PARENT', '13800021014', '南京市建邺区江东中路 399 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(107, 100000, 1015, '宋雅琴', 'PARENT', '13800021015', '上海市徐汇区漕溪北路 520 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(108, 100000, 1016, '高文博', 'PARENT', '13800021016', '苏州市姑苏区干将西路 168 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(109, 100000, 1017, '徐可欣', 'SIBLING', '13800021017', '宁波市鄞州区天童南路 517 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(110, 100000, 1018, '彭立新', 'PARENT', '13800021018', '无锡市滨湖区太湖大道 777 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(111, 100000, 1019, '许晨曦', 'SPOUSE', '13800021019', '合肥市蜀山区望江西路 618 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0),
(112, 100000, 1020, '韩淑媛', 'PARENT', '13800021020', '南京市雨花台区软件大道 99 号', 1, NOW(), NOW(), 'zhao', 'zhao', 0);

-- 8.3 文件归档与审计记录
INSERT INTO cloud_flow_db.sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
) VALUES
(93001, 100000, '产品与交付协同周需求清单.pdf', '/demo/org/product-delivery-week-requirements.pdf', 'https://demo.cloudflow.local/files/org/product-delivery-week-requirements.pdf', 'LOCAL', 428560, 'application/pdf', 'sun_pm', DATE_SUB(NOW(), INTERVAL 16 HOUR), '0', '对应任务 9425 的需求输出物'),
(93002, 100000, '华东项目上线风险清单.xlsx', '/demo/org/east-delivery-risk-list.xlsx', 'https://demo.cloudflow.local/files/org/east-delivery-risk-list.xlsx', 'LOCAL', 186240, 'application/xlsx', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 14 HOUR), '0', '对应任务 9426 的风险盘点附件'),
(93003, 100000, '重点客户健康分层.xlsx', '/demo/org/customer-health-matrix.xlsx', 'https://demo.cloudflow.local/files/org/customer-health-matrix.xlsx', 'LOCAL', 158300, 'application/xlsx', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 13 HOUR), '0', '对应任务 9427 的客户健康分层'),
(93004, 100000, '二季度销售拜访路线.pdf', '/demo/org/q2-sales-route.pdf', 'https://demo.cloudflow.local/files/org/q2-sales-route.pdf', 'LOCAL', 262880, 'application/pdf', 'he_sales', DATE_SUB(NOW(), INTERVAL 12 HOUR), '0', '对应任务 9434 的拜访路线规划'),
(93005, 100000, '运维应急演练手册.docx', '/demo/org/ops-drill-manual.docx', 'https://demo.cloudflow.local/files/org/ops-drill-manual.docx', 'LOCAL', 138420, 'application/docx', 'tang_ops', DATE_SUB(NOW(), INTERVAL 11 HOUR), '0', '对应事件 9517 的应急演练手册'),
(93006, 100000, '移动端回归用例池.xlsx', '/demo/org/mobile-regression-cases.xlsx', 'https://demo.cloudflow.local/files/org/mobile-regression-cases.xlsx', 'LOCAL', 214300, 'application/xlsx', 'han_qa', DATE_SUB(NOW(), INTERVAL 10 HOUR), '0', '对应任务 9430 的回归用例池'),
(93007, 100000, '解决方案架构师JD.docx', '/demo/hr/solution-architect-jd.docx', 'https://demo.cloudflow.local/files/hr/solution-architect-jd.docx', 'LOCAL', 96520, 'application/docx', 'zhao', DATE_SUB(NOW(), INTERVAL 9 HOUR), '0', '对应招聘需求 2012 的岗位说明书'),
(93008, 100000, '交付团队培训计划.pdf', '/demo/org/delivery-team-training-plan.pdf', 'https://demo.cloudflow.local/files/org/delivery-team-training-plan.pdf', 'LOCAL', 305780, 'application/pdf', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 8 HOUR), '0', '对应任务 9432 的培训计划'),
(93009, 100000, '高牧苏州培训总结.pdf', '/demo/trip/gaomu-suzhou-summary.pdf', 'https://demo.cloudflow.local/files/trip/gaomu-suzhou-summary.pdf', 'LOCAL', 356420, 'application/pdf', 'gao_delivery', DATE_SUB(NOW(), INTERVAL 7 HOUR), '0', '对应出差单 9012 的总结归档'),
(93010, 100000, '华东客户培训服务合同.pdf', '/demo/payment/fk202604070012-contract.pdf', 'https://demo.cloudflow.local/files/payment/fk202604070012-contract.pdf', 'LOCAL', 1896420, 'application/pdf', 'wang', DATE_SUB(NOW(), INTERVAL 6 HOUR), '0', '对应付款申请 9012 的合同附件');

INSERT INTO cloud_flow_db.sys_audit_log (
  audit_id, tenant_id, audit_name, audit_field, before_val, after_val, create_by, create_time
) VALUES
(93001, 100000, '编制调整', 'approved_count', '1', '2', 'admin', DATE_SUB(NOW(), INTERVAL 3 DAY)),
(93002, 100000, '汇报关系调整', 'report_to_id', 'NULL', '1011', 'zhao', DATE_SUB(NOW(), INTERVAL 2 DAY)),
(93003, 100000, '合同档案补录', 'status', 'DRAFT', 'ACTIVE', 'zhao', DATE_SUB(NOW(), INTERVAL 1 DAY)),
(93004, 100000, '文件归档', 'remark', '未归档', '已归档到交付培训资料库', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 8.4 通知配置、消息日志与流程抄送
INSERT INTO cloud_flow_db.wf_notification_config (
  config_id, tenant_id, config_name, event_type, notify_channel, template_id, recipient_type, recipient_value, enabled, create_time, update_time
) VALUES
('seed_notify_003', 100000, '公告发布站内通知', 'ANNOUNCEMENT_PUBLISHED', 'INTERNAL', NULL, 'ROLE', 'manager', 1, DATE_SUB(NOW(), INTERVAL 15 DAY), DATE_SUB(NOW(), INTERVAL 15 DAY)),
('seed_notify_004', 100000, '值班排班短信提醒', 'DUTY_SCHEDULE_CREATED', 'SMS', NULL, 'ROLE', 'employee', 1, DATE_SUB(NOW(), INTERVAL 12 DAY), DATE_SUB(NOW(), INTERVAL 12 DAY)),
('seed_notify_005', 100000, '会议创建参与人提醒', 'MEETING_CREATED', 'INTERNAL', NULL, 'USER', '10,11,12,13,14,20', 1, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO cloud_flow_db.wf_transaction_message (
  message_id, tenant_id, business_type, business_id, content, status, retry_count, max_retry_count, next_retry_time, create_time, update_time, error_message
) VALUES
('seed_msg_org_001', 100000, 'ANNOUNCEMENT', '9612', '产品与交付协同周公告已推送到核心成员。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 15 HOUR), DATE_SUB(NOW(), INTERVAL 15 HOUR), NULL),
('seed_msg_org_002', 100000, 'ANNOUNCEMENT', '9614', '运维应急演练计划公告已发送到值班相关人员。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), NULL),
('seed_msg_org_003', 100000, 'TASK_REMINDER', '9426', '华东项目上线风险清单任务提醒已投递。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 8 HOUR), NULL),
('seed_msg_org_004', 100000, 'DUTY_NOTICE', '9813', '运维夜间值守提醒已发送。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), NULL),
('seed_msg_org_005', 100000, 'SYS_NOTICE', '9918', '交付启动会站内提醒已投递。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL),
('seed_msg_org_006', 100000, 'SYS_NOTICE', '9923', '解决方案架构师 JD 评审提醒等待邮件通道重试。', 'PENDING', 1, 5, DATE_ADD(NOW(), INTERVAL 15 MINUTE), DATE_SUB(NOW(), INTERVAL 20 MINUTE), DATE_SUB(NOW(), INTERVAL 10 MINUTE), '邮件通道连接抖动');

INSERT INTO cloud_flow_db.wf_notification_log (
  log_id, tenant_id, notification_type, recipient_id, recipient_name, title, content, send_status, send_time, error_message,
  related_type, related_id, create_time
) VALUES
('seed_notice_org_001', 100000, 'INTERNAL', 15, '宋清妍', '待参加：AI 表单能力评审会', '请准备新工作台需求清单和设计评审材料。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 5 HOUR), NULL, 'SCHEDULE_EVENT', '9513', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
('seed_notice_org_002', 100000, 'INTERNAL', 16, '高牧', '待参加：华东交付启动会', '请携带风险清单、培训计划和客户环境核验结果。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 4 HOUR), NULL, 'SCHEDULE_EVENT', '9514', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
('seed_notice_org_003', 100000, 'SMS', 18, '彭骁', '待参加：月度销售漏斗评审', '请提前准备二季度重点客户拜访路线。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 3 HOUR), NULL, 'SCHEDULE_EVENT', '9516', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('seed_notice_org_004', 100000, 'INTERNAL', 19, '许磊', '待值守：运维夜间值守', '请确认监控面板、告警链路和值班交接清单。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL, 'DUTY_SCHEDULE', '9813', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
('seed_notice_org_005', 100000, 'INTERNAL', 20, '韩悦', '待值守：测试回归值班', '请完成移动端冒烟回归并同步缺陷清单。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 90 MINUTE), NULL, 'DUTY_SCHEDULE', '9816', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
('seed_notice_org_006', 100000, 'EMAIL', 4, '赵HR', '待评审：解决方案架构师 JD', '产品部已完成岗位职责初稿，请在今天下班前完成 HR 评审。', 'PENDING', NULL, NULL, 'WORK_TASK', '9431', DATE_SUB(NOW(), INTERVAL 30 MINUTE));

INSERT INTO cloud_flow_db.wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name, start_user_id, start_user_name, user_id,
  form_data, is_read, read_time, create_time
) VALUES
(100000, 'seed_inst_expense_ops_001', 'biz_reimburse', '前端测试的苏州上线差旅报销', 'b2', '财务总监审批', 8, '前端测试', 11,
 '{"claimNo":"BX202604070011","amount":4860.00,"project":"苏州智造上线项目"}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', '苏州智造上线保障周对公付款申请', 'b2', '总经理审批', 3, '王财务', 11,
 '{"paymentNo":"FK202604070011","amount":56800.00,"project":"苏州智造上线保障周"}', 1, DATE_SUB(NOW(), INTERVAL 70 MINUTE), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(100000, 'seed_inst_payment_ops_001', 'biz_payment', '苏州智造上线保障周对公付款申请', 'b2', '总经理审批', 3, '王财务', 13,
 '{"paymentNo":"FK202604070011","amount":56800.00,"project":"苏州智造上线保障周"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 4 HOUR));

-- 8.5 站内消息与流程模板归档
INSERT INTO cloud_flow_db.sys_notice (
  notice_id, tenant_id, notice_title, notice_type, notice_content, sender_id, recipient_id, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(9917, 100000, '需求评审提醒', '1', 'AI 表单能力评审会将于明日上午开始，请准备新工作台需求清单。', 10, 15, '0', 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 HOUR), 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 HOUR), '组织扩充-需求评审提醒'),
(9918, 100000, '交付启动会提醒', '1', '华东交付启动会将在交付作战室举行，请携带风险清单和培训计划。', 11, 16, '0', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 4 HOUR), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 4 HOUR), '组织扩充-交付启动会提醒'),
(9919, 100000, '续约复盘提醒', '1', '重点客户续约复盘会已排期，请准备客户健康分层和活跃度数据。', 12, 18, '0', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 3 HOUR), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 3 HOUR), '组织扩充-续约复盘提醒'),
(9920, 100000, '运维演练提醒', '1', '本周四晚进行运维应急演练，请提前检查告警链路和值守清单。', 14, 19, '0', 'tang_ops', DATE_SUB(NOW(), INTERVAL 2 HOUR), 'tang_ops', DATE_SUB(NOW(), INTERVAL 2 HOUR), '组织扩充-运维演练提醒'),
(9921, 100000, '测试回归提醒', '1', '今晚需要完成移动端审批与访客二维码相关回归，请注意汇总缺陷。', 14, 20, '0', 'tang_ops', DATE_SUB(NOW(), INTERVAL 100 MINUTE), 'tang_ops', DATE_SUB(NOW(), INTERVAL 100 MINUTE), '组织扩充-测试回归提醒'),
(9922, 100000, '报销归档提醒', '1', '苏州培训出差报销已审批通过，请核对票据并完成归档。', 16, 3, '0', 'gao_delivery', DATE_SUB(NOW(), INTERVAL 80 MINUTE), 'gao_delivery', DATE_SUB(NOW(), INTERVAL 80 MINUTE), '组织扩充-报销归档提醒'),
(9923, 100000, 'JD评审提醒', '1', '解决方案架构师 JD 初稿已完成，请 HR 今天内反馈招聘侧修改意见。', 10, 4, '0', 'sun_pm', DATE_SUB(NOW(), INTERVAL 60 MINUTE), 'sun_pm', DATE_SUB(NOW(), INTERVAL 60 MINUTE), '组织扩充-JD评审提醒'),
(9924, 100000, '客户接待提醒', '1', '明日有交付客户来访，请提前检查会议设备、胸卡和演示账号。', 11, 7, '0', 'wu_delivery', DATE_SUB(NOW(), INTERVAL 40 MINUTE), 'wu_delivery', DATE_SUB(NOW(), INTERVAL 40 MINUTE), '组织扩充-客户接待提醒');

INSERT INTO cloud_flow_db.workflow_archive (
  id, workflow_id, workflow_name, archived_by, archived_at, archive_reason, can_restore, original_data, tenant_id
) VALUES
('seed_archive_001', 'tpl-customer-visit-legacy', '客户拜访登记旧版', 'sun_pm', DATE_SUB(NOW(), INTERVAL 18 DAY),
 '客户拜访登记已并入访客预约与日程联动方案，旧版模板仅保留历史映射。', 1,
 '{"status":"archived","mergedInto":"customer-visit-collaboration-v2","linkedModules":["visitor","schedule","sales"],"note":"保留字段映射与历史恢复能力"}', 100000),
('seed_archive_002', 'tpl-ops-night-duty-legacy', '夜间值守申请旧版', 'tang_ops', DATE_SUB(NOW(), INTERVAL 12 DAY),
 '夜间值守改由统一值班排班看板维护，旧版申请模板不再独立使用。', 1,
 '{"status":"archived","mergedInto":"duty-schedule-board","linkedModules":["duty","ops","alert"],"note":"保留历史排班与审批记录"}', 100000);

INSERT INTO cloud_flow_db.wf_audit_log (
  id, operation_type, target_type, target_id, target_name, operator_id, operator_name, operation_time, operation_reason,
  operation_details, operation_result, error_message, ip_address, user_agent, tenant_id
) VALUES
('seed_audit_002', 'ARCHIVE', 'workflow_template', 'tpl-customer-visit-legacy', '客户拜访登记旧版', '10', '孙雨澄', DATE_SUB(NOW(), INTERVAL 18 DAY),
 '客户接待流程已升级为访客预约与日程联动版本。', '归档旧版拜访登记模板，保留历史字段映射与恢复入口。', 'SUCCESS', NULL, '10.10.0.41',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36', 100000),
('seed_audit_003', 'ARCHIVE', 'workflow_template', 'tpl-ops-night-duty-legacy', '夜间值守申请旧版', '14', '唐志远', DATE_SUB(NOW(), INTERVAL 12 DAY),
 '运维值守改由统一排班看板和短信提醒管理。', '归档旧版夜间值守申请模板，避免与当前值班排班模块重复。', 'SUCCESS', NULL, '10.10.0.43',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/134.0.0.0 Safari/537.36', 100000);

-- =========================================================
-- 九、组织扩充后的运营轨迹数据：操作日志、前端异常、HR审计、催办效果
-- =========================================================

DELETE FROM cloud_flow_db.sys_log
WHERE log_id IN (93011,93012,93013,93014,93015,93016,93017,93018);

DELETE FROM cloud_flow_db.sys_frontend_error_log
WHERE id IN (99511,99512,99513,99514,99515,99516);

DELETE FROM cloud_flow_db.hr_audit_log
WHERE id IN (101,102,103,104,105,106,107,108);

DELETE FROM cloud_flow_db.wf_urge_effect
WHERE task_id IN ('seed_task_hr_att_001', 'seed_task_hr_leave_001', 'seed_task_hr_salary_001');

INSERT INTO cloud_flow_db.sys_log (
  log_id, tenant_id, log_type, title, service_id, remote_addr, user_agent, request_uri, method, params, time, exception, create_by, create_time
) VALUES
(93011, 100000, '0', '产品协同周公告查询', 'cloudflow-oa', '10.10.3.11',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/announcement/detail/9612', 'GET', '{"announcementId":9612}', 86, NULL, 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 HOUR)),
(93012, 100000, '0', '交付启动会日程查看', 'cloudflow-oa', '10.10.3.12',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/schedule/event/detail/9514', 'GET', '{"eventId":9514}', 92, NULL, 'wu_delivery', DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(93013, 100000, '0', '客户健康分层文件下载', 'cloudflow-common', '10.10.3.13',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/system/file/download/93003', 'GET', '{"fileId":93003}', 118, NULL, 'zheng_cs', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(93014, 100000, '0', '车辆使用记录查询', 'cloudflow-oa', '10.10.3.14',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/vehicle/usage/detail/9012', 'GET', '{"usageId":9012}', 95, NULL, 'he_sales', DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(93015, 100000, '9', '值班排班保存失败', 'cloudflow-oa', '10.10.3.15',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/duty/schedule', 'POST', '{"scheduleId":9813,"userId":19}', 436, '值班人员冲突校验超时', 'tang_ops', DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
(93016, 100000, '0', '移动端回归用例池更新', 'cloudflow-oa', '10.10.3.16',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/task/update/9430', 'PUT', '{"taskId":9430,"status":"DOING"}', 104, NULL, 'han_qa', DATE_SUB(NOW(), INTERVAL 70 MINUTE)),
(93017, 100000, '0', '员工合同档案补录', 'cloudflow-hr', '10.10.3.17',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/employee/contract/save', 'POST', '{"employeeId":1016,"contractNo":"LABOR-CF20260011-001"}', 132, NULL, 'zhao', DATE_SUB(NOW(), INTERVAL 55 MINUTE)),
(93018, 100000, '0', '出差报销归档确认', 'cloudflow-oa', '10.10.3.18',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/oa/expense/claim/archive/9012', 'POST', '{"claimId":9012}', 88, NULL, 'gao_delivery', DATE_SUB(NOW(), INTERVAL 40 MINUTE));

INSERT INTO cloud_flow_db.sys_frontend_error_log (
  id, tenant_id, message, stack, component_stack, context, url, user_agent, level, tags, extra, client_ip,
  user_id, user_name, client_time, create_time
) VALUES
(99511, 100000, '交付作战室日程看板渲染失败',
 'TypeError: Cannot read properties of null (reading ''startTime'')',
 'at DeliveryBoardCalendar (src/pages/oa/ScheduleBoard.tsx:146)\nat ScheduleBoardPage',
 '交付启动会前查看日程看板',
 '/oa/schedule/board?roomId=9005',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','schedule','page','ScheduleBoard','env','seed'),
 JSON_OBJECT('eventId',9514,'roomId',9005,'browser','Chrome'),
 '10.10.3.31', 11, '吴思远', DATE_SUB(NOW(), INTERVAL 4 HOUR), DATE_SUB(NOW(), INTERVAL 4 HOUR)),
(99512, 100000, '客户健康分层图表加载超时',
 'AxiosError: timeout of 12000ms exceeded',
 'at CustomerHealthChart (src/pages/crm/CustomerHealthPage.tsx:88)\nat CustomerHealthPage',
 '客户成功查看健康分层图表',
 '/crm/customer-health',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 'warning',
 JSON_OBJECT('module','customer_success','page','CustomerHealthPage','env','seed'),
 JSON_OBJECT('taskId',9427,'dataset','health-matrix'),
 '10.10.3.32', 12, '郑雅宁', DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 3 HOUR)),
(99513, 100000, '运维演练大屏告警流展示异常',
 'RangeError: Invalid time value',
 'at AlertTimeline (src/pages/ops/DrillDashboard.tsx:57)\nat DrillDashboardPage',
 '运维演练大屏查看告警时间线',
 '/ops/drill/dashboard',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','ops','page','DrillDashboard','env','seed'),
 JSON_OBJECT('scheduleId',9813,'alertSource','timeline'),
 '10.10.3.33', 14, '唐志远', DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 2 HOUR)),
(99514, 100000, '移动端回归任务筛选结果为空',
 'Error: useDeferredValue result mismatch',
 'at MobileRegressionTaskList (src/mobile/pages/TaskList.tsx:103)\nat MobileTaskListPage',
 '测试组在移动端查看回归任务',
 '/mobile/tasks?tag=回归',
 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_4 like Mac OS X) AppleWebKit/605.1.15',
 'warning',
 JSON_OBJECT('module','task','page','MobileTaskList','env','seed'),
 JSON_OBJECT('taskId',9430,'device','iPhone 15 Pro'),
 '10.10.3.34', 20, '韩悦', DATE_SUB(NOW(), INTERVAL 90 MINUTE), DATE_SUB(NOW(), INTERVAL 90 MINUTE)),
(99515, 100000, '客户接待提醒消息重复展示',
 'Error: duplicate key in virtual list',
 'at VisitorNoticePanel (src/pages/oa/VisitorPage.tsx:121)\nat VisitorPage',
 '销售洽谈室访客接待看板',
 '/oa/visitor',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 'info',
 JSON_OBJECT('module','visitor','page','VisitorPage','env','seed'),
 JSON_OBJECT('visitorId',9714,'noticeId',9924),
 '10.10.3.35', 13, '何嘉树', DATE_SUB(NOW(), INTERVAL 75 MINUTE), DATE_SUB(NOW(), INTERVAL 75 MINUTE)),
(99516, 100000, '员工合同上传后预览空白',
 'TypeError: Cannot read properties of undefined (reading ''url'')',
 'at ContractPreviewDrawer (src/pages/hr/EmployeeContractPage.tsx:164)\nat EmployeeContractPage',
 'HR 查看新增员工合同预览',
 '/hr/employee/contracts',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 'error',
 JSON_OBJECT('module','hr','page','EmployeeContractPage','env','seed'),
 JSON_OBJECT('employeeId',1016,'contractId',108),
 '10.10.3.36', 4, '赵HR', DATE_SUB(NOW(), INTERVAL 50 MINUTE), DATE_SUB(NOW(), INTERVAL 50 MINUTE));

INSERT INTO cloud_flow_db.hr_audit_log (
  id, tenant_id, log_type, operation_type, business_module, business_type, business_id, business_no,
  operator_id, operator_name, operation_desc, before_data, after_data, change_content, approval_comment, approval_result,
  ip_address, user_agent, request_uri, request_method, request_params, execution_time, status, error_message, create_time, archived, archive_time
) VALUES
(101, 100000, 'OPERATION', 'CREATE', 'EMPLOYEE', 'EMPLOYEE_CONTRACT', 108, 'LABOR-CF20260011-001',
 4, '赵HR', '为高牧补录劳动合同档案', NULL,
 '{"employeeId":1016,"contractNo":"LABOR-CF20260011-001","status":"ACTIVE"}',
 '新增交付顾问劳动合同档案并挂接电子合同文件。', NULL, NULL,
 '10.10.3.41', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/employee/contract/save', 'POST', '{"employeeId":1016,"contractType":"LABOR"}', 132, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 55 MINUTE), 0, NULL),
(102, 100000, 'OPERATION', 'CREATE', 'EMPLOYEE', 'EMPLOYEE_DOCUMENT', 115, 'DIP-2019-1016',
 4, '赵HR', '为高牧补录学历证书', NULL,
 '{"employeeId":1016,"documentType":"DIPLOMA","documentNo":"DIP-2019-1016"}',
 '新增实施顾问学历证书扫描件，供入职资料归档。', NULL, NULL,
 '10.10.3.42', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/employee/document/save', 'POST', '{"employeeId":1016,"documentType":"DIPLOMA"}', 98, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 52 MINUTE), 0, NULL),
(103, 100000, 'APPROVAL', 'APPROVE', 'ATTENDANCE', 'ATTENDANCE_APPEAL', 9311, 'KQ202604070011',
 2, '李经理', '审批前端测试外勤补卡申请',
 '{"status":"PENDING","missingTime":"08:58:00"}',
 '{"status":"APPROVED","missingTime":"08:58:00"}',
 '直属上级确认员工确在苏州客户园区现场办公。', '情况属实，同意补卡。', 'APPROVED',
 '10.10.3.43', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/attendance/appeal/approve', 'POST', '{"id":9311,"decision":"APPROVE"}', 176, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 6 HOUR), 0, NULL),
(104, 100000, 'APPROVAL', 'APPROVE', 'ATTENDANCE', 'LEAVE_APPLICATION', 9004, 'QJ202604070004',
 12, '郑雅宁', '审批徐珂调休申请',
 '{"status":"PENDING","duration":1.00}',
 '{"status":"APPROVED","duration":1.00}',
 '客户成功专员完成重点客户复盘后安排补休。', '申请内容合理，已做好客户交接。', 'APPROVED',
 '10.10.3.44', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/leave/approve', 'POST', '{"id":9004,"decision":"APPROVE"}', 143, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 16 HOUR), 0, NULL),
(105, 100000, 'APPROVAL', 'APPROVE', 'SALARY', 'SALARY_ADJUSTMENT', 102, 'SA202604070012',
 1, 'Admin', '审批宋清妍绩效调薪申请',
 '{"status":"PENDING","afterTotal":21000.00}',
 '{"status":"APPROVED","afterTotal":21000.00}',
 '产品经理完成跨部门需求闭环后追加绩效奖金。', '绩效成果清晰，同意生效。', 'APPROVED',
 '10.10.3.45', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/salary/adjustment/approve', 'POST', '{"id":102,"decision":"APPROVE"}', 208, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 14 HOUR), 0, NULL),
(106, 100000, 'OPERATION', 'UPDATE', 'RECRUITMENT', 'RECRUITMENT_REQUEST', 2012, 'HRRQ202604070012',
 4, '赵HR', '更新解决方案架构师招聘需求附件',
 '{"status":"RECRUITING","fileAttached":false}',
 '{"status":"RECRUITING","fileAttached":true}',
 '补充岗位说明书和候选人筛选标准文件。', NULL, NULL,
 '10.10.3.46', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/recruitment/request/update', 'PUT', '{"id":2012,"attachment":"93007"}', 121, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 9 HOUR), 0, NULL),
(107, 100000, 'OPERATION', 'UPDATE', 'EMPLOYEE', 'REPORTING_LINE', 112, 'REPORT-1017-DOTTED',
 4, '赵HR', '维护徐珂虚线汇报关系',
 '{"employeeId":1017,"reportToId":null,"reportType":"DOTTED"}',
 '{"employeeId":1017,"reportToId":1013,"reportType":"DOTTED"}',
 '为客户成功与销售联动场景补充虚线汇报关系。', NULL, NULL,
 '10.10.3.47', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/reporting-line/save', 'POST', '{"employeeId":1017,"reportToId":1013,"reportType":"DOTTED"}', 87, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR), 0, NULL),
(108, 100000, 'OPERATION', 'UPDATE', 'EMPLOYEE', 'HEADCOUNT', 104, 'HC-DEPT-115',
 1, 'Admin', '更新交付一组编制信息',
 '{"approvedCount":1,"actualCount":1,"vacancyCount":0}',
 '{"approvedCount":2,"actualCount":1,"vacancyCount":1}',
 '考虑后续扩充方案架构师协同岗位，补充交付一组编制空缺。', NULL, NULL,
 '10.10.3.48', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36',
 '/api/hr/headcount/update', 'PUT', '{"id":104,"approvedCount":2}', 73, 'SUCCESS', NULL, DATE_SUB(NOW(), INTERVAL 3 DAY), 0, NULL);

INSERT INTO cloud_flow_db.wf_urge_effect (
  tenant_id, task_id, urge_count, first_urge_time, last_urge_time, task_complete_time, response_seconds
) VALUES
(100000, 'seed_task_hr_att_001', 1, DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 7 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), 3600),
(100000, 'seed_task_hr_leave_001', 2, DATE_SUB(NOW(), INTERVAL 13 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_SUB(NOW(), INTERVAL 9 HOUR), 14400),
(100000, 'seed_task_hr_salary_001', 1, DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, 21600);

-- =========================================================
-- 十、组织扩充后的流程治理数据：模板、版本、发布、回滚、影响评估
-- =========================================================

DELETE FROM cloud_flow_db.wf_notification_log
WHERE log_id IN (
  'seed_notice_deploy_001',
  'seed_notice_deploy_002',
  'seed_notice_deploy_003',
  'seed_notice_deploy_004'
);

DELETE FROM cloud_flow_db.wf_transaction_message
WHERE message_id IN (
  'seed_msg_deploy_001',
  'seed_msg_deploy_002',
  'seed_msg_deploy_003',
  'seed_msg_deploy_004'
);

DELETE FROM cloud_flow_db.wf_notification_config
WHERE config_id IN ('seed_notify_006', 'seed_notify_007');

DELETE FROM cloud_flow_db.sys_notice
WHERE notice_id BETWEEN 9925 AND 9928
   OR remark IN (
     '组织扩充-流程发布提醒',
     '组织扩充-流程回滚提醒',
     '组织扩充-续约模板发布提醒',
     '组织扩充-发布影响确认提醒'
   );

DELETE FROM cloud_flow_db.sys_file
WHERE file_id IN (93021,93022,93023,93024);

DELETE FROM cloud_flow_db.wf_deploy_impact
WHERE id IN (98003,98004,98005,98006,98007);

DELETE FROM cloud_flow_db.wf_deploy_rollback_history
WHERE id IN (98002);

DELETE FROM cloud_flow_db.wf_deploy_record
WHERE id IN (98003,98004,98005,98006);

DELETE FROM cloud_flow_db.workflow_version
WHERE id IN (
  'seed_tpl_delivery_change_001_v1',
  'seed_tpl_delivery_change_001_v2',
  'seed_tpl_delivery_change_001_v3',
  'seed_tpl_customer_renewal_001_v1'
);

DELETE FROM cloud_flow_db.workflow_archive
WHERE id IN ('seed_archive_003');

DELETE FROM cloud_flow_db.wf_audit_log
WHERE id IN ('seed_audit_004', 'seed_audit_005', 'seed_audit_006');

DELETE FROM cloud_flow_db.workflow_template
WHERE id IN ('seed_tpl_delivery_change_001', 'seed_tpl_customer_renewal_001');

INSERT INTO cloud_flow_db.sys_file (
  file_id, tenant_id, file_name, file_path, url, storage_type, file_size, file_type, create_by, create_time, del_flag, remark
) VALUES
(93021, 100000, '交付上线变更审批V2发布说明.pdf', '/demo/workflow/deploy/delivery-change-v2-release-note.pdf',
 'https://demo.cloudflow.local/files/workflow/deploy/delivery-change-v2-release-note.pdf', 'LOCAL', 482600, 'application/pdf', 'tang_ops', DATE_SUB(NOW(), INTERVAL 10 DAY), '0', '对应流程模板 seed_tpl_delivery_change_001 的 V2 发布说明'),
(93022, 100000, '交付上线变更审批回滚报告.pdf', '/demo/workflow/deploy/delivery-change-rollback-report.pdf',
 'https://demo.cloudflow.local/files/workflow/deploy/delivery-change-rollback-report.pdf', 'LOCAL', 368920, 'application/pdf', 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 DAY), '0', '对应流程模板 seed_tpl_delivery_change_001 的回滚分析'),
(93023, 100000, '重点客户续约评审模板说明.docx', '/demo/workflow/deploy/customer-renewal-template-spec.docx',
 'https://demo.cloudflow.local/files/workflow/deploy/customer-renewal-template-spec.docx', 'LOCAL', 156480, 'application/docx', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 6 DAY), '0', '对应流程模板 seed_tpl_customer_renewal_001 的设计说明'),
(93024, 100000, '流程发布影响分析.xlsx', '/demo/workflow/deploy/process-impact-analysis.xlsx',
 'https://demo.cloudflow.local/files/workflow/deploy/process-impact-analysis.xlsx', 'LOCAL', 214880, 'application/xlsx', 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 DAY), '0', '交付上线变更与续约评审模板的联合影响评估');

INSERT INTO cloud_flow_db.workflow_template (
  id, name, description, category_id, tags, definition, preview_image, created_by, created_at, updated_at, usage_count, is_system, status, tenant_id
) VALUES
('seed_tpl_delivery_change_001', '交付上线变更审批', '交付申请 → 技术评审 → 测试备注 → 发布窗口审批 → 完成', 'cat-it',
 '["交付","上线","变更","运维"]',
 '{"nodes":[{"id":"start","type":"START","title":"提交变更申请"},{"id":"n1","type":"APPROVAL","title":"技术评审","approverType":"ROLE","approverValue":"admin"},{"id":"n2","type":"MANUAL","title":"记录测试验证备注","approverType":"INITIATOR"},{"id":"n3","type":"APPROVAL","title":"发布窗口审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
 '/demo/workflow/template/delivery-change.png', 'tang_ops', DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), 11, 0, 'active', 100000),
('seed_tpl_customer_renewal_001', '重点客户续约评审', '客户成功发起 → 销售复核 → 财务确认 → 总经理审批', 'cat-sales',
 '["续约","客户成功","销售","评审"]',
 '{"nodes":[{"id":"start","type":"START","title":"提交续约评审"},{"id":"n1","type":"APPROVAL","title":"销售复核","approverType":"USER","approverValue":"13"},{"id":"n2","type":"APPROVAL","title":"财务确认","approverType":"ROLE","approverValue":"finance"},{"id":"n3","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
 '/demo/workflow/template/customer-renewal.png', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), 7, 0, 'active', 100000);

INSERT INTO cloud_flow_db.workflow_version (
  id, workflow_id, version_number, definition, change_log, change_type, created_by, created_at, is_rollback, rollback_from_version, checksum, tenant_id
) VALUES
('seed_tpl_delivery_change_001_v1', 'seed_tpl_delivery_change_001', 'v1',
 '{"nodes":[{"id":"start","type":"START","title":"提交变更申请"},{"id":"n1","type":"APPROVAL","title":"技术评审","approverType":"ROLE","approverValue":"admin"},{"id":"n2","type":"APPROVAL","title":"发布窗口审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}',
 '初始版本，覆盖交付上线前审批和发布窗口确认。', 'CREATE', 'tang_ops', DATE_SUB(NOW(), INTERVAL 14 DAY), 0, NULL,
 '7e3a1f90c4b64d0ea3d41c0a5f1800017e3a1f90c4b64d0ea3d41c0a5f180001', 100000),
('seed_tpl_delivery_change_001_v2', 'seed_tpl_delivery_change_001', 'v2',
 '{"nodes":[{"id":"start","type":"START","title":"提交变更申请"},{"id":"n1","type":"APPROVAL","title":"技术评审","approverType":"ROLE","approverValue":"admin"},{"id":"n2","type":"APPROVAL","title":"测试验证","approverType":"ROLE","approverValue":"admin"},{"id":"n3","type":"APPROVAL","title":"发布窗口审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
 '新增测试验证审批节点，并收紧高风险变更的校验要求。', 'UPDATE', 'tang_ops', DATE_SUB(NOW(), INTERVAL 10 DAY), 0, NULL,
 '8f4b2b10d5e74b2fb4c51d0b6f2800028f4b2b10d5e74b2fb4c51d0b6f280002', 100000),
('seed_tpl_delivery_change_001_v3', 'seed_tpl_delivery_change_001', 'v3',
 '{"nodes":[{"id":"start","type":"START","title":"提交变更申请"},{"id":"n1","type":"APPROVAL","title":"技术评审","approverType":"ROLE","approverValue":"admin"},{"id":"n2","type":"MANUAL","title":"记录测试验证备注","approverType":"INITIATOR"},{"id":"n3","type":"APPROVAL","title":"发布窗口审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
 '回滚到稳定审批链路，并保留测试验证备注字段。', 'ROLLBACK', 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 DAY), 1, 'v2',
 '9a5c3c20e6f84c30c5d62e1c7f3900039a5c3c20e6f84c30c5d62e1c7f390003', 100000),
('seed_tpl_customer_renewal_001_v1', 'seed_tpl_customer_renewal_001', 'v1',
 '{"nodes":[{"id":"start","type":"START","title":"提交续约评审"},{"id":"n1","type":"APPROVAL","title":"销售复核","approverType":"USER","approverValue":"13"},{"id":"n2","type":"APPROVAL","title":"财务确认","approverType":"ROLE","approverValue":"finance"},{"id":"n3","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"manager"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"start->n1","source":"start","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}',
 '重点客户续约评审模板初始版本，统一客户成功、销售、财务和总经理审批链路。', 'CREATE', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 6 DAY), 0, NULL,
 'ab6d4d30f7a95d41d6e73f2d8a4a0004ab6d4d30f7a95d41d6e73f2d8a4a0004', 100000);

INSERT INTO cloud_flow_db.wf_deploy_record (
  id, tenant_id, process_def_id, process_key, version, deploy_status, deploy_by, deployer_name, deploy_time,
  deploy_note, change_log, can_rollback, rollback_from_version, rollback_reason, rollback_by, rollback_time,
  approval_id, deploy_window_id, impact_analysis, created_time, updated_time
) VALUES
(98003, 100000, 'seed_tpl_delivery_change_001', 'delivery_change_approval', 1, 'SUCCESS', 14, '唐志远', DATE_SUB(NOW(), INTERVAL 14 DAY),
 '发布交付上线变更审批V1', '覆盖交付上线前审批、发布窗口确认与基础附件归档。', 1, NULL, NULL, NULL, NULL,
 NULL, NULL, '影响交付上线审批和发布窗口确认场景。', DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY)),
(98004, 100000, 'seed_tpl_delivery_change_001', 'delivery_change_approval', 2, 'SUCCESS', 14, '唐志远', DATE_SUB(NOW(), INTERVAL 10 DAY),
 '发布交付上线变更审批V2', '新增测试验证审批节点，并提高高风险变更拦截阈值。', 1, NULL, NULL, NULL, NULL,
 NULL, NULL, '影响交付上线申请 9 条，需补录测试验证结果。', DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY)),
(98005, 100000, 'seed_tpl_delivery_change_001', 'delivery_change_approval', 3, 'SUCCESS', 14, '唐志远', DATE_SUB(NOW(), INTERVAL 7 DAY),
 '回滚并发布交付上线变更审批V3', '回滚到稳定审批链路，保留测试验证备注字段。', 0, 2, '测试验证节点对演练大屏字段兼容性要求过高，导致审批链路阻塞。', 14, DATE_SUB(NOW(), INTERVAL 7 DAY),
 NULL, NULL, '回滚后恢复稳定审批链路，存量申请继续沿用备注补录方式。', DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY)),
(98006, 100000, 'seed_tpl_customer_renewal_001', 'customer_renewal_review', 1, 'SUCCESS', 12, '郑雅宁', DATE_SUB(NOW(), INTERVAL 6 DAY),
 '发布重点客户续约评审模板V1', '统一客户成功、销售、财务和总经理审批节点。', 1, NULL, NULL, NULL, NULL,
 NULL, NULL, '影响续约评审和报价复核通知链路。', DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO cloud_flow_db.wf_deploy_rollback_history (
  id, tenant_id, original_deploy_id, rollback_deploy_id, process_def_id, from_version, to_version, rollback_type,
  rollback_status, rollback_reason, rollback_by, rollback_by_name, rollback_time, success, error_message
) VALUES
(98002, 100000, 98004, 98005, 'seed_tpl_delivery_change_001', 2, 3, 'MANUAL', 'SUCCESS',
 '演练大屏时间线字段兼容性不足，导致高风险变更审批阻塞。', 14, '唐志远', DATE_SUB(NOW(), INTERVAL 7 DAY), 1, NULL);

INSERT INTO cloud_flow_db.wf_deploy_impact (
  id, tenant_id, deploy_id, impact_type, impact_level, impact_count, impact_detail, mitigation_plan, create_time
) VALUES
(98003, 100000, 98003, 'PROCESS', 'LOW', 4, '交付上线审批场景新增标准化流程入口 4 处。', '同步交付组培训并提供发布窗口使用说明。', DATE_SUB(NOW(), INTERVAL 14 DAY)),
(98004, 100000, 98004, 'TASK', 'HIGH', 9, '新增测试验证审批节点后，9 条存量交付变更需补录验证结果。', '通过站内消息提醒交付组和测试组补填验证结果。', DATE_SUB(NOW(), INTERVAL 10 DAY)),
(98005, 100000, 98005, 'PROCESS', 'MEDIUM', 9, '回滚恢复稳定审批链路，9 条进行中变更重新映射到备注补录方式。', '保留原验证内容到备注字段，并由运维人工核对。', DATE_SUB(NOW(), INTERVAL 7 DAY)),
(98006, 100000, 98006, 'NOTICE', 'LOW', 6, '重点客户续约评审模板发布后，影响客户成功和销售通知配置 6 条。', '同步站内消息模板和财务确认节点接收人。', DATE_SUB(NOW(), INTERVAL 6 DAY)),
(98007, 100000, 98006, 'TASK', 'MEDIUM', 3, '三条历史续约评审记录迁移到新模板进行统一追踪。', '由客户成功组在发布后一日内复核迁移结果。', DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO cloud_flow_db.wf_notification_config (
  config_id, tenant_id, config_name, event_type, notify_channel, template_id, recipient_type, recipient_value, enabled, create_time, update_time
) VALUES
('seed_notify_006', 100000, '流程模板发布通知', 'DEPLOY_SUCCESS', 'INTERNAL', NULL, 'ROLE', 'manager', 1, DATE_SUB(NOW(), INTERVAL 14 DAY), DATE_SUB(NOW(), INTERVAL 14 DAY)),
('seed_notify_007', 100000, '流程模板回滚告警', 'DEPLOY_ROLLBACK', 'SMS', NULL, 'USER', '1,14', 1, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY));

INSERT INTO cloud_flow_db.wf_transaction_message (
  message_id, tenant_id, business_type, business_id, content, status, retry_count, max_retry_count, next_retry_time, create_time, update_time, error_message
) VALUES
('seed_msg_deploy_001', 100000, 'WORKFLOW_DEPLOY', '98004', '交付上线变更审批V2已发布，等待影响提示发送。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 10 DAY), DATE_SUB(NOW(), INTERVAL 10 DAY), NULL),
('seed_msg_deploy_002', 100000, 'WORKFLOW_ROLLBACK', '98005', '交付上线变更审批已回滚到稳定版本。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), NULL),
('seed_msg_deploy_003', 100000, 'WORKFLOW_DEPLOY', '98006', '重点客户续约评审模板已发布，等待审批角色确认。', 'SENT', 0, 5, NULL, DATE_SUB(NOW(), INTERVAL 6 DAY), DATE_SUB(NOW(), INTERVAL 6 DAY), NULL),
('seed_msg_deploy_004', 100000, 'WORKFLOW_NOTIFY', '98005', '回滚影响说明短信待通道重试。', 'PENDING', 1, 5, DATE_ADD(NOW(), INTERVAL 10 MINUTE), DATE_SUB(NOW(), INTERVAL 7 DAY), DATE_SUB(NOW(), INTERVAL 7 DAY), '短信通道响应超时');

INSERT INTO cloud_flow_db.wf_notification_log (
  log_id, tenant_id, notification_type, recipient_id, recipient_name, title, content, send_status, send_time, error_message,
  related_type, related_id, create_time
) VALUES
('seed_notice_deploy_001', 100000, 'INTERNAL', 14, '唐志远', '发布完成：交付上线变更审批V2', '模板已发布，请关注交付组和测试组的补录验证结果。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 10 DAY), NULL, 'DEPLOY_RECORD', '98004', DATE_SUB(NOW(), INTERVAL 10 DAY)),
('seed_notice_deploy_002', 100000, 'SMS', 1, 'Admin', '回滚完成：交付上线变更审批', '交付上线变更审批已回滚到稳定版本，请留意影响评估。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 7 DAY), NULL, 'DEPLOY_RECORD', '98005', DATE_SUB(NOW(), INTERVAL 7 DAY)),
('seed_notice_deploy_003', 100000, 'INTERNAL', 12, '郑雅宁', '发布完成：重点客户续约评审模板', '续约评审模板已发布，请确认财务和销售审批角色配置。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, 'DEPLOY_RECORD', '98006', DATE_SUB(NOW(), INTERVAL 6 DAY)),
('seed_notice_deploy_004', 100000, 'INTERNAL', 13, '何嘉树', '请确认：续约评审模板审批角色', '请核对销售复核节点的审批角色和续约客户名单映射。', 'SUCCESS', DATE_SUB(NOW(), INTERVAL 6 DAY), NULL, 'WORKFLOW_TEMPLATE', 'seed_tpl_customer_renewal_001', DATE_SUB(NOW(), INTERVAL 6 DAY));

INSERT INTO cloud_flow_db.sys_notice (
  notice_id, tenant_id, notice_title, notice_type, notice_content, sender_id, recipient_id, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(9925, 100000, '流程发布提醒', '1', '交付上线变更审批V2已发布，请交付组和测试组补录测试验证结果。', 14, 11, '0', 'tang_ops', DATE_SUB(NOW(), INTERVAL 10 DAY), 'tang_ops', DATE_SUB(NOW(), INTERVAL 10 DAY), '组织扩充-流程发布提醒'),
(9926, 100000, '流程回滚提醒', '1', '交付上线变更审批已回滚到稳定版本，请按备注方式继续补录验证结果。', 14, 1, '0', 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 DAY), 'tang_ops', DATE_SUB(NOW(), INTERVAL 7 DAY), '组织扩充-流程回滚提醒'),
(9927, 100000, '续约模板发布提醒', '1', '重点客户续约评审模板已发布，请客户成功和销售共同确认审批链路。', 12, 13, '0', 'zheng_cs', DATE_SUB(NOW(), INTERVAL 6 DAY), 'zheng_cs', DATE_SUB(NOW(), INTERVAL 6 DAY), '组织扩充-续约模板发布提醒'),
(9928, 100000, '发布影响确认提醒', '1', '请复核流程发布影响分析表，确认续约评审与交付变更模板的通知范围。', 10, 3, '0', 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 DAY), 'sun_pm', DATE_SUB(NOW(), INTERVAL 5 DAY), '组织扩充-发布影响确认提醒');

INSERT INTO cloud_flow_db.workflow_archive (
  id, workflow_id, workflow_name, archived_by, archived_at, archive_reason, can_restore, original_data, tenant_id
) VALUES
('seed_archive_003', 'tpl-delivery-change-legacy', '交付上线变更登记旧版', 'tang_ops', DATE_SUB(NOW(), INTERVAL 14 DAY),
 '旧版交付上线变更登记模板已迁移到标准审批链路，保留历史映射和恢复入口。', 1,
 '{"status":"archived","movedTo":"seed_tpl_delivery_change_001","linkedModules":["delivery","ops","qa"],"note":"保留历史登记字段与恢复能力"}', 100000);

INSERT INTO cloud_flow_db.wf_audit_log (
  id, operation_type, target_type, target_id, target_name, operator_id, operator_name, operation_time, operation_reason,
  operation_details, operation_result, error_message, ip_address, user_agent, tenant_id
) VALUES
('seed_audit_004', 'DEPLOY', 'workflow_template', 'seed_tpl_delivery_change_001', '交付上线变更审批', '14', '唐志远', DATE_SUB(NOW(), INTERVAL 10 DAY),
 '交付上线变更审批链路补充测试验证节点。', '发布V2版本，并生成部署记录 98004 与影响评估。', 'SUCCESS', NULL, '10.10.0.51',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36', 100000),
('seed_audit_005', 'ROLLBACK', 'workflow_template', 'seed_tpl_delivery_change_001', '交付上线变更审批', '14', '唐志远', DATE_SUB(NOW(), INTERVAL 7 DAY),
 '测试验证节点对演练大屏字段兼容性要求过高，需要回滚稳定版本。', '回滚并发布V3稳定版本，保留测试验证备注字段。', 'SUCCESS', NULL, '10.10.0.52',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36', 100000),
('seed_audit_006', 'DEPLOY', 'workflow_template', 'seed_tpl_customer_renewal_001', '重点客户续约评审', '12', '郑雅宁', DATE_SUB(NOW(), INTERVAL 6 DAY),
 '重点客户续约流程标准化，需要统一客户成功、销售、财务和总经理审批节点。', '发布V1版本，并同步续约评审说明、影响分析和审批通知。', 'SUCCESS', NULL, '10.10.0.53',
 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/135.0.0.0 Safari/537.36', 100000);

-- =========================================================
-- 工作流监控数据回填：从模拟流程实例、任务和节点轨迹派生监控表
-- =========================================================

DELETE FROM cloud_flow_db.wf_timeout_alert
WHERE target_id LIKE 'test_inst_%'
   OR target_id LIKE 'demo_inst_%'
   OR target_id LIKE 'seed_inst_%'
   OR target_id LIKE 'seed_hr_inst_%'
   OR target_id LIKE 'test_task_%'
   OR target_id LIKE 'demo_task_%'
   OR target_id LIKE 'seed_task_%';

DELETE FROM cloud_flow_db.wf_anomaly_alert
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_node_monitor
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_task_monitor
WHERE task_id LIKE 'test_task_%'
   OR task_id LIKE 'demo_task_%'
   OR task_id LIKE 'seed_task_%'
   OR instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

DELETE FROM cloud_flow_db.wf_process_monitor
WHERE instance_id LIKE 'test_inst_%'
   OR instance_id LIKE 'demo_inst_%'
   OR instance_id LIKE 'seed_inst_%'
   OR instance_id LIKE 'seed_hr_inst_%';

INSERT INTO cloud_flow_db.wf_process_monitor (
  tenant_id, instance_id, process_def_id, process_def_key, process_def_name, business_key,
  status, start_time, end_time, duration, node_count, task_count, start_user_id, start_user_name,
  error_message, create_time, update_time
)
SELECT
  i.tenant_id,
  i.instance_id,
  i.definition_id,
  i.process_def_key,
  COALESCE(d.process_name, i.title, i.process_def_key),
  i.business_key,
  i.status,
  i.start_time,
  i.end_time,
  CASE WHEN i.end_time IS NOT NULL THEN TIMESTAMPDIFF(MICROSECOND, i.start_time, i.end_time) DIV 1000 ELSE NULL END,
  (SELECT COUNT(*) FROM cloud_flow_db.wf_node_record nr WHERE nr.instance_id = i.instance_id),
  (
    (SELECT COUNT(*) FROM cloud_flow_db.wf_task t WHERE t.instance_id = i.instance_id)
    + (SELECT COUNT(DISTINCT h.task_id) FROM cloud_flow_db.wf_task_history h WHERE h.instance_id = i.instance_id)
  ),
  i.start_user_id,
  i.start_user_name,
  NULL,
  COALESCE(i.create_time, i.start_time, NOW()),
  COALESCE(i.update_time, NOW())
FROM cloud_flow_db.wf_process_instance i
LEFT JOIN cloud_flow_db.wf_process_definition d
  ON d.definition_id = i.definition_id
WHERE i.instance_id LIKE 'test_inst_%'
   OR i.instance_id LIKE 'demo_inst_%'
   OR i.instance_id LIKE 'seed_inst_%'
   OR i.instance_id LIKE 'seed_hr_inst_%'
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  process_def_id = VALUES(process_def_id),
  process_def_key = VALUES(process_def_key),
  process_def_name = VALUES(process_def_name),
  business_key = VALUES(business_key),
  status = VALUES(status),
  start_time = VALUES(start_time),
  end_time = VALUES(end_time),
  duration = VALUES(duration),
  node_count = VALUES(node_count),
  task_count = VALUES(task_count),
  start_user_id = VALUES(start_user_id),
  start_user_name = VALUES(start_user_name),
  error_message = VALUES(error_message),
  create_time = VALUES(create_time),
  update_time = VALUES(update_time);

INSERT INTO cloud_flow_db.wf_task_monitor (
  tenant_id, task_id, instance_id, node_key, task_name, assignee_id, assignee_name,
  create_time_task, claim_time, complete_time, wait_duration, handle_duration, total_duration,
  status, action, create_time, update_time
)
SELECT
  t.tenant_id,
  t.task_id,
  t.instance_id,
  t.node_key,
  t.node_name,
  t.assignee,
  t.assignee_name,
  t.create_time,
  t.create_time,
  h.last_history_time,
  0,
  CASE
    WHEN h.last_history_time IS NOT NULL THEN TIMESTAMPDIFF(MICROSECOND, t.create_time, h.last_history_time) DIV 1000
    ELSE TIMESTAMPDIFF(MICROSECOND, t.create_time, NOW()) DIV 1000
  END,
  CASE
    WHEN h.last_history_time IS NOT NULL THEN TIMESTAMPDIFF(MICROSECOND, t.create_time, h.last_history_time) DIV 1000
    ELSE TIMESTAMPDIFF(MICROSECOND, t.create_time, NOW()) DIV 1000
  END,
  CASE
    WHEN t.status IN ('DONE', 'APPROVED', 'COMPLETED') OR h.last_action IN ('APPROVE', 'REJECT', 'AUTO_PASS_FALLBACK') THEN 'COMPLETED'
    ELSE 'PENDING'
  END,
  h.last_action,
  COALESCE(t.create_time, NOW()),
  NOW()
FROM cloud_flow_db.wf_task t
LEFT JOIN (
  SELECT
    h1.task_id,
    MAX(h1.create_time) AS last_history_time,
    SUBSTRING_INDEX(GROUP_CONCAT(h1.action ORDER BY h1.create_time DESC SEPARATOR ','), ',', 1) AS last_action
  FROM cloud_flow_db.wf_task_history h1
  GROUP BY h1.task_id
) h ON h.task_id = t.task_id
WHERE t.task_id LIKE 'test_task_%'
   OR t.task_id LIKE 'demo_task_%'
   OR t.task_id LIKE 'seed_task_%'
   OR t.instance_id LIKE 'test_inst_%'
   OR t.instance_id LIKE 'demo_inst_%'
   OR t.instance_id LIKE 'seed_inst_%'
   OR t.instance_id LIKE 'seed_hr_inst_%'
ON DUPLICATE KEY UPDATE
  tenant_id = VALUES(tenant_id),
  instance_id = VALUES(instance_id),
  node_key = VALUES(node_key),
  task_name = VALUES(task_name),
  assignee_id = VALUES(assignee_id),
  assignee_name = VALUES(assignee_name),
  create_time_task = VALUES(create_time_task),
  claim_time = VALUES(claim_time),
  complete_time = VALUES(complete_time),
  wait_duration = VALUES(wait_duration),
  handle_duration = VALUES(handle_duration),
  total_duration = VALUES(total_duration),
  status = VALUES(status),
  action = VALUES(action),
  create_time = VALUES(create_time),
  update_time = VALUES(update_time);

INSERT INTO cloud_flow_db.wf_node_monitor (
  tenant_id, instance_id, node_id, node_key, node_name, node_type, start_time, end_time,
  duration, status, error_message, retry_count, create_time, update_time
)
SELECT
  nr.tenant_id,
  nr.instance_id,
  nr.node_key,
  nr.node_key,
  nr.node_name,
  nr.node_type,
  nr.start_time,
  nr.end_time,
  nr.duration_ms,
  nr.status,
  NULL,
  0,
  nr.create_time,
  COALESCE(nr.event_time, nr.create_time, NOW())
FROM cloud_flow_db.wf_node_record nr
WHERE nr.instance_id LIKE 'test_inst_%'
   OR nr.instance_id LIKE 'demo_inst_%'
   OR nr.instance_id LIKE 'seed_inst_%'
   OR nr.instance_id LIKE 'seed_hr_inst_%';

INSERT INTO cloud_flow_db.wf_timeout_alert (
  tenant_id, alert_type, target_id, target_name, timeout_level, timeout_duration, threshold,
  assignee_id, assignee_name, alert_time, notification_sent, escalated, resolved, create_time, update_time
)
SELECT
  tm.tenant_id,
  'TASK',
  tm.task_id,
  tm.task_name,
  CASE
    WHEN tm.total_duration >= 14400000 THEN 'CRITICAL'
    WHEN tm.total_duration >= 7200000 THEN 'WARNING'
    ELSE 'REMIND'
  END,
  tm.total_duration,
  CASE
    WHEN tm.total_duration >= 14400000 THEN 14400000
    WHEN tm.total_duration >= 7200000 THEN 7200000
    ELSE 3600000
  END,
  tm.assignee_id,
  tm.assignee_name,
  NOW(),
  'Y',
  'N',
  'N',
  NOW(),
  NOW()
FROM cloud_flow_db.wf_task_monitor tm
WHERE tm.status = 'PENDING'
  AND tm.total_duration >= 3600000
  AND (
    tm.task_id LIKE 'test_task_%'
    OR tm.task_id LIKE 'demo_task_%'
    OR tm.task_id LIKE 'seed_task_%'
  );

INSERT INTO cloud_flow_db.wf_timeout_alert (
  tenant_id, alert_type, target_id, target_name, timeout_level, timeout_duration, threshold,
  assignee_id, assignee_name, alert_time, notification_sent, escalated, resolved, create_time, update_time
)
SELECT
  pm.tenant_id,
  'PROCESS',
  pm.instance_id,
  pm.process_def_name,
  CASE
    WHEN TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000 >= 14400000 THEN 'CRITICAL'
    WHEN TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000 >= 7200000 THEN 'WARNING'
    ELSE 'REMIND'
  END,
  TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000,
  CASE
    WHEN TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000 >= 14400000 THEN 14400000
    WHEN TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000 >= 7200000 THEN 7200000
    ELSE 3600000
  END,
  NULL,
  NULL,
  NOW(),
  'Y',
  'N',
  'N',
  NOW(),
  NOW()
FROM cloud_flow_db.wf_process_monitor pm
WHERE pm.status = 'RUNNING'
  AND TIMESTAMPDIFF(MICROSECOND, pm.start_time, NOW()) DIV 1000 >= 3600000
  AND (
    pm.instance_id LIKE 'test_inst_%'
    OR pm.instance_id LIKE 'demo_inst_%'
    OR pm.instance_id LIKE 'seed_inst_%'
    OR pm.instance_id LIKE 'seed_hr_inst_%'
  );

DELETE ps
FROM cloud_flow_db.wf_performance_stats ps
JOIN (
  SELECT DISTINCT tenant_id, DATE(start_time) AS stat_date, process_def_key
  FROM cloud_flow_db.wf_process_monitor
  WHERE tenant_id = 100000
) scope
  ON scope.tenant_id = ps.tenant_id
 AND scope.stat_date = ps.stat_date
 AND scope.process_def_key = ps.process_def_key;

INSERT INTO cloud_flow_db.wf_performance_stats (
  tenant_id, stat_date, process_def_key, process_def_name, total_count, completed_count, failed_count,
  timeout_count, anomaly_count, avg_duration, min_duration, max_duration, create_time, update_time
)
SELECT
  g.tenant_id,
  g.stat_date,
  g.process_def_key,
  g.process_def_name,
  g.total_count,
  g.completed_count,
  g.failed_count,
  COALESCE(t.timeout_count, 0),
  COALESCE(a.anomaly_count, 0),
  g.avg_duration,
  g.min_duration,
  g.max_duration,
  NOW(),
  NOW()
FROM (
  SELECT
    pm.tenant_id,
    DATE(pm.start_time) AS stat_date,
    pm.process_def_key,
    MAX(pm.process_def_name) AS process_def_name,
    COUNT(*) AS total_count,
    SUM(CASE WHEN pm.status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed_count,
    SUM(CASE WHEN pm.status IN ('FAILED', 'TERMINATED', 'REJECTED', 'INVALIDATED') THEN 1 ELSE 0 END) AS failed_count,
    COALESCE(ROUND(AVG(pm.duration)), 0) AS avg_duration,
    COALESCE(MIN(pm.duration), 0) AS min_duration,
    COALESCE(MAX(pm.duration), 0) AS max_duration
  FROM cloud_flow_db.wf_process_monitor pm
  WHERE pm.tenant_id = 100000
    AND pm.status IN ('COMPLETED', 'FAILED', 'TERMINATED', 'REJECTED', 'INVALIDATED')
  GROUP BY pm.tenant_id, DATE(pm.start_time), pm.process_def_key
) g
LEFT JOIN (
  SELECT
    x.tenant_id,
    DATE(x.alert_time) AS stat_date,
    x.process_def_key,
    COUNT(*) AS timeout_count
  FROM (
    SELECT ta.tenant_id, ta.alert_time, pm.process_def_key
    FROM cloud_flow_db.wf_timeout_alert ta
    JOIN cloud_flow_db.wf_process_monitor pm
      ON ta.alert_type = 'PROCESS'
     AND pm.tenant_id = ta.tenant_id
     AND pm.instance_id = ta.target_id
    WHERE ta.resolved = 'N'
    UNION ALL
    SELECT ta.tenant_id, ta.alert_time, pm.process_def_key
    FROM cloud_flow_db.wf_timeout_alert ta
    JOIN cloud_flow_db.wf_task_monitor tm
      ON ta.alert_type = 'TASK'
     AND tm.tenant_id = ta.tenant_id
     AND tm.task_id = ta.target_id
    JOIN cloud_flow_db.wf_process_monitor pm
      ON pm.tenant_id = tm.tenant_id
     AND pm.instance_id = tm.instance_id
    WHERE ta.resolved = 'N'
  ) x
  GROUP BY x.tenant_id, DATE(x.alert_time), x.process_def_key
) t
  ON t.tenant_id = g.tenant_id
 AND t.stat_date = g.stat_date
 AND t.process_def_key = g.process_def_key
LEFT JOIN (
  SELECT
    aa.tenant_id,
    DATE(aa.create_time) AS stat_date,
    aa.process_def_key,
    COUNT(*) AS anomaly_count
  FROM cloud_flow_db.wf_anomaly_alert aa
  WHERE aa.resolved = 'N'
  GROUP BY aa.tenant_id, DATE(aa.create_time), aa.process_def_key
) a
  ON a.tenant_id = g.tenant_id
 AND a.stat_date = g.stat_date
 AND a.process_def_key = g.process_def_key
ON DUPLICATE KEY UPDATE
  process_def_name = VALUES(process_def_name),
  total_count = VALUES(total_count),
  completed_count = VALUES(completed_count),
  failed_count = VALUES(failed_count),
  timeout_count = VALUES(timeout_count),
  anomaly_count = VALUES(anomaly_count),
  avg_duration = VALUES(avg_duration),
  min_duration = VALUES(min_duration),
  max_duration = VALUES(max_duration),
  update_time = VALUES(update_time);

SET FOREIGN_KEY_CHECKS = 1;

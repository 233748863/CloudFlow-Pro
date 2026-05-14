-- =========================================================
-- CloudFlow Pro - HR 人力资源业务域重建脚本
-- 说明：项目未上线，HR 表允许直接 DROP/CREATE，不保留旧数据。
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS hr_audit_log;
DROP TABLE IF EXISTS hr_performance_salary_adjustment;
DROP TABLE IF EXISTS hr_performance_result;
DROP TABLE IF EXISTS hr_performance_assignment;
DROP TABLE IF EXISTS hr_performance_objective;
DROP TABLE IF EXISTS hr_tax_deduction;
DROP TABLE IF EXISTS hr_tax_profile;
DROP TABLE IF EXISTS hr_employee_benefit;
DROP TABLE IF EXISTS hr_benefit_scheme;
DROP TABLE IF EXISTS hr_comp_change;
DROP TABLE IF EXISTS hr_employee_comp;
DROP TABLE IF EXISTS hr_comp_grade;
DROP TABLE IF EXISTS hr_comp_structure;
DROP TABLE IF EXISTS hr_comp_component;
DROP TABLE IF EXISTS hr_time_request;
DROP TABLE IF EXISTS hr_leave_quota;
DROP TABLE IF EXISTS hr_leave_type;
DROP TABLE IF EXISTS hr_attendance_monthly;
DROP TABLE IF EXISTS hr_attendance_record;
DROP TABLE IF EXISTS hr_schedule_assignment;
DROP TABLE IF EXISTS hr_attendance_rule;
DROP TABLE IF EXISTS hr_shift;
DROP TABLE IF EXISTS hr_lifecycle_task;
DROP TABLE IF EXISTS hr_lifecycle_detail;
DROP TABLE IF EXISTS hr_lifecycle_application;
DROP TABLE IF EXISTS hr_offer;
DROP TABLE IF EXISTS hr_interview;
DROP TABLE IF EXISTS hr_candidate;
DROP TABLE IF EXISTS hr_recruitment_requisition;
DROP TABLE IF EXISTS hr_headcount;
DROP TABLE IF EXISTS hr_position;
DROP TABLE IF EXISTS hr_job_level;
DROP TABLE IF EXISTS hr_position_family;
DROP TABLE IF EXISTS hr_emergency_contact;
DROP TABLE IF EXISTS hr_employee_document;
DROP TABLE IF EXISTS hr_employee_contract;
DROP TABLE IF EXISTS hr_employee;

-- 清理旧 HR 表名，避免种子 SQL 与运行期误连旧结构。
DROP TABLE IF EXISTS hr_recruitment_request;
DROP TABLE IF EXISTS hr_onboarding_task;
DROP TABLE IF EXISTS hr_onboarding_application;
DROP TABLE IF EXISTS hr_probation_confirmation;
DROP TABLE IF EXISTS hr_transfer_application;
DROP TABLE IF EXISTS hr_resignation_handover;
DROP TABLE IF EXISTS hr_resignation_application;
DROP TABLE IF EXISTS hr_schedule_plan;
DROP TABLE IF EXISTS hr_schedule_rule_assignment;
DROP TABLE IF EXISTS hr_schedule_rule;
DROP TABLE IF EXISTS hr_work_calendar;
DROP TABLE IF EXISTS hr_leave_application;
DROP TABLE IF EXISTS hr_overtime_application;
DROP TABLE IF EXISTS hr_salary_adjustment;
DROP TABLE IF EXISTS hr_employee_salary;
DROP TABLE IF EXISTS hr_salary_grade;
DROP TABLE IF EXISTS hr_salary_structure_item;
DROP TABLE IF EXISTS hr_salary_structure;
DROP TABLE IF EXISTS hr_salary_item;
DROP TABLE IF EXISTS hr_employee_insurance;
DROP TABLE IF EXISTS hr_insurance_scheme;
DROP TABLE IF EXISTS hr_employee_tax_deduction;
DROP TABLE IF EXISTS hr_tax_config;
DROP TABLE IF EXISTS hr_employee_contract_attachment;
DROP TABLE IF EXISTS hr_employee_document_attachment;
DROP TABLE IF EXISTS hr_reporting_line;

CREATE TABLE hr_employee (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_no VARCHAR(50) NOT NULL COMMENT '工号',
  name VARCHAR(100) NOT NULL COMMENT '姓名',
  gender VARCHAR(20) NOT NULL COMMENT '性别',
  birth_date DATE DEFAULT NULL COMMENT '出生日期',
  phone VARCHAR(30) DEFAULT NULL COMMENT '手机号',
  email VARCHAR(120) DEFAULT NULL COMMENT '邮箱',
  dept_id BIGINT DEFAULT NULL COMMENT '部门ID',
  post_id BIGINT DEFAULT NULL COMMENT '岗位ID',
  position_id BIGINT DEFAULT NULL COMMENT '职位ID',
  employee_type VARCHAR(30) NOT NULL DEFAULT 'FULL_TIME' COMMENT '员工类型',
  employee_status VARCHAR(30) NOT NULL DEFAULT 'PROBATION' COMMENT '员工状态',
  hire_date DATE DEFAULT NULL COMMENT '入职日期',
  regular_date DATE DEFAULT NULL COMMENT '转正日期',
  resign_date DATE DEFAULT NULL COMMENT '离职日期',
  user_id BIGINT DEFAULT NULL COMMENT '系统用户ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_employee_no (tenant_id, employee_no),
  KEY idx_hr_employee_status (tenant_id, employee_status),
  KEY idx_hr_employee_dept (tenant_id, dept_id),
  KEY idx_hr_employee_user (tenant_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工主数据';

CREATE TABLE hr_employee_contract (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  contract_type VARCHAR(30) NOT NULL,
  contract_no VARCHAR(80) NOT NULL,
  sign_date DATE NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  attachment_urls JSON DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_contract_no (tenant_id, contract_no),
  KEY idx_hr_contract_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工合同';

CREATE TABLE hr_employee_document (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  document_type VARCHAR(40) NOT NULL,
  document_no VARCHAR(100) NOT NULL,
  issue_date DATE DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  attachment_urls JSON DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_document_employee (tenant_id, employee_id),
  KEY idx_hr_document_type (tenant_id, document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工证件';

CREATE TABLE hr_emergency_contact (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  contact_name VARCHAR(100) NOT NULL,
  relationship VARCHAR(30) NOT NULL,
  phone VARCHAR(30) NOT NULL,
  address VARCHAR(255) DEFAULT NULL,
  priority INT DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_contact_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR紧急联系人';

CREATE TABLE hr_position_family (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  family_code VARCHAR(50) NOT NULL,
  family_name VARCHAR(100) NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_family_code (tenant_id, family_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职位族';

CREATE TABLE hr_job_level (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  level_code VARCHAR(50) NOT NULL,
  level_name VARCHAR(100) NOT NULL,
  level_series VARCHAR(20) NOT NULL,
  level_rank INT NOT NULL,
  description VARCHAR(500) DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_level_code (tenant_id, level_code),
  KEY idx_hr_level_series (tenant_id, level_series, level_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职级';

CREATE TABLE hr_position (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  position_code VARCHAR(50) NOT NULL,
  position_name VARCHAR(100) NOT NULL,
  family_id BIGINT DEFAULT NULL,
  level_id BIGINT DEFAULT NULL,
  post_id BIGINT DEFAULT NULL,
  job_description TEXT DEFAULT NULL,
  requirements TEXT DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_position_code (tenant_id, position_code),
  KEY idx_hr_position_family (tenant_id, family_id),
  KEY idx_hr_position_level (tenant_id, level_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职位';

CREATE TABLE hr_headcount (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  target_type VARCHAR(20) NOT NULL COMMENT 'DEPT/POST',
  target_id BIGINT NOT NULL,
  target_name VARCHAR(120) DEFAULT NULL,
  approved_count INT NOT NULL DEFAULT 0,
  actual_count INT NOT NULL DEFAULT 0,
  vacancy_count INT NOT NULL DEFAULT 0,
  effective_date DATE DEFAULT NULL,
  expiry_date DATE DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_headcount_target (tenant_id, target_type, target_id),
  KEY idx_hr_headcount_type (tenant_id, target_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR组织编制';

CREATE TABLE hr_recruitment_requisition (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  requisition_no VARCHAR(60) NOT NULL,
  title VARCHAR(160) NOT NULL,
  dept_id BIGINT DEFAULT NULL,
  position_id BIGINT DEFAULT NULL,
  headcount INT NOT NULL DEFAULT 1,
  hired_count INT NOT NULL DEFAULT 0,
  salary_min VARCHAR(255) DEFAULT NULL,
  salary_max VARCHAR(255) DEFAULT NULL,
  expected_arrival_date DATE DEFAULT NULL,
  reason VARCHAR(500) DEFAULT NULL,
  requirements TEXT DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  process_instance_id VARCHAR(100) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_requisition_no (tenant_id, requisition_no),
  KEY idx_hr_requisition_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR招聘需求';

CREATE TABLE hr_candidate (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  candidate_no VARCHAR(60) DEFAULT NULL,
  requisition_id BIGINT DEFAULT NULL,
  name VARCHAR(100) NOT NULL,
  gender VARCHAR(20) DEFAULT NULL,
  phone VARCHAR(30) DEFAULT NULL,
  email VARCHAR(120) DEFAULT NULL,
  source VARCHAR(50) DEFAULT NULL,
  resume_attachment_urls JSON DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SCREENING',
  reject_reason VARCHAR(500) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_candidate_req (tenant_id, requisition_id),
  KEY idx_hr_candidate_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR候选人';

CREATE TABLE hr_interview (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  candidate_id BIGINT NOT NULL,
  interview_round VARCHAR(40) DEFAULT NULL,
  interview_type VARCHAR(40) DEFAULT NULL,
  interview_time DATETIME DEFAULT NULL,
  interview_end_time DATETIME DEFAULT NULL,
  interviewer_ids JSON DEFAULT NULL,
  interviewer_names JSON DEFAULT NULL,
  location VARCHAR(200) DEFAULT NULL,
  evaluation TEXT DEFAULT NULL,
  score DECIMAL(6,2) DEFAULT NULL,
  result VARCHAR(30) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_interview_candidate (tenant_id, candidate_id),
  KEY idx_hr_interview_time (tenant_id, interview_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR面试';

CREATE TABLE hr_offer (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  offer_no VARCHAR(60) NOT NULL,
  candidate_id BIGINT NOT NULL,
  position_id BIGINT DEFAULT NULL,
  salary VARCHAR(255) DEFAULT NULL,
  expected_arrival_date DATE DEFAULT NULL,
  expire_date DATE DEFAULT NULL,
  offer_content TEXT DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  process_instance_id VARCHAR(100) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_offer_no (tenant_id, offer_no),
  KEY idx_hr_offer_candidate (tenant_id, candidate_id),
  KEY idx_hr_offer_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR录用Offer';

CREATE TABLE hr_lifecycle_application (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  application_no VARCHAR(60) NOT NULL,
  type VARCHAR(30) NOT NULL COMMENT 'ONBOARDING/PROBATION/TRANSFER/RESIGNATION',
  employee_id BIGINT DEFAULT NULL,
  candidate_id BIGINT DEFAULT NULL,
  name VARCHAR(100) DEFAULT NULL,
  dept_id BIGINT DEFAULT NULL,
  post_id BIGINT DEFAULT NULL,
  position_id BIGINT DEFAULT NULL,
  effective_date DATE DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  process_instance_id VARCHAR(100) DEFAULT NULL,
  remark VARCHAR(800) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_lifecycle_no (tenant_id, application_no),
  KEY idx_hr_lifecycle_type (tenant_id, type, status),
  KEY idx_hr_lifecycle_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工生命周期申请';

CREATE TABLE hr_lifecycle_detail (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  application_id BIGINT NOT NULL,
  detail_type VARCHAR(40) NOT NULL,
  detail_json JSON NOT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_lifecycle_detail_app (tenant_id, application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR生命周期申请明细';

CREATE TABLE hr_lifecycle_task (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  application_id BIGINT NOT NULL,
  task_name VARCHAR(120) NOT NULL,
  task_type VARCHAR(40) NOT NULL,
  owner_id BIGINT DEFAULT NULL,
  due_date DATE DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING',
  remark VARCHAR(500) DEFAULT NULL,
  completed_time DATETIME DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_lifecycle_task_app (tenant_id, application_id),
  KEY idx_hr_lifecycle_task_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR生命周期任务';

CREATE TABLE hr_shift (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  shift_code VARCHAR(50) NOT NULL,
  shift_name VARCHAR(100) NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  break_minutes INT NOT NULL DEFAULT 60,
  work_minutes INT NOT NULL DEFAULT 480,
  color VARCHAR(20) DEFAULT '#0891b2',
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_shift_code (tenant_id, shift_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR班次';

CREATE TABLE hr_attendance_rule (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  rule_code VARCHAR(50) NOT NULL,
  rule_name VARCHAR(100) NOT NULL,
  rule_type VARCHAR(30) NOT NULL DEFAULT 'FIXED',
  shift_id BIGINT DEFAULT NULL,
  work_days JSON DEFAULT NULL,
  check_methods JSON DEFAULT NULL,
  config_json JSON DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_att_rule_code (tenant_id, rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考勤规则';

CREATE TABLE hr_schedule_assignment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  target_type VARCHAR(30) NOT NULL,
  target_id BIGINT NOT NULL,
  target_name VARCHAR(120) DEFAULT NULL,
  rule_id BIGINT DEFAULT NULL,
  shift_id BIGINT DEFAULT NULL,
  schedule_date DATE DEFAULT NULL,
  effective_start DATE DEFAULT NULL,
  effective_end DATE DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_schedule_target (tenant_id, target_type, target_id),
  KEY idx_hr_schedule_date (tenant_id, schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR排班分配';

CREATE TABLE hr_attendance_record (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  attendance_date DATE NOT NULL,
  shift_id BIGINT DEFAULT NULL,
  check_type VARCHAR(30) NOT NULL,
  check_time DATETIME NOT NULL,
  expected_time DATETIME DEFAULT NULL,
  deviation_minutes INT DEFAULT 0,
  check_method VARCHAR(30) DEFAULT NULL,
  location VARCHAR(255) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'NORMAL',
  remark VARCHAR(500) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_att_record_employee (tenant_id, employee_id, attendance_date),
  KEY idx_hr_att_record_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR打卡记录';

CREATE TABLE hr_attendance_monthly (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  year INT NOT NULL,
  month INT NOT NULL,
  work_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  actual_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  late_times INT NOT NULL DEFAULT 0,
  early_times INT NOT NULL DEFAULT 0,
  absent_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  leave_days DECIMAL(6,2) NOT NULL DEFAULT 0,
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0,
  attendance_rate DECIMAL(6,2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_att_monthly (tenant_id, employee_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR月度考勤统计';

CREATE TABLE hr_leave_type (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  leave_code VARCHAR(50) NOT NULL,
  leave_name VARCHAR(100) NOT NULL,
  need_quota TINYINT(1) NOT NULL DEFAULT 0,
  is_paid TINYINT(1) NOT NULL DEFAULT 1,
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY',
  quota_rule JSON DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_leave_code (tenant_id, leave_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期类型';

CREATE TABLE hr_leave_quota (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  leave_type_id BIGINT NOT NULL,
  year INT NOT NULL,
  total_quota DECIMAL(8,2) NOT NULL DEFAULT 0,
  used_quota DECIMAL(8,2) NOT NULL DEFAULT 0,
  frozen_quota DECIMAL(8,2) NOT NULL DEFAULT 0,
  available_quota DECIMAL(8,2) NOT NULL DEFAULT 0,
  expiry_date DATE DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_leave_quota_employee (tenant_id, employee_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期额度';

CREATE TABLE hr_time_request (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  request_no VARCHAR(60) NOT NULL,
  request_type VARCHAR(30) NOT NULL COMMENT 'LEAVE/OVERTIME/SUPPLEMENT',
  employee_id BIGINT NOT NULL,
  leave_type_id BIGINT DEFAULT NULL,
  start_time DATETIME DEFAULT NULL,
  end_time DATETIME DEFAULT NULL,
  duration DECIMAL(8,2) DEFAULT NULL,
  unit VARCHAR(20) DEFAULT NULL,
  reason VARCHAR(800) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  process_instance_id VARCHAR(100) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_time_request_no (tenant_id, request_no),
  KEY idx_hr_time_request_employee (tenant_id, employee_id, request_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假勤申请';

CREATE TABLE hr_comp_component (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  component_code VARCHAR(50) NOT NULL,
  component_name VARCHAR(100) NOT NULL,
  component_type VARCHAR(30) NOT NULL,
  category VARCHAR(30) DEFAULT NULL,
  taxable TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT DEFAULT 0,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_component (tenant_id, component_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资项目';

CREATE TABLE hr_comp_structure (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  structure_code VARCHAR(50) NOT NULL,
  structure_name VARCHAR(100) NOT NULL,
  component_config JSON DEFAULT NULL,
  description VARCHAR(500) DEFAULT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_structure (tenant_id, structure_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资结构';

CREATE TABLE hr_comp_grade (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  grade_code VARCHAR(50) NOT NULL,
  grade_name VARCHAR(100) NOT NULL,
  level_id BIGINT DEFAULT NULL,
  min_salary VARCHAR(255) NOT NULL,
  mid_salary VARCHAR(255) NOT NULL,
  max_salary VARCHAR(255) NOT NULL,
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY',
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_grade (tenant_id, grade_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪级';

CREATE TABLE hr_employee_comp (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  structure_id BIGINT DEFAULT NULL,
  grade_id BIGINT DEFAULT NULL,
  component_values JSON DEFAULT NULL,
  total_salary VARCHAR(255) NOT NULL,
  effective_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_employee_comp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工薪资';

CREATE TABLE hr_comp_change (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  change_no VARCHAR(60) NOT NULL,
  employee_id BIGINT NOT NULL,
  change_type VARCHAR(30) NOT NULL,
  before_total VARCHAR(255) DEFAULT NULL,
  after_total VARCHAR(255) NOT NULL,
  change_amount VARCHAR(255) DEFAULT NULL,
  effective_date DATE NOT NULL,
  reason VARCHAR(800) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  process_instance_id VARCHAR(100) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_change_no (tenant_id, change_no),
  KEY idx_hr_comp_change_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR调薪';

CREATE TABLE hr_benefit_scheme (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  scheme_code VARCHAR(50) NOT NULL,
  scheme_name VARCHAR(100) NOT NULL,
  city VARCHAR(80) DEFAULT NULL,
  benefit_config JSON NOT NULL,
  effective_date DATE NOT NULL,
  status TINYINT(1) NOT NULL DEFAULT 1,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_benefit_scheme (tenant_id, scheme_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR社保公积金方案';

CREATE TABLE hr_employee_benefit (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  scheme_id BIGINT NOT NULL,
  base_amount VARCHAR(255) NOT NULL,
  effective_date DATE NOT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_employee_benefit (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工福利方案';

CREATE TABLE hr_tax_profile (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  tax_residence_city VARCHAR(80) DEFAULT NULL,
  threshold VARCHAR(255) NOT NULL DEFAULT '5000',
  tax_config JSON DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_tax_profile_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR个税档案';

CREATE TABLE hr_tax_deduction (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  deduction_type VARCHAR(50) NOT NULL,
  amount VARCHAR(255) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE',
  remark VARCHAR(500) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_hr_tax_deduction_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR专项扣除';

CREATE TABLE hr_performance_objective (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  objective_no VARCHAR(60) NOT NULL,
  cycle_name VARCHAR(100) NOT NULL,
  cycle_start_date DATE NOT NULL,
  cycle_end_date DATE NOT NULL,
  objective_name VARCHAR(200) NOT NULL,
  owner_employee_id BIGINT DEFAULT NULL,
  metric_config JSON DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  plan_process_instance_id VARCHAR(100) DEFAULT NULL,
  result_process_instance_id VARCHAR(100) DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  create_by VARCHAR(64) DEFAULT '',
  update_by VARCHAR(64) DEFAULT '',
  deleted TINYINT(1) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_perf_objective_no (tenant_id, objective_no),
  KEY idx_hr_perf_objective_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效目标';

CREATE TABLE hr_performance_assignment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  objective_id BIGINT NOT NULL,
  parent_id BIGINT DEFAULT NULL,
  assignee_type VARCHAR(30) NOT NULL,
  assignee_id BIGINT NOT NULL,
  assignee_name VARCHAR(120) DEFAULT NULL,
  target_value DECIMAL(18,4) DEFAULT 0,
  actual_value DECIMAL(18,4) DEFAULT 0,
  weight DECIMAL(8,2) DEFAULT 100,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_perf_assignment_obj (tenant_id, objective_id),
  KEY idx_hr_perf_assignment_assignee (tenant_id, assignee_type, assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效分解';

CREATE TABLE hr_performance_result (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  objective_id BIGINT NOT NULL,
  assignment_id BIGINT DEFAULT NULL,
  employee_id BIGINT DEFAULT NULL,
  score DECIMAL(8,2) DEFAULT NULL,
  grade VARCHAR(20) DEFAULT NULL,
  summary TEXT DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_perf_result_obj (tenant_id, objective_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效结果';

CREATE TABLE hr_performance_salary_adjustment (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  objective_id BIGINT NOT NULL,
  employee_id BIGINT NOT NULL,
  comp_change_id BIGINT DEFAULT NULL,
  adjustment_amount VARCHAR(255) NOT NULL,
  reason VARCHAR(800) DEFAULT NULL,
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_perf_salary_obj (tenant_id, objective_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效调薪联动';

CREATE TABLE hr_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT,
  tenant_id BIGINT NOT NULL,
  business_domain VARCHAR(60) NOT NULL,
  business_id BIGINT DEFAULT NULL,
  operation_type VARCHAR(40) NOT NULL,
  operator_id BIGINT DEFAULT NULL,
  operator_name VARCHAR(100) DEFAULT NULL,
  before_data JSON DEFAULT NULL,
  after_data JSON DEFAULT NULL,
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_audit_business (tenant_id, business_domain, business_id),
  KEY idx_hr_audit_time (tenant_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR审计日志';

SET FOREIGN_KEY_CHECKS = 1;

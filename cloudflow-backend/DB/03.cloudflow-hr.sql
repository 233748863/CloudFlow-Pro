-- =========================================================
-- CloudFlow Pro - HR 人力资源业务域重建脚本
-- 说明：项目未上线，HR 表允许直接 DROP/CREATE，不保留旧数据。
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ===== 人才盘点 / 继任 / 人才池 / 培养行动 新增表的 DROP（按反向依赖顺序） =====
DROP TABLE IF EXISTS hr_talent_development_action;
DROP TABLE IF EXISTS hr_talent_pool_member;
DROP TABLE IF EXISTS hr_talent_pool;
DROP TABLE IF EXISTS hr_talent_successor;
DROP TABLE IF EXISTS hr_talent_succession_plan;
DROP TABLE IF EXISTS hr_talent_calibration_session;
DROP TABLE IF EXISTS hr_talent_review_participant;
DROP TABLE IF EXISTS hr_talent_review;

-- ===== ESS (员工自助) + 培训管理 新增表的 DROP（按反向依赖顺序） =====
DROP TABLE IF EXISTS hr_training_certificate;
DROP TABLE IF EXISTS hr_training_certificate_template;
DROP TABLE IF EXISTS hr_exam_attempt;
DROP TABLE IF EXISTS hr_exam_paper;
DROP TABLE IF EXISTS hr_exam_question_bank;
DROP TABLE IF EXISTS hr_training_enrollment;
DROP TABLE IF EXISTS hr_training_session;
DROP TABLE IF EXISTS hr_training_course;
DROP TABLE IF EXISTS hr_training_instructor;
DROP TABLE IF EXISTS hr_training_category;
DROP TABLE IF EXISTS hr_training_plan;
DROP TABLE IF EXISTS hr_self_service_message;
DROP TABLE IF EXISTS hr_contract_signature;
DROP TABLE IF EXISTS hr_benefit_payment;
DROP TABLE IF EXISTS hr_family_member;
DROP TABLE IF EXISTS hr_bank_card;
DROP TABLE IF EXISTS hr_certificate_request;
DROP TABLE IF EXISTS hr_salary_slip;

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
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  contract_type VARCHAR(30) NOT NULL COMMENT '合同类型(LABOR/INTERN/SERVICE)',
  contract_no VARCHAR(80) NOT NULL COMMENT '合同编号',
  sign_date DATE NOT NULL COMMENT '签订日期',
  start_date DATE NOT NULL COMMENT '合同开始日期',
  end_date DATE NOT NULL COMMENT '合同到期日期',
  attachment_urls JSON DEFAULT NULL COMMENT '合同附件URL列表',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '合同状态(ACTIVE/EXPIRED/TERMINATED)',
  sign_status VARCHAR(30) NOT NULL DEFAULT 'UNSIGNED' COMMENT '电子签署状态 UNSIGNED/PENDING/SIGNED/REJECTED/EXPIRED',
  signed_at DATETIME DEFAULT NULL COMMENT '签署完成时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_contract_no (tenant_id, contract_no),
  KEY idx_hr_contract_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工合同';

CREATE TABLE hr_employee_document (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  document_type VARCHAR(40) NOT NULL COMMENT '证件类型(ID_CARD/PASSPORT/...)',
  document_no VARCHAR(100) NOT NULL COMMENT '证件号',
  issue_date DATE DEFAULT NULL COMMENT '签发日期',
  expiry_date DATE DEFAULT NULL COMMENT '失效日期',
  attachment_urls JSON DEFAULT NULL COMMENT '证件影像URL列表',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_document_employee (tenant_id, employee_id),
  KEY idx_hr_document_type (tenant_id, document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工证件';

CREATE TABLE hr_emergency_contact (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  contact_name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
  relationship VARCHAR(30) NOT NULL COMMENT '与员工关系',
  phone VARCHAR(30) NOT NULL COMMENT '联系电话',
  address VARCHAR(255) DEFAULT NULL COMMENT '联系地址',
  priority INT DEFAULT 1 COMMENT '优先级(数字越小越优先)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_contact_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR紧急联系人';

CREATE TABLE hr_position_family (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  family_code VARCHAR(50) NOT NULL COMMENT '职位族编码',
  family_name VARCHAR(100) NOT NULL COMMENT '职位族名称',
  description VARCHAR(500) DEFAULT NULL COMMENT '说明',
  sort_order INT DEFAULT 0 COMMENT '排序号',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_family_code (tenant_id, family_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职位族';

CREATE TABLE hr_job_level (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  level_code VARCHAR(50) NOT NULL COMMENT '职级编码',
  level_name VARCHAR(100) NOT NULL COMMENT '职级名称',
  level_series VARCHAR(20) NOT NULL COMMENT '职级序列',
  level_rank INT NOT NULL COMMENT '职级数值排序',
  description VARCHAR(500) DEFAULT NULL COMMENT '说明',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_level_code (tenant_id, level_code),
  KEY idx_hr_level_series (tenant_id, level_series, level_rank)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职级';

CREATE TABLE hr_position (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  position_code VARCHAR(50) NOT NULL COMMENT '职位编码',
  position_name VARCHAR(100) NOT NULL COMMENT '职位名称',
  family_id BIGINT DEFAULT NULL COMMENT '所属职位族ID',
  level_id BIGINT DEFAULT NULL COMMENT '所属职级ID',
  post_id BIGINT DEFAULT NULL COMMENT '关联岗位ID',
  job_description TEXT DEFAULT NULL COMMENT '岗位职责描述',
  requirements TEXT DEFAULT NULL COMMENT '任职要求',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_position_code (tenant_id, position_code),
  KEY idx_hr_position_family (tenant_id, family_id),
  KEY idx_hr_position_level (tenant_id, level_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR职位';

CREATE TABLE hr_headcount (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  target_type VARCHAR(20) NOT NULL COMMENT 'DEPT/POST',
  target_id BIGINT NOT NULL COMMENT '编制对象ID(部门或岗位)',
  target_name VARCHAR(120) DEFAULT NULL COMMENT '编制对象名称(冗余)',
  approved_count INT NOT NULL DEFAULT 0 COMMENT '审批编制数',
  actual_count INT NOT NULL DEFAULT 0 COMMENT '当前在岗数',
  vacancy_count INT NOT NULL DEFAULT 0 COMMENT '空缺数',
  effective_date DATE DEFAULT NULL COMMENT '编制生效日期',
  expiry_date DATE DEFAULT NULL COMMENT '编制失效日期',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_headcount_target (tenant_id, target_type, target_id),
  KEY idx_hr_headcount_type (tenant_id, target_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR组织编制';

CREATE TABLE hr_recruitment_requisition (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  requisition_no VARCHAR(60) NOT NULL COMMENT '招聘需求单号',
  title VARCHAR(160) NOT NULL COMMENT '招聘需求标题',
  dept_id BIGINT DEFAULT NULL COMMENT '招聘所属部门ID',
  position_id BIGINT DEFAULT NULL COMMENT '招聘职位ID',
  headcount INT NOT NULL DEFAULT 1 COMMENT '需求人数',
  hired_count INT NOT NULL DEFAULT 0 COMMENT '已录用人数',
  salary_min VARCHAR(255) DEFAULT NULL COMMENT '薪资下限(加密存储)',
  salary_max VARCHAR(255) DEFAULT NULL COMMENT '薪资上限(加密存储)',
  expected_arrival_date DATE DEFAULT NULL COMMENT '期望到岗日期',
  reason VARCHAR(500) DEFAULT NULL COMMENT '招聘原因',
  requirements TEXT DEFAULT NULL COMMENT '任职要求',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '招聘单状态(DRAFT/APPROVING/OPEN/CLOSED/CANCELLED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_requisition_no (tenant_id, requisition_no),
  KEY idx_hr_requisition_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR招聘需求';

CREATE TABLE hr_candidate (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  candidate_no VARCHAR(60) DEFAULT NULL COMMENT '候选人编号',
  requisition_id BIGINT DEFAULT NULL COMMENT '关联招聘需求ID',
  name VARCHAR(100) NOT NULL COMMENT '候选人姓名',
  gender VARCHAR(20) DEFAULT NULL COMMENT '性别',
  phone VARCHAR(30) DEFAULT NULL COMMENT '联系电话',
  email VARCHAR(120) DEFAULT NULL COMMENT '邮箱',
  source VARCHAR(50) DEFAULT NULL COMMENT '简历来源(自由文本,兼容历史)',
  channel_id BIGINT DEFAULT NULL COMMENT '关联招聘渠道ID(hr_recruitment_channel.id)',
  resume_attachment_urls JSON DEFAULT NULL COMMENT '简历附件URL列表',
  status VARCHAR(30) NOT NULL DEFAULT 'SCREENING' COMMENT '候选人状态(SCREENING/INTERVIEWING/OFFERED/REJECTED/HIRED)',
  reject_reason VARCHAR(500) DEFAULT NULL COMMENT '淘汰原因',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_candidate_req (tenant_id, requisition_id),
  KEY idx_hr_candidate_status (tenant_id, status),
  KEY idx_hr_candidate_channel (tenant_id, channel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR候选人';

CREATE TABLE hr_interview (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  candidate_id BIGINT NOT NULL COMMENT '候选人ID',
  interview_round VARCHAR(40) DEFAULT NULL COMMENT '面试轮次',
  interview_type VARCHAR(40) DEFAULT NULL COMMENT '面试方式(ONSITE/VIDEO/PHONE)',
  interview_time DATETIME DEFAULT NULL COMMENT '面试开始时间',
  interview_end_time DATETIME DEFAULT NULL COMMENT '面试结束时间',
  interviewer_ids JSON DEFAULT NULL COMMENT '面试官用户ID列表',
  interviewer_names JSON DEFAULT NULL COMMENT '面试官姓名列表(冗余快照)',
  location VARCHAR(200) DEFAULT NULL COMMENT '面试地点',
  evaluation TEXT DEFAULT NULL COMMENT '面试评价',
  score DECIMAL(6,2) DEFAULT NULL COMMENT '面试评分',
  result VARCHAR(30) DEFAULT NULL COMMENT '面试结果(PASS/FAIL/PENDING)',
  status VARCHAR(30) NOT NULL DEFAULT 'SCHEDULED' COMMENT '面试状态(SCHEDULED/COMPLETED/CANCELLED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_interview_candidate (tenant_id, candidate_id),
  KEY idx_hr_interview_time (tenant_id, interview_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR面试';

CREATE TABLE hr_offer (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  offer_no VARCHAR(60) NOT NULL COMMENT 'Offer编号',
  candidate_id BIGINT NOT NULL COMMENT '候选人ID',
  position_id BIGINT DEFAULT NULL COMMENT '入职职位ID',
  salary VARCHAR(255) DEFAULT NULL COMMENT '薪资方案(加密存储)',
  expected_arrival_date DATE DEFAULT NULL COMMENT '期望到岗日期',
  expire_date DATE DEFAULT NULL COMMENT 'Offer有效期',
  offer_content TEXT DEFAULT NULL COMMENT 'Offer正文',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'Offer状态(DRAFT/APPROVING/SENT/ACCEPTED/REJECTED/EXPIRED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_offer_no (tenant_id, offer_no),
  KEY idx_hr_offer_candidate (tenant_id, candidate_id),
  KEY idx_hr_offer_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR录用Offer';

CREATE TABLE hr_lifecycle_application (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_no VARCHAR(60) NOT NULL COMMENT '生命周期申请单号',
  type VARCHAR(30) NOT NULL COMMENT 'ONBOARDING/PROBATION/TRANSFER/RESIGNATION',
  employee_id BIGINT DEFAULT NULL COMMENT '员工ID(转正/调岗/离职用)',
  candidate_id BIGINT DEFAULT NULL COMMENT '候选人ID(入职用)',
  name VARCHAR(100) DEFAULT NULL COMMENT '申请人姓名(冗余快照)',
  dept_id BIGINT DEFAULT NULL COMMENT '目标部门ID',
  post_id BIGINT DEFAULT NULL COMMENT '目标岗位ID',
  position_id BIGINT DEFAULT NULL COMMENT '目标职位ID',
  effective_date DATE DEFAULT NULL COMMENT '生效日期',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  remark VARCHAR(800) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_lifecycle_no (tenant_id, application_no),
  KEY idx_hr_lifecycle_type (tenant_id, type, status),
  KEY idx_hr_lifecycle_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工生命周期申请';

CREATE TABLE hr_lifecycle_detail (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_id BIGINT NOT NULL COMMENT '关联生命周期申请ID',
  detail_type VARCHAR(40) NOT NULL COMMENT '明细类型(ONBOARD_TASK/HANDOVER_ITEM/...)',
  detail_json JSON NOT NULL COMMENT '明细数据(JSON)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_lifecycle_detail_app (tenant_id, application_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR生命周期申请明细';

CREATE TABLE hr_lifecycle_task (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_id BIGINT NOT NULL COMMENT '关联生命周期申请ID',
  task_name VARCHAR(120) NOT NULL COMMENT '任务名称',
  task_type VARCHAR(40) NOT NULL COMMENT '任务类型(ONBOARDING/HANDOVER/...)',
  owner_id BIGINT DEFAULT NULL COMMENT '任务负责人用户ID',
  due_date DATE DEFAULT NULL COMMENT '任务截止日期',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '任务状态(PENDING/IN_PROGRESS/DONE/CANCELLED)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  completed_time DATETIME DEFAULT NULL COMMENT '任务完成时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_lifecycle_task_app (tenant_id, application_id),
  KEY idx_hr_lifecycle_task_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR生命周期任务';

CREATE TABLE hr_shift (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  shift_code VARCHAR(50) NOT NULL COMMENT '班次编码',
  shift_name VARCHAR(100) NOT NULL COMMENT '班次名称',
  start_time TIME NOT NULL COMMENT '上班时间',
  end_time TIME NOT NULL COMMENT '下班时间',
  break_minutes INT NOT NULL DEFAULT 60 COMMENT '休息时长(分钟)',
  work_minutes INT NOT NULL DEFAULT 480 COMMENT '工作时长(分钟)',
  color VARCHAR(20) DEFAULT '#0891b2' COMMENT '日历显示颜色',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_shift_code (tenant_id, shift_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR班次';

CREATE TABLE hr_attendance_rule (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  rule_code VARCHAR(50) NOT NULL COMMENT '考勤规则编码',
  rule_name VARCHAR(100) NOT NULL COMMENT '考勤规则名称',
  rule_type VARCHAR(30) NOT NULL DEFAULT 'FIXED' COMMENT '考勤规则类型(FIXED/FLEX/SHIFT)',
  shift_id BIGINT DEFAULT NULL COMMENT '关联班次ID',
  work_days JSON DEFAULT NULL COMMENT '工作日配置(JSON)',
  check_methods JSON DEFAULT NULL COMMENT '打卡方式配置(JSON)',
  config_json JSON DEFAULT NULL COMMENT '其它配置(JSON)',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_att_rule_code (tenant_id, rule_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考勤规则';

CREATE TABLE hr_schedule_assignment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  target_type VARCHAR(30) NOT NULL COMMENT '排班对象类型(EMPLOYEE/DEPT)',
  target_id BIGINT NOT NULL COMMENT '排班对象ID',
  target_name VARCHAR(120) DEFAULT NULL COMMENT '排班对象名称(冗余)',
  rule_id BIGINT DEFAULT NULL COMMENT '关联考勤规则ID',
  shift_id BIGINT DEFAULT NULL COMMENT '关联班次ID',
  schedule_date DATE DEFAULT NULL COMMENT '排班日期',
  effective_start DATE DEFAULT NULL COMMENT '生效起始日期',
  effective_end DATE DEFAULT NULL COMMENT '生效结束日期',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '排班状态(ACTIVE/CANCELLED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_schedule_target (tenant_id, target_type, target_id),
  KEY idx_hr_schedule_date (tenant_id, schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR排班分配';

CREATE TABLE hr_attendance_record (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  attendance_date DATE NOT NULL COMMENT '考勤所属日期',
  shift_id BIGINT DEFAULT NULL COMMENT '当日班次ID',
  check_type VARCHAR(30) NOT NULL COMMENT '打卡类型(CHECK_IN/CHECK_OUT/BREAK_OUT/BREAK_IN)',
  check_time DATETIME NOT NULL COMMENT '实际打卡时间',
  expected_time DATETIME DEFAULT NULL COMMENT '应打卡时间',
  deviation_minutes INT DEFAULT 0 COMMENT '偏差分钟数(负=早,正=晚)',
  check_method VARCHAR(30) DEFAULT NULL COMMENT '打卡方式(GPS/WIFI/FACE/MANUAL)',
  location VARCHAR(255) DEFAULT NULL COMMENT '打卡地点',
  status VARCHAR(30) NOT NULL DEFAULT 'NORMAL' COMMENT '打卡状态(NORMAL/LATE/EARLY/ABSENT/MAKEUP)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_att_record_employee (tenant_id, employee_id, attendance_date),
  KEY idx_hr_att_record_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR打卡记录';

CREATE TABLE hr_attendance_monthly (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  year INT NOT NULL COMMENT '统计年份',
  month INT NOT NULL COMMENT '统计月份',
  work_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '应出勤天数',
  actual_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '实际出勤天数',
  late_times INT NOT NULL DEFAULT 0 COMMENT '迟到次数',
  early_times INT NOT NULL DEFAULT 0 COMMENT '早退次数',
  absent_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '缺勤天数',
  leave_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '请假天数',
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '加班小时数',
  attendance_rate DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '出勤率(%)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '统计单状态(DRAFT/CONFIRMED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_att_monthly (tenant_id, employee_id, year, month)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR月度考勤统计';

CREATE TABLE hr_leave_type (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  leave_code VARCHAR(50) NOT NULL COMMENT '假期类型编码',
  leave_name VARCHAR(100) NOT NULL COMMENT '假期类型名称',
  need_quota TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要额度(1=是,0=否)',
  is_paid TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否带薪(1=是,0=否)',
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT '请假单位(DAY/HOUR)',
  quota_rule JSON DEFAULT NULL COMMENT '额度计算规则(JSON)',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_leave_code (tenant_id, leave_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期类型';

CREATE TABLE hr_leave_quota (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT NOT NULL COMMENT '假期类型ID',
  year INT NOT NULL COMMENT '所属年度',
  total_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '额度总量',
  used_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '已使用额度',
  frozen_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '冻结中额度(审批中)',
  available_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '可用额度',
  expiry_date DATE DEFAULT NULL COMMENT '额度失效日期',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_leave_quota_employee (tenant_id, employee_id, year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期额度';

CREATE TABLE hr_time_request (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '假勤申请单号',
  request_type VARCHAR(30) NOT NULL COMMENT 'LEAVE/OVERTIME/SUPPLEMENT',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT DEFAULT NULL COMMENT '假期类型ID(请假时)',
  start_time DATETIME DEFAULT NULL COMMENT '开始时间',
  end_time DATETIME DEFAULT NULL COMMENT '结束时间',
  duration DECIMAL(8,2) DEFAULT NULL COMMENT '时长',
  unit VARCHAR(20) DEFAULT NULL COMMENT '时长单位(DAY/HOUR)',
  reason VARCHAR(800) DEFAULT NULL COMMENT '事由',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_time_request_no (tenant_id, request_no),
  KEY idx_hr_time_request_employee (tenant_id, employee_id, request_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假勤申请';

CREATE TABLE hr_comp_component (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  component_code VARCHAR(50) NOT NULL COMMENT '薪资项编码',
  component_name VARCHAR(100) NOT NULL COMMENT '薪资项名称',
  component_type VARCHAR(30) NOT NULL COMMENT '薪资项类型(EARNING/DEDUCTION)',
  category VARCHAR(30) DEFAULT NULL COMMENT '薪资项分类(BASIC/ALLOWANCE/INSURANCE/TAX/...)',
  taxable TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否计税(1=是,0=否)',
  sort_order INT DEFAULT 0 COMMENT '排序号',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_component (tenant_id, component_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资项目';

CREATE TABLE hr_comp_structure (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  structure_code VARCHAR(50) NOT NULL COMMENT '薪资结构编码',
  structure_name VARCHAR(100) NOT NULL COMMENT '薪资结构名称',
  component_config JSON DEFAULT NULL COMMENT '薪资项组成配置(JSON)',
  description VARCHAR(500) DEFAULT NULL COMMENT '说明',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_structure (tenant_id, structure_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资结构';

CREATE TABLE hr_comp_grade (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  grade_code VARCHAR(50) NOT NULL COMMENT '薪级编码',
  grade_name VARCHAR(100) NOT NULL COMMENT '薪级名称',
  level_id BIGINT DEFAULT NULL COMMENT '关联职级ID',
  min_salary VARCHAR(255) NOT NULL COMMENT '薪级下限(加密存储)',
  mid_salary VARCHAR(255) NOT NULL COMMENT '薪级中位(加密存储)',
  max_salary VARCHAR(255) NOT NULL COMMENT '薪级上限(加密存储)',
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_grade (tenant_id, grade_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR薪级';

CREATE TABLE hr_employee_comp (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  structure_id BIGINT DEFAULT NULL COMMENT '薪资结构ID',
  grade_id BIGINT DEFAULT NULL COMMENT '薪级ID',
  component_values JSON DEFAULT NULL COMMENT '各薪资项金额(JSON,加密存储)',
  total_salary VARCHAR(255) NOT NULL COMMENT '总薪资(加密存储)',
  effective_date DATE NOT NULL COMMENT '生效日期',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '薪资记录状态(ACTIVE/SUPERSEDED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_employee_comp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工薪资';

CREATE TABLE hr_comp_change (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  change_no VARCHAR(60) NOT NULL COMMENT '调薪单号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  change_type VARCHAR(30) NOT NULL COMMENT '调薪类型(PROMOTION/PERFORMANCE/ADJUSTMENT)',
  before_total VARCHAR(255) DEFAULT NULL COMMENT '调薪前总额(加密存储)',
  after_total VARCHAR(255) NOT NULL COMMENT '调薪后总额(加密存储)',
  change_amount VARCHAR(255) DEFAULT NULL COMMENT '调薪金额(加密存储)',
  effective_date DATE NOT NULL COMMENT '生效日期',
  reason VARCHAR(800) DEFAULT NULL COMMENT '调薪原因',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '调薪单状态(DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_change_no (tenant_id, change_no),
  KEY idx_hr_comp_change_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR调薪';

CREATE TABLE hr_benefit_scheme (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  scheme_code VARCHAR(50) NOT NULL COMMENT '福利方案编码',
  scheme_name VARCHAR(100) NOT NULL COMMENT '福利方案名称',
  city VARCHAR(80) DEFAULT NULL COMMENT '适用城市',
  benefit_config JSON NOT NULL COMMENT '福利项配置(JSON,含险种/比例/基数上下限)',
  effective_date DATE NOT NULL COMMENT '生效日期',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_benefit_scheme (tenant_id, scheme_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR社保公积金方案';

CREATE TABLE hr_employee_benefit (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  scheme_id BIGINT NOT NULL COMMENT '关联福利方案ID',
  base_amount VARCHAR(255) NOT NULL COMMENT '缴纳基数(加密存储)',
  effective_date DATE NOT NULL COMMENT '生效日期',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '员工福利状态(ACTIVE/SUSPENDED/TERMINATED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_employee_benefit (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工福利方案';

CREATE TABLE hr_tax_profile (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  tax_residence_city VARCHAR(80) DEFAULT NULL COMMENT '个税居民城市',
  threshold VARCHAR(255) NOT NULL DEFAULT '5000' COMMENT '起征点(加密存储)',
  tax_config JSON DEFAULT NULL COMMENT '个税专项配置(JSON)',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '档案状态(ACTIVE/CLOSED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_tax_profile_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR个税档案';

CREATE TABLE hr_tax_deduction (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  deduction_type VARCHAR(50) NOT NULL COMMENT '专项扣除类型(CHILDREN/EDU/HOUSING/MEDICAL/ELDER/...)',
  amount VARCHAR(255) NOT NULL COMMENT '扣除金额(加密存储)',
  start_date DATE NOT NULL COMMENT '扣除开始日期',
  end_date DATE DEFAULT NULL COMMENT '扣除结束日期',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '扣除状态(ACTIVE/EXPIRED)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_tax_deduction_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR专项扣除';

CREATE TABLE hr_performance_objective (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_no VARCHAR(60) NOT NULL COMMENT '绩效目标单号',
  cycle_name VARCHAR(100) NOT NULL COMMENT '考核周期名称',
  cycle_start_date DATE NOT NULL COMMENT '周期开始日期',
  cycle_end_date DATE NOT NULL COMMENT '周期结束日期',
  objective_name VARCHAR(200) NOT NULL COMMENT '目标名称',
  owner_employee_id BIGINT DEFAULT NULL COMMENT '目标负责人员工ID',
  metric_config JSON DEFAULT NULL COMMENT '指标配置(JSON)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '目标状态(DRAFT/APPROVING/IN_PROGRESS/CLOSED)',
  plan_process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '计划阶段工作流实例ID',
  result_process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '结果阶段工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_perf_objective_no (tenant_id, objective_no),
  KEY idx_hr_perf_objective_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效目标';

CREATE TABLE hr_performance_assignment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  parent_id BIGINT DEFAULT NULL COMMENT '父分解节点ID(支持目标级联)',
  assignee_type VARCHAR(30) NOT NULL COMMENT '承接对象类型(DEPT/EMPLOYEE)',
  assignee_id BIGINT NOT NULL COMMENT '承接对象ID',
  assignee_name VARCHAR(120) DEFAULT NULL COMMENT '承接对象名称(冗余快照)',
  target_value DECIMAL(18,4) DEFAULT 0 COMMENT '目标值',
  actual_value DECIMAL(18,4) DEFAULT 0 COMMENT '实际值',
  weight DECIMAL(8,2) DEFAULT 100 COMMENT '权重(%)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '分解节点状态(DRAFT/IN_PROGRESS/COMPLETED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_perf_assignment_obj (tenant_id, objective_id),
  KEY idx_hr_perf_assignment_assignee (tenant_id, assignee_type, assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效分解';

CREATE TABLE hr_performance_result (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  assignment_id BIGINT DEFAULT NULL COMMENT '关联分解节点ID',
  employee_id BIGINT DEFAULT NULL COMMENT '被评员工ID',
  score DECIMAL(8,2) DEFAULT NULL COMMENT '评分',
  grade VARCHAR(20) DEFAULT NULL COMMENT '绩效等级(S/A/B/C/D)',
  summary TEXT DEFAULT NULL COMMENT '评估总结',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '结果状态(DRAFT/CONFIRMED/PUBLISHED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_perf_result_obj (tenant_id, objective_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效结果';

CREATE TABLE hr_performance_salary_adjustment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  comp_change_id BIGINT DEFAULT NULL COMMENT '关联调薪单ID',
  adjustment_amount VARCHAR(255) NOT NULL COMMENT '调整金额(加密存储)',
  reason VARCHAR(800) DEFAULT NULL COMMENT '调整原因',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '联动调薪状态(DRAFT/SUBMITTED/APPLIED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_perf_salary_obj (tenant_id, objective_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效调薪联动';

CREATE TABLE hr_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  business_domain VARCHAR(60) NOT NULL COMMENT '业务域(EMPLOYEE/CONTRACT/SALARY/...)',
  business_id BIGINT DEFAULT NULL COMMENT '业务主键ID',
  operation_type VARCHAR(40) NOT NULL COMMENT '操作类型(CREATE/UPDATE/DELETE/APPROVE/...)',
  operator_id BIGINT DEFAULT NULL COMMENT '操作人用户ID',
  operator_name VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名(冗余快照)',
  before_data JSON DEFAULT NULL COMMENT '变更前数据(JSON)',
  after_data JSON DEFAULT NULL COMMENT '变更后数据(JSON)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (id),
  KEY idx_hr_audit_business (tenant_id, business_domain, business_id),
  KEY idx_hr_audit_time (tenant_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR审计日志';

-- =========================================================
-- ESS 员工自助服务 7 张新表
-- =========================================================

CREATE TABLE hr_salary_slip (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  period_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  gross_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应发合计',
  deduction_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '扣除合计',
  net_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '实发合计',
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '个税扣除',
  benefit_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '社保公积金合计',
  components JSON DEFAULT NULL COMMENT '工资项展开 [{code,name,amount,kind:EARNING/DEDUCTION}]',
  pay_date DATE DEFAULT NULL COMMENT '发薪日',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/CONFIRMED/PAID/RELEASED',
  employee_confirmed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '员工是否确认',
  confirmed_time DATETIME DEFAULT NULL COMMENT '确认时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_salary_slip (tenant_id, employee_id, period_month),
  KEY idx_hr_salary_slip_period (tenant_id, period_month, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS月度工资条';

CREATE TABLE hr_certificate_request (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  request_no VARCHAR(80) NOT NULL COMMENT '申请编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  certificate_type VARCHAR(40) NOT NULL COMMENT 'EMPLOYMENT/INCOME/SOCIAL_INSURANCE/RESIGNATION/CUSTOM',
  purpose VARCHAR(500) DEFAULT NULL COMMENT '开具用途',
  language VARCHAR(10) NOT NULL DEFAULT 'zh' COMMENT 'zh/en',
  recipient_org VARCHAR(200) DEFAULT NULL COMMENT '接收单位',
  copies INT NOT NULL DEFAULT 1 COMMENT '份数',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PENDING/APPROVED/REJECTED/ISSUED/CANCELLED',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  issued_at DATETIME DEFAULT NULL COMMENT '证明开具完成时间',
  pdf_file_id BIGINT DEFAULT NULL COMMENT 'sys_file 主键',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_cert_request_no (tenant_id, request_no),
  KEY idx_hr_cert_req_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS证明开具申请单';

CREATE TABLE hr_bank_card (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  bank_name VARCHAR(120) NOT NULL COMMENT '开户银行',
  bank_branch VARCHAR(200) DEFAULT NULL COMMENT '开户支行',
  account_no VARCHAR(500) NOT NULL COMMENT '加密存储',
  account_holder VARCHAR(100) NOT NULL COMMENT '账户持有人',
  is_primary TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否主账户(1=是,0=否)',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/INACTIVE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_bank_card_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS员工银行卡';

CREATE TABLE hr_family_member (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  member_name VARCHAR(100) NOT NULL COMMENT '家庭成员姓名',
  relationship VARCHAR(30) NOT NULL COMMENT 'SPOUSE/CHILD/PARENT/SIBLING/OTHER',
  id_card_no VARCHAR(500) DEFAULT NULL COMMENT '加密存储',
  birth_date DATE DEFAULT NULL COMMENT '出生日期',
  occupation VARCHAR(100) DEFAULT NULL COMMENT '职业',
  phone VARCHAR(30) DEFAULT NULL COMMENT '联系电话',
  is_dependent TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否被赡养人',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_family_member_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS员工家庭成员';

CREATE TABLE hr_benefit_payment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  scheme_id BIGINT NOT NULL COMMENT 'hr_benefit_scheme 主键',
  period_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  base_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '缴纳基数',
  company_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '公司缴纳合计',
  personal_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '个人缴纳合计',
  items JSON DEFAULT NULL COMMENT '分项 [{itemCode,companyAmount,personalAmount}]',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PAID/RECONCILED',
  pay_date DATE DEFAULT NULL COMMENT '发薪日',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_benefit_pay (tenant_id, employee_id, scheme_id, period_month),
  KEY idx_hr_benefit_pay_period (tenant_id, period_month, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS社保公积金月度明细';

CREATE TABLE hr_contract_signature (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  contract_id BIGINT NOT NULL COMMENT 'hr_employee_contract 主键',
  signer_type VARCHAR(20) NOT NULL COMMENT 'EMPLOYEE/COMPANY',
  signer_id BIGINT NOT NULL COMMENT '签署人ID(员工ID或公司印章ID)',
  sign_method VARCHAR(20) NOT NULL DEFAULT 'E_SIGN' COMMENT 'E_SIGN/MANUAL',
  sign_status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/SIGNED/REJECTED/EXPIRED',
  sign_time DATETIME DEFAULT NULL COMMENT '签署完成时间',
  ip_address VARCHAR(45) DEFAULT NULL COMMENT '签署来源IP',
  signature_file_id BIGINT DEFAULT NULL COMMENT '签署后文件ID(sys_file主键)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  expire_time DATETIME DEFAULT NULL COMMENT '签署链接过期时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_contract_sig (tenant_id, contract_id, sign_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS电子合同签署流水';

CREATE TABLE hr_self_service_message (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  category VARCHAR(30) NOT NULL COMMENT 'SLIP/CERT/CONTRACT/LEAVE/BENEFIT/TRAINING',
  title VARCHAR(200) NOT NULL COMMENT '消息标题',
  summary VARCHAR(500) DEFAULT NULL COMMENT '消息摘要',
  link_url VARCHAR(500) DEFAULT NULL COMMENT '跳转链接',
  related_id BIGINT DEFAULT NULL COMMENT '业务关联ID',
  read_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '已读标志(1=已读,0=未读)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_ess_msg_employee (tenant_id, employee_id, read_flag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='ESS自助门户消息';

-- =========================================================
-- 培训管理 11 张新表
-- =========================================================

CREATE TABLE hr_training_plan (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  plan_no VARCHAR(80) NOT NULL COMMENT '培训计划编号',
  plan_name VARCHAR(200) NOT NULL COMMENT '培训计划名称',
  plan_type VARCHAR(20) NOT NULL COMMENT 'ANNUAL/QUARTERLY/DEPT/ADHOC',
  year INT DEFAULT NULL COMMENT '所属年份',
  quarter INT DEFAULT NULL COMMENT '所属季度',
  dept_id BIGINT DEFAULT NULL COMMENT '所属部门ID',
  owner_id BIGINT DEFAULT NULL COMMENT '计划负责人用户ID',
  budget DECIMAL(18,2) DEFAULT 0 COMMENT '培训预算',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
  description VARCHAR(1000) DEFAULT NULL COMMENT '描述',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_plan_no (tenant_id, plan_no),
  KEY idx_hr_train_plan_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训计划';

CREATE TABLE hr_training_category (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  parent_id BIGINT DEFAULT 0 COMMENT '父分类ID(0=根)',
  name VARCHAR(120) NOT NULL COMMENT '分类名称',
  sort INT NOT NULL DEFAULT 0 COMMENT '排序号',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_train_cat_parent (tenant_id, parent_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训课程分类';

CREATE TABLE hr_training_instructor (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  instructor_name VARCHAR(100) NOT NULL COMMENT '讲师姓名',
  instructor_type VARCHAR(20) NOT NULL DEFAULT 'INTERNAL' COMMENT 'INTERNAL/EXTERNAL',
  employee_id BIGINT DEFAULT NULL COMMENT '内部讲师对应员工ID',
  expertise VARCHAR(500) DEFAULT NULL COMMENT '擅长领域',
  bio TEXT DEFAULT NULL COMMENT '讲师简介',
  contact VARCHAR(200) DEFAULT NULL COMMENT '联系方式',
  hourly_rate DECIMAL(18,2) DEFAULT 0 COMMENT '课时费',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_train_instructor_emp (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训讲师';

CREATE TABLE hr_training_course (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  course_code VARCHAR(80) NOT NULL COMMENT '课程编码',
  course_name VARCHAR(200) NOT NULL COMMENT '课程名称',
  category_id BIGINT DEFAULT NULL COMMENT '所属分类ID',
  instructor_id BIGINT DEFAULT NULL COMMENT '默认讲师ID',
  mode VARCHAR(20) NOT NULL DEFAULT 'OFFLINE' COMMENT 'ONLINE/OFFLINE/BLENDED',
  duration_hours DECIMAL(8,2) DEFAULT 0 COMMENT '课时(小时)',
  credit_hours DECIMAL(8,2) DEFAULT 0 COMMENT '学时',
  cover_url VARCHAR(500) DEFAULT NULL COMMENT '封面图URL',
  materials JSON DEFAULT NULL COMMENT '课件 file_id 列表',
  description TEXT DEFAULT NULL COMMENT '课程描述',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/OFFLINE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_course (tenant_id, course_code),
  KEY idx_hr_train_course_cat (tenant_id, category_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训课程库';

CREATE TABLE hr_training_session (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  plan_id BIGINT DEFAULT NULL COMMENT '所属培训计划ID',
  course_id BIGINT NOT NULL COMMENT '所属课程ID',
  session_no VARCHAR(80) NOT NULL COMMENT '培训班次编号',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  start_time DATETIME NOT NULL COMMENT '开班开始时间',
  end_time DATETIME NOT NULL COMMENT '开班结束时间',
  capacity INT NOT NULL DEFAULT 0 COMMENT '报名人数上限',
  enrolled_count INT NOT NULL DEFAULT 0 COMMENT '已报名人数',
  instructor_id BIGINT DEFAULT NULL COMMENT '本班次讲师ID',
  status VARCHAR(30) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/REGISTERING/ONGOING/COMPLETED/CANCELLED',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_session_no (tenant_id, session_no),
  KEY idx_hr_train_session_course (tenant_id, course_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训班次';

CREATE TABLE hr_training_enrollment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  session_id BIGINT NOT NULL COMMENT '培训班次ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  enroll_type VARCHAR(20) NOT NULL DEFAULT 'SELF' COMMENT 'SELF/ASSIGNED',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVED/REJECTED/WITHDRAWN',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  attended TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否签到(1=是,0=否)',
  check_in_time DATETIME DEFAULT NULL COMMENT '签到时间',
  completion_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/PASSED/FAILED',
  score DECIMAL(8,2) DEFAULT NULL COMMENT '考核成绩',
  comment VARCHAR(500) DEFAULT NULL COMMENT '学员评语',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_enroll (tenant_id, session_id, employee_id),
  KEY idx_hr_training_enrollment_completion (tenant_id, employee_id, completion_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训报名记录';

CREATE TABLE hr_exam_question_bank (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  category_id BIGINT DEFAULT NULL COMMENT '题目分类ID',
  question_type VARCHAR(20) NOT NULL COMMENT 'SINGLE/MULTI/JUDGE/FILL/ESSAY',
  content TEXT NOT NULL COMMENT '题目题干',
  options JSON DEFAULT NULL COMMENT '[{key,text}]',
  answer JSON DEFAULT NULL COMMENT '正确答案 [key] / 文本',
  score DECIMAL(6,2) NOT NULL DEFAULT 1 COMMENT '分数',
  difficulty INT NOT NULL DEFAULT 1 COMMENT '1-5',
  analysis TEXT DEFAULT NULL COMMENT '解析',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态(ACTIVE/ARCHIVED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_exam_qbank_cat (tenant_id, category_id, question_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考试题库';

CREATE TABLE hr_exam_paper (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  course_id BIGINT DEFAULT NULL COMMENT '关联课程ID',
  paper_name VARCHAR(200) NOT NULL COMMENT '试卷名称',
  total_score DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '总分',
  pass_score DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '及格分',
  duration_minutes INT NOT NULL DEFAULT 0 COMMENT '考试时长(分钟)',
  question_count INT NOT NULL DEFAULT 0 COMMENT '题量',
  question_ids JSON DEFAULT NULL COMMENT '题目ID列表(手动组卷时)',
  generate_mode VARCHAR(20) NOT NULL DEFAULT 'MANUAL' COMMENT 'MANUAL/RANDOM',
  config JSON DEFAULT NULL COMMENT '随机组卷配置 {categoryId,type,count,scorePer}',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/CLOSED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_exam_paper_course (tenant_id, course_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考试试卷';

CREATE TABLE hr_exam_attempt (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  paper_id BIGINT NOT NULL COMMENT '关联试卷ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  session_id BIGINT DEFAULT NULL COMMENT '关联培训班次ID',
  start_time DATETIME DEFAULT NULL COMMENT '开始作答时间',
  submit_time DATETIME DEFAULT NULL COMMENT '提交时间',
  score DECIMAL(8,2) DEFAULT NULL COMMENT '得分',
  pass_flag TINYINT(1) DEFAULT NULL COMMENT '是否通过(1=是,0=否)',
  answers JSON DEFAULT NULL COMMENT '[{questionId,answer,score}]',
  status VARCHAR(20) NOT NULL DEFAULT 'IN_PROGRESS' COMMENT 'IN_PROGRESS/SUBMITTED/GRADED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_exam_attempt (tenant_id, employee_id, paper_id),
  KEY idx_hr_exam_attempt_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='考试作答记录';

CREATE TABLE hr_training_certificate_template (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  template_code VARCHAR(80) NOT NULL COMMENT '证书模板编码',
  template_name VARCHAR(200) NOT NULL COMMENT '证书模板名称',
  background_url VARCHAR(500) DEFAULT NULL COMMENT '背景图URL',
  fields JSON DEFAULT NULL COMMENT '可填充字段 [{key,label,placement:{x,y}}]',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_cert_tpl (tenant_id, template_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训证书模板';

CREATE TABLE hr_training_certificate (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  cert_no VARCHAR(80) NOT NULL COMMENT '证书编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  course_id BIGINT NOT NULL COMMENT '关联课程ID',
  session_id BIGINT DEFAULT NULL COMMENT '关联培训班次ID',
  template_id BIGINT DEFAULT NULL COMMENT '使用的证书模板ID',
  issue_date DATE NOT NULL COMMENT '颁发日期',
  expire_date DATE DEFAULT NULL COMMENT '过期日期',
  pdf_file_id BIGINT DEFAULT NULL COMMENT '生成PDF文件ID',
  status VARCHAR(20) NOT NULL DEFAULT 'VALID' COMMENT 'VALID/REVOKED',
  revoked_reason VARCHAR(500) DEFAULT NULL COMMENT '吊销原因',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_cert_no (tenant_id, cert_no),
  KEY idx_hr_train_cert_emp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='培训证书';

-- =========================================================
-- 人才盘点 / 继任 / 人才池 / 培养行动 (P0 人才盘点模块)
-- =========================================================

CREATE TABLE hr_talent_review (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  review_no VARCHAR(80) NOT NULL COMMENT '盘点活动编号',
  review_name VARCHAR(200) NOT NULL COMMENT '盘点活动名称',
  review_year INT NOT NULL COMMENT '盘点年份',
  cycle_type VARCHAR(20) NOT NULL DEFAULT 'ANNUAL' COMMENT 'ANNUAL/H1/H2/QUARTER',
  scope_type VARCHAR(20) NOT NULL DEFAULT 'GLOBAL' COMMENT 'GLOBAL/DEPT/POSITION',
  scope_value VARCHAR(500) DEFAULT NULL COMMENT 'DEPT: dept_id 列表; POSITION: position_id 列表; 逗号分隔',
  performance_source_objective_id BIGINT DEFAULT NULL COMMENT '业绩快照来源的考核周期 hr_performance_objective.id',
  owner_id BIGINT DEFAULT NULL COMMENT '活动负责人用户ID',
  deadline DATE DEFAULT NULL COMMENT '盘点截止日期',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/IN_PROGRESS/CALIBRATING/PUBLISHED/ARCHIVED',
  process_instance_id VARCHAR(64) DEFAULT NULL COMMENT '关联工作流实例ID',
  publish_time DATETIME DEFAULT NULL COMMENT '发布时间',
  description VARCHAR(1000) DEFAULT NULL COMMENT '描述',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_review_no (tenant_id, review_no),
  KEY idx_hr_talent_review_status (tenant_id, status, review_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才盘点活动';

CREATE TABLE hr_talent_review_participant (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  review_id BIGINT NOT NULL COMMENT '关联盘点活动ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  performance_score DECIMAL(8,2) DEFAULT NULL COMMENT '业绩快照分',
  performance_band VARCHAR(10) DEFAULT NULL COMMENT 'HIGH/MID/LOW',
  potential_score INT DEFAULT NULL COMMENT '潜力分 1-5',
  potential_band VARCHAR(10) DEFAULT NULL COMMENT 'HIGH/MID/LOW',
  grid_cell INT DEFAULT NULL COMMENT '九宫格 1-9',
  calibration_notes VARCHAR(2000) DEFAULT NULL COMMENT '校准评语',
  develop_action_summary VARCHAR(1000) DEFAULT NULL COMMENT '培养行动摘要',
  decided_by BIGINT DEFAULT NULL COMMENT '最终定格人用户ID',
  decided_at DATETIME DEFAULT NULL COMMENT '定格时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_participant (tenant_id, review_id, employee_id),
  KEY idx_hr_talent_participant_emp (tenant_id, employee_id, review_id),
  KEY idx_hr_talent_participant_cell (tenant_id, review_id, grid_cell)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才盘点参与人(九宫格落格)';

CREATE TABLE hr_talent_calibration_session (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  review_id BIGINT NOT NULL COMMENT '关联盘点活动ID',
  session_no VARCHAR(80) NOT NULL COMMENT '校准会议编号',
  session_name VARCHAR(200) DEFAULT NULL COMMENT '校准会议名称',
  scheduled_at DATETIME DEFAULT NULL COMMENT '会议计划时间',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  facilitator_id BIGINT DEFAULT NULL COMMENT '主持人用户ID',
  participants JSON DEFAULT NULL COMMENT '参会 user_id 列表',
  agenda TEXT DEFAULT NULL COMMENT '会议议程',
  minutes TEXT DEFAULT NULL COMMENT '会议纪要',
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/ONGOING/COMPLETED/CANCELLED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_calib_no (tenant_id, session_no),
  KEY idx_hr_talent_calib_review (tenant_id, review_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才盘点校准会议';

CREATE TABLE hr_talent_succession_plan (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  plan_no VARCHAR(80) NOT NULL COMMENT '继任计划编号',
  plan_name VARCHAR(200) NOT NULL COMMENT '继任计划名称',
  position_id BIGINT NOT NULL COMMENT '关联 hr_position',
  incumbent_employee_id BIGINT DEFAULT NULL COMMENT '现任',
  key_role_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否关键岗位',
  risk_level VARCHAR(20) NOT NULL DEFAULT 'MID' COMMENT 'LOW/MID/HIGH/CRITICAL',
  retention_risk VARCHAR(500) DEFAULT NULL COMMENT '保留风险说明',
  description VARCHAR(2000) DEFAULT NULL COMMENT '描述',
  owner_id BIGINT DEFAULT NULL COMMENT '负责人ID',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/ARCHIVED',
  process_instance_id VARCHAR(64) DEFAULT NULL COMMENT '关联工作流实例ID',
  publish_time DATETIME DEFAULT NULL COMMENT '发布时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_succession_no (tenant_id, plan_no),
  KEY idx_hr_talent_succession_pos (tenant_id, position_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='继任计划';

CREATE TABLE hr_talent_successor (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  plan_id BIGINT NOT NULL COMMENT '关联继任计划ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  readiness VARCHAR(20) NOT NULL DEFAULT 'IN_1_2_YEARS' COMMENT 'READY_NOW/IN_1_2_YEARS/IN_3_5_YEARS',
  rank_order INT NOT NULL DEFAULT 0 COMMENT '继任顺位',
  talent_review_participant_id BIGINT DEFAULT NULL COMMENT '关联人才盘点参与人ID',
  development_gap VARCHAR(2000) DEFAULT NULL COMMENT '能力差距说明',
  retention_action VARCHAR(2000) DEFAULT NULL COMMENT '保留行动方案',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/REMOVED',
  notified_at DATETIME DEFAULT NULL COMMENT '通知到本人的时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_successor (tenant_id, plan_id, employee_id),
  KEY idx_hr_talent_successor_emp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='继任人提名';

CREATE TABLE hr_talent_pool (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  pool_no VARCHAR(80) NOT NULL COMMENT '人才池编号',
  pool_name VARCHAR(200) NOT NULL COMMENT '人才池名称',
  pool_type VARCHAR(30) NOT NULL DEFAULT 'CORE' COMMENT 'CORE/HIPO/SUCCESSOR/CRITICAL_SKILL/EXTERNAL_BENCH',
  description VARCHAR(1000) DEFAULT NULL COMMENT '描述',
  owner_id BIGINT DEFAULT NULL COMMENT '负责人ID',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE/ARCHIVED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_pool_no (tenant_id, pool_no),
  KEY idx_hr_talent_pool_type (tenant_id, pool_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才池';

CREATE TABLE hr_talent_pool_member (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  pool_id BIGINT NOT NULL COMMENT '人才池ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  joined_at DATETIME DEFAULT NULL COMMENT '入池时间',
  joined_review_id BIGINT DEFAULT NULL COMMENT '来源盘点',
  exit_at DATETIME DEFAULT NULL COMMENT '出池时间',
  exit_reason VARCHAR(30) DEFAULT NULL COMMENT 'PROMOTED/RESIGNED/DOWNGRADE/MANUAL',
  status VARCHAR(10) NOT NULL DEFAULT 'IN' COMMENT 'IN/OUT',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_talent_pool_member (tenant_id, pool_id, employee_id, status),
  KEY idx_hr_talent_pool_member_emp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才池成员历史';

CREATE TABLE hr_talent_development_action (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  source_review_id BIGINT DEFAULT NULL COMMENT '来源盘点活动ID',
  source_pool_id BIGINT DEFAULT NULL COMMENT '来源人才池ID',
  action_type VARCHAR(30) NOT NULL DEFAULT 'TRAINING' COMMENT 'TRAINING/MENTOR/JOB_ROTATION/STRETCH_PROJECT/EXTERNAL_COURSE',
  action_name VARCHAR(200) NOT NULL COMMENT '行动名称',
  mentor_id BIGINT DEFAULT NULL COMMENT '导师用户ID',
  owner_id BIGINT DEFAULT NULL COMMENT '行动负责人用户ID',
  start_date DATE DEFAULT NULL COMMENT '开始日期',
  end_date DATE DEFAULT NULL COMMENT '结束日期',
  training_session_id BIGINT DEFAULT NULL COMMENT '可复用 hr_training_session',
  status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/ONGOING/COMPLETED/CANCELLED',
  evaluation_score DECIMAL(8,2) DEFAULT NULL COMMENT '评估得分',
  evaluation_notes VARCHAR(2000) DEFAULT NULL COMMENT '评估备注',
  description VARCHAR(2000) DEFAULT NULL COMMENT '描述',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_talent_dev_emp (tenant_id, employee_id, status),
  KEY idx_hr_talent_dev_source (tenant_id, source_review_id, action_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='人才培养行动';

-- ===== 福利申领 / 积分商城 / 工伤管理 / 劳动争议 新增表的 DROP（按反向依赖顺序） =====
DROP TABLE IF EXISTS hr_dispute_evidence;
DROP TABLE IF EXISTS hr_dispute_arbitration;
DROP TABLE IF EXISTS hr_dispute_mediation;
DROP TABLE IF EXISTS hr_labor_dispute;
DROP TABLE IF EXISTS hr_work_injury_rehabilitation;
DROP TABLE IF EXISTS hr_work_injury_compensation;
DROP TABLE IF EXISTS hr_work_injury_treatment;
DROP TABLE IF EXISTS hr_work_injury_investigation;
DROP TABLE IF EXISTS hr_work_injury;
DROP TABLE IF EXISTS hr_mall_order_item;
DROP TABLE IF EXISTS hr_mall_order;
DROP TABLE IF EXISTS hr_mall_item;
DROP TABLE IF EXISTS hr_point_transaction;
DROP TABLE IF EXISTS hr_point_account;
DROP TABLE IF EXISTS hr_benefit_request;

-- ===== 福利申领（HR 福利领取审批单） =====
CREATE TABLE hr_benefit_request (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  request_no VARCHAR(80) NOT NULL COMMENT '申领单号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  scheme_id BIGINT DEFAULT NULL COMMENT '关联 hr_benefit_scheme.id（可空，POINT 类不需要）',
  request_type VARCHAR(30) NOT NULL DEFAULT 'BENEFIT_CLAIM' COMMENT 'BENEFIT_CLAIM/POINT_TOPUP/POINT_ADJUST',
  amount DECIMAL(12,2) DEFAULT NULL COMMENT '申领金额',
  point_amount INT DEFAULT 0 COMMENT '申领/调整积分数',
  reason VARCHAR(1000) DEFAULT NULL COMMENT '申请原因',
  attachments JSON DEFAULT NULL COMMENT '附件 ID 列表',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/SUBMITTED/APPROVING/APPROVED/REJECTED/PAID/CANCELLED',
  process_instance_id VARCHAR(80) DEFAULT NULL COMMENT '关联工作流实例ID',
  approver_id BIGINT DEFAULT NULL COMMENT '审批人用户ID',
  paid_at DATETIME DEFAULT NULL COMMENT '支付完成时间',
  remark VARCHAR(1000) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_benefit_request_no (tenant_id, request_no),
  KEY idx_hr_benefit_request_emp (tenant_id, employee_id, status),
  KEY idx_hr_benefit_request_status (tenant_id, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 福利申领审批单';

-- ===== 积分账户 =====
CREATE TABLE hr_point_account (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  available_points INT NOT NULL DEFAULT 0 COMMENT '可用积分',
  total_earned INT NOT NULL DEFAULT 0 COMMENT '累计获得',
  total_spent INT NOT NULL DEFAULT 0 COMMENT '累计消费',
  frozen_points INT NOT NULL DEFAULT 0 COMMENT '冻结中（下单未确认）',
  last_active_at DATETIME DEFAULT NULL COMMENT '最近活跃时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_point_account_emp (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 员工积分账户';

-- ===== 积分流水 =====
CREATE TABLE hr_point_transaction (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  account_id BIGINT NOT NULL COMMENT '关联积分账户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  txn_no VARCHAR(80) NOT NULL COMMENT '流水编号',
  direction VARCHAR(15) NOT NULL COMMENT 'IN/OUT/FROZEN/UNFROZEN',
  source_type VARCHAR(20) NOT NULL COMMENT 'BENEFIT/MALL_ORDER/MANUAL_ADJUST/EXPIRE',
  source_id BIGINT DEFAULT NULL COMMENT '业务来源主键ID',
  points INT NOT NULL COMMENT '本次变动积分(正=增,负=减)',
  balance_after INT NOT NULL COMMENT '变动后余额',
  effective_date DATE DEFAULT NULL COMMENT '生效日期',
  expire_date DATE DEFAULT NULL COMMENT '过期日期',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_point_txn_no (tenant_id, txn_no),
  KEY idx_hr_point_txn_account (tenant_id, account_id, effective_date),
  KEY idx_hr_point_txn_emp (tenant_id, employee_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 积分流水';

-- ===== 积分商城商品 =====
CREATE TABLE hr_mall_item (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  item_no VARCHAR(80) NOT NULL COMMENT '商品编号',
  item_name VARCHAR(200) NOT NULL COMMENT '商品名称',
  category VARCHAR(50) DEFAULT NULL COMMENT 'GIFT/COUPON/WELFARE/HEALTH',
  point_price INT NOT NULL DEFAULT 0 COMMENT '积分价格',
  stock INT NOT NULL DEFAULT 0 COMMENT '库存',
  sales_count INT NOT NULL DEFAULT 0 COMMENT '已售数量',
  cover_image VARCHAR(500) DEFAULT NULL COMMENT '封面图URL',
  images JSON DEFAULT NULL COMMENT '详情图URL列表(JSON)',
  detail_html LONGTEXT COMMENT '商品详情HTML',
  status VARCHAR(20) NOT NULL DEFAULT 'OFF_SHELF' COMMENT 'ON_SHELF/OFF_SHELF',
  approval_threshold INT NOT NULL DEFAULT 5000 COMMENT '订单审批阈值（高价值订单触发工作流）',
  sort_order INT NOT NULL DEFAULT 0 COMMENT '排序号',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_mall_item_no (tenant_id, item_no),
  KEY idx_hr_mall_item_status (tenant_id, status, sort_order)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 积分商城商品';

-- ===== 积分商城订单 =====
CREATE TABLE hr_mall_order (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  order_no VARCHAR(80) NOT NULL COMMENT '订单编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  total_points INT NOT NULL DEFAULT 0 COMMENT '订单总积分',
  item_count INT NOT NULL DEFAULT 0 COMMENT '订单商品总件数',
  receiver_name VARCHAR(120) DEFAULT NULL COMMENT '收货人姓名',
  receiver_phone VARCHAR(500) DEFAULT NULL COMMENT '加密存储',
  receiver_address VARCHAR(1000) DEFAULT NULL COMMENT '加密存储',
  express_company VARCHAR(80) DEFAULT NULL COMMENT '快递公司',
  express_no VARCHAR(120) DEFAULT NULL COMMENT '快递单号',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING/APPROVING/APPROVED/SHIPPED/COMPLETED/CANCELLED',
  process_instance_id VARCHAR(80) DEFAULT NULL COMMENT '关联工作流实例ID',
  cancel_reason VARCHAR(500) DEFAULT NULL COMMENT '取消原因',
  shipped_at DATETIME DEFAULT NULL COMMENT '发货时间',
  completed_at DATETIME DEFAULT NULL COMMENT '完成时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_mall_order_no (tenant_id, order_no),
  KEY idx_hr_mall_order_emp (tenant_id, employee_id, status),
  KEY idx_hr_mall_order_status (tenant_id, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 积分商城订单';

-- ===== 积分商城订单明细 =====
CREATE TABLE hr_mall_order_item (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  order_id BIGINT NOT NULL COMMENT '关联订单ID',
  item_id BIGINT NOT NULL COMMENT '商品ID',
  item_no VARCHAR(80) DEFAULT NULL COMMENT '商品编号(冗余快照)',
  item_name VARCHAR(200) NOT NULL COMMENT '冗余快照',
  cover_image VARCHAR(500) DEFAULT NULL COMMENT '封面图(冗余快照)',
  point_price INT NOT NULL DEFAULT 0 COMMENT '下单时积分单价(冗余快照)',
  quantity INT NOT NULL DEFAULT 1 COMMENT '购买数量',
  subtotal INT NOT NULL DEFAULT 0 COMMENT '小计积分',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_mall_order_item (tenant_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 积分商城订单明细';

-- ===== 工伤申报主表 =====
CREATE TABLE hr_work_injury (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  injury_no VARCHAR(80) NOT NULL COMMENT '工伤事件编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  dept_id BIGINT DEFAULT NULL COMMENT '事发部门ID',
  occurred_at DATETIME NOT NULL COMMENT '事发时间',
  location VARCHAR(500) DEFAULT NULL COMMENT '事发地点',
  event_description VARCHAR(2000) DEFAULT NULL COMMENT '事件经过',
  injury_part VARCHAR(200) DEFAULT NULL COMMENT '受伤部位',
  injury_level VARCHAR(20) DEFAULT 'MINOR' COMMENT 'MINOR/MODERATE/SEVERE/DEATH',
  status VARCHAR(30) NOT NULL DEFAULT 'REPORTED' COMMENT 'REPORTED/INVESTIGATING/DETERMINING/DETERMINED/COMPENSATING/REHABILITATING/CLOSED',
  process_instance_id VARCHAR(80) DEFAULT NULL COMMENT '关联工作流实例ID',
  determined_at DATETIME DEFAULT NULL COMMENT '认定时间',
  determined_grade VARCHAR(10) DEFAULT NULL COMMENT '伤残等级 1-10 级（仅在 DETERMINED 之后有效）',
  close_reason VARCHAR(500) DEFAULT NULL COMMENT '结案原因',
  closed_at DATETIME DEFAULT NULL COMMENT '结案时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_work_injury_no (tenant_id, injury_no),
  KEY idx_hr_work_injury_emp (tenant_id, employee_id, status),
  KEY idx_hr_work_injury_status (tenant_id, status, occurred_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 工伤申报主表';

-- ===== 工伤调查 =====
CREATE TABLE hr_work_injury_investigation (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  injury_id BIGINT NOT NULL COMMENT '关联工伤事件ID',
  employee_id BIGINT NOT NULL COMMENT '冗余便于数据权限',
  investigator_id BIGINT DEFAULT NULL COMMENT '调查人用户ID',
  investigation_date DATE DEFAULT NULL COMMENT '调查日期',
  scene_photos JSON DEFAULT NULL COMMENT '附件 ID 列表',
  witness_statements LONGTEXT COMMENT '证人陈述',
  conclusion TEXT COMMENT '调查结论',
  responsibility_type VARCHAR(20) DEFAULT NULL COMMENT 'WORK_RELATED/COMMUTE/THIRD_PARTY',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_work_injury_inv (tenant_id, injury_id, investigation_date),
  KEY idx_hr_work_injury_inv_emp (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 工伤调查记录';

-- ===== 工伤医疗记录 =====
CREATE TABLE hr_work_injury_treatment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  injury_id BIGINT NOT NULL COMMENT '关联工伤事件ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  hospital_name VARCHAR(200) DEFAULT NULL COMMENT '就诊医院',
  admit_date DATE DEFAULT NULL COMMENT '入院日期',
  discharge_date DATE DEFAULT NULL COMMENT '出院日期',
  total_cost DECIMAL(12,2) DEFAULT 0 COMMENT '医疗总费用',
  insurance_covered DECIMAL(12,2) DEFAULT 0 COMMENT '医保/工伤保险覆盖金额',
  self_paid DECIMAL(12,2) DEFAULT 0 COMMENT '自付金额',
  diagnosis VARCHAR(2000) DEFAULT NULL COMMENT '加密存储',
  treatment_summary VARCHAR(2000) DEFAULT NULL COMMENT '治疗经过',
  receipts JSON DEFAULT NULL COMMENT '附件 ID 列表',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_work_injury_treat (tenant_id, injury_id, admit_date),
  KEY idx_hr_work_injury_treat_emp (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 工伤医疗记录';

-- ===== 工伤赔偿记录 =====
CREATE TABLE hr_work_injury_compensation (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  injury_id BIGINT NOT NULL COMMENT '关联工伤事件ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  item_type VARCHAR(30) NOT NULL COMMENT 'MEDICAL/DISABILITY_ALLOWANCE/LUMP_SUM/FUNERAL/DEPENDENT_SUPPORT',
  amount DECIMAL(12,2) NOT NULL DEFAULT 0 COMMENT '赔偿金额',
  payment_status VARCHAR(20) NOT NULL DEFAULT 'PLANNED' COMMENT 'PLANNED/PAID/REJECTED',
  paid_at DATETIME DEFAULT NULL COMMENT '支付完成时间',
  bank_account VARCHAR(500) DEFAULT NULL COMMENT '加密存储',
  remark VARCHAR(1000) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_work_injury_comp (tenant_id, injury_id, item_type),
  KEY idx_hr_work_injury_comp_emp (tenant_id, employee_id, payment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 工伤赔偿记录';

-- ===== 工伤康复记录 =====
CREATE TABLE hr_work_injury_rehabilitation (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  injury_id BIGINT NOT NULL COMMENT '关联工伤事件ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  return_date DATE DEFAULT NULL COMMENT '复工日期',
  position_adjustment VARCHAR(20) DEFAULT 'SAME' COMMENT 'SAME/RELIGHTED/CHANGED',
  new_position_id BIGINT DEFAULT NULL COMMENT '调整后职位ID',
  ability_assessment VARCHAR(2000) DEFAULT NULL COMMENT '工作能力评估结论',
  follow_up_at DATETIME DEFAULT NULL COMMENT '跟踪随访时间',
  status VARCHAR(20) NOT NULL DEFAULT 'IN_REHAB' COMMENT 'IN_REHAB/RETURNED/UNABLE_RETURN',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_work_injury_rehab (tenant_id, injury_id, status),
  KEY idx_hr_work_injury_rehab_emp (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 工伤康复记录';

-- ===== 劳动争议主表 =====
CREATE TABLE hr_labor_dispute (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  dispute_no VARCHAR(80) NOT NULL COMMENT '劳动争议案件编号',
  applicant_employee_id BIGINT DEFAULT NULL COMMENT '在职员工申请人（可空）',
  applicant_external_name VARCHAR(120) DEFAULT NULL COMMENT '离职/外部申请人姓名',
  applicant_external_phone VARCHAR(500) DEFAULT NULL COMMENT '离职/外部申请人电话（加密存储）',
  dispute_type VARCHAR(30) NOT NULL DEFAULT 'OTHER' COMMENT 'SALARY/CONTRACT/DISMISSAL/SOCIAL_INSURANCE/OTHER',
  claim_amount DECIMAL(12,2) DEFAULT NULL COMMENT '主张金额',
  claim_description VARCHAR(2000) DEFAULT NULL COMMENT '主张事项描述',
  status VARCHAR(20) NOT NULL DEFAULT 'REGISTERED' COMMENT 'REGISTERED/MEDIATING/MEDIATED/ARBITRATING/AWARDED/EXECUTED/CLOSED',
  process_instance_id VARCHAR(80) DEFAULT NULL COMMENT '关联工作流实例ID',
  opened_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '立案时间',
  closed_at DATETIME DEFAULT NULL COMMENT '结案时间',
  close_reason VARCHAR(500) DEFAULT NULL COMMENT '结案原因',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_labor_dispute_no (tenant_id, dispute_no),
  KEY idx_hr_labor_dispute_emp (tenant_id, applicant_employee_id, status),
  KEY idx_hr_labor_dispute_status (tenant_id, status, opened_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 劳动争议主表';

-- ===== 争议调解记录 =====
CREATE TABLE hr_dispute_mediation (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  dispute_id BIGINT NOT NULL COMMENT '关联争议案件ID',
  mediator_id BIGINT DEFAULT NULL COMMENT '调解员用户ID',
  mediation_date DATE DEFAULT NULL COMMENT '调解日期',
  location VARCHAR(500) DEFAULT NULL COMMENT '调解地点',
  process_summary LONGTEXT COMMENT '调解过程纪要',
  result VARCHAR(20) DEFAULT NULL COMMENT 'SUCCESS/PARTIAL/FAILED',
  agreement_url VARCHAR(500) DEFAULT NULL COMMENT '调解协议URL',
  signed_at DATETIME DEFAULT NULL COMMENT '协议签署时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_dispute_mediation (tenant_id, dispute_id, mediation_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 劳动争议调解记录';

-- ===== 争议仲裁记录 =====
CREATE TABLE hr_dispute_arbitration (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  dispute_id BIGINT NOT NULL COMMENT '关联争议案件ID',
  arbitration_committee VARCHAR(200) DEFAULT NULL COMMENT '受理仲裁委员会',
  case_no VARCHAR(80) DEFAULT NULL COMMENT '仲裁案号',
  accepted_at DATETIME DEFAULT NULL COMMENT '受理时间',
  hearing_dates JSON DEFAULT NULL COMMENT '开庭日期列表(JSON)',
  award_no VARCHAR(80) DEFAULT NULL COMMENT '裁决书编号',
  award_result VARCHAR(20) DEFAULT NULL COMMENT 'SUPPORTED/PARTIAL/REJECTED',
  award_amount DECIMAL(12,2) DEFAULT NULL COMMENT '裁决金额',
  effective_date DATE DEFAULT NULL COMMENT '裁决生效日期',
  award_doc_url VARCHAR(500) DEFAULT NULL COMMENT '裁决书URL',
  remark VARCHAR(1000) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_dispute_arb (tenant_id, dispute_id, accepted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 劳动争议仲裁记录';

-- ===== 争议证据材料 =====
CREATE TABLE hr_dispute_evidence (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  dispute_id BIGINT NOT NULL COMMENT '关联争议案件ID',
  evidence_type VARCHAR(30) NOT NULL DEFAULT 'OTHER' COMMENT 'CONTRACT/PAYSLIP/MEDICAL/WITNESS/OTHER',
  file_id BIGINT DEFAULT NULL COMMENT '附件文件ID',
  file_name VARCHAR(200) DEFAULT NULL COMMENT '附件文件名',
  file_url VARCHAR(500) DEFAULT NULL COMMENT '附件URL',
  uploaded_by BIGINT DEFAULT NULL COMMENT '上传人用户ID',
  uploaded_at DATETIME DEFAULT NULL COMMENT '上传时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_dispute_evidence (tenant_id, dispute_id, evidence_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR 劳动争议证据材料';

-- =========================================================
-- HR-P0-1 绩效 360 度评估：评估关系 + 多源打分
-- =========================================================
CREATE TABLE hr_perf_evaluator (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  assignment_id BIGINT DEFAULT NULL COMMENT '关联分解节点ID',
  result_id BIGINT DEFAULT NULL COMMENT '关联绩效结果ID(评分聚合后回填)',
  evaluatee_id BIGINT NOT NULL COMMENT '被评员工ID',
  evaluatee_name VARCHAR(120) DEFAULT NULL COMMENT '被评员工姓名(冗余快照)',
  evaluator_id BIGINT NOT NULL COMMENT '评估人员工ID',
  evaluator_name VARCHAR(120) DEFAULT NULL COMMENT '评估人姓名(冗余快照)',
  evaluator_source VARCHAR(20) NOT NULL COMMENT '评估源(SELF/MANAGER/PEER/SUBORDINATE/CUSTOMER)',
  weight DECIMAL(5,2) NOT NULL DEFAULT 20.00 COMMENT '该评估源权重(%)',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '评估状态(PENDING/SUBMITTED/CANCELLED)',
  invite_time DATETIME DEFAULT NULL COMMENT '邀请发起时间',
  remind_count INT NOT NULL DEFAULT 0 COMMENT '催办次数',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_perf_evaluator_relation (tenant_id, objective_id, evaluatee_id, evaluator_id, evaluator_source),
  KEY idx_hr_perf_evaluator_evaluatee (tenant_id, evaluatee_id, status),
  KEY idx_hr_perf_evaluator_evaluator (tenant_id, evaluator_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效360评估关系';

CREATE TABLE hr_perf_evaluator_response (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  evaluator_id BIGINT NOT NULL COMMENT '关联 hr_perf_evaluator.id',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID(冗余便于联表)',
  evaluatee_id BIGINT NOT NULL COMMENT '被评员工ID(冗余便于联表)',
  evaluator_source VARCHAR(20) NOT NULL COMMENT '评估源(冗余便于聚合)',
  score DECIMAL(8,2) NOT NULL COMMENT '总评分',
  dimension_scores JSON DEFAULT NULL COMMENT '各维度细分打分 [{dimension,score,weight}]',
  comment_text TEXT DEFAULT NULL COMMENT '文字评价',
  submit_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_perf_response_evaluator (tenant_id, evaluator_id),
  KEY idx_hr_perf_response_obj (tenant_id, objective_id, evaluatee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效360评估打分';

-- =========================================================
-- HR-P0-2 绩效强制分布规则
-- =========================================================
CREATE TABLE hr_perf_distribution_rule (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT DEFAULT NULL COMMENT '关联绩效目标ID(为空表示租户全局默认规则)',
  rule_name VARCHAR(120) NOT NULL COMMENT '规则名称',
  distribution JSON NOT NULL COMMENT '分布配额配置 [{grade:"S",percent:10,minCount:0,maxCount:99}]',
  total_population INT DEFAULT NULL COMMENT '总人数(校验快照)',
  enforce_mode VARCHAR(20) NOT NULL DEFAULT 'BLOCK' COMMENT '强制模式(BLOCK 超额拦截 / WARN 仅警告)',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '规则状态(ACTIVE/INACTIVE)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_perf_distribution_obj (tenant_id, objective_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效强制分布规则';

-- =========================================================
-- HR-P0-3 招聘渠道管理
-- =========================================================
CREATE TABLE hr_recruitment_channel (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  channel_code VARCHAR(60) NOT NULL COMMENT '渠道编码',
  channel_name VARCHAR(120) NOT NULL COMMENT '渠道名称',
  channel_type VARCHAR(30) NOT NULL DEFAULT 'PORTAL' COMMENT '渠道类型(PORTAL门户/HEADHUNTER猎头/REFERRAL内推/CAMPUS校招/SOCIAL社招/OTHER)',
  cost_amount DECIMAL(12,2) DEFAULT 0 COMMENT '渠道费用',
  cost_currency VARCHAR(10) DEFAULT 'CNY' COMMENT '费用币种',
  contract_start DATE DEFAULT NULL COMMENT '合作开始日期',
  contract_end DATE DEFAULT NULL COMMENT '合作结束日期',
  contact_name VARCHAR(100) DEFAULT NULL COMMENT '渠道对接人姓名',
  contact_phone VARCHAR(40) DEFAULT NULL COMMENT '渠道对接人电话',
  contact_email VARCHAR(120) DEFAULT NULL COMMENT '渠道对接人邮箱',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '渠道状态(ACTIVE/EXPIRED/DISABLED)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_recruitment_channel_code (tenant_id, channel_code),
  KEY idx_hr_recruitment_channel_status (tenant_id, status, channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR招聘渠道';

-- =========================================================
-- HR-P1-1 简历解析字段(候选人附件解析回填)
-- =========================================================
CREATE TABLE hr_resume_parsed_fields (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  candidate_id BIGINT NOT NULL COMMENT '候选人ID hr_candidate.id',
  resume_url VARCHAR(500) DEFAULT NULL COMMENT '原始简历附件URL',
  parsed_name VARCHAR(100) DEFAULT NULL COMMENT '解析姓名',
  parsed_phone VARCHAR(40) DEFAULT NULL COMMENT '解析手机',
  parsed_email VARCHAR(120) DEFAULT NULL COMMENT '解析邮箱',
  parsed_education VARCHAR(120) DEFAULT NULL COMMENT '解析学历',
  parsed_school VARCHAR(120) DEFAULT NULL COMMENT '解析最高学历院校',
  parsed_skills JSON DEFAULT NULL COMMENT '解析技能标签 ["Java","Spring"]',
  parsed_experiences JSON DEFAULT NULL COMMENT '工作经历 [{company,title,start,end}]',
  raw_text MEDIUMTEXT DEFAULT NULL COMMENT '解析提取的纯文本(便于复核与重跑)',
  confidence DECIMAL(4,3) DEFAULT NULL COMMENT '整体置信度(0-1)',
  review_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '复核状态(PENDING/CONFIRMED/REJECTED)',
  reviewer_id BIGINT DEFAULT NULL COMMENT '复核人ID',
  reviewer_name VARCHAR(100) DEFAULT NULL COMMENT '复核人姓名',
  review_time DATETIME DEFAULT NULL COMMENT '复核时间',
  parse_error VARCHAR(500) DEFAULT NULL COMMENT '解析失败原因',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_resume_parsed_candidate (tenant_id, candidate_id, review_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR简历解析字段';

-- =========================================================
-- HR-P1-3 绩效面谈记录
-- =========================================================
CREATE TABLE hr_performance_interview (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  result_id BIGINT DEFAULT NULL COMMENT '关联绩效结果ID hr_performance_result.id',
  evaluatee_id BIGINT NOT NULL COMMENT '被面谈员工ID(评估对象)',
  evaluatee_name VARCHAR(100) DEFAULT NULL COMMENT '员工姓名',
  interviewer_id BIGINT NOT NULL COMMENT '面谈主持人ID(直属上级)',
  interviewer_name VARCHAR(100) DEFAULT NULL COMMENT '主持人姓名',
  hr_observer_id BIGINT DEFAULT NULL COMMENT 'HR旁听人ID',
  hr_observer_name VARCHAR(100) DEFAULT NULL COMMENT 'HR旁听人姓名',
  interview_time DATETIME NOT NULL COMMENT '面谈时间',
  location VARCHAR(200) DEFAULT NULL COMMENT '面谈地点',
  duration_minutes INT DEFAULT NULL COMMENT '面谈时长(分钟)',
  consensus TEXT DEFAULT NULL COMMENT '双方共识/结论',
  improvement_items JSON DEFAULT NULL COMMENT '改进项清单 [{item,owner,deadline}]',
  employee_feedback TEXT DEFAULT NULL COMMENT '员工反馈',
  manager_comment TEXT DEFAULT NULL COMMENT '主管点评',
  attachment_urls JSON DEFAULT NULL COMMENT '附件URL列表',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/CONFIRMED)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_perf_interview_result (tenant_id, result_id),
  KEY idx_hr_perf_interview_obj (tenant_id, objective_id, evaluatee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效面谈记录';

-- =========================================================
-- HR-P1-4 考勤异常申诉
-- =========================================================
CREATE TABLE hr_attendance_appeal (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  appeal_no VARCHAR(40) DEFAULT NULL COMMENT '申诉编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID hr_employee.id',
  employee_name VARCHAR(100) DEFAULT NULL COMMENT '员工姓名',
  dept_id BIGINT DEFAULT NULL COMMENT '部门ID',
  dept_name VARCHAR(120) DEFAULT NULL COMMENT '部门名称',
  attendance_record_id BIGINT DEFAULT NULL COMMENT '关联考勤记录ID hr_attendance_record.id',
  attendance_date DATE NOT NULL COMMENT '申诉考勤日期',
  exception_type VARCHAR(40) NOT NULL COMMENT '异常类型(LATE迟到/EARLY_LEAVE早退/ABSENT缺勤/MISSING_PUNCH漏打卡/OTHER)',
  reason TEXT NOT NULL COMMENT '申诉理由',
  evidence_urls JSON DEFAULT NULL COMMENT '证据材料URL列表',
  expected_check_in DATETIME DEFAULT NULL COMMENT '员工申报应打卡时间',
  expected_check_out DATETIME DEFAULT NULL COMMENT '员工申报应下班时间',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/CANCELLED)',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '关联工作流实例ID',
  manager_id BIGINT DEFAULT NULL COMMENT '审批主管ID',
  manager_remark VARCHAR(500) DEFAULT NULL COMMENT '主管审批意见',
  hr_reviewer_id BIGINT DEFAULT NULL COMMENT 'HR复核人ID',
  hr_remark VARCHAR(500) DEFAULT NULL COMMENT 'HR复核意见',
  approved_check_in DATETIME DEFAULT NULL COMMENT 'HR最终采纳的打卡时间',
  approved_check_out DATETIME DEFAULT NULL COMMENT 'HR最终采纳的下班时间',
  final_decision VARCHAR(40) DEFAULT NULL COMMENT '最终判定(REWRITE改写/REJECT驳回/IGNORE忽略)',
  decided_time DATETIME DEFAULT NULL COMMENT '判定时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  KEY idx_hr_attendance_appeal_emp (tenant_id, employee_id, attendance_date),
  KEY idx_hr_attendance_appeal_status (tenant_id, status, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考勤异常申诉';

SET FOREIGN_KEY_CHECKS = 1;

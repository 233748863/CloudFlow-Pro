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
DROP TABLE IF EXISTS hr_contract_signature;
DROP TABLE IF EXISTS hr_benefit_payment;
DROP TABLE IF EXISTS hr_family_member;
DROP TABLE IF EXISTS hr_bank_card;
DROP TABLE IF EXISTS hr_certificate_request;
DROP TABLE IF EXISTS hr_salary_slip;

DROP TABLE IF EXISTS hr_grievance_record;
DROP TABLE IF EXISTS hr_grievance;
DROP TABLE IF EXISTS hr_tax_slab_detail;
DROP TABLE IF EXISTS hr_tax_slab;
DROP TABLE IF EXISTS hr_payroll_correction;
DROP TABLE IF EXISTS hr_payroll_batch_employee;
DROP TABLE IF EXISTS hr_payroll_batch;
DROP TABLE IF EXISTS hr_payroll_period;
DROP TABLE IF EXISTS hr_attendance_checkin;
DROP TABLE IF EXISTS hr_earned_leave_schedule;
DROP TABLE IF EXISTS hr_leave_policy_assignment;
DROP TABLE IF EXISTS hr_leave_policy_detail;
DROP TABLE IF EXISTS hr_leave_policy;
DROP TABLE IF EXISTS hr_leave_period;
DROP TABLE IF EXISTS hr_leave_ledger;

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
  phone VARCHAR(64) DEFAULT NULL COMMENT '手机号',
  email VARCHAR(512) DEFAULT NULL COMMENT '邮箱',
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
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '合同状态(ACTIVE/EFFECTIVE/EXPIRING/EXPIRED/TERMINATED)',
  sign_status VARCHAR(30) NOT NULL DEFAULT 'UNSIGNED' COMMENT '电子签署状态(UNSIGNED/PENDING/SIGNED/REJECTED/EXPIRED/CANCELLED)',
  signed_at DATETIME DEFAULT NULL COMMENT '签署完成时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_contract_no (tenant_id, contract_no),
  KEY idx_hr_contract_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工合同';

CREATE TABLE hr_employee_document (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  document_type VARCHAR(40) NOT NULL COMMENT '证件类型(ID_CARD/PASSPORT/DIPLOMA/DEGREE/EDU/OFFER/STUDENT)',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '招聘单状态(DRAFT/APPROVING/RECRUITING/COMPLETED/CANCELLED)',
  process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '关联工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  email VARCHAR(254) DEFAULT NULL COMMENT '邮箱',
  source VARCHAR(50) DEFAULT NULL COMMENT '简历来源(自由文本,兼容历史)(WEBSITE/REFERRAL/HEADHUNTER/CAMPUS)',
  channel_id BIGINT DEFAULT NULL COMMENT '关联招聘渠道ID(hr_recruitment_channel.id)',
  resume_attachment_urls JSON DEFAULT NULL COMMENT '简历附件URL列表',
  status VARCHAR(30) NOT NULL DEFAULT 'SCREENING' COMMENT '候选人状态(NEW/SCREENING/INTERVIEW/OFFER/HIRED/REJECTED)',
  reject_reason VARCHAR(500) DEFAULT NULL COMMENT '淘汰原因',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_lifecycle_no (tenant_id, application_no),
  KEY idx_hr_lifecycle_type (tenant_id, type, status),
  KEY idx_hr_lifecycle_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工生命周期申请';

CREATE TABLE hr_lifecycle_detail (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_id BIGINT NOT NULL COMMENT '关联生命周期申请ID',
  detail_type VARCHAR(40) NOT NULL COMMENT '明细类型(ONBOARDING/PROBATION/TRANSFER/RESIGNATION)',
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
  task_type VARCHAR(40) NOT NULL COMMENT '任务类型(ONBOARDING/HANDOVER/DOCUMENT/IT_ACCOUNT)',
  owner_id BIGINT DEFAULT NULL COMMENT '任务负责人用户ID',
  due_date DATE DEFAULT NULL COMMENT '任务截止日期',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '任务状态(PENDING/IN_PROGRESS/DONE/CANCELLED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  checkin_window_before_minutes INT NOT NULL DEFAULT 0 COMMENT '班次开始前可打卡分钟数',
  checkout_window_after_minutes INT NOT NULL DEFAULT 0 COMMENT '班次结束后可打卡分钟数',
  late_grace_minutes INT NOT NULL DEFAULT 0 COMMENT '迟到宽容分钟数',
  early_exit_grace_minutes INT NOT NULL DEFAULT 0 COMMENT '早退宽容分钟数',
  half_day_hours_threshold DECIMAL(4,2) NOT NULL DEFAULT 4.00 COMMENT '判定半天的最低工时(小时)',
  absent_hours_threshold DECIMAL(4,2) NOT NULL DEFAULT 0.00 COMMENT '判定缺勤的最低工时(小时)',
  working_hours_calc_mode VARCHAR(20) NOT NULL DEFAULT 'FIRST_LAST' COMMENT '工时计算方式(FIRST_LAST/PAIRED)',
  checkin_determine_mode VARCHAR(20) NOT NULL DEFAULT 'EARLIEST_LATEST' COMMENT '进出打卡判定方式(EARLIEST_LATEST/ALTERNATING)',
  holiday_calendar_id BIGINT(20) DEFAULT NULL COMMENT '绑定节假日日历ID',
  auto_attendance_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否自动生成考勤',
  process_attendance_after DATE DEFAULT NULL COMMENT '自动处理起始日期',
  mark_on_holiday_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '节假日是否判定考勤',
  overtime_threshold_minutes INT NOT NULL DEFAULT 0 COMMENT '超过多少分钟计为加班，预留给批次H',
  color VARCHAR(20) DEFAULT '#0891b2' COMMENT '日历显示颜色',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  rule_type VARCHAR(30) NOT NULL DEFAULT 'FIXED' COMMENT '考勤规则类型(FIXED/STANDARD/FLEXIBLE)',
  shift_id BIGINT DEFAULT NULL COMMENT '关联班次ID',
  check_methods JSON DEFAULT NULL COMMENT '打卡方式配置(JSON)',
  config_json JSON DEFAULT NULL COMMENT '其它配置(JSON)',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '排班状态(ACTIVE/PUBLISHED/CANCELLED)',
  source_shift_request_id BIGINT(20) DEFAULT NULL COMMENT '生成该员工单日排班的调班申请ID，手工排班为空',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_schedule_target (tenant_id, target_type, target_id),
  UNIQUE KEY uk_hr_schedule_shift_request (tenant_id, source_shift_request_id, target_type, target_id, schedule_date),
  KEY idx_hr_schedule_emp_day (tenant_id, target_type, target_id, schedule_date, status),
  KEY idx_hr_schedule_date (tenant_id, schedule_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR排班分配';

CREATE TABLE hr_attendance_record (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  attendance_date DATE NOT NULL COMMENT '考勤所属日期',
  shift_id BIGINT DEFAULT NULL COMMENT '当日班次ID',
  work_minutes INT NOT NULL DEFAULT 0 COMMENT '实际工时(分钟)',
  expected_minutes INT NOT NULL DEFAULT 0 COMMENT '应出勤工时(分钟)',
  late_minutes INT NOT NULL DEFAULT 0 COMMENT '迟到分钟数',
  early_exit_minutes INT NOT NULL DEFAULT 0 COMMENT '早退分钟数',
  overtime_minutes INT NOT NULL DEFAULT 0 COMMENT '加班分钟数，预留给批次H',
  first_checkin_time DATETIME DEFAULT NULL COMMENT '首次上班打卡时间',
  last_checkout_time DATETIME DEFAULT NULL COMMENT '末次下班打卡时间',
  checkin_count INT NOT NULL DEFAULT 0 COMMENT '打卡次数',
  half_day_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否半天',
  absent_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否缺勤',
  date_type VARCHAR(20) NOT NULL DEFAULT 'WORKDAY' COMMENT '日期类型(WORKDAY/HOLIDAY/REST)',
  status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '日结论状态(NORMAL/LATE/EARLY_EXIT/LATE_AND_EARLY/HALF_DAY/ABSENT/LEAVE/HOLIDAY/REST/BUSINESS_TRIP/PENDING)',
  recalc_time DATETIME DEFAULT NULL COMMENT '最近重算时间',
  manual_adjusted_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否人工调整过',
  appeal_id BIGINT(20) DEFAULT NULL COMMENT '关联考勤申诉ID',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_att_record_employee_date (tenant_id, employee_id, attendance_date),
  KEY idx_hr_att_record_employee (tenant_id, employee_id, attendance_date),
  KEY idx_hr_att_record_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR打卡记录';

CREATE TABLE hr_attendance_monthly (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  year INT NOT NULL COMMENT '统计年份',
  month INT NOT NULL COMMENT '统计月份',
  work_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '按节假日日历计算的应出勤天数',
  actual_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '实际出勤天数',
  late_times INT NOT NULL DEFAULT 0 COMMENT '迟到次数',
  early_times INT NOT NULL DEFAULT 0 COMMENT '早退次数',
  absent_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '缺勤天数',
  leave_days DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '请假天数',
  overtime_hours DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '加班小时数',
  attendance_rate DECIMAL(6,2) NOT NULL DEFAULT 0 COMMENT '出勤率(%)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '统计单状态(DRAFT/CONFIRMED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  max_days_per_year DECIMAL(8,2) DEFAULT NULL COMMENT '年度数量上限，单位与假期单位一致',
  applicable_after_days INT NOT NULL DEFAULT 0 COMMENT '入职满多少自然日可用',
  max_continuous_days DECIMAL(8,2) DEFAULT NULL COMMENT '单次连续数量上限，单位与假期单位一致',
  carry_forward_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许结转',
  max_carry_forward_days DECIMAL(8,2) DEFAULT NULL COMMENT '结转数量上限，单位与假期单位一致',
  carry_forward_expire_days INT DEFAULT NULL COMMENT '结转后多少自然日过期',
  earned_leave_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否按周期累积',
  earned_leave_frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' COMMENT '累积频率(MONTHLY/QUARTERLY/HALF_YEARLY/YEARLY)',
  rounding_mode VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT '数量舍入方式(NONE/HALF_DAY/FULL_DAY)',
  encashment_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许折现',
  encashment_component_id BIGINT(20) DEFAULT NULL COMMENT '折现薪酬项ID',
  lwp_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否无薪假',
  partial_paid_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否部分带薪',
  salary_fraction_per_day DECIMAL(5,4) NOT NULL DEFAULT 1.0000 COMMENT '部分带薪比例(0至1)',
  compensatory_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否调休假',
  optional_leave_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否可选节假日',
  include_holiday_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '数量计算是否包含节假日及休息日',
  allow_negative_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许负余额',
  allow_over_allocation_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许超额分配',
  need_attachment_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '请假是否必须提供附件',
  quota_rule JSON DEFAULT NULL COMMENT '额度计算规则(JSON)',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  period_id BIGINT(20) NOT NULL COMMENT '所属假期周期ID',
  total_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '额度总量',
  used_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '已使用额度',
  frozen_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '冻结中额度(审批中)',
  available_quota DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '可用额度',
  last_calc_time DATETIME DEFAULT NULL COMMENT '最近台账重算时间',
  expiry_date DATE DEFAULT NULL COMMENT '额度失效日期',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_leave_quota_period (tenant_id, employee_id, leave_type_id, period_id),
  KEY idx_hr_leave_quota_employee (tenant_id, employee_id, period_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假期额度';

CREATE TABLE hr_time_request (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '假勤申请单号',
  request_type VARCHAR(30) NOT NULL COMMENT '既有假勤类型，加班OVERTIME改用独立加班申请',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_time_request_no (tenant_id, request_no),
  CONSTRAINT ck_hr_time_request_no_overtime CHECK (request_type <> 'OVERTIME'),
  KEY idx_hr_time_request_employee (tenant_id, employee_id, request_type, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR假勤申请';

CREATE TABLE hr_comp_component (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  component_code VARCHAR(50) NOT NULL COMMENT '薪资项编码',
  component_name VARCHAR(100) NOT NULL COMMENT '薪资项名称',
  component_type VARCHAR(30) NOT NULL COMMENT '薪资项类型(FIXED/VARIABLE/EARNING/DEDUCTION/COMPANY)',
  category VARCHAR(30) DEFAULT NULL COMMENT '薪资项分类(BASE/ALLOWANCE/BONUS/BENEFIT/OTHER)',
  taxable TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否计税(1=是,0=否)',
  sort_order INT DEFAULT 0 COMMENT '排序号',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '启用状态(1=启用,0=停用)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  KEY idx_hr_employee_comp (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工薪资';

CREATE TABLE hr_comp_change (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  change_no VARCHAR(60) NOT NULL COMMENT '调薪单号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  change_type VARCHAR(30) NOT NULL COMMENT '薪资变动类型(PROMOTION/PERFORMANCE/ADJUSTMENT/BONUS/OVERTIME/REFERRAL_BONUS/LEAVE_ENCASHMENT)',
  salary_component_id BIGINT(20) DEFAULT NULL COMMENT '来源业务确定的薪资项目ID，既有变动可为空',
  payroll_period_id BIGINT(20) DEFAULT NULL COMMENT '来源业务指定的目标工资周期ID，既有变动沿生效日期',
  source_biz_type VARCHAR(50) DEFAULT NULL COMMENT '来源业务类型，H加班为HR_OVERTIME',
  source_biz_id VARCHAR(64) DEFAULT NULL COMMENT '来源业务申请ID',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_comp_change_no (tenant_id, change_no),
  UNIQUE KEY uk_hr_comp_change_source (tenant_id, source_biz_type, source_biz_id),
  KEY idx_hr_comp_change_payroll (tenant_id, employee_id, payroll_period_id, status),
  CONSTRAINT ck_hr_comp_change_source CHECK ((source_biz_type IS NULL AND source_biz_id IS NULL) OR (source_biz_type IS NOT NULL AND source_biz_id IS NOT NULL)),
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  KEY idx_hr_employee_benefit (tenant_id, employee_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR员工福利方案';

CREATE TABLE hr_tax_profile (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  tax_residence_city VARCHAR(80) DEFAULT NULL COMMENT '个税居民城市',
  tax_slab_id BIGINT(20) DEFAULT NULL COMMENT '适用税率表ID',
  threshold VARCHAR(255) NOT NULL DEFAULT '5000' COMMENT '起征点(加密存储)',
  tax_config JSON DEFAULT NULL COMMENT '个税专项配置(JSON)',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '档案状态(ACTIVE/CLOSED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_tax_profile_employee (tenant_id, employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR个税档案';

CREATE TABLE hr_tax_deduction (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  deduction_type VARCHAR(50) NOT NULL COMMENT '专项扣除类型(CHILD_EDUCATION/CONTINUING_EDU/HOUSING_LOAN/HOUSING_RENT/ELDERLY_CARE/INFANT_CARE)',
  amount VARCHAR(255) NOT NULL COMMENT '扣除金额(加密存储)',
  start_date DATE NOT NULL COMMENT '扣除开始日期',
  end_date DATE DEFAULT NULL COMMENT '扣除结束日期',
  status VARCHAR(30) NOT NULL DEFAULT 'ACTIVE' COMMENT '扣除状态(ACTIVE/EXPIRED)',
  declare_status VARCHAR(30) NOT NULL DEFAULT 'DECLARED' COMMENT '举证状态(DECLARED/PROOF_SUBMITTED/VERIFIED/REJECTED)',
  proof_file_url VARCHAR(1000) DEFAULT NULL COMMENT '举证材料地址',
  verify_by BIGINT(20) DEFAULT NULL COMMENT '举证审核人ID',
  verify_time DATETIME DEFAULT NULL COMMENT '举证审核时间',
  reject_reason VARCHAR(500) DEFAULT NULL COMMENT '驳回原因',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  cycle_id BIGINT(20) DEFAULT NULL COMMENT '新绩效周期ID，空为既有目标',
  kra_id BIGINT(20) DEFAULT NULL COMMENT '周期内KRA ID',
  metric_config JSON DEFAULT NULL COMMENT '指标配置(JSON)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '目标状态(DRAFT/PLAN_APPROVING/PLAN_APPROVED/RESULT_APPROVING/RESULT_APPROVED/COMPLETED/REJECTED/CANCELLED)',
  plan_process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '计划阶段工作流实例ID',
  result_process_instance_id VARCHAR(100) DEFAULT NULL COMMENT '结果阶段工作流实例ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_perf_objective_no (tenant_id, objective_no),
  KEY idx_performance_cycle (tenant_id, cycle_id, kra_id),
  KEY idx_hr_perf_objective_status (tenant_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效目标';

CREATE TABLE hr_performance_assignment (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  cycle_id BIGINT(20) DEFAULT NULL COMMENT '所属绩效周期ID，空为既有分派',
  parent_id BIGINT DEFAULT NULL COMMENT '父分解节点ID(支持目标级联)',
  assignee_type VARCHAR(30) NOT NULL COMMENT '承接对象类型(DEPT/EMPLOYEE)',
  assignee_id BIGINT NOT NULL COMMENT '承接对象ID',
  assignee_name VARCHAR(120) DEFAULT NULL COMMENT '承接对象名称(冗余快照)',
  target_value DECIMAL(18,4) DEFAULT 0 COMMENT '目标值',
  actual_value DECIMAL(18,4) DEFAULT 0 COMMENT '实际值',
  weight DECIMAL(8,2) DEFAULT 100 COMMENT '权重(%)',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '分解节点状态(DRAFT/ACTIVE/IN_PROGRESS/COMPLETED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_perf_assignment_obj (tenant_id, objective_id),
  KEY idx_assignment_cycle (tenant_id, cycle_id, assignee_id),
  KEY idx_hr_perf_assignment_assignee (tenant_id, assignee_type, assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效分解';

CREATE TABLE hr_performance_result (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT NOT NULL COMMENT '关联绩效目标ID',
  assignment_id BIGINT DEFAULT NULL COMMENT '关联分解节点ID',
  employee_id BIGINT DEFAULT NULL COMMENT '被评员工ID',
  score DECIMAL(8,2) DEFAULT NULL COMMENT '评分',
  grade VARCHAR(20) DEFAULT NULL COMMENT '绩效等级(S/A/B+/B/C/D)',
  summary TEXT DEFAULT NULL COMMENT '评估总结',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '结果状态(DRAFT/SUBMITTED/APPROVED/CONFIRMED/PUBLISHED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '联动调薪状态(DRAFT/SUBMITTED/APPROVED/APPLIED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_hr_perf_salary_obj (tenant_id, objective_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效调薪联动';

CREATE TABLE hr_audit_log (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  business_domain VARCHAR(60) NOT NULL COMMENT '业务域(EMPLOYEE/CONTRACT/SALARY/SALARY_SLIP/BANK_CARD/BENEFIT/POINT/POSITION/PERFORMANCE/TALENT/TRAINING/WORK_INJURY/LABOR_DISPUTE/CERTIFICATE_REQ/MALL_ORDER/AUDIT)',
  business_id BIGINT DEFAULT NULL COMMENT '业务主键ID',
  operation_type VARCHAR(40) NOT NULL COMMENT '操作类型(CREATE/UPDATE/DELETE/APPROVE/REJECT/EXPORT)',
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
  batch_id BIGINT(20) DEFAULT NULL COMMENT '薪资批次ID，手工工资单为空',
  reserved_settlement_id BIGINT(20) DEFAULT NULL COMMENT '离职结算占位，发薪与冲正均需检查',
  period_month VARCHAR(7) NOT NULL COMMENT 'YYYY-MM',
  gross_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应发合计',
  deduction_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '扣除合计',
  net_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '实发合计',
  tax_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '个税扣除',
  benefit_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '社保公积金合计',
  cumulative_taxable_income DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '年度累计应税所得',
  cumulative_deduction DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '年度累计扣除',
  cumulative_tax_payable DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '年度累计应纳税额',
  cumulative_tax_paid DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '年度累计已缴税额',
  current_tax DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '本期应缴税额',
  components JSON DEFAULT NULL COMMENT '工资项展开 [{code,name,amount,kind:EARNING/DEDUCTION}]',
  pay_date DATE DEFAULT NULL COMMENT '发薪日',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/CONFIRMED/PAID/RELEASED',
  employee_confirmed TINYINT(1) NOT NULL DEFAULT 0 COMMENT '员工是否确认',
  confirmed_time DATETIME DEFAULT NULL COMMENT '确认时间',
  digest_sha256 CHAR(64) DEFAULT NULL COMMENT '工资条防篡改摘要',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_salary_slip (tenant_id, employee_id, period_month, batch_id),
  KEY idx_hr_salary_slip_batch (tenant_id, batch_id),
  KEY idx_salary_settlement (tenant_id, reserved_settlement_id),
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态(ACTIVE/INACTIVE)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态(ACTIVE/INACTIVE)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  skill_id BIGINT(20) DEFAULT NULL COMMENT '完成培训可提升的技能ID',
  target_level TINYINT DEFAULT NULL COMMENT '可提升至一至五级',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/PUBLISHED/OFFLINE',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_train_course (tenant_id, course_code),
  KEY idx_hr_train_course_cat (tenant_id, category_id, status),
  CONSTRAINT chk_training_skill CHECK ((skill_id IS NULL AND target_level IS NULL) OR (skill_id IS NOT NULL AND target_level IS NOT NULL AND target_level BETWEEN 1 AND 5))
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '启用状态(ACTIVE/INACTIVE)',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  review_id BIGINT(20) DEFAULT NULL COMMENT '人才盘点ID，与绩效周期互斥',
  cycle_id BIGINT(20) DEFAULT NULL COMMENT '绩效周期ID，与人才盘点互斥',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_talent_calib_no (tenant_id, session_no),
  KEY idx_hr_talent_calib_review (tenant_id, review_id, status),
  KEY idx_calibration_cycle (tenant_id, cycle_id),
  CONSTRAINT chk_calibration_scope CHECK ((review_id IS NOT NULL AND cycle_id IS NULL) OR (review_id IS NULL AND cycle_id IS NOT NULL))
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
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/IN_PROGRESS/PUBLISHED/ARCHIVED/REJECTED',
  process_instance_id VARCHAR(64) DEFAULT NULL COMMENT '关联工作流实例ID',
  publish_time DATETIME DEFAULT NULL COMMENT '发布时间',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
  UNIQUE KEY uk_hr_point_source_direction (tenant_id, source_type, source_id, direction),
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
  remark VARCHAR(500) DEFAULT NULL COMMENT '下单备注',
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
  status VARCHAR(30) NOT NULL DEFAULT 'REPORTED' COMMENT 'REPORTED/INVESTIGATING/DETERMINING/DETERMINED/COMPENSATING/REHABILITATING/CLOSED/REJECTED',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
DROP TABLE IF EXISTS hr_perf_evaluator_response;
DROP TABLE IF EXISTS hr_perf_evaluator;
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
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
DROP TABLE IF EXISTS hr_perf_distribution_rule;
CREATE TABLE hr_perf_distribution_rule (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  objective_id BIGINT DEFAULT NULL COMMENT '关联绩效目标ID(为空表示租户全局默认规则)',
  cycle_id BIGINT(20) DEFAULT NULL COMMENT '适用周期，空时保留原目标或全局规则',
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  KEY idx_hr_perf_distribution_obj (tenant_id, objective_id, status),
  KEY idx_distribution_cycle (tenant_id, cycle_id, status),
  CONSTRAINT chk_distribution_scope CHECK (cycle_id IS NULL OR objective_id IS NULL)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效强制分布规则';

-- =========================================================
-- HR-P0-3 招聘渠道管理
-- =========================================================
DROP TABLE IF EXISTS hr_recruitment_channel;
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_recruitment_channel_code (tenant_id, channel_code),
  KEY idx_hr_recruitment_channel_status (tenant_id, status, channel_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR招聘渠道';

-- =========================================================
-- HR-P1-1 简历解析字段(候选人附件解析回填)
-- =========================================================
DROP TABLE IF EXISTS hr_resume_parsed_fields;
CREATE TABLE hr_resume_parsed_fields (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  candidate_id BIGINT NOT NULL COMMENT '候选人ID hr_candidate.id',
  resume_url VARCHAR(500) DEFAULT NULL COMMENT '原始简历附件URL',
  parsed_name VARCHAR(100) DEFAULT NULL COMMENT '解析姓名',
  parsed_phone VARCHAR(40) DEFAULT NULL COMMENT '解析手机',
  parsed_email VARCHAR(254) DEFAULT NULL COMMENT '解析邮箱',
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
DROP TABLE IF EXISTS hr_performance_interview;
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  KEY idx_hr_perf_interview_result (tenant_id, result_id),
  KEY idx_hr_perf_interview_obj (tenant_id, objective_id, evaluatee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR绩效面谈记录';

-- =========================================================
-- HR-P1-4 考勤异常申诉
-- =========================================================
DROP TABLE IF EXISTS hr_attendance_appeal;
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
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  PRIMARY KEY (id),
  KEY idx_hr_attendance_appeal_emp (tenant_id, employee_id, attendance_date),
  KEY idx_hr_attendance_appeal_status (tenant_id, status, attendance_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR考勤异常申诉';

-- =========================================================
-- HR-P0-1 培训档案物理化(实时聚合改异步增量 + 凌晨重建兜底)
-- =========================================================
DROP TABLE IF EXISTS hr_training_archive;
CREATE TABLE hr_training_archive (
  id                  BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id           BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  employee_id         BIGINT(20)      NOT NULL COMMENT '员工ID',
  total_hours         DECIMAL(10,2)   NOT NULL DEFAULT 0 COMMENT '累计学时',
  completion_count    INT(11)         NOT NULL DEFAULT 0 COMMENT '已完成培训次数(PASSED)',
  cert_count          INT(11)         NOT NULL DEFAULT 0 COMMENT '有效证书数(VALID)',
  ongoing_count       INT(11)         NOT NULL DEFAULT 0 COMMENT '进行中培训次数(APPROVED+PENDING)',
  last_training_date  DATE            DEFAULT NULL COMMENT '最近一次培训日期',
  year_hours          JSON            DEFAULT NULL COMMENT '分年度学时 JSON {"2024":12.5,"2025":40.0}',
  refreshed_at        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '最近一次刷新时间',
  create_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time         DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by           VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by           VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted             TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删,1=已删)',
  PRIMARY KEY (id),
  UNIQUE KEY uk_hr_training_archive_emp (tenant_id, employee_id, deleted),
  KEY idx_hr_training_archive_refresh (tenant_id, refreshed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='HR培训档案(物理化聚合)';

-- =========================================================
-- 批次 D：假期、考勤、薪资与员工申诉
-- =========================================================
CREATE TABLE hr_leave_ledger (
  ledger_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '台账主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT(20) NOT NULL COMMENT '假期类型ID',
  leave_period_id BIGINT(20) DEFAULT NULL COMMENT '假期周期ID',
  transaction_type VARCHAR(30) NOT NULL COMMENT '变动类型(ALLOCATION/APPLICATION/CARRY_FORWARD/EXPIRY/ENCASHMENT/ADJUSTMENT/COMPENSATORY/FREEZE/UNFREEZE)',
  source_biz_type VARCHAR(50) DEFAULT NULL COMMENT '来源业务类型',
  source_biz_id VARCHAR(64) DEFAULT NULL COMMENT '来源业务ID',
  source_event_key VARCHAR(128) DEFAULT NULL COMMENT '自动业务入账幂等键，既有台账为空',
  leave_days DECIMAL(8,2) NOT NULL COMMENT '变动数量，正为增加负为减少',
  quantity_unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT '数量单位(DAY/HOUR)',
  from_date DATE DEFAULT NULL COMMENT '适用开始日期',
  to_date DATE DEFAULT NULL COMMENT '适用结束日期',
  carry_forward_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否结转产生',
  expired_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否过期扣减',
  lwp_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否无薪假',
  reversal_of_id BIGINT(20) DEFAULT NULL COMMENT '冲正来源台账ID',
  operator_id BIGINT(20) DEFAULT NULL COMMENT '操作人ID',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (ledger_id),
  KEY idx_hr_leave_ledger_emp_type (tenant_id, employee_id, leave_type_id, leave_period_id),
  KEY idx_hr_leave_ledger_source (source_biz_type, source_biz_id),
  UNIQUE KEY uk_hr_leave_ledger_event (tenant_id, source_event_key),
  KEY idx_hr_leave_ledger_tenant_source (tenant_id, source_biz_type, source_biz_id),
  KEY idx_hr_leave_ledger_type_time (transaction_type, create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR假期台账';

CREATE TABLE hr_leave_period (
  period_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '周期主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  period_name VARCHAR(100) NOT NULL COMMENT '周期名称',
  start_date DATE NOT NULL COMMENT '周期开始日期',
  end_date DATE NOT NULL COMMENT '周期结束日期',
  default_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否默认周期',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT '周期状态(OPEN/CLOSED)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (period_id),
  UNIQUE KEY uk_hr_leave_period_name (tenant_id, period_name),
  KEY idx_hr_leave_period_date (tenant_id, start_date, end_date, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR假期周期';

CREATE TABLE hr_leave_policy (
  policy_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '政策主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  policy_code VARCHAR(50) NOT NULL COMMENT '政策编码',
  policy_name VARCHAR(120) NOT NULL COMMENT '政策名称',
  description VARCHAR(500) DEFAULT NULL COMMENT '政策说明',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/ACTIVE/INACTIVE)',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (policy_id),
  UNIQUE KEY uk_hr_leave_policy_code (tenant_id, policy_code),
  KEY idx_hr_leave_policy_status (tenant_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR假期政策';

CREATE TABLE hr_leave_policy_detail (
  detail_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '政策明细主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  policy_id BIGINT(20) NOT NULL COMMENT '政策ID',
  leave_type_id BIGINT(20) NOT NULL COMMENT '假期类型ID',
  annual_days DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '年度分配数量',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (detail_id),
  UNIQUE KEY uk_hr_leave_policy_detail (tenant_id, policy_id, leave_type_id),
  KEY idx_hr_leave_policy_detail_type (tenant_id, leave_type_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR假期政策明细';

CREATE TABLE hr_leave_policy_assignment (
  assignment_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '政策分配主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  policy_id BIGINT(20) NOT NULL COMMENT '政策ID',
  leave_period_id BIGINT(20) NOT NULL COMMENT '假期周期ID',
  assignment_basis VARCHAR(30) NOT NULL DEFAULT 'PERIOD' COMMENT '额度计算依据(PERIOD按周期/JOINING_DATE按入职日折算)',
  effective_from DATE DEFAULT NULL COMMENT '生效开始日期',
  effective_to DATE DEFAULT NULL COMMENT '生效结束日期',
  carry_forward_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许结转',
  allocated_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已写入分配台账',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (assignment_id),
  UNIQUE KEY uk_hr_leave_policy_assignment (tenant_id, employee_id, policy_id, leave_period_id),
  KEY idx_hr_leave_policy_assignment_basis (tenant_id, assignment_basis, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR假期政策分配';

CREATE TABLE hr_earned_leave_schedule (
  schedule_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '累积执行主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT(20) NOT NULL COMMENT '假期类型ID',
  leave_period_id BIGINT(20) NOT NULL COMMENT '假期周期ID',
  schedule_date DATE NOT NULL COMMENT '计划执行日期',
  earned_days DECIMAL(8,2) NOT NULL DEFAULT 0 COMMENT '应累积数量',
  executed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已执行',
  ledger_id BIGINT(20) DEFAULT NULL COMMENT '生成的台账ID',
  error_message VARCHAR(500) DEFAULT NULL COMMENT '执行失败原因',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (schedule_id),
  UNIQUE KEY uk_hr_earned_leave_schedule (tenant_id, employee_id, leave_type_id, leave_period_id, schedule_date),
  KEY idx_hr_earned_leave_schedule_pending (tenant_id, schedule_date, executed_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR按月累积执行台账';

CREATE TABLE hr_attendance_checkin (
  checkin_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '打卡主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  log_type VARCHAR(10) NOT NULL COMMENT '打卡方向(IN/OUT)',
  check_time DATETIME NOT NULL COMMENT '实际打卡时间',
  shift_id BIGINT(20) DEFAULT NULL COMMENT '所属班次ID',
  attendance_date DATE DEFAULT NULL COMMENT '归属考勤日期',
  device_id VARCHAR(100) DEFAULT NULL COMMENT '设备标识',
  check_method VARCHAR(20) NOT NULL DEFAULT 'MANUAL' COMMENT '打卡方式(APP/FACE/CARD/WIFI/GPS/MANUAL)',
  latitude DECIMAL(10,7) DEFAULT NULL COMMENT '纬度',
  longitude DECIMAL(10,7) DEFAULT NULL COMMENT '经度',
  location_name VARCHAR(255) DEFAULT NULL COMMENT '位置名称',
  location_valid_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '位置是否在允许范围内',
  offshift_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否非本班次打卡',
  overtime_type_id BIGINT(20) DEFAULT NULL COMMENT 'hr_overtime_type类型ID，仅服务端在新打卡时赋值',
  overtime_request_id BIGINT(20) DEFAULT NULL COMMENT '新打卡关联的加班申请ID，事后申请不回写原始卡',
  skip_auto_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否跳过自动考勤',
  attendance_record_id BIGINT(20) DEFAULT NULL COMMENT '回指日考勤结论ID',
  photo_file_id BIGINT(20) DEFAULT NULL COMMENT '打卡照片文件ID',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (checkin_id),
  KEY idx_hr_attendance_checkin_emp_date (tenant_id, employee_id, attendance_date),
  KEY idx_hr_attendance_checkin_emp_time (tenant_id, employee_id, check_time),
  KEY idx_hr_checkin_ot_request (tenant_id, overtime_request_id, check_time),
  KEY idx_hr_attendance_checkin_record (attendance_record_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR原始打卡记录';

CREATE TABLE hr_payroll_period (
  period_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '薪资周期主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  period_name VARCHAR(100) NOT NULL COMMENT '薪资周期名称',
  start_date DATE NOT NULL COMMENT '周期开始日期',
  end_date DATE NOT NULL COMMENT '周期结束日期',
  frequency VARCHAR(20) NOT NULL DEFAULT 'MONTHLY' COMMENT '发薪频率(MONTHLY/SEMI_MONTHLY/WEEKLY)',
  pay_date DATE DEFAULT NULL COMMENT '计划发薪日期',
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN' COMMENT '状态(OPEN/CALCULATING/CLOSED)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (period_id),
  UNIQUE KEY uk_hr_payroll_period_name (tenant_id, period_name),
  KEY idx_hr_payroll_period_date (tenant_id, start_date, end_date, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资周期';

CREATE TABLE hr_payroll_batch (
  batch_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '薪资批次主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  batch_no VARCHAR(80) NOT NULL COMMENT '批次编号',
  payroll_period_id BIGINT(20) NOT NULL COMMENT '薪资周期ID',
  posting_date DATE DEFAULT NULL COMMENT '记账日期',
  filter_dept_ids JSON DEFAULT NULL COMMENT '部门筛选条件',
  filter_position_ids JSON DEFAULT NULL COMMENT '岗位筛选条件',
  filter_job_level_ids JSON DEFAULT NULL COMMENT '职级筛选条件',
  filter_employee_type VARCHAR(30) DEFAULT NULL COMMENT '员工类型筛选条件',
  filter_employee_ids JSON DEFAULT NULL COMMENT '员工筛选条件',
  employee_count INT NOT NULL DEFAULT 0 COMMENT '员工数量',
  validate_attendance_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否强制校验考勤齐备',
  deduct_unverified_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否扣除未举证的专项申报项',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/CALCULATING/CALCULATED/SUBMITTED/PAID/FAILED/CANCELLED)',
  slip_created_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已生成工资单',
  slip_submitted_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否已提交审批',
  total_gross DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应发合计',
  total_deduction DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '扣除合计',
  total_tax DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '个税合计',
  total_net DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '实发合计',
  error_message VARCHAR(1000) DEFAULT NULL COMMENT '错误信息',
  instance_id VARCHAR(100) DEFAULT NULL COMMENT '审批流实例ID',
  calc_start_time DATETIME DEFAULT NULL COMMENT '计算开始时间',
  calc_end_time DATETIME DEFAULT NULL COMMENT '计算结束时间',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (batch_id),
  UNIQUE KEY uk_hr_payroll_batch_no (tenant_id, batch_no),
  KEY idx_hr_payroll_batch_period (tenant_id, payroll_period_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资批次';

CREATE TABLE hr_payroll_batch_employee (
  batch_employee_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '批次明细主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  batch_id BIGINT(20) NOT NULL COMMENT '薪资批次ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  employee_name VARCHAR(100) DEFAULT NULL COMMENT '员工姓名快照',
  salary_slip_id BIGINT(20) DEFAULT NULL COMMENT '工资单ID',
  calc_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '计算状态(PENDING/SUCCESS/FAILED/SKIPPED)',
  error_message VARCHAR(1000) DEFAULT NULL COMMENT '计算错误信息',
  gross_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '应发合计',
  net_total DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '实发合计',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (batch_employee_id),
  UNIQUE KEY uk_hr_payroll_batch_employee (tenant_id, batch_id, employee_id),
  KEY idx_hr_payroll_batch_employee_status (tenant_id, batch_id, calc_status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR薪资批次员工明细';

CREATE TABLE hr_payroll_correction (
  correction_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '补正主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  original_slip_id BIGINT(20) NOT NULL COMMENT '原工资单ID',
  correction_slip_id BIGINT(20) DEFAULT NULL COMMENT '补正工资单ID',
  corrected_by BIGINT(20) DEFAULT NULL COMMENT '补正经办用户ID',
  correction_time DATETIME DEFAULT NULL COMMENT '补正时间',
  reason VARCHAR(1000) NOT NULL COMMENT '补正原因',
  diff_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '补正差额',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/PENDING/APPROVED/REJECTED/APPLIED)',
  instance_id VARCHAR(100) DEFAULT NULL COMMENT '审批流实例ID',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (correction_id),
  KEY idx_hr_payroll_correction_original (tenant_id, original_slip_id),
  KEY idx_hr_payroll_correction_status (tenant_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR工资补正';

CREATE TABLE hr_tax_slab (
  slab_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '税率表主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  slab_name VARCHAR(120) NOT NULL COMMENT '税率表名称',
  region VARCHAR(50) DEFAULT NULL COMMENT '适用地区',
  effective_from DATE NOT NULL COMMENT '生效开始日期',
  effective_to DATE DEFAULT NULL COMMENT '生效结束日期',
  threshold_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '起征点',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态(DRAFT/ACTIVE/INACTIVE)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (slab_id),
  UNIQUE KEY uk_hr_tax_slab_effective (tenant_id, region, effective_from),
  KEY idx_hr_tax_slab_status (tenant_id, status, effective_from)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR个税税率表';

CREATE TABLE hr_tax_slab_detail (
  slab_detail_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '税率档明细主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  slab_id BIGINT(20) NOT NULL COMMENT '税率表ID',
  level_no INT NOT NULL COMMENT '税率档次',
  from_amount DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '收入下限',
  to_amount DECIMAL(18,2) DEFAULT NULL COMMENT '收入上限，空表示无上限',
  tax_rate DECIMAL(6,4) NOT NULL DEFAULT 0 COMMENT '税率',
  quick_deduction DECIMAL(18,2) NOT NULL DEFAULT 0 COMMENT '速算扣除数',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (slab_detail_id),
  UNIQUE KEY uk_hr_tax_slab_detail_level (tenant_id, slab_id, level_no),
  KEY idx_hr_tax_slab_detail_amount (tenant_id, slab_id, from_amount, to_amount)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR个税税率档明细';

CREATE TABLE hr_grievance (
  grievance_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '申诉主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  grievance_no VARCHAR(80) NOT NULL COMMENT '申诉编号',
  employee_id BIGINT(20) NOT NULL COMMENT '申诉人ID',
  employee_name VARCHAR(100) DEFAULT NULL COMMENT '申诉人姓名快照',
  dept_id BIGINT(20) DEFAULT NULL COMMENT '申诉人部门ID',
  grievance_type VARCHAR(30) NOT NULL COMMENT '申诉类型',
  subject VARCHAR(200) NOT NULL COMMENT '申诉标题',
  description TEXT NOT NULL COMMENT '详细描述',
  cause VARCHAR(1000) DEFAULT NULL COMMENT '起因',
  expectation VARCHAR(1000) DEFAULT NULL COMMENT '期望结果',
  against_type VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT '指向类型(USER/DEPT/POLICY/NONE)',
  against_id BIGINT(20) DEFAULT NULL COMMENT '指向对象ID',
  against_name VARCHAR(200) DEFAULT NULL COMMENT '指向对象名称快照',
  related_biz_type VARCHAR(50) DEFAULT NULL COMMENT '关联业务类型',
  related_biz_id BIGINT(20) DEFAULT NULL COMMENT '关联业务ID',
  attachment_url VARCHAR(1000) DEFAULT NULL COMMENT '附件地址',
  priority VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT '优先级(LOW/NORMAL/HIGH/URGENT)',
  status VARCHAR(30) NOT NULL DEFAULT 'SUBMITTED' COMMENT '状态(SUBMITTED/ACCEPTED/INVESTIGATING/RESOLVED/CLOSED/ESCALATED/WITHDRAWN)',
  handler_id BIGINT(20) DEFAULT NULL COMMENT '处理人ID',
  handler_name VARCHAR(100) DEFAULT NULL COMMENT '处理人姓名',
  accept_time DATETIME DEFAULT NULL COMMENT '受理时间',
  resolution_detail TEXT DEFAULT NULL COMMENT '处理结论',
  resolution_date DATE DEFAULT NULL COMMENT '处理日期',
  satisfied_flag TINYINT(1) DEFAULT NULL COMMENT '申诉人是否认可结论',
  escalated_dispute_id BIGINT(20) DEFAULT NULL COMMENT '升级劳动争议ID',
  instance_id VARCHAR(100) DEFAULT NULL COMMENT '审批流实例ID',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删,1=已删)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (grievance_id),
  UNIQUE KEY uk_hr_grievance_no (tenant_id, grievance_no),
  KEY idx_hr_grievance_employee (tenant_id, employee_id),
  KEY idx_hr_grievance_status (tenant_id, status),
  KEY idx_hr_grievance_handler (tenant_id, handler_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR员工申诉';

CREATE TABLE hr_grievance_record (
  record_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '处理轨迹主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  grievance_id BIGINT(20) NOT NULL COMMENT '申诉ID',
  record_type VARCHAR(30) NOT NULL COMMENT '记录类型(COMMENT/STATUS_CHANGE/ASSIGN/ESCALATE)',
  operator_id BIGINT(20) DEFAULT NULL COMMENT '操作人ID',
  operator_name VARCHAR(100) DEFAULT NULL COMMENT '操作人姓名',
  operator_role VARCHAR(20) NOT NULL COMMENT '操作人角色(EMPLOYEE/HR/MANAGER)',
  content TEXT DEFAULT NULL COMMENT '处理内容',
  attachment_url VARCHAR(1000) DEFAULT NULL COMMENT '附件地址',
  visible_to_employee_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '员工是否可见',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (record_id),
  KEY idx_hr_grievance_record_grievance (tenant_id, grievance_id, create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR员工申诉处理轨迹';

DROP TABLE IF EXISTS hr_overtime_type;
CREATE TABLE hr_overtime_type (
  type_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '加班类型主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  type_code VARCHAR(50) NOT NULL COMMENT '类型编码',
  type_name VARCHAR(100) NOT NULL COMMENT '类型名称',
  applicable_day_type VARCHAR(20) NOT NULL COMMENT '适用加班日类型(WORKDAY/REST_DAY/HOLIDAY)',
  rate_multiplier DECIMAL(4,2) DEFAULT NULL COMMENT '加班费倍率，NULL表示未核定',
  salary_component_id BIGINT(20) DEFAULT NULL COMMENT '加班费对应薪资项目ID',
  compensatory_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否允许转调休(0=否,1=是)',
  compensatory_ratio DECIMAL(4,2) DEFAULT NULL COMMENT '每小时加班转入的调休小时比例，NULL表示未核定',
  compensatory_leave_type_id BIGINT(20) DEFAULT NULL COMMENT '调休转入目标假种ID，首期须为HOUR',
  max_hours_per_month DECIMAL(8,2) DEFAULT NULL COMMENT '自然月加班小时上限，NULL表示未核定',
  max_hours_per_day DECIMAL(8,2) DEFAULT NULL COMMENT '自然日加班小时上限，NULL表示未核定',
  need_approval_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否需要审批，首期仅允许1',
  status TINYINT(1) NOT NULL DEFAULT 0 COMMENT '启用状态(0=停用待核定,1=启用)',
  remark VARCHAR(500) DEFAULT NULL COMMENT '规则核定说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志(0=未删除,1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (type_id),
  UNIQUE KEY uk_hr_ot_type_code (tenant_id, type_code),
  UNIQUE KEY uk_hr_ot_type_day (tenant_id, applicable_day_type),
  KEY idx_hr_ot_type_component (tenant_id, salary_component_id),
  KEY idx_hr_ot_type_leave (tenant_id, compensatory_leave_type_id),
  CONSTRAINT ck_hr_ot_type_day CHECK (applicable_day_type IN ('WORKDAY','REST_DAY','HOLIDAY')),
  CONSTRAINT ck_hr_ot_type_rate CHECK (rate_multiplier IS NULL OR rate_multiplier > 0),
  CONSTRAINT ck_hr_ot_type_ratio CHECK (compensatory_ratio IS NULL OR compensatory_ratio > 0),
  CONSTRAINT ck_hr_ot_type_limits CHECK ((max_hours_per_day IS NULL OR max_hours_per_day > 0) AND (max_hours_per_month IS NULL OR max_hours_per_month > 0)),
  CONSTRAINT ck_hr_ot_type_flags CHECK (compensatory_flag IN (0,1) AND need_approval_flag = 1 AND status IN (0,1) AND deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR加班类型及核定规则';

DROP TABLE IF EXISTS hr_overtime_request;
CREATE TABLE hr_overtime_request (
  request_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '加班申请主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '服务端生成的加班申请单号',
  employee_id BIGINT(20) NOT NULL COMMENT '申请员工ID',
  dept_id BIGINT(20) NOT NULL COMMENT '申请时部门ID快照',
  work_date DATE NOT NULL COMMENT '加班自然日期，用于倍率及日月上限',
  attendance_date DATE DEFAULT NULL COMMENT 'D考勤归属日，跨夜按班次开始日',
  shift_id BIGINT(20) DEFAULT NULL COMMENT '核算依据班次ID',
  rule_id BIGINT(20) DEFAULT NULL COMMENT '核算依据考勤规则ID',
  calendar_id BIGINT(20) DEFAULT NULL COMMENT '核算依据日历ID',
  date_type VARCHAR(20) DEFAULT NULL COMMENT '日历原始日期类型(WORKDAY/REST/HOLIDAY)',
  triple_pay_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '日历三倍工资日标记快照',
  start_time DATETIME NOT NULL COMMENT '申请开始时间，业务时区Asia/Shanghai',
  end_time DATETIME NOT NULL COMMENT '申请结束时间，不包含此时点',
  requested_minutes INT NOT NULL COMMENT '申请时段分钟数，由服务端计算',
  actual_minutes INT DEFAULT NULL COMMENT '扣休息及阈值后的实际可核定加班分钟',
  actual_hours DECIMAL(8,2) DEFAULT NULL COMMENT '实际加班小时展示值，由实际分钟除60舍入',
  approved_minutes INT DEFAULT NULL COMMENT 'HR核定加班分钟',
  approved_hours DECIMAL(8,2) DEFAULT NULL COMMENT '核定加班小时展示值，由核定分钟除60舍入',
  overtime_type_id BIGINT(20) NOT NULL COMMENT '关联加班类型主键ID',
  settle_mode VARCHAR(20) NOT NULL COMMENT '结算方式(PAY加班费/COMPENSATORY调休)',
  rate_multiplier DECIMAL(4,2) DEFAULT NULL COMMENT '提交时加班费倍率快照',
  compensatory_ratio DECIMAL(4,2) DEFAULT NULL COMMENT '提交时调休比例快照',
  salary_component_id BIGINT(20) DEFAULT NULL COMMENT '加班薪资项目ID快照',
  leave_type_id BIGINT(20) DEFAULT NULL COMMENT '调休目标假种ID快照',
  leave_period_id BIGINT(20) DEFAULT NULL COMMENT '调休转入的假期周期ID',
  compensatory_quantity DECIMAL(8,2) DEFAULT NULL COMMENT '实际转入调休小时，按原周期累计差额计算，可为0',
  payroll_period_id BIGINT(20) DEFAULT NULL COMMENT '财务核定的目标工资周期ID',
  currency VARCHAR(10) NOT NULL DEFAULT 'CNY' COMMENT '币种，首期沿现有CNY工资链路',
  hourly_rate_cipher VARCHAR(255) DEFAULT NULL COMMENT '已核定基础时薪密文，解密后按DECIMAL(18,2)计算',
  settlement_amount_cipher VARCHAR(255) DEFAULT NULL COMMENT '加班费金额密文，解密后按DECIMAL(18,2)计算',
  reason VARCHAR(800) NOT NULL DEFAULT '' COMMENT '申请事由',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/SUBMITTED/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED)',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '当前正式工作流实例ID',
  reviewed_by BIGINT(20) DEFAULT NULL COMMENT '工时核定用户ID',
  reviewed_time DATETIME DEFAULT NULL COMMENT '工时核定时间',
  review_note VARCHAR(500) DEFAULT NULL COMMENT '工时核定依据',
  priced_by BIGINT(20) DEFAULT NULL COMMENT '财务核价用户ID',
  priced_time DATETIME DEFAULT NULL COMMENT '财务核价时间',
  price_note VARCHAR(500) DEFAULT NULL COMMENT '核价依据说明，不存口令或银行信息',
  calculation_snapshot JSON DEFAULT NULL COMMENT '服务端生成的打卡、区间、休息、阈值及版本依据，不存工资明文',
  policy_snapshot JSON DEFAULT NULL COMMENT '服务端生成的类型、日历及规则效果快照，不存工资明文',
  settlement_status VARCHAR(20) NOT NULL DEFAULT 'NOT_READY' COMMENT '结算状态(NOT_READY/PENDING/SETTLED/FAILED/NEEDS_RESOLUTION/CORRECTION_PENDING/REJECTED)',
  settled_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否完成结算，含累计差额为0的调休结算',
  settle_time DATETIME DEFAULT NULL COMMENT '结算成功时间',
  comp_change_id BIGINT(20) DEFAULT NULL COMMENT '生成的薪资变动ID，PAY使用',
  leave_ledger_id BIGINT(20) DEFAULT NULL COMMENT '生成的假期台账ID，COMPENSATORY使用',
  payroll_correction_id BIGINT(20) DEFAULT NULL COMMENT '关账后明确发起的D工资补正ID，与原薪资变动互斥',
  settlement_resolution JSON DEFAULT NULL COMMENT '显式结案或补正的原目标及新目标、原因、经办人和时间，不存金额或密文',
  last_error_code VARCHAR(64) DEFAULT NULL COMMENT '最近结算失败业务码',
  last_error_message VARCHAR(500) DEFAULT NULL COMMENT '脱敏后的最近结算失败说明',
  idempotency_key VARCHAR(64) NOT NULL COMMENT '创建请求幂等键',
  request_digest CHAR(64) NOT NULL COMMENT '初次创建有效载荷SHA256摘要',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (request_id),
  UNIQUE KEY uk_hr_ot_request_no (tenant_id, request_no),
  UNIQUE KEY uk_hr_ot_request_idem (tenant_id, employee_id, idempotency_key),
  UNIQUE KEY uk_hr_ot_request_change (tenant_id, comp_change_id),
  UNIQUE KEY uk_hr_ot_request_ledger (tenant_id, leave_ledger_id),
  UNIQUE KEY uk_hr_ot_request_correction (tenant_id, payroll_correction_id),
  KEY idx_hr_ot_request_emp_date (tenant_id, employee_id, work_date, status),
  KEY idx_hr_ot_request_att_date (tenant_id, employee_id, attendance_date),
  KEY idx_hr_ot_request_dept (tenant_id, dept_id, status, work_date),
  KEY idx_hr_ot_request_period (tenant_id, payroll_period_id, settlement_status),
  KEY idx_hr_ot_request_settle (tenant_id, settlement_status, update_time),
  KEY idx_hr_ot_request_leave_sum (tenant_id, employee_id, leave_type_id, leave_period_id, settle_mode, settlement_status),
  CONSTRAINT ck_hr_ot_request_time CHECK (end_time > start_time AND requested_minutes > 0),
  CONSTRAINT ck_hr_ot_request_minutes CHECK ((actual_minutes IS NULL OR actual_minutes >= 0) AND (approved_minutes IS NULL OR (approved_minutes > 0 AND actual_minutes IS NOT NULL AND approved_minutes <= actual_minutes))),
  CONSTRAINT ck_hr_ot_request_mode CHECK (settle_mode IN ('PAY','COMPENSATORY')),
  CONSTRAINT ck_hr_ot_request_status CHECK (status IN ('DRAFT','SUBMITTED','PENDING','APPROVING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT ck_hr_ot_request_settle CHECK (settlement_status IN ('NOT_READY','PENDING','SETTLED','FAILED','NEEDS_RESOLUTION','CORRECTION_PENDING','REJECTED') AND settled_flag IN (0,1)),
  CONSTRAINT ck_hr_ot_request_result CHECK ((settled_flag = 0 AND settlement_status <> 'SETTLED' AND settle_time IS NULL) OR (settled_flag = 1 AND settlement_status = 'SETTLED' AND settle_time IS NOT NULL)),
  CONSTRAINT ck_hr_ot_request_source CHECK ((comp_change_id IS NULL OR leave_ledger_id IS NULL) AND (comp_change_id IS NULL OR payroll_correction_id IS NULL) AND (leave_ledger_id IS NULL OR payroll_correction_id IS NULL)),
  CONSTRAINT ck_hr_ot_request_quantity CHECK (compensatory_quantity IS NULL OR compensatory_quantity >= 0),
  CONSTRAINT ck_hr_ot_request_correction CHECK (settlement_status <> 'CORRECTION_PENDING' OR (settle_mode = 'PAY' AND payroll_correction_id IS NOT NULL)),
  CONSTRAINT ck_hr_ot_request_flags CHECK (triple_pay_flag IN (0,1) AND deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR独立加班申请及结算结果';

DROP TABLE IF EXISTS hr_shift_request;
CREATE TABLE hr_shift_request (
  request_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '调班申请主键ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  request_no VARCHAR(60) NOT NULL COMMENT '服务端生成的调班单号',
  employee_id BIGINT(20) NOT NULL COMMENT '申请员工ID',
  dept_id BIGINT(20) NOT NULL COMMENT '申请时部门ID快照',
  request_mode VARCHAR(20) NOT NULL DEFAULT 'SINGLE' COMMENT '调班方式(SINGLE本人换班/SWAP双方互换)',
  from_shift_id BIGINT(20) NOT NULL COMMENT '申请人原有效班次ID',
  to_shift_id BIGINT(20) NOT NULL COMMENT '申请人目标班次ID，互换时为对方原班次',
  from_rule_id BIGINT(20) DEFAULT NULL COMMENT '申请人原考勤规则ID快照',
  to_rule_id BIGINT(20) DEFAULT NULL COMMENT '目标班次配套规则ID快照',
  from_date DATE NOT NULL COMMENT '原考勤日期，首期单日',
  to_date DATE NOT NULL COMMENT '目标考勤日期，首期等于原日期',
  swap_employee_id BIGINT(20) DEFAULT NULL COMMENT '互换员工ID，本人换班为空',
  peer_acceptance_status VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT '对方同意状态(NONE/PENDING/ACCEPTED/DECLINED)',
  peer_responded_by BIGINT(20) DEFAULT NULL COMMENT '对方本人回应用户ID',
  peer_responded_time DATETIME DEFAULT NULL COMMENT '对方回应时间',
  peer_response_note VARCHAR(500) DEFAULT NULL COMMENT '对方回应说明',
  reason VARCHAR(800) NOT NULL DEFAULT '' COMMENT '调班事由',
  approver_id BIGINT(20) DEFAULT NULL COMMENT '最终审批用户ID，由可信审批结果记录',
  status VARCHAR(30) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态(DRAFT/WAITING_ACCEPTANCE/PENDING/APPROVING/APPROVED/REJECTED/CANCELLED)',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '正式工作流实例ID',
  minimum_rest_minutes INT DEFAULT NULL COMMENT 'HR核定的相邻班次最短休息分钟快照',
  schedule_snapshot JSON DEFAULT NULL COMMENT '两方原排班、规则、相邻班次与同意内容的服务端快照',
  application_status VARCHAR(20) NOT NULL DEFAULT 'NOT_READY' COMMENT '排班应用状态(NOT_READY/PENDING/APPLIED/FAILED)',
  applied_time DATETIME DEFAULT NULL COMMENT '全部受影响排班成功应用时间',
  last_error_code VARCHAR(64) DEFAULT NULL COMMENT '最近排班应用失败业务码',
  last_error_message VARCHAR(500) DEFAULT NULL COMMENT '脱敏后的排班应用失败说明',
  idempotency_key VARCHAR(64) NOT NULL COMMENT '创建请求幂等键',
  request_digest CHAR(64) NOT NULL COMMENT '初次创建有效载荷SHA256摘要',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除标志，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) NOT NULL DEFAULT '' COMMENT '更新者',
  update_time DATETIME DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (request_id),
  UNIQUE KEY uk_hr_shift_request_no (tenant_id, request_no),
  UNIQUE KEY uk_hr_shift_request_idem (tenant_id, employee_id, idempotency_key),
  KEY idx_hr_shift_request_emp_date (tenant_id, employee_id, from_date, status),
  KEY idx_hr_shift_request_peer (tenant_id, swap_employee_id, from_date, peer_acceptance_status),
  KEY idx_hr_shift_request_dept (tenant_id, dept_id, status),
  KEY idx_hr_shift_request_apply (tenant_id, application_status, update_time),
  CONSTRAINT ck_hr_shift_request_date CHECK (from_date = to_date),
  CONSTRAINT ck_hr_shift_request_shifts CHECK (from_shift_id <> to_shift_id),
  CONSTRAINT ck_hr_shift_request_mode CHECK ((request_mode = 'SINGLE' AND swap_employee_id IS NULL) OR (request_mode = 'SWAP' AND swap_employee_id IS NOT NULL AND swap_employee_id <> employee_id)),
  CONSTRAINT ck_hr_shift_request_peer CHECK (peer_acceptance_status IN ('NONE','PENDING','ACCEPTED','DECLINED')),
  CONSTRAINT ck_hr_shift_request_status CHECK (status IN ('DRAFT','WAITING_ACCEPTANCE','PENDING','APPROVING','APPROVED','REJECTED','CANCELLED')),
  CONSTRAINT ck_hr_shift_request_apply CHECK (application_status IN ('NOT_READY','PENDING','APPLIED','FAILED')),
  CONSTRAINT ck_hr_shift_request_rest CHECK (minimum_rest_minutes IS NULL OR minimum_rest_minutes >= 0),
  CONSTRAINT ck_hr_shift_request_deleted CHECK (deleted IN (0,1))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='HR调班申请及双方同意记录';

DROP TABLE IF EXISTS hr_skill;
CREATE TABLE hr_skill (
  skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '技能ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  skill_code VARCHAR(64) NOT NULL COMMENT '技能编码',
  skill_name VARCHAR(100) NOT NULL COMMENT '技能名称',
  skill_category VARCHAR(100) DEFAULT NULL COMMENT '技能分类',
  description VARCHAR(1000) DEFAULT NULL COMMENT '技能说明',
  level_definition JSON NOT NULL COMMENT '一至五级的核定描述',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或ACTIVE或DISABLED',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (skill_id),
  UNIQUE KEY uk_skill_code (tenant_id, skill_code)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='技能主数据';

DROP TABLE IF EXISTS hr_position_skill;
CREATE TABLE hr_position_skill (
  position_skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '岗位技能要求ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  position_id BIGINT(20) NOT NULL COMMENT '岗位ID',
  skill_id BIGINT(20) NOT NULL COMMENT '技能ID',
  required_level TINYINT NOT NULL COMMENT '要求等级一至五',
  weight DECIMAL(6,4) NOT NULL COMMENT '权重零至一',
  mandatory_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '一为必备零为加分',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (position_skill_id),
  UNIQUE KEY uk_position_skill (tenant_id, position_id, skill_id),
  CONSTRAINT chk_position_skill CHECK (required_level BETWEEN 1 AND 5 AND weight BETWEEN 0 AND 1)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='岗位技能等级与权重要求';

DROP TABLE IF EXISTS hr_employee_skill;
CREATE TABLE hr_employee_skill (
  employee_skill_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '技能评估记录ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  skill_id BIGINT(20) NOT NULL COMMENT '技能ID',
  current_level TINYINT NOT NULL COMMENT '本次证据支持的一至五级',
  assessed_by BIGINT(20) DEFAULT NULL COMMENT '授权评估人用户ID，自动证据为空',
  assess_time DATETIME DEFAULT NULL COMMENT '评估生效时间',
  evidence_type VARCHAR(30) NOT NULL COMMENT 'TRAINING或EXAM或CERTIFICATE或MANAGER_REVIEW或SELF',
  evidence_biz_id VARCHAR(64) DEFAULT NULL COMMENT '真实证据业务ID',
  evidence_key VARCHAR(128) NOT NULL COMMENT '证据事件或人工请求唯一键',
  evidence_snapshot JSON DEFAULT NULL COMMENT '已核验证据快照',
  assessment_status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或APPROVED或REJECTED或REVOKED或RECORDED',
  current_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否当前生效评估，同员工技能最多一条',
  current_skill_id BIGINT(20) GENERATED ALWAYS AS (CASE WHEN current_flag = 1 THEN skill_id ELSE NULL END) STORED COMMENT '当前技能唯一约束键',
  expire_date DATE DEFAULT NULL COMMENT '有效期，含当日',
  remark VARCHAR(500) DEFAULT NULL COMMENT '评估说明',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (employee_skill_id),
  UNIQUE KEY uk_employee_skill_evidence (tenant_id, employee_id, skill_id, evidence_key),
  UNIQUE KEY uk_employee_skill_current (tenant_id, employee_id, current_skill_id),
  KEY idx_employee_skill_history (tenant_id, employee_id, skill_id, assess_time),
  CONSTRAINT chk_employee_skill_level CHECK (current_level BETWEEN 1 AND 5),
  CONSTRAINT chk_employee_skill_current CHECK (current_flag = 0 OR assessment_status = 'APPROVED')
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工技能评估证据及当前结果';

DROP TABLE IF EXISTS hr_appraisal_cycle;
CREATE TABLE hr_appraisal_cycle (
  cycle_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '绩效周期ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_name VARCHAR(100) NOT NULL COMMENT '周期名称',
  cycle_type VARCHAR(20) NOT NULL COMMENT 'MONTHLY或QUARTERLY或HALF_YEARLY或YEARLY',
  start_date DATE NOT NULL COMMENT '开始日期',
  end_date DATE NOT NULL COMMENT '结束日期',
  scope_dept_ids JSON DEFAULT NULL COMMENT '部门范围ID集合',
  scope_position_ids JSON DEFAULT NULL COMMENT '岗位范围ID集合',
  scope_job_level_ids JSON DEFAULT NULL COMMENT '职级范围ID集合',
  evaluation_method VARCHAR(20) NOT NULL COMMENT 'KRA_WEIGHTED或GOAL_BASED或MIXED',
  final_score_mode VARCHAR(20) NOT NULL COMMENT 'WEIGHTED_AVG或FORMULA',
  final_score_formula VARCHAR(500) DEFAULT NULL COMMENT '仅允许白名单变量及四则运算',
  score_config JSON NOT NULL COMMENT '混合权重、评分上下界及分布舍入规则',
  frozen_config JSON DEFAULT NULL COMMENT '启动时冻结的范围、公式和权重',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或ONGOING或SCORING或CALIBRATING或COMPLETED',
  completed_time DATETIME DEFAULT NULL COMMENT '完成冻结时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除，仅草稿允许删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (cycle_id),
  KEY idx_appraisal_cycle (tenant_id, status, start_date, end_date),
  CONSTRAINT chk_appraisal_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_appraisal_formula CHECK (final_score_mode <> 'FORMULA' OR final_score_formula IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效周期与评分配置';

DROP TABLE IF EXISTS hr_appraisal_kra;
CREATE TABLE hr_appraisal_kra (
  kra_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '关键成果领域ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_id BIGINT(20) NOT NULL COMMENT '绩效周期ID',
  kra_name VARCHAR(100) NOT NULL COMMENT '领域名称',
  weight DECIMAL(6,4) NOT NULL COMMENT '权重零至一',
  sort_no INT NOT NULL DEFAULT 0 COMMENT '排序',
  description VARCHAR(500) DEFAULT NULL COMMENT '说明',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (kra_id),
  UNIQUE KEY uk_appraisal_kra (tenant_id, cycle_id, kra_name),
  CONSTRAINT chk_appraisal_kra_weight CHECK (weight BETWEEN 0 AND 1)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效周期KRA权重';

DROP TABLE IF EXISTS hr_appraisal_result;
CREATE TABLE hr_appraisal_result (
  appraisal_result_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '周期参评及最终结果ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  cycle_id BIGINT(20) NOT NULL COMMENT '周期ID',
  employee_id BIGINT(20) NOT NULL COMMENT '参评员工ID',
  scope_snapshot JSON NOT NULL COMMENT '启动时员工所属部门岗位职级快照',
  input_scores JSON DEFAULT NULL COMMENT '目标、KRA和360评分的版本与输入值',
  calculated_score DECIMAL(10,4) DEFAULT NULL COMMENT '按冻结公式计算的原始总分',
  final_score DECIMAL(10,4) DEFAULT NULL COMMENT '经授权校准的最终总分',
  grade VARCHAR(30) DEFAULT NULL COMMENT '最终等级',
  calibration_reason VARCHAR(1000) DEFAULT NULL COMMENT '校准原因，原始分数不覆盖',
  calibrated_by BIGINT(20) DEFAULT NULL COMMENT '校准人',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或SCORED或CALIBRATED或COMPLETED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (appraisal_result_id),
  UNIQUE KEY uk_appraisal_result (tenant_id, cycle_id, employee_id),
  KEY idx_appraisal_result_employee (tenant_id, employee_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='冻结参评范围及周期最终得分';

DROP TABLE IF EXISTS hr_employee_advance;
CREATE TABLE hr_employee_advance (
  advance_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '员工借款ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  advance_no VARCHAR(64) NOT NULL COMMENT '借款单号',
  employee_id BIGINT(20) NOT NULL COMMENT '借款员工ID',
  advance_amount DECIMAL(14,2) NOT NULL COMMENT '申请借款金额',
  purpose VARCHAR(500) NOT NULL COMMENT '用途',
  apply_date DATE NOT NULL COMMENT '申请日期',
  repay_mode VARCHAR(20) NOT NULL COMMENT 'SALARY_DEDUCT或LUMP_SUM',
  repay_start_month CHAR(7) DEFAULT NULL COMMENT '扣还开始月份yyyy-MM',
  repay_months INT DEFAULT NULL COMMENT '计划扣还月数',
  monthly_deduct_amount DECIMAL(14,2) DEFAULT NULL COMMENT '计划月扣金额，末期按余额收尾',
  repaid_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '已入账还款金额',
  outstanding_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '实际已放款的剩余本金',
  reserved_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '算薪或离职结算预约扣款额',
  written_off_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '经过授权核销金额',
  status VARCHAR(20) NOT NULL DEFAULT 'APPLYING' COMMENT 'APPLYING或APPROVED或PAID或REPAYING或CLEARED或WRITTEN_OFF',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或SUBMITTED或APPROVED或REJECTED或CANCELLED',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '审批实例ID',
  payment_request_id BIGINT(20) DEFAULT NULL COMMENT 'OA放款申请ID',
  paid_time DATETIME DEFAULT NULL COMMENT '实际放款确认时间',
  rule_snapshot JSON DEFAULT NULL COMMENT '额度、工资项目及扣还规则快照',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (advance_id),
  UNIQUE KEY uk_advance_no (tenant_id, advance_no),
  UNIQUE KEY uk_advance_payment (tenant_id, payment_request_id),
  KEY idx_advance_employee (tenant_id, employee_id, status),
  CONSTRAINT chk_advance_balance CHECK (advance_amount > 0 AND repaid_amount >= 0 AND outstanding_amount >= 0 AND reserved_amount >= 0 AND reserved_amount <= outstanding_amount AND written_off_amount >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工借款及实际余额';

DROP TABLE IF EXISTS hr_advance_repayment;
CREATE TABLE hr_advance_repayment (
  repayment_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '还款预约或入账ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  advance_id BIGINT(20) NOT NULL COMMENT '借款ID',
  repay_month CHAR(7) DEFAULT NULL COMMENT '扣还月份yyyy-MM',
  repay_amount DECIMAL(14,2) NOT NULL COMMENT '金额，冲正时使用负数',
  salary_slip_id BIGINT(20) DEFAULT NULL COMMENT '工资单ID',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '离职结算单ID',
  repay_type VARCHAR(20) NOT NULL COMMENT 'SALARY或MANUAL或SETTLEMENT',
  status VARCHAR(20) NOT NULL DEFAULT 'RESERVED' COMMENT 'RESERVED或POSTED或RELEASED或REVERSED',
  source_event_key VARCHAR(128) NOT NULL COMMENT '业务事件唯一键',
  reversal_of_id BIGINT(20) DEFAULT NULL COMMENT '原入账流水ID',
  proof_file_id BIGINT(20) DEFAULT NULL COMMENT '人工还款凭据私有文件ID',
  repay_date DATE DEFAULT NULL COMMENT '实际还款日期',
  posted_time DATETIME DEFAULT NULL COMMENT '入账时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '还款或冲正原因',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (repayment_id),
  UNIQUE KEY uk_advance_repayment_event (tenant_id, source_event_key),
  UNIQUE KEY uk_advance_repayment_reversal (tenant_id, reversal_of_id),
  KEY idx_advance_repayment (tenant_id, advance_id, status),
  KEY idx_advance_repayment_slip (tenant_id, salary_slip_id, status),
  CONSTRAINT chk_repayment_sign CHECK ((reversal_of_id IS NULL AND repay_amount > 0) OR (reversal_of_id IS NOT NULL AND repay_amount < 0))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='借款扣还预约及不可覆盖的入账流水';

DROP TABLE IF EXISTS hr_employee_referral;
DROP TABLE IF EXISTS hr_recruitment_identity;
CREATE TABLE hr_employee_referral (
  referral_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '内部推荐ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  referral_no VARCHAR(64) NOT NULL COMMENT '推荐单号',
  referrer_employee_id BIGINT(20) NOT NULL COMMENT '推荐员工ID',
  referrer_name VARCHAR(100) NOT NULL COMMENT '推荐人姓名快照',
  candidate_name VARCHAR(100) NOT NULL COMMENT '候选人姓名',
  contact_phone VARCHAR(32) DEFAULT NULL COMMENT '候选人规范化手机号码',
  email VARCHAR(254) DEFAULT NULL COMMENT '候选人规范化邮箱',
  current_employer VARCHAR(200) DEFAULT NULL COMMENT '现任公司',
  current_job_title VARCHAR(100) DEFAULT NULL COMMENT '现任职务',
  target_position_id BIGINT(20) NOT NULL COMMENT '目标岗位ID',
  resume_file_id BIGINT(20) NOT NULL COMMENT '简历私有文件ID，不保存可公开直链',
  referral_reason VARCHAR(1000) DEFAULT NULL COMMENT '推荐理由',
  status VARCHAR(20) NOT NULL DEFAULT 'SUBMITTED' COMMENT 'SUBMITTED或SCREENING或INTERVIEWING或OFFERED或HIRED或REJECTED或DUPLICATE',
  candidate_id BIGINT(20) DEFAULT NULL COMMENT '招聘候选人ID',
  hire_date DATE DEFAULT NULL COMMENT '核实入职日期',
  bonus_applicable_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否适用已核定奖金',
  bonus_amount DECIMAL(14,2) DEFAULT NULL COMMENT '核定推荐奖金',
  bonus_status VARCHAR(20) NOT NULL DEFAULT 'NOT_APPLICABLE' COMMENT 'NOT_APPLICABLE或PENDING或APPROVED或PAID',
  bonus_pay_date DATE DEFAULT NULL COMMENT '实际工资发放日期',
  bonus_condition_snapshot JSON DEFAULT NULL COMMENT '奖金条件与入职证据快照',
  bonus_condition_remark VARCHAR(500) DEFAULT NULL COMMENT '奖金条件说明',
  comp_change_id BIGINT(20) DEFAULT NULL COMMENT '薪资变动项ID',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '奖金审批实例ID',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (referral_id),
  UNIQUE KEY uk_referral_no (tenant_id, referral_no),
  UNIQUE KEY uk_referral_candidate (tenant_id, candidate_id),
  KEY idx_referral_owner (tenant_id, referrer_employee_id, status),
  CONSTRAINT chk_referral_contact CHECK (contact_phone IS NOT NULL OR email IS NOT NULL),
  CONSTRAINT chk_referral_bonus CHECK (bonus_amount IS NULL OR bonus_amount >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工推荐与奖金进展';

CREATE TABLE hr_recruitment_identity (
  identity_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '招聘身份占位ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  identity_type VARCHAR(10) NOT NULL COMMENT 'PHONE或EMAIL',
  identity_hash CHAR(64) NOT NULL COMMENT '带租户及类型的规范化联系方式SHA256',
  referral_id BIGINT(20) DEFAULT NULL COMMENT '首次推荐ID',
  candidate_id BIGINT(20) DEFAULT NULL COMMENT '候选人ID',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (identity_id),
  UNIQUE KEY uk_recruitment_identity (tenant_id, identity_type, identity_hash),
  KEY idx_recruitment_identity_candidate (tenant_id, candidate_id),
  CONSTRAINT chk_recruitment_identity_owner CHECK (referral_id IS NOT NULL OR candidate_id IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='推荐与候选人共用的联系方式并发去重占位';

DROP TABLE IF EXISTS hr_severance_rule;
CREATE TABLE hr_severance_rule (
  rule_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  rule_code VARCHAR(64) NOT NULL COMMENT '规则编码',
  rule_name VARCHAR(100) NOT NULL COMMENT '规则名称',
  effective_from DATE NOT NULL COMMENT '生效日期',
  effective_to DATE DEFAULT NULL COMMENT '失效日期，含当日',
  salary_component_ids JSON NOT NULL COMMENT '月工资基数项目ID白名单',
  averaging_months INT NOT NULL COMMENT '基数取样月数',
  service_rounding VARCHAR(30) NOT NULL COMMENT 'ACTUAL_MONTHS或FLOOR_YEAR或CEIL_HALF_YEAR',
  social_monthly_salary DECIMAL(14,2) DEFAULT NULL COMMENT '核定社会平均月工资',
  base_cap_multiplier DECIMAL(8,4) DEFAULT NULL COMMENT '核定月基数上限倍数',
  max_compensation_months DECIMAL(8,4) DEFAULT NULL COMMENT '核定补偿月数上限',
  notice_months DECIMAL(8,4) NOT NULL DEFAULT 0 COMMENT '经核定的额外通知补偿月数',
  leave_daily_divisor DECIMAL(8,4) DEFAULT NULL COMMENT '年假折现月工资除数',
  leave_hours_per_day DECIMAL(8,4) DEFAULT NULL COMMENT '小时假折现的每日小时数',
  leave_cash_multiplier DECIMAL(8,4) DEFAULT NULL COMMENT '经核定的年假折现系数',
  policy_file_id BIGINT(20) DEFAULT NULL COMMENT '核定政策私有文件ID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '政策核定人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '核定时间',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或DISABLED',
  remark VARCHAR(500) DEFAULT NULL COMMENT '核定说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (rule_id),
  UNIQUE KEY uk_severance_code (tenant_id, rule_code),
  KEY idx_severance_effective (tenant_id, status, effective_from, effective_to),
  CONSTRAINT chk_severance_dates CHECK (effective_to IS NULL OR effective_to >= effective_from),
  CONSTRAINT chk_severance_average CHECK (averaging_months BETWEEN 1 AND 120),
  CONSTRAINT chk_severance_caps CHECK ((social_monthly_salary IS NULL OR social_monthly_salary > 0) AND (base_cap_multiplier IS NULL OR base_cap_multiplier > 0) AND (max_compensation_months IS NULL OR max_compensation_months > 0) AND notice_months >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='核定后方可正式使用的离职补偿规则';

DROP TABLE IF EXISTS hr_severance_rule_slab;
CREATE TABLE hr_severance_rule_slab (
  slab_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '工龄分档ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  rule_id BIGINT(20) NOT NULL COMMENT '规则ID',
  sort_no INT NOT NULL COMMENT '档位顺序',
  min_service_years DECIMAL(8,4) NOT NULL COMMENT '含下限的核定工龄',
  max_service_years DECIMAL(8,4) DEFAULT NULL COMMENT '不含上限的核定工龄，空为不限',
  calculation_mode VARCHAR(20) NOT NULL COMMENT 'FIXED或PER_YEAR',
  compensation_months DECIMAL(8,4) NOT NULL COMMENT '固定月数或每工龄年对应月数',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (slab_id),
  UNIQUE KEY uk_severance_slab (tenant_id, rule_id, sort_no),
  CONSTRAINT chk_severance_slab CHECK (min_service_years >= 0 AND (max_service_years IS NULL OR max_service_years > min_service_years) AND compensation_months >= 0),
  CONSTRAINT chk_severance_slab_mode CHECK (calculation_mode IN ('FIXED','PER_YEAR'))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='经济补偿工龄分档';

DROP TABLE IF EXISTS hr_final_settlement;
CREATE TABLE hr_final_settlement (
  settlement_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '结算单ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  settlement_no VARCHAR(64) NOT NULL COMMENT '结算单号',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  lifecycle_application_id BIGINT(20) NOT NULL COMMENT '离职生命周期申请ID',
  settlement_kind VARCHAR(20) NOT NULL DEFAULT 'NORMAL' COMMENT 'NORMAL或REVERSAL',
  reversal_of_id BIGINT(20) DEFAULT NULL COMMENT '冲正的原结算单ID',
  superseded_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '原单已被完整冲正入账后才可置一',
  active_lifecycle_id BIGINT(20) GENERATED ALWAYS AS (CASE WHEN settlement_kind = 'NORMAL' AND superseded_flag = 0 THEN lifecycle_application_id ELSE NULL END) STORED COMMENT '防止一个离职申请重复形成有效结算',
  join_date DATE NOT NULL COMMENT '入职日期快照',
  relieving_date DATE NOT NULL COMMENT '离职日期快照',
  work_years DECIMAL(5,2) NOT NULL DEFAULT 0 COMMENT '展示工龄，计算使用规则快照中未舍入值',
  rule_id BIGINT(20) DEFAULT NULL COMMENT '经济补偿规则ID',
  calculation_snapshot JSON DEFAULT NULL COMMENT '来源版本、未舍入工龄、规则、单价和计算明细快照',
  total_payable DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应付合计',
  total_receivable DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应收合计',
  asset_recovery_cost DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '核定资产损失合计',
  severance_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '经济补偿合计',
  net_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '应付净额，负值为应收员工',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或PAID或CLOSED',
  approval_status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或SUBMITTED或APPROVED或REJECTED或CANCELLED',
  instance_id VARCHAR(64) DEFAULT NULL COMMENT '审批实例ID',
  payment_request_id BIGINT(20) DEFAULT NULL COMMENT 'OA付款申请ID',
  settlement_proof_file_id BIGINT(20) DEFAULT NULL COMMENT '收付款凭据私有文件ID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '结算确认人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '确认时间',
  paid_time DATETIME DEFAULT NULL COMMENT '实际收付完成时间',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注或冲正原因',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (settlement_id),
  UNIQUE KEY uk_settlement_no (tenant_id, settlement_no),
  UNIQUE KEY uk_settlement_reversal (tenant_id, reversal_of_id),
  UNIQUE KEY uk_settlement_active (tenant_id, active_lifecycle_id),
  KEY idx_settlement_employee (tenant_id, employee_id, status),
  KEY idx_settlement_lifecycle (tenant_id, lifecycle_application_id),
  CONSTRAINT chk_settlement_kind CHECK ((settlement_kind = 'NORMAL' AND reversal_of_id IS NULL) OR (settlement_kind = 'REVERSAL' AND reversal_of_id IS NOT NULL)),
  CONSTRAINT chk_settlement_net CHECK (net_amount = total_payable + severance_amount - total_receivable - asset_recovery_cost)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职结算及冲正凭证';

DROP TABLE IF EXISTS hr_final_settlement_item;
CREATE TABLE hr_final_settlement_item (
  item_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '结算明细ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  settlement_id BIGINT(20) NOT NULL COMMENT '结算单ID',
  item_type VARCHAR(20) NOT NULL COMMENT 'PAYABLE或RECEIVABLE或ASSET或SEVERANCE',
  item_name VARCHAR(200) NOT NULL COMMENT '明细名称',
  source_biz_type VARCHAR(50) NOT NULL COMMENT '来源业务类型',
  source_biz_id VARCHAR(64) NOT NULL COMMENT '来源业务ID',
  source_snapshot JSON DEFAULT NULL COMMENT '来源金额、数量单位、版本及资产归还情况',
  amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '金额，冲正单保留有符号反向数',
  confirmed_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '来源及金额是否已核定',
  source_posted_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '来源账本是否实际入账',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_settlement_item_source (tenant_id, settlement_id, source_biz_type, source_biz_id),
  KEY idx_settlement_source (tenant_id, source_biz_type, source_biz_id),
  CONSTRAINT chk_settlement_item_type CHECK (item_type IN ('PAYABLE','RECEIVABLE','ASSET','SEVERANCE'))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职结算来源与金额快照';

DROP TABLE IF EXISTS hr_training_recovery;
CREATE TABLE hr_training_recovery (
  recovery_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '培训追偿核定ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  enrollment_id BIGINT(20) NOT NULL COMMENT '真实培训报名ID',
  agreement_file_id BIGINT(20) NOT NULL COMMENT '培训协议私有文件ID',
  assessed_amount DECIMAL(14,2) NOT NULL COMMENT 'HR或法务核定的可追偿金额',
  collected_amount DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '已实际收回金额',
  assessment_reason VARCHAR(1000) NOT NULL COMMENT '核定依据，不自动将培训费用视为违约金',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED或CLEARED或VOID',
  confirmed_by BIGINT(20) DEFAULT NULL COMMENT '核定人',
  confirmed_time DATETIME DEFAULT NULL COMMENT '核定时间',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '已占用结算单ID',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (recovery_id),
  UNIQUE KEY uk_training_recovery (tenant_id, employee_id, enrollment_id, agreement_file_id),
  KEY idx_training_recovery_employee (tenant_id, employee_id, status),
  CONSTRAINT chk_training_recovery_amount CHECK (assessed_amount >= 0 AND collected_amount >= 0 AND collected_amount <= assessed_amount)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='有协议和核定依据的培训追偿';

DROP TABLE IF EXISTS hr_exit_interview;
CREATE TABLE hr_exit_interview (
  interview_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '离职面谈ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  employee_id BIGINT(20) NOT NULL COMMENT '员工ID',
  lifecycle_application_id BIGINT(20) NOT NULL COMMENT '离职申请ID',
  settlement_id BIGINT(20) DEFAULT NULL COMMENT '结算单ID',
  interviewer_id BIGINT(20) NOT NULL COMMENT '面谈人用户ID',
  interview_time DATETIME NOT NULL COMMENT '面谈时间',
  location VARCHAR(200) DEFAULT NULL COMMENT '地点',
  leaving_reason VARCHAR(1000) DEFAULT NULL COMMENT '离职原因',
  employee_feedback TEXT DEFAULT NULL COMMENT '员工反馈',
  manager_comment TEXT DEFAULT NULL COMMENT '面谈意见，仅授权HR可见',
  improvement_items JSON DEFAULT NULL COMMENT '改进事项',
  attachment_file_ids JSON DEFAULT NULL COMMENT '私有附件ID集合',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或CONFIRMED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (interview_id),
  KEY idx_exit_interview (tenant_id, lifecycle_application_id, interview_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='离职面谈记录';

SET FOREIGN_KEY_CHECKS = 1;

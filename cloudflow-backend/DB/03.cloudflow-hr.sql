-- =========================================================
-- CloudFlow Pro - 人事模块数据库脚本
-- 模块：员工档案、假期额度、休假登记、加班登记
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 员工档案
DROP TABLE IF EXISTS hr_employee;
CREATE TABLE hr_employee (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_no VARCHAR(50) NOT NULL COMMENT '员工编号',
  name VARCHAR(100) NOT NULL COMMENT '姓名',
  gender VARCHAR(20) NOT NULL COMMENT '性别',
  birth_date DATE DEFAULT NULL COMMENT '出生日期',
  phone VARCHAR(20) DEFAULT NULL COMMENT '手机号',
  email VARCHAR(100) DEFAULT NULL COMMENT '邮箱',
  dept_id BIGINT DEFAULT NULL COMMENT '部门ID',
  post_id BIGINT DEFAULT NULL COMMENT '岗位ID',
  employee_type VARCHAR(20) NOT NULL COMMENT '员工类型',
  employee_status VARCHAR(20) NOT NULL COMMENT '员工状态（正式/已离职）',
  hire_date DATE DEFAULT NULL COMMENT '入职日期',
  regular_date DATE DEFAULT NULL COMMENT '转正日期',
  resign_date DATE DEFAULT NULL COMMENT '离职日期',
  user_id BIGINT DEFAULT NULL COMMENT '关联用户ID',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_employee_no (tenant_id, employee_no),
  UNIQUE KEY uk_tenant_user_id (tenant_id, user_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_dept_id (dept_id),
  KEY idx_post_id (post_id),
  KEY idx_employee_status (employee_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工档案表';

DROP TABLE IF EXISTS hr_emergency_contact;
CREATE TABLE hr_emergency_contact (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  contact_name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
  relationship VARCHAR(20) NOT NULL COMMENT '关系',
  phone VARCHAR(20) NOT NULL COMMENT '联系电话',
  address VARCHAR(500) DEFAULT NULL COMMENT '联系地址',
  priority INT NOT NULL DEFAULT 1 COMMENT '优先级',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='紧急联系人表';

-- 假期类型与额度
DROP TABLE IF EXISTS hr_leave_type;
CREATE TABLE hr_leave_type (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  leave_code VARCHAR(50) NOT NULL COMMENT '假期编码',
  leave_name VARCHAR(100) NOT NULL COMMENT '假期名称',
  need_quota TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否需要额度',
  is_paid TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否带薪',
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT '计量单位',
  quota_rule TEXT DEFAULT NULL COMMENT '额度规则JSON',
  expiry_rule TEXT DEFAULT NULL COMMENT '过期规则JSON',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_leave_code (tenant_id, leave_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='假期类型表';

DROP TABLE IF EXISTS hr_leave_quota;
CREATE TABLE hr_leave_quota (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT NOT NULL COMMENT '假期类型ID',
  year INT NOT NULL COMMENT '年份',
  total_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '总额度天数',
  used_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '已用额度天数',
  frozen_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '冻结额度天数',
  available_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '可用额度天数',
  expiry_date DATE DEFAULT NULL COMMENT '过期日期',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_leave_year (tenant_id, employee_id, leave_type_id, year),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='假期额度表';

DROP TABLE IF EXISTS hr_leave_application;
CREATE TABLE hr_leave_application (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  leave_type_id BIGINT NOT NULL COMMENT '假期类型ID',
  start_time DATETIME NOT NULL COMMENT '开始时间',
  end_time DATETIME NOT NULL COMMENT '结束时间',
  duration DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '请假天数',
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT '计量单位',
  period_type VARCHAR(20) NOT NULL DEFAULT 'FULL_DAY' COMMENT '请假时段',
  reason VARCHAR(1000) DEFAULT NULL COMMENT '请假原因',
  quota_allocation TEXT DEFAULT NULL COMMENT '额度扣减明细JSON',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_status (status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='休假申请表';

DROP TABLE IF EXISTS hr_overtime_application;
CREATE TABLE hr_overtime_application (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id BIGINT NOT NULL COMMENT '租户ID',
  application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
  employee_id BIGINT NOT NULL COMMENT '员工ID',
  start_time DATETIME NOT NULL COMMENT '开始时间',
  end_time DATETIME NOT NULL COMMENT '结束时间',
  duration DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '实际小时数',
  overtime_type VARCHAR(20) NOT NULL COMMENT '加班类型',
  reason VARCHAR(1000) DEFAULT NULL COMMENT '加班原因',
  compensation_type VARCHAR(20) NOT NULL DEFAULT 'TIME_OFF' COMMENT '补偿方式',
  compensation_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '补偿小时数',
  quota_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '调休额度天数',
  matched_slots TEXT DEFAULT NULL COMMENT '匹配班段明细JSON',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '申请状态',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_status (status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加班申请表';

SET FOREIGN_KEY_CHECKS = 1;

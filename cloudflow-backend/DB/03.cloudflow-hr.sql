-- =========================================================
-- CloudFlow Pro - HR light schema
-- Scope: employee archive, leave, overtime and leave quota
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Employee archive
DROP TABLE IF EXISTS hr_employee;
CREATE TABLE hr_employee (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  employee_no VARCHAR(50) NOT NULL COMMENT 'employee number',
  name VARCHAR(100) NOT NULL COMMENT 'name',
  gender VARCHAR(20) NOT NULL COMMENT 'MALE/FEMALE',
  birth_date DATE DEFAULT NULL COMMENT 'birth date',
  phone VARCHAR(20) DEFAULT NULL COMMENT 'phone',
  email VARCHAR(100) DEFAULT NULL COMMENT 'email',
  dept_id BIGINT DEFAULT NULL COMMENT 'auth department id',
  post_id BIGINT DEFAULT NULL COMMENT 'auth post id',
  employee_type VARCHAR(20) NOT NULL COMMENT 'FULL_TIME/PART_TIME/INTERN/CONTRACTOR',
  employee_status VARCHAR(20) NOT NULL COMMENT 'PENDING/PROBATION/REGULAR/RESIGNED',
  hire_date DATE DEFAULT NULL COMMENT 'hire date',
  regular_date DATE DEFAULT NULL COMMENT 'regular date',
  resign_date DATE DEFAULT NULL COMMENT 'resign date',
  user_id BIGINT DEFAULT NULL COMMENT 'auth user id',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_employee_no (tenant_id, employee_no),
  UNIQUE KEY uk_tenant_user_id (tenant_id, user_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_dept_id (dept_id),
  KEY idx_post_id (post_id),
  KEY idx_employee_status (employee_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='employee archive';

DROP TABLE IF EXISTS hr_emergency_contact;
CREATE TABLE hr_emergency_contact (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  employee_id BIGINT NOT NULL COMMENT 'employee id',
  contact_name VARCHAR(100) NOT NULL COMMENT 'contact name',
  relationship VARCHAR(20) NOT NULL COMMENT 'SPOUSE/PARENT/SIBLING/CHILD/OTHER',
  phone VARCHAR(20) NOT NULL COMMENT 'phone',
  address VARCHAR(500) DEFAULT NULL COMMENT 'address',
  priority INT NOT NULL DEFAULT 1 COMMENT 'priority',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='emergency contact';

-- Leave and quota
DROP TABLE IF EXISTS hr_leave_type;
CREATE TABLE hr_leave_type (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  leave_code VARCHAR(50) NOT NULL COMMENT 'leave code',
  leave_name VARCHAR(100) NOT NULL COMMENT 'leave name',
  need_quota TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'need quota',
  is_paid TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'paid flag',
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT 'DAY/HOUR',
  quota_rule TEXT DEFAULT NULL COMMENT 'quota rule json',
  expiry_rule TEXT DEFAULT NULL COMMENT 'expiry rule json',
  status TINYINT(1) NOT NULL DEFAULT 1 COMMENT 'status',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_leave_code (tenant_id, leave_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='leave type';

DROP TABLE IF EXISTS hr_leave_quota;
CREATE TABLE hr_leave_quota (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  employee_id BIGINT NOT NULL COMMENT 'employee id',
  leave_type_id BIGINT NOT NULL COMMENT 'leave type id',
  year INT NOT NULL COMMENT 'year',
  total_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'total quota days',
  used_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'used quota days',
  frozen_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'frozen quota days',
  available_quota DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'available quota days',
  expiry_date DATE DEFAULT NULL COMMENT 'expiry date',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_leave_year (tenant_id, employee_id, leave_type_id, year),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_year (year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='leave quota';

DROP TABLE IF EXISTS hr_leave_application;
CREATE TABLE hr_leave_application (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  application_no VARCHAR(50) NOT NULL COMMENT 'application number',
  employee_id BIGINT NOT NULL COMMENT 'employee id',
  leave_type_id BIGINT NOT NULL COMMENT 'leave type id',
  start_time DATETIME NOT NULL COMMENT 'start time',
  end_time DATETIME NOT NULL COMMENT 'end time',
  duration DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'leave duration days',
  unit VARCHAR(20) NOT NULL DEFAULT 'DAY' COMMENT 'DAY',
  period_type VARCHAR(20) NOT NULL DEFAULT 'FULL_DAY' COMMENT 'AM/PM/FULL_DAY',
  reason VARCHAR(1000) DEFAULT NULL COMMENT 'reason',
  quota_allocation TEXT DEFAULT NULL COMMENT 'quota allocation json',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_status (status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='leave application';

DROP TABLE IF EXISTS hr_overtime_application;
CREATE TABLE hr_overtime_application (
  id BIGINT NOT NULL AUTO_INCREMENT COMMENT 'primary key',
  tenant_id BIGINT NOT NULL COMMENT 'tenant id',
  application_no VARCHAR(50) NOT NULL COMMENT 'application number',
  employee_id BIGINT NOT NULL COMMENT 'employee id',
  start_time DATETIME NOT NULL COMMENT 'start time',
  end_time DATETIME NOT NULL COMMENT 'end time',
  duration DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'actual hours',
  overtime_type VARCHAR(20) NOT NULL COMMENT 'WORKDAY/WEEKEND/HOLIDAY',
  reason VARCHAR(1000) DEFAULT NULL COMMENT 'reason',
  compensation_type VARCHAR(20) NOT NULL DEFAULT 'TIME_OFF' COMMENT 'TIME_OFF',
  compensation_hours DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'legacy compensation hours',
  quota_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT 'time off quota days',
  matched_slots TEXT DEFAULT NULL COMMENT 'matched half-day slots json',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT/APPROVING/APPROVED/REJECTED/CANCELLED',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create time',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update time',
  create_by VARCHAR(64) DEFAULT '' COMMENT 'create by',
  update_by VARCHAR(64) DEFAULT '' COMMENT 'update by',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT 'deleted flag',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_status (status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='overtime application';

SET FOREIGN_KEY_CHECKS = 1;

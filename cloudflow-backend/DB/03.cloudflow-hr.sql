-- =========================================================
-- CloudFlow Pro - HR人力资源管理模块数据库脚本
-- 模块：组织架构、员工档案、考勤管理、薪酬管理、招聘管理
-- 版本：v1.0
-- 创建日期：2026-03-20
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、组织架构管理模块
-- =========================================================

-- 1. 职位族表
DROP TABLE IF EXISTS hr_position_family;
CREATE TABLE hr_position_family (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  family_code       VARCHAR(50)     NOT NULL COMMENT '职位族编码',
  family_name       VARCHAR(100)    NOT NULL COMMENT '职位族名称',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '职位族描述',
  sort_order        INT(11)         DEFAULT 0 COMMENT '排序号',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_family_code (tenant_id, family_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='职位族表';

-- 2. 职级表
DROP TABLE IF EXISTS hr_job_level;
CREATE TABLE hr_job_level (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  level_code        VARCHAR(50)     NOT NULL COMMENT '职级编码',
  level_name        VARCHAR(100)    NOT NULL COMMENT '职级名称',
  level_series      VARCHAR(20)     NOT NULL COMMENT '职级序列：P-专业序列 M-管理序列',
  level_rank        INT(11)         NOT NULL COMMENT '职级等级：1-10',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '职级描述',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_level_code (tenant_id, level_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_level_series (level_series),
  KEY idx_level_rank (level_rank),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='职级表';

-- 3. 职位表
DROP TABLE IF EXISTS hr_position;
CREATE TABLE hr_position (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  position_code     VARCHAR(50)     NOT NULL COMMENT '职位编码',
  position_name     VARCHAR(100)    NOT NULL COMMENT '职位名称',
  family_id         BIGINT(20)      DEFAULT NULL COMMENT '职位族ID',
  level_id          BIGINT(20)      DEFAULT NULL COMMENT '职级ID',
  post_id           BIGINT(20)      DEFAULT NULL COMMENT '岗位ID（关联Auth服务的sys_post）',
  job_description   TEXT            DEFAULT NULL COMMENT '岗位职责',
  requirements      TEXT            DEFAULT NULL COMMENT '任职要求',
  work_content      TEXT            DEFAULT NULL COMMENT '工作内容',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_position_code (tenant_id, position_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_family_id (family_id),
  KEY idx_level_id (level_id),
  KEY idx_post_id (post_id),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='职位表';

-- 4. 编制管理表
DROP TABLE IF EXISTS hr_headcount;
CREATE TABLE hr_headcount (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  target_type       VARCHAR(20)     NOT NULL COMMENT '目标类型：DEPT-部门 POST-岗位',
  target_id         BIGINT(20)      NOT NULL COMMENT '目标ID（dept_id或post_id）',
  approved_count    INT(11)         NOT NULL DEFAULT 0 COMMENT '核定编制数',
  actual_count      INT(11)         NOT NULL DEFAULT 0 COMMENT '实际在职人数',
  vacancy_count     INT(11)         NOT NULL DEFAULT 0 COMMENT '空缺人数',
  effective_date    DATE            DEFAULT NULL COMMENT '生效日期',
  expiry_date       DATE            DEFAULT NULL COMMENT '失效日期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_target (target_type, target_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='编制管理表';

-- 5. 汇报关系表
DROP TABLE IF EXISTS hr_reporting_line;
CREATE TABLE hr_reporting_line (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  report_to_id      BIGINT(20)      NOT NULL COMMENT '汇报对象ID',
  report_type       VARCHAR(20)     NOT NULL COMMENT '汇报类型：DIRECT-直接汇报 DOTTED-虚线汇报',
  effective_date    DATE            DEFAULT NULL COMMENT '生效日期',
  expiry_date       DATE            DEFAULT NULL COMMENT '失效日期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_report_to_id (report_to_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='汇报关系表';

-- =========================================================
-- 初始化数据 - 职位族
-- =========================================================

INSERT INTO hr_position_family (tenant_id, family_code, family_name, description, sort_order, status) VALUES
(100000, 'TECH', '技术族', '技术研发相关职位', 1, 1),
(100000, 'PRODUCT', '产品族', '产品设计与管理相关职位', 2, 1),
(100000, 'OPERATION', '运营族', '运营推广相关职位', 3, 1),
(100000, 'SALES', '销售族', '销售与客户服务相关职位', 4, 1),
(100000, 'SUPPORT', '支持族', '行政、人力、财务等支持职位', 5, 1);

-- =========================================================
-- 初始化数据 - 职级（专业序列）
-- =========================================================

INSERT INTO hr_job_level (tenant_id, level_code, level_name, level_series, level_rank, description, status) VALUES
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

INSERT INTO hr_job_level (tenant_id, level_code, level_name, level_series, level_rank, description, status) VALUES
(100000, 'M1', '主管', 'M', 1, '管理序列一级', 1),
(100000, 'M2', '经理', 'M', 2, '管理序列二级', 1),
(100000, 'M3', '高级经理', 'M', 3, '管理序列三级', 1),
(100000, 'M4', '总监', 'M', 4, '管理序列四级', 1),
(100000, 'M5', '副总裁', 'M', 5, '管理序列五级', 1),
(100000, 'M6', '高级副总裁', 'M', 6, '管理序列六级', 1);

SET FOREIGN_KEY_CHECKS = 1;


-- =========================================================
-- 员工档案管理表
-- =========================================================

-- 员工档案表
CREATE TABLE hr_employee (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    employee_no VARCHAR(50) NOT NULL COMMENT '工号',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    gender VARCHAR(20) NOT NULL COMMENT '性别：MALE-男 FEMALE-女',
    birth_date DATE COMMENT '出生日期',
    phone VARCHAR(20) COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    dept_id BIGINT COMMENT '部门ID（关联Auth服务）',
    post_id BIGINT COMMENT '岗位ID（关联Auth服务）',
    position_id BIGINT COMMENT '职位ID（HR服务）',
    employee_type VARCHAR(20) NOT NULL COMMENT '员工类型：FULL_TIME-全职 PART_TIME-兼职 INTERN-实习生 CONTRACTOR-外包',
    employee_status VARCHAR(20) NOT NULL COMMENT '员工状态：PENDING-待入职 PROBATION-试用期 REGULAR-正式 RESIGNED-已离职',
    hire_date DATE COMMENT '入职日期',
    regular_date DATE COMMENT '转正日期',
    resign_date DATE COMMENT '离职日期',
    user_id BIGINT COMMENT '用户ID（关联Auth服务）',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_employee_no (tenant_id, employee_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_dept_id (dept_id),
    KEY idx_post_id (post_id),
    KEY idx_position_id (position_id),
    KEY idx_user_id (user_id),
    KEY idx_employee_status (employee_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工档案表';

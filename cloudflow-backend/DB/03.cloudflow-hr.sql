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
DROP TABLE IF EXISTS hr_employee;
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
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_employee_no (tenant_id, employee_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_dept_id (dept_id),
    KEY idx_post_id (post_id),
    KEY idx_position_id (position_id),
    KEY idx_user_id (user_id),
    KEY idx_employee_status (employee_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工档案表';

-- 员工合同表
DROP TABLE IF EXISTS hr_employee_contract;
CREATE TABLE hr_employee_contract (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    contract_type VARCHAR(20) NOT NULL COMMENT '合同类型：LABOR-劳动合同 SERVICE-劳务合同 INTERN-实习协议',
    contract_no VARCHAR(100) NOT NULL COMMENT '合同编号',
    sign_date DATE NOT NULL COMMENT '签订日期',
    start_date DATE NOT NULL COMMENT '开始日期',
    end_date DATE NOT NULL COMMENT '结束日期',
    duration INT COMMENT '合同期限（月）',
    file_url VARCHAR(500) COMMENT '合同文件URL',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期 TERMINATED-已终止',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_contract_no (tenant_id, contract_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_status (status),
    KEY idx_end_date (end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工合同表';

-- 员工证件表
DROP TABLE IF EXISTS hr_employee_document;
CREATE TABLE hr_employee_document (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    document_type VARCHAR(20) NOT NULL COMMENT '证件类型：ID_CARD-身份证 PASSPORT-护照 DIPLOMA-学历证书 DEGREE-学位证书',
    document_no VARCHAR(100) NOT NULL COMMENT '证件号码',
    issue_date DATE COMMENT '签发日期',
    expiry_date DATE COMMENT '有效期至',
    file_url VARCHAR(500) COMMENT '证件扫描件URL',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_document_type (document_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='员工证件表';

-- 紧急联系人表
DROP TABLE IF EXISTS hr_emergency_contact;
CREATE TABLE hr_emergency_contact (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    contact_name VARCHAR(100) NOT NULL COMMENT '联系人姓名',
    relationship VARCHAR(20) NOT NULL COMMENT '关系：SPOUSE-配偶 PARENT-父母 SIBLING-兄弟姐妹 CHILD-子女 OTHER-其他',
    phone VARCHAR(20) NOT NULL COMMENT '联系电话',
    address VARCHAR(500) COMMENT '联系地址',
    priority INT COMMENT '优先级：1-第一联系人 2-第二联系人',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_priority (priority)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='紧急联系人表';

-- =========================================================
-- 员工生命周期管理表
-- =========================================================

-- 入职申请表
DROP TABLE IF EXISTS hr_onboarding_application;
CREATE TABLE hr_onboarding_application (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
    candidate_id BIGINT COMMENT '候选人ID（如果来自招聘）',
    name VARCHAR(100) NOT NULL COMMENT '姓名',
    gender VARCHAR(20) DEFAULT NULL COMMENT '性别：MALE-男 FEMALE-女',
    phone VARCHAR(20) NOT NULL COMMENT '手机号',
    email VARCHAR(100) COMMENT '邮箱',
    dept_id BIGINT NOT NULL COMMENT '部门ID',
    post_id BIGINT NOT NULL COMMENT '岗位ID',
    position_id BIGINT COMMENT '职位ID',
    expected_date DATE NOT NULL COMMENT '预计入职日期',
    process_instance_id VARCHAR(100) COMMENT '流程实例ID',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 ONBOARDED-已入职',
    employee_id BIGINT COMMENT '员工ID（入职后生成）',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_candidate_id (candidate_id),
    KEY idx_dept_id (dept_id),
    KEY idx_status (status),
    KEY idx_process_instance_id (process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入职申请表';

-- 入职任务表
DROP TABLE IF EXISTS hr_onboarding_task;
CREATE TABLE hr_onboarding_task (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_id BIGINT NOT NULL COMMENT '入职申请ID',
    task_name VARCHAR(200) NOT NULL COMMENT '任务名称',
    task_type VARCHAR(20) NOT NULL COMMENT '任务类型：DOCUMENT-资料收集 ACCOUNT-账号开通 EQUIPMENT-设备领用 TRAINING-培训',
    task_description TEXT COMMENT '任务描述',
    assignee_id BIGINT COMMENT '负责人ID',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING-待处理 IN_PROGRESS-处理中 COMPLETED-已完成',
    completed_time DATETIME COMMENT '完成时间',
    remark VARCHAR(500) COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_application_id (application_id),
    KEY idx_task_type (task_type),
    KEY idx_status (status),
    KEY idx_assignee_id (assignee_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='入职任务表';

-- 转正申请表
DROP TABLE IF EXISTS hr_probation_confirmation;
CREATE TABLE hr_probation_confirmation (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    probation_start_date DATE NOT NULL COMMENT '试用期开始日期',
    probation_end_date DATE NOT NULL COMMENT '试用期结束日期',
    expected_regular_date DATE NOT NULL COMMENT '预计转正日期',
    self_evaluation TEXT COMMENT '自我评价',
    manager_evaluation TEXT COMMENT '主管评价',
    process_instance_id VARCHAR(100) COMMENT '流程实例ID',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EXTENDED-延长试用期',
    reject_reason VARCHAR(500) COMMENT '拒绝原因',
    extension_days INT COMMENT '延长天数',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_status (status),
    KEY idx_process_instance_id (process_instance_id),
    KEY idx_probation_end_date (probation_end_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='转正申请表';

-- 调岗申请表
DROP TABLE IF EXISTS hr_transfer_application;
CREATE TABLE hr_transfer_application (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    from_dept_id BIGINT NOT NULL COMMENT '原部门ID',
    from_post_id BIGINT NOT NULL COMMENT '原岗位ID',
    from_position_id BIGINT COMMENT '原职位ID',
    to_dept_id BIGINT NOT NULL COMMENT '目标部门ID',
    to_post_id BIGINT NOT NULL COMMENT '目标岗位ID',
    to_position_id BIGINT COMMENT '目标职位ID',
    transfer_type VARCHAR(20) NOT NULL COMMENT '调岗类型：DEPT-部门调动 POST-岗位调整 PROMOTION-晋升 DEMOTION-降级',
    reason TEXT COMMENT '调岗原因',
    effective_date DATE NOT NULL COMMENT '生效日期',
    salary_change TINYINT(1) DEFAULT 0 COMMENT '是否涉及薪资变更：0-否 1-是',
    process_instance_id VARCHAR(100) COMMENT '流程实例ID',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EFFECTIVE-已生效',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_status (status),
    KEY idx_process_instance_id (process_instance_id),
    KEY idx_effective_date (effective_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='调岗申请表';

-- 离职申请表
DROP TABLE IF EXISTS hr_resignation_application;
CREATE TABLE hr_resignation_application (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_no VARCHAR(50) NOT NULL COMMENT '申请编号',
    employee_id BIGINT NOT NULL COMMENT '员工ID',
    resignation_type VARCHAR(20) NOT NULL COMMENT '离职类型：VOLUNTARY-主动离职 INVOLUNTARY-被动离职 CONTRACT_EXPIRY-合同到期',
    resignation_reason TEXT COMMENT '离职原因',
    expected_date DATE NOT NULL COMMENT '预计离职日期',
    actual_date DATE COMMENT '实际离职日期',
    interview_content TEXT COMMENT '离职面谈内容',
    process_instance_id VARCHAR(100) COMMENT '流程实例ID',
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 COMPLETED-已完成',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
    KEY idx_tenant_id (tenant_id),
    KEY idx_employee_id (employee_id),
    KEY idx_status (status),
    KEY idx_process_instance_id (process_instance_id),
    KEY idx_expected_date (expected_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='离职申请表';

-- 离职交接表
DROP TABLE IF EXISTS hr_resignation_handover;
CREATE TABLE hr_resignation_handover (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    application_id BIGINT NOT NULL COMMENT '离职申请ID',
    handover_item VARCHAR(200) NOT NULL COMMENT '交接项目',
    handover_type VARCHAR(20) NOT NULL COMMENT '交接类型：WORK-工作交接 ASSET-资产归还 DOCUMENT-文档交接 ACCOUNT-账号注销',
    handover_to_id BIGINT COMMENT '交接对象ID',
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态：PENDING-待交接 COMPLETED-已完成',
    completed_time DATETIME COMMENT '完成时间',
    remark VARCHAR(500) COMMENT '备注',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
    update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
    deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
    PRIMARY KEY (id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_application_id (application_id),
    KEY idx_handover_type (handover_type),
    KEY idx_status (status),
    KEY idx_handover_to_id (handover_to_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='离职交接表';


-- =========================================================
-- 五、考勤管理模块
-- =========================================================

-- 1. 班次表
DROP TABLE IF EXISTS hr_shift;
CREATE TABLE hr_shift (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  shift_code        VARCHAR(50)     NOT NULL COMMENT '班次编码',
  shift_name        VARCHAR(100)    NOT NULL COMMENT '班次名称',
  start_time        TIME            NOT NULL COMMENT '上班时间',
  end_time          TIME            NOT NULL COMMENT '下班时间',
  break_minutes     INT(11)         NOT NULL DEFAULT 0 COMMENT '休息时长（分钟）',
  late_threshold    INT(11)         NOT NULL DEFAULT 15 COMMENT '迟到阈值（分钟）',
  early_threshold   INT(11)         NOT NULL DEFAULT 15 COMMENT '早退阈值（分钟）',
  work_minutes      INT(11)         NOT NULL DEFAULT 0 COMMENT '工作时长（分钟）',
  color             VARCHAR(20)     DEFAULT '#1890ff' COMMENT '显示颜色',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_shift_code (tenant_id, shift_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='班次表';

-- 2. 排班规则表
DROP TABLE IF EXISTS hr_schedule_rule;
CREATE TABLE hr_schedule_rule (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  rule_name         VARCHAR(100)    NOT NULL COMMENT '规则名称',
  rule_type         VARCHAR(20)     NOT NULL COMMENT '规则类型：FIXED-固定班 ROTATION-轮班 FLEXIBLE-弹性工作制 COMPREHENSIVE-综合工时制',
  rule_config       TEXT            DEFAULT NULL COMMENT '规则配置（JSON格式）',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '规则描述',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_rule_type (rule_type),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='排班规则表';

-- 3. 排班计划表
DROP TABLE IF EXISTS hr_schedule_plan;
CREATE TABLE hr_schedule_plan (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  plan_name         VARCHAR(100)    NOT NULL COMMENT '计划名称',
  target_type       VARCHAR(20)     NOT NULL COMMENT '目标类型：EMPLOYEE-员工 DEPT-部门',
  target_id         BIGINT(20)      NOT NULL COMMENT '目标ID（员工ID或部门ID）',
  shift_id          BIGINT(20)      NOT NULL COMMENT '班次ID',
  schedule_date     DATE            NOT NULL COMMENT '排班日期',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 PUBLISHED-已发布 CANCELLED-已取消',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         BIGINT(20)      DEFAULT NULL COMMENT '创建人ID',
  update_by         BIGINT(20)      DEFAULT NULL COMMENT '更新人ID',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_target (target_type, target_id),
  KEY idx_shift_id (shift_id),
  KEY idx_schedule_date (schedule_date),
  KEY idx_status (status),
  KEY idx_target_date (tenant_id, target_type, target_id, schedule_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='排班计划表';

-- 4. 打卡记录表
DROP TABLE IF EXISTS hr_attendance_record;
CREATE TABLE hr_attendance_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  attendance_date   DATE            NOT NULL COMMENT '考勤日期',
  shift_id          BIGINT(20)      DEFAULT NULL COMMENT '班次ID',
  check_type        VARCHAR(20)     NOT NULL COMMENT '打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡',
  check_time        DATETIME        NOT NULL COMMENT '打卡时间',
  check_method      VARCHAR(20)     NOT NULL COMMENT '打卡方式：GPS-定位打卡 WIFI-WiFi打卡 FACE-人脸识别 SUPPLEMENT-补卡',
  location          VARCHAR(500)    DEFAULT NULL COMMENT '打卡位置（GPS坐标或WiFi SSID）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'NORMAL' COMMENT '状态：NORMAL-正常 LATE-迟到 EARLY-早退 MISSING-缺卡 SUPPLEMENT-补卡',
  process_instance_id VARCHAR(100)  DEFAULT NULL COMMENT '补卡流程实例ID',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         BIGINT(20)      DEFAULT NULL COMMENT '创建人ID',
  update_by         BIGINT(20)      DEFAULT NULL COMMENT '更新人ID',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_attendance_date (attendance_date),
  KEY idx_shift_id (shift_id),
  KEY idx_check_type (check_type),
  KEY idx_status (status),
  KEY idx_employee_date (employee_id, attendance_date),
  KEY idx_tenant_employee_date (tenant_id, employee_id, attendance_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打卡记录表';

-- 插入示例班次数据
INSERT INTO hr_shift (tenant_id, shift_code, shift_name, start_time, end_time, break_minutes, late_threshold, early_threshold, work_minutes, color, status) VALUES
(100000, 'MORNING', '早班', '08:00:00', '17:00:00', 60, 15, 15, 480, '#1890ff', 1),
(100000, 'AFTERNOON', '中班', '13:00:00', '22:00:00', 60, 15, 15, 480, '#52c41a', 1),
(100000, 'NIGHT', '晚班', '22:00:00', '07:00:00', 60, 15, 15, 480, '#722ed1', 1),
(100000, 'STANDARD', '标准班', '09:00:00', '18:00:00', 60, 15, 15, 480, '#1890ff', 1);

-- 插入示例排班规则数据
INSERT INTO hr_schedule_rule (tenant_id, rule_name, rule_type, rule_config, description, status) VALUES
(100000, '固定早班制', 'FIXED', '{"shiftId": 100}', '每天固定早班，适用于行政人员', 1),
(100000, '三班轮换制', 'ROTATION', '{"cycle": 7, "shifts": [100, 101, 102]}', '早中晚三班轮换，适用于生产线', 1),
(100000, '弹性工作制', 'FLEXIBLE', '{"coreTime": {"start": "10:00", "end": "16:00"}, "dailyHours": 8}', '核心时间段必须在岗，其他时间灵活安排', 1);

SET FOREIGN_KEY_CHECKS = 1;


-- =========================================================
-- 假期管理表
-- =========================================================

-- 5. 假期类型表
DROP TABLE IF EXISTS hr_leave_type;
CREATE TABLE hr_leave_type (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  leave_code        VARCHAR(50)     NOT NULL COMMENT '假期编码',
  leave_name        VARCHAR(100)    NOT NULL COMMENT '假期名称',
  need_quota        TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否需要额度：0-否 1-是',
  is_paid           TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否带薪：0-否 1-是',
  unit              VARCHAR(20)     NOT NULL DEFAULT 'DAY' COMMENT '计算单位：DAY-天 HOUR-小时',
  quota_rule        TEXT            DEFAULT NULL COMMENT '额度规则（JSON格式）',
  expiry_rule       TEXT            DEFAULT NULL COMMENT '过期规则（JSON格式）',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_leave_code (tenant_id, leave_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='假期类型表';

-- 6. 假期额度表
DROP TABLE IF EXISTS hr_leave_quota;
CREATE TABLE hr_leave_quota (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  leave_type_id     BIGINT(20)      NOT NULL COMMENT '假期类型ID',
  year              INT(11)         NOT NULL COMMENT '年度',
  total_quota       DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '总额度',
  used_quota        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '已使用额度',
  frozen_quota      DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '冻结额度（审批中）',
  available_quota   DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '可用额度',
  expiry_date       DATE            DEFAULT NULL COMMENT '过期日期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_leave_year (tenant_id, employee_id, leave_type_id, year),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_year (year),
  KEY idx_expiry_date (expiry_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='假期额度表';

-- 7. 请假申请表
DROP TABLE IF EXISTS hr_leave_application;
CREATE TABLE hr_leave_application (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  application_no    VARCHAR(50)     NOT NULL COMMENT '申请编号',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  leave_type_id     BIGINT(20)      NOT NULL COMMENT '假期类型ID',
  start_time        DATETIME        NOT NULL COMMENT '开始时间',
  end_time          DATETIME        NOT NULL COMMENT '结束时间',
  duration          DECIMAL(10,2)   NOT NULL COMMENT '请假时长',
  unit              VARCHAR(20)     NOT NULL DEFAULT 'DAY' COMMENT '单位：DAY-天 HOUR-小时',
  reason            TEXT            DEFAULT NULL COMMENT '请假原因',
  process_instance_id VARCHAR(100)  DEFAULT NULL COMMENT '流程实例ID',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 CANCELLED-已撤销',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_leave_type_id (leave_type_id),
  KEY idx_status (status),
  KEY idx_process_instance_id (process_instance_id),
  KEY idx_start_time (start_time),
  KEY idx_end_time (end_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='请假申请表';

-- 插入示例假期类型数据
INSERT INTO hr_leave_type (tenant_id, leave_code, leave_name, need_quota, is_paid, unit, quota_rule, expiry_rule, status) VALUES
(100000, 'ANNUAL', '年假', 1, 1, 'DAY', '{"baseQuota": 5, "incrementPerYear": 1, "maxQuota": 15}', '{"expiryType": "YEAR_END", "carryOver": false}', 1),
(100000, 'SICK', '病假', 0, 1, 'DAY', NULL, NULL, 1),
(100000, 'PERSONAL', '事假', 0, 0, 'DAY', NULL, NULL, 1),
(100000, 'MARRIAGE', '婚假', 0, 1, 'DAY', '{"quota": 3}', NULL, 1),
(100000, 'MATERNITY', '产假', 0, 1, 'DAY', '{"quota": 98}', NULL, 1),
(100000, 'PATERNITY', '陪产假', 0, 1, 'DAY', '{"quota": 15}', NULL, 1),
(100000, 'BEREAVEMENT', '丧假', 0, 1, 'DAY', '{"quota": 3}', NULL, 1),
(100000, 'COMPENSATORY', '调休', 1, 1, 'HOUR', NULL, '{"expiryType": "FIXED_DAYS", "days": 90}', 1);

-- =========================================================
-- 加班管理表
-- =========================================================

-- 8. 加班申请表
DROP TABLE IF EXISTS hr_overtime_application;
CREATE TABLE hr_overtime_application (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  application_no    VARCHAR(50)     NOT NULL COMMENT '申请编号',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  start_time        DATETIME        NOT NULL COMMENT '开始时间',
  end_time          DATETIME        NOT NULL COMMENT '结束时间',
  duration          DECIMAL(10,2)   NOT NULL COMMENT '加班时长（小时）',
  overtime_type     VARCHAR(20)     NOT NULL COMMENT '加班类型：WORKDAY-工作日 WEEKEND-周末 HOLIDAY-节假日',
  reason            TEXT            DEFAULT NULL COMMENT '加班原因',
  compensation_type VARCHAR(20)     NOT NULL DEFAULT 'TIME_OFF' COMMENT '补偿类型：TIME_OFF-调休 PAYMENT-加班费',
  compensation_hours DECIMAL(10,2)  DEFAULT NULL COMMENT '补偿时长（调休小时数）',
  process_instance_id VARCHAR(100)  DEFAULT NULL COMMENT '流程实例ID',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_overtime_type (overtime_type),
  KEY idx_status (status),
  KEY idx_process_instance_id (process_instance_id),
  KEY idx_start_time (start_time),
  KEY idx_end_time (end_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='加班申请表';

-- =========================================================
-- 考勤统计表
-- =========================================================

-- 9. 考勤月报表
DROP TABLE IF EXISTS hr_attendance_monthly;
CREATE TABLE hr_attendance_monthly (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  year              INT(11)         NOT NULL COMMENT '年份',
  month             INT(11)         NOT NULL COMMENT '月份',
  work_days         INT(11)         NOT NULL DEFAULT 0 COMMENT '应出勤天数',
  actual_days       INT(11)         NOT NULL DEFAULT 0 COMMENT '实际出勤天数',
  late_times        INT(11)         NOT NULL DEFAULT 0 COMMENT '迟到次数',
  early_times       INT(11)         NOT NULL DEFAULT 0 COMMENT '早退次数',
  absent_days       INT(11)         NOT NULL DEFAULT 0 COMMENT '旷工天数',
  missing_times     INT(11)         NOT NULL DEFAULT 0 COMMENT '缺卡次数',
  leave_days        DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '请假天数',
  overtime_hours    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '加班时长（小时）',
  attendance_rate   DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '出勤率（百分比）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 CONFIRMED-已确认',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_employee_year_month (tenant_id, employee_id, year, month),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_year_month (year, month),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='考勤月报表';

-- =========================================================
-- 四、薪酬管理模块
-- =========================================================

-- 1. 薪资项目表
DROP TABLE IF EXISTS hr_salary_item;
CREATE TABLE hr_salary_item (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  item_code         VARCHAR(50)     NOT NULL COMMENT '项目编码',
  item_name         VARCHAR(100)    NOT NULL COMMENT '项目名称',
  item_type         VARCHAR(20)     NOT NULL COMMENT '项目类型：FIXED-固定项 VARIABLE-浮动项',
  category          VARCHAR(20)     NOT NULL COMMENT '分类：BASIC-基本工资 ALLOWANCE-津贴 BONUS-奖金 DEDUCTION-扣款 INSURANCE-社保 TAX-个税',
  is_taxable        TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否计税：0-否 1-是',
  formula           VARCHAR(500)    DEFAULT NULL COMMENT '计算公式（支持表达式）',
  sort_order        INT(11)         DEFAULT 0 COMMENT '排序号',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_item_code (tenant_id, item_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_item_type (item_type),
  KEY idx_category (category),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='薪资项目表';

-- 2. 薪资结构表
DROP TABLE IF EXISTS hr_salary_structure;
CREATE TABLE hr_salary_structure (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  structure_code    VARCHAR(50)     NOT NULL COMMENT '结构编码',
  structure_name    VARCHAR(100)    NOT NULL COMMENT '结构名称',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '描述',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_structure_code (tenant_id, structure_code),
  KEY idx_tenant_id (tenant_id),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='薪资结构表';

-- 3. 薪资结构项目关联表
DROP TABLE IF EXISTS hr_salary_structure_item;
CREATE TABLE hr_salary_structure_item (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  structure_id      BIGINT(20)      NOT NULL COMMENT '薪资结构ID',
  item_id           BIGINT(20)      NOT NULL COMMENT '薪资项目ID',
  sort_order        INT(11)         DEFAULT 0 COMMENT '排序号',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_structure_item (tenant_id, structure_id, item_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_structure_id (structure_id),
  KEY idx_item_id (item_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='薪资结构项目关联表';

-- 4. 薪资等级表
DROP TABLE IF EXISTS hr_salary_grade;
CREATE TABLE hr_salary_grade (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  level_id          BIGINT(20)      NOT NULL COMMENT '职级ID',
  min_salary        DECIMAL(12,2)   NOT NULL COMMENT '最低薪资',
  max_salary        DECIMAL(12,2)   NOT NULL COMMENT '最高薪资',
  mid_salary        DECIMAL(12,2)   NOT NULL COMMENT '中位薪资',
  currency          VARCHAR(10)     NOT NULL DEFAULT 'CNY' COMMENT '币种：CNY-人民币 USD-美元',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_level (tenant_id, level_id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_level_id (level_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='薪资等级表';

-- 插入示例薪资项目数据
INSERT INTO hr_salary_item (tenant_id, item_code, item_name, item_type, category, is_taxable, sort_order, status) VALUES
(100000, 'BASIC_SALARY', '基本工资', 'FIXED', 'BASIC', 1, 1, 1),
(100000, 'POSITION_ALLOWANCE', '岗位津贴', 'FIXED', 'ALLOWANCE', 1, 2, 1),
(100000, 'MEAL_ALLOWANCE', '餐补', 'FIXED', 'ALLOWANCE', 0, 3, 1),
(100000, 'TRANSPORT_ALLOWANCE', '交通补贴', 'FIXED', 'ALLOWANCE', 0, 4, 1),
(100000, 'PERFORMANCE_BONUS', '绩效奖金', 'VARIABLE', 'BONUS', 1, 5, 1),
(100000, 'YEAR_END_BONUS', '年终奖', 'VARIABLE', 'BONUS', 1, 6, 1),
(100000, 'LATE_DEDUCTION', '迟到扣款', 'VARIABLE', 'DEDUCTION', 0, 7, 1),
(100000, 'ABSENT_DEDUCTION', '旷工扣款', 'VARIABLE', 'DEDUCTION', 0, 8, 1);

-- 插入示例薪资结构数据
INSERT INTO hr_salary_structure (tenant_id, structure_code, structure_name, description, status) VALUES
(100000, 'STANDARD', '标准薪资结构', '适用于大部分员工的标准薪资结构', 1),
(100000, 'EXECUTIVE', '高管薪资结构', '适用于高级管理人员的薪资结构', 1),
(100000, 'SALES', '销售薪资结构', '适用于销售人员的薪资结构', 1);

-- 插入薪资结构项目关联数据（标准薪资结构）
INSERT INTO hr_salary_structure_item (tenant_id, structure_id, item_id, sort_order) VALUES
(100000, 100, 100, 1),  -- 基本工资
(100000, 100, 101, 2),  -- 岗位津贴
(100000, 100, 102, 3),  -- 餐补
(100000, 100, 103, 4),  -- 交通补贴
(100000, 100, 104, 5);  -- 绩效奖金

-- 插入示例薪资等级数据
INSERT INTO hr_salary_grade (
  id, tenant_id, level_id, min_salary, max_salary, mid_salary, currency,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 101, 9000.00, 15000.00, 12000.00, 'CNY',
 '2026-03-20 09:30:00', '2026-03-20 09:30:00', 'admin', 'admin', 0);

-- 5. 员工薪资表
DROP TABLE IF EXISTS hr_employee_salary;
CREATE TABLE hr_employee_salary (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  structure_id      BIGINT(20)      NOT NULL COMMENT '薪资结构ID',
  salary_data       TEXT            DEFAULT NULL COMMENT '薪资数据（JSON格式，存储各项目金额）',
  total_salary      DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '总薪资',
  effective_date    DATE            NOT NULL COMMENT '生效日期',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_structure_id (structure_id),
  KEY idx_status (status),
  KEY idx_effective_date (effective_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工薪资表';

-- 插入示例员工薪资数据
INSERT INTO hr_employee_salary (
  id, tenant_id, employee_id, structure_id, salary_data, total_salary, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 100, '{"100":8000,"101":1200,"102":300,"103":300,"104":800}', 10600.00, '2026-03-24', 'EXPIRED',
 '2026-03-24 09:00:00', '2026-03-24 12:20:00', 'admin', 'admin', 0),
(101, 100000, 1002, 100, '{"100":8000,"101":1200,"102":300,"103":300,"104":1200}', 11000.00, '2026-03-24', 'ACTIVE',
 '2026-03-24 12:21:00', '2026-03-24 12:21:00', 'admin', 'admin', 0);

-- 6. 调薪申请表
DROP TABLE IF EXISTS hr_salary_adjustment;
CREATE TABLE hr_salary_adjustment (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  application_no    VARCHAR(50)     NOT NULL COMMENT '申请编号',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  adjustment_type   VARCHAR(20)     NOT NULL COMMENT '调薪类型：PROMOTION-晋升调薪 ANNUAL-年度调薪 PERFORMANCE-绩效调薪 MARKET-市场调薪',
  adjustment_reason VARCHAR(500)    DEFAULT NULL COMMENT '调薪原因',
  before_salary_data TEXT           DEFAULT NULL COMMENT '调薪前薪资数据（JSON）',
  after_salary_data TEXT            DEFAULT NULL COMMENT '调薪后薪资数据（JSON）',
  before_total      DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '调薪前总额',
  after_total       DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '调薪后总额',
  adjustment_amount DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '调薪金额',
  adjustment_rate   DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '调薪比例（百分比）',
  effective_date    DATE            NOT NULL COMMENT '生效日期',
  process_instance_id VARCHAR(100)  DEFAULT NULL COMMENT '流程实例ID',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EFFECTIVE-已生效',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_application_no (tenant_id, application_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_status (status),
  KEY idx_effective_date (effective_date),
  KEY idx_process_instance_id (process_instance_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='调薪申请表';

-- 插入示例调薪申请数据
INSERT INTO hr_salary_adjustment (
  id, tenant_id, application_no, employee_id, adjustment_type, adjustment_reason,
  before_salary_data, after_salary_data, before_total, after_total, adjustment_amount, adjustment_rate,
  effective_date, process_instance_id, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 'SA202603240001', 1002, 'PERFORMANCE', '桌面端薪酬页真实联调样本：提高绩效奖金',
 '{"100":8000,"101":1200,"102":300,"103":300,"104":800}', '{"100":8000,"101":1200,"102":300,"103":300,"104":1200}',
 10600.00, 11000.00, 400.00, 3.77, '2026-03-24', '788a3482-22d2-4c2b-87f1-4d57b3175046', 'EFFECTIVE',
 '2026-03-24 11:30:00', '2026-03-24 12:22:00', 'admin', 'admin', 0);

-- 7. 五险一金方案表
DROP TABLE IF EXISTS hr_insurance_scheme;
CREATE TABLE hr_insurance_scheme (
  id                        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id                 BIGINT(20)      NOT NULL COMMENT '租户ID',
  scheme_name               VARCHAR(100)    NOT NULL COMMENT '方案名称',
  city                      VARCHAR(50)     NOT NULL COMMENT '城市',
  pension_company_rate      DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '养老保险-公司比例（%）',
  pension_personal_rate     DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '养老保险-个人比例（%）',
  medical_company_rate      DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '医疗保险-公司比例（%）',
  medical_personal_rate     DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '医疗保险-个人比例（%）',
  unemployment_company_rate DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '失业保险-公司比例（%）',
  unemployment_personal_rate DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT '失业保险-个人比例（%）',
  injury_company_rate       DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '工伤保险-公司比例（%）',
  maternity_company_rate    DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '生育保险-公司比例（%）',
  housing_fund_company_rate DECIMAL(5,2)    NOT NULL DEFAULT 0.00 COMMENT '公积金-公司比例（%）',
  housing_fund_personal_rate DECIMAL(5,2)   NOT NULL DEFAULT 0.00 COMMENT '公积金-个人比例（%）',
  base_min                  DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '缴纳基数下限',
  base_max                  DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '缴纳基数上限',
  base_rule                 VARCHAR(500)    DEFAULT NULL COMMENT '基数计算规则',
  effective_date            DATE            NOT NULL COMMENT '生效日期',
  status                    TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time               DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by                 VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by                 VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted                   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_city (city),
  KEY idx_status (status),
  KEY idx_effective_date (effective_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='五险一金方案表';

-- 8. 员工五险一金表
DROP TABLE IF EXISTS hr_employee_insurance;
CREATE TABLE hr_employee_insurance (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  scheme_id         BIGINT(20)      NOT NULL COMMENT '方案ID',
  base              DECIMAL(12,2)   NOT NULL DEFAULT 0.00 COMMENT '缴纳基数',
  effective_date    DATE            NOT NULL COMMENT '生效日期',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE-生效中 EXPIRED-已过期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_scheme_id (scheme_id),
  KEY idx_status (status),
  KEY idx_effective_date (effective_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工五险一金表';

-- 插入示例五险一金方案数据（北京地区）
INSERT INTO hr_insurance_scheme (
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
INSERT INTO hr_insurance_scheme (
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

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 五、招聘管理模块
-- =========================================================

-- 1. 招聘需求表
DROP TABLE IF EXISTS hr_recruitment_request;
CREATE TABLE hr_recruitment_request (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  request_no        VARCHAR(50)     NOT NULL COMMENT '需求编号',
  dept_id           BIGINT(20)      NOT NULL COMMENT '部门ID',
  position_id       BIGINT(20)      NOT NULL COMMENT '职位ID',
  headcount         INT(11)         NOT NULL DEFAULT 1 COMMENT '招聘人数',
  job_requirements  TEXT            DEFAULT NULL COMMENT '任职要求',
  salary_min        DECIMAL(12,2)   DEFAULT NULL COMMENT '薪资范围-最低',
  salary_max        DECIMAL(12,2)   DEFAULT NULL COMMENT '薪资范围-最高',
  expected_date     DATE            DEFAULT NULL COMMENT '期望到岗日期',
  process_instance_id VARCHAR(100)  DEFAULT NULL COMMENT '流程实例ID',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 RECRUITING-招聘中 COMPLETED-已完成 CANCELLED-已取消',
  hired_count       INT(11)         NOT NULL DEFAULT 0 COMMENT '已招聘人数',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_request_no (tenant_id, request_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_dept_id (dept_id),
  KEY idx_position_id (position_id),
  KEY idx_status (status),
  KEY idx_process_instance_id (process_instance_id),
  KEY idx_expected_date (expected_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='招聘需求表';

-- 2. 候选人表
DROP TABLE IF EXISTS hr_candidate;
CREATE TABLE hr_candidate (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  request_id        BIGINT(20)      NOT NULL COMMENT '招聘需求ID',
  name              VARCHAR(100)    NOT NULL COMMENT '姓名',
  gender            VARCHAR(20)     DEFAULT NULL COMMENT '性别：MALE-男 FEMALE-女',
  phone             VARCHAR(20)     NOT NULL COMMENT '手机号',
  email             VARCHAR(100)    DEFAULT NULL COMMENT '邮箱',
  resume_url        VARCHAR(500)    DEFAULT NULL COMMENT '简历URL',
  source            VARCHAR(50)     DEFAULT NULL COMMENT '来源：WEBSITE-官网 REFERRAL-内推 HEADHUNTER-猎头 CAMPUS-校招',
  status            VARCHAR(20)     NOT NULL DEFAULT 'NEW' COMMENT '状态：NEW-新简历 SCREENING-筛选中 INTERVIEW-面试中 OFFER-已发Offer HIRED-已入职 REJECTED-已拒绝',
  reject_reason     VARCHAR(500)    DEFAULT NULL COMMENT '拒绝原因',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_request_id (request_id),
  KEY idx_phone (phone),
  KEY idx_email (email),
  KEY idx_status (status),
  KEY idx_source (source),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='候选人表';

-- 3. 面试表
DROP TABLE IF EXISTS hr_interview;
CREATE TABLE hr_interview (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  candidate_id      BIGINT(20)      NOT NULL COMMENT '候选人ID',
  interview_round   VARCHAR(20)     NOT NULL COMMENT '面试轮次：FIRST-初试 SECOND-复试 FINAL-终试',
  interview_type    VARCHAR(20)     NOT NULL COMMENT '面试类型：PHONE-电话面试 VIDEO-视频面试 ONSITE-现场面试',
  interview_time    DATETIME        NOT NULL COMMENT '面试时间',
  location          VARCHAR(500)    DEFAULT NULL COMMENT '面试地点',
  interviewers      TEXT            DEFAULT NULL COMMENT '面试官ID列表（JSON格式）',
  evaluation        TEXT            DEFAULT NULL COMMENT '面试评价',
  score             INT(11)         DEFAULT NULL COMMENT '面试评分（0-100）',
  result            VARCHAR(20)     DEFAULT NULL COMMENT '面试结果：PASS-通过 FAIL-不通过 PENDING-待定',
  status            VARCHAR(20)     NOT NULL DEFAULT 'SCHEDULED' COMMENT '状态：SCHEDULED-已安排 COMPLETED-已完成 CANCELLED-已取消',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_candidate_id (candidate_id),
  KEY idx_interview_round (interview_round),
  KEY idx_interview_type (interview_type),
  KEY idx_interview_time (interview_time),
  KEY idx_status (status),
  KEY idx_result (result),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='面试表';

-- 4. Offer表
DROP TABLE IF EXISTS hr_offer;
CREATE TABLE hr_offer (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  offer_no          VARCHAR(50)     NOT NULL COMMENT 'Offer编号',
  candidate_id      BIGINT(20)      NOT NULL COMMENT '候选人ID',
  dept_id           BIGINT(20)      NOT NULL COMMENT '部门ID',
  position_id       BIGINT(20)      NOT NULL COMMENT '职位ID',
  salary            DECIMAL(10,2)   NOT NULL COMMENT '薪资',
  expected_date     DATE            NOT NULL COMMENT '期望入职日期',
  expiry_date       DATE            NOT NULL COMMENT 'Offer有效期',
  offer_content     TEXT            DEFAULT NULL COMMENT 'Offer内容',
  process_instance_id VARCHAR(64)   DEFAULT NULL COMMENT '流程实例ID',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 SENT-已发送 ACCEPTED-已接受 REJECTED-已拒绝 EXPIRED-已过期',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_offer_no (offer_no),
  KEY idx_tenant_id (tenant_id),
  KEY idx_candidate_id (candidate_id),
  KEY idx_dept_id (dept_id),
  KEY idx_position_id (position_id),
  KEY idx_status (status),
  KEY idx_expected_date (expected_date),
  KEY idx_expiry_date (expiry_date),
  KEY idx_process_instance_id (process_instance_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='Offer表';

-- =========================================================
-- 六、个税管理模块
-- =========================================================

-- 1. 个税配置表
DROP TABLE IF EXISTS hr_tax_config;
CREATE TABLE hr_tax_config (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  threshold         DECIMAL(10,2)   NOT NULL COMMENT '起征点（个税免征额）',
  tax_brackets      TEXT            NOT NULL COMMENT '税率表（JSON格式）',
  deduction_items   TEXT            DEFAULT NULL COMMENT '专项附加扣除项目（JSON格式）',
  effective_date    DATE            NOT NULL COMMENT '生效日期',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_effective_date (effective_date),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='个税配置表';

-- 2. 员工专项扣除表
DROP TABLE IF EXISTS hr_employee_tax_deduction;
CREATE TABLE hr_employee_tax_deduction (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  deduction_type    VARCHAR(50)     NOT NULL COMMENT '扣除类型：CHILD_EDU-子女教育 CONTINUING_EDU-继续教育 MEDICAL-大病医疗 HOUSING_LOAN-住房贷款利息 HOUSING_RENT-住房租金 ELDERLY_CARE-赡养老人',
  amount            DECIMAL(10,2)   NOT NULL COMMENT '扣除金额（每月）',
  start_date        DATE            NOT NULL COMMENT '开始日期',
  end_date          DATE            DEFAULT NULL COMMENT '结束日期',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE-生效中 EXPIRED-已过期',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_employee_id (employee_id),
  KEY idx_deduction_type (deduction_type),
  KEY idx_status (status),
  KEY idx_start_date (start_date),
  KEY idx_end_date (end_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='员工专项扣除表';

-- 插入示例个税配置数据（2026年标准）
INSERT INTO hr_tax_config (
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
INSERT INTO hr_position (
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
INSERT INTO hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email, dept_id, post_id, position_id,
  employee_type, employee_status, hire_date, regular_date, resign_date, user_id,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(1001, 100000, 'CF20230001', '赵HR', 'FEMALE', '1990-06-12', '13800010001', 'zhao.hr@cloudflow.com', 103, 2, 104,
 'FULL_TIME', 'REGULAR', '2023-04-10', '2023-10-10', NULL, 4, '2026-03-20 10:00:00', '2026-03-20 10:00:00', 'admin', 'admin', 0),
(1002, 100000, 'CF20260001', '前端测试', 'FEMALE', '1998-03-08', '13800010002', 'test.fe@cloudflow.com', 106, 4, 101,
 'FULL_TIME', 'PROBATION', '2026-02-10', NULL, NULL, 8, '2026-03-20 10:05:00', '2026-03-20 10:05:00', 'admin', 'admin', 0),
(1003, 100000, 'CF20240008', '后端测试', 'MALE', '1996-11-21', '13800010003', 'test.be@cloudflow.com', 107, 4, 102,
 'FULL_TIME', 'REGULAR', '2024-08-15', '2025-02-15', NULL, 9, '2026-03-20 10:10:00', '2026-03-20 10:10:00', 'admin', 'admin', 0),
(1004, 100000, 'CF20230015', '王财务', 'FEMALE', '1992-05-16', '13800010004', 'wang.finance@cloudflow.com', 102, 4, 103,
 'FULL_TIME', 'RESIGNED', '2023-03-01', '2023-09-01', '2026-03-21', 3, '2026-03-20 10:15:00', '2026-03-20 10:15:00', 'admin', 'admin', 0),
(1005, 100000, 'CF20240002', '张三', 'MALE', '1995-01-19', '13800010005', 'zhang@cloudflow.com', 101, 4, 102,
 'FULL_TIME', 'REGULAR', '2024-04-18', '2024-10-18', NULL, 5, '2026-03-20 10:20:00', '2026-03-20 10:20:00', 'admin', 'admin', 0),
(1006, 100000, 'CF20260002', '李若彤', 'FEMALE', '1999-09-09', '13800010006', 'li.ruotong@cloudflow.com', 101, 4, 101,
 'FULL_TIME', 'PROBATION', '2026-03-01', NULL, NULL, NULL, '2026-03-20 10:25:00', '2026-03-20 10:25:00', 'admin', 'admin', 0),
(1007, 100000, 'CF20250009', '周宁', 'MALE', '1997-07-14', '13800010007', 'zhou.ning@cloudflow.com', 103, 4, 105,
 'FULL_TIME', 'PROBATION', '2025-11-01', NULL, NULL, NULL, '2026-03-20 10:30:00', '2026-03-20 10:30:00', 'admin', 'admin', 0),
(1008, 100000, 'CF20240012', '陈凯', 'MALE', '1994-12-03', '13800010008', 'chen.kai@cloudflow.com', 101, 4, 101,
 'FULL_TIME', 'REGULAR', '2024-06-01', '2024-12-01', NULL, NULL, '2026-03-20 10:35:00', '2026-03-20 10:35:00', 'admin', 'admin', 0);

-- 3. 员工社保与个税联调示例数据
INSERT INTO hr_employee_insurance (
  id, tenant_id, employee_id, scheme_id, base, effective_date, status,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 100, 10600.00, '2026-03-24', 'ACTIVE',
 '2026-03-24 10:40:00', '2026-03-24 10:40:00', 'admin', 'admin', 0);

INSERT INTO hr_employee_tax_deduction (
  id, tenant_id, employee_id, deduction_type, amount, start_date, end_date, status, remark,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100, 100000, 1002, 'HOUSING_RENT', 1500.00, '2026-03-01', NULL, 'ACTIVE', '桌面端薪酬联调用住房租金扣除样本',
 '2026-03-24 10:45:00', '2026-03-24 10:45:00', NULL, NULL, 0),
(101, 100000, 1002, 'CONTINUING_EDU', 400.00, '2026-03-01', NULL, 'ACTIVE', '桌面端薪酬联调用继续教育扣除样本',
 '2026-03-24 10:46:00', '2026-03-24 10:46:00', NULL, NULL, 0);

-- 4. 招聘需求示例数据
INSERT INTO hr_recruitment_request (
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
INSERT INTO hr_candidate (
  id, tenant_id, request_id, name, gender, phone, email, resume_url, source, status, reject_reason,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(3001, 100000, 2001, '陈海涛', 'MALE', '13900011001', 'chen.haitao@example.com', 'https://example.com/resume/chenhaitao.pdf', 'HEADHUNTER', 'HIRED', NULL,
 '2026-03-21 10:00:00', '2026-03-24 12:31:14', 'admin', 'admin', 0),
(3002, 100000, 2001, '孙晓雨', 'FEMALE', '13900011002', 'sun.xiaoyu@example.com', 'https://example.com/resume/sunxiaoyu.pdf', 'REFERRAL', 'OFFER', NULL,
 '2026-03-21 10:30:00', '2026-03-23 09:10:00', 'zhao', 'zhao', 0),
(3003, 100000, 2002, '林嘉琪', 'FEMALE', '13900011003', 'lin.jiaqi@example.com', 'https://example.com/resume/linjiaqi.pdf', 'WEBSITE', 'SCREENING', NULL,
 '2026-03-22 13:00:00', '2026-03-22 13:30:00', 'zhao', 'zhao', 0),
(3004, 100000, 2003, '李若彤', 'FEMALE', '13900011004', 'li.ruotong@example.com', 'https://example.com/resume/liruotong.pdf', 'REFERRAL', 'HIRED', NULL,
 '2026-03-15 14:00:00', '2026-03-20 18:10:00', 'zhao', 'zhao', 0),
(3005, 100000, 2001, '吴嘉豪', 'MALE', '13900011006', 'wu.jiahao@example.com', 'https://example.com/resume/wujiahao.pdf', 'WEBSITE', 'INTERVIEW', NULL,
 '2026-03-24 12:40:00', '2026-03-24 12:40:00', 'admin', 'admin', 0);

-- 5. 面试示例数据
INSERT INTO hr_interview (
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
INSERT INTO hr_offer (
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
INSERT INTO hr_onboarding_application (
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

INSERT INTO hr_onboarding_task (
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
INSERT INTO hr_probation_confirmation (
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
(6003, 100000, 'HRPB202602010001', 1007, '2025-11-01', '2026-04-30', '2026-05-01',
 '招聘协同推进正常，但数据复盘能力还需加强。', '建议延长试用期一个月，重点提升渠道复盘能力。', 'wf_hr_probation_6003',
 'REJECTED', '阶段性目标完成度不足，需延长试用观察。', 30, '2026-02-15 14:00:00', '2026-03-20 16:00:00', 'zhao', 'zhao', 0);

-- 8. 调岗申请示例数据
INSERT INTO hr_transfer_application (
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
INSERT INTO hr_resignation_application (
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

INSERT INTO hr_resignation_handover (
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
-- 八、审计日志模块
-- =========================================================

-- 1. 审计日志表
DROP TABLE IF EXISTS hr_audit_log;
CREATE TABLE hr_audit_log (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  log_type          VARCHAR(20)     NOT NULL COMMENT '日志类型：OPERATION-操作日志 APPROVAL-审批日志',
  operation_type    VARCHAR(20)     NOT NULL COMMENT '操作类型：CREATE-创建 UPDATE-修改 DELETE-删除 APPROVE-审批 REJECT-拒绝',
  business_module   VARCHAR(50)     NOT NULL COMMENT '业务模块：EMPLOYEE-员工管理 ATTENDANCE-考勤管理 SALARY-薪酬管理 RECRUITMENT-招聘管理',
  business_type     VARCHAR(50)     NOT NULL COMMENT '业务类型：具体的业务实体类型',
  business_id       BIGINT(20)      DEFAULT NULL COMMENT '业务ID：关联的业务数据主键',
  business_no       VARCHAR(100)    DEFAULT NULL COMMENT '业务编号：业务数据的编号',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(100)    DEFAULT NULL COMMENT '操作人姓名',
  operation_desc    VARCHAR(500)    DEFAULT NULL COMMENT '操作描述',
  before_data       TEXT            DEFAULT NULL COMMENT '变更前数据（JSON格式）',
  after_data        TEXT            DEFAULT NULL COMMENT '变更后数据（JSON格式）',
  change_content    VARCHAR(1000)   DEFAULT NULL COMMENT '变更内容描述',
  approval_comment  VARCHAR(500)    DEFAULT NULL COMMENT '审批意见',
  approval_result   VARCHAR(20)     DEFAULT NULL COMMENT '审批结果：APPROVED-通过 REJECTED-拒绝',
  ip_address        VARCHAR(50)     DEFAULT NULL COMMENT 'IP地址',
  user_agent        VARCHAR(500)    DEFAULT NULL COMMENT '用户代理（浏览器信息）',
  request_uri       VARCHAR(200)    DEFAULT NULL COMMENT '请求URI',
  request_method    VARCHAR(10)     DEFAULT NULL COMMENT '请求方法：GET POST PUT DELETE',
  request_params    TEXT            DEFAULT NULL COMMENT '请求参数（JSON格式）',
  execution_time    BIGINT(20)      DEFAULT NULL COMMENT '执行时长（毫秒）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'SUCCESS' COMMENT '操作状态：SUCCESS-成功 FAILURE-失败',
  error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  archived          TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已归档：0-未归档 1-已归档',
  archive_time      DATETIME        DEFAULT NULL COMMENT '归档时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_log_type (log_type),
  KEY idx_operation_type (operation_type),
  KEY idx_business_module (business_module),
  KEY idx_business_type (business_type),
  KEY idx_business_id (business_id),
  KEY idx_business_no (business_no),
  KEY idx_operator_id (operator_id),
  KEY idx_create_time (create_time),
  KEY idx_archived (archived),
  KEY idx_tenant_business (tenant_id, business_module, business_type, business_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';


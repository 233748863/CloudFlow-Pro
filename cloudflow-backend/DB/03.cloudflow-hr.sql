-- =========================================================
-- CloudFlow Pro - HR人力资源管理模块数据库脚本
-- 模块：组织架构、员工档案、考勤管理、薪酬管理、招聘管理
-- 版本：v1.0
-- 创建日期：2026-03-20
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 说明：本文件仅保留表结构与约束，初始化/演示种子数据已统一迁移至 06.cloudflow-business-seed.sql。

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
    UNIQUE KEY uk_tenant_user_id (tenant_id, user_id),
    KEY idx_tenant_id (tenant_id),
    KEY idx_dept_id (dept_id),
    KEY idx_post_id (post_id),
    KEY idx_position_id (position_id),
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

-- 员工合同附件表
DROP TABLE IF EXISTS hr_employee_contract_attachment;
CREATE TABLE hr_employee_contract_attachment (
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

-- 员工证件附件表
DROP TABLE IF EXISTS hr_employee_document_attachment;
CREATE TABLE hr_employee_document_attachment (
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

-- 3. 排班规则分配表
DROP TABLE IF EXISTS hr_schedule_rule_assignment;
CREATE TABLE hr_schedule_rule_assignment (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  rule_id           BIGINT(20)      NOT NULL COMMENT '规则ID',
  target_type       VARCHAR(20)     NOT NULL COMMENT '目标类型：DEPT-部门 POST-岗位 EMPLOYEE-员工',
  target_id         BIGINT(20)      NOT NULL COMMENT '目标ID',
  effective_start   DATE            NOT NULL COMMENT '生效开始日期',
  effective_end     DATE            DEFAULT NULL COMMENT '生效结束日期',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_rule_id (rule_id),
  KEY idx_target (tenant_id, target_type, target_id),
  KEY idx_effective_range (effective_start, effective_end),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='排班规则分配表';

-- 4. 企业工作日历表
DROP TABLE IF EXISTS hr_work_calendar;
CREATE TABLE hr_work_calendar (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  calendar_date     DATE            NOT NULL COMMENT '日期',
  day_type          VARCHAR(20)     NOT NULL COMMENT '日期类型：WORKDAY-工作日 REST-休息日 HOLIDAY-节假日',
  day_name          VARCHAR(100)    DEFAULT NULL COMMENT '日期名称',
  source            VARCHAR(20)     NOT NULL DEFAULT 'MANUAL' COMMENT '来源：MANUAL-手工维护 SYSTEM-系统生成',
  status            TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '状态：0-禁用 1-启用',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '删除标志（0-未删除 1-已删除）',
  PRIMARY KEY (id),
  UNIQUE KEY uk_tenant_calendar_date (tenant_id, calendar_date),
  KEY idx_tenant_id (tenant_id),
  KEY idx_calendar_date (calendar_date),
  KEY idx_day_type (day_type),
  KEY idx_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='企业工作日历表';

-- 5. 排班计划表
DROP TABLE IF EXISTS hr_schedule_plan;
CREATE TABLE hr_schedule_plan (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  plan_name         VARCHAR(100)    NOT NULL COMMENT '计划名称',
  target_type       VARCHAR(20)     NOT NULL COMMENT '目标类型：EMPLOYEE-员工 POST-岗位 DEPT-部门',
  target_id         BIGINT(20)      NOT NULL COMMENT '目标ID（员工ID、岗位ID或部门ID）',
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

-- 6. 打卡记录表
DROP TABLE IF EXISTS hr_attendance_record;
CREATE TABLE hr_attendance_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  employee_id       BIGINT(20)      NOT NULL COMMENT '员工ID',
  attendance_date   DATE            NOT NULL COMMENT '考勤日期',
  rule_id           BIGINT(20)      DEFAULT NULL COMMENT '生效规则ID',
  shift_id          BIGINT(20)      DEFAULT NULL COMMENT '班次ID',
  check_type        VARCHAR(20)     NOT NULL COMMENT '打卡类型：CHECK_IN-上班打卡 CHECK_OUT-下班打卡',
  check_time        DATETIME        NOT NULL COMMENT '打卡时间',
  expected_time     DATETIME        DEFAULT NULL COMMENT '规则期望打卡时间',
  deviation_minutes INT(11)         DEFAULT NULL COMMENT '偏差分钟数，迟到为正，早退为负',
  check_method      VARCHAR(20)     NOT NULL COMMENT '打卡方式：GPS-定位打卡 WIFI-WiFi打卡 FACE-人脸识别 SUPPLEMENT-补卡',
  location          VARCHAR(500)    DEFAULT NULL COMMENT '打卡位置（GPS坐标或WiFi SSID）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'NORMAL' COMMENT '状态：NORMAL-正常 LATE-迟到 SEVERE_LATE-严重迟到 EARLY-早退 ABSENT-旷工 MISSING-缺卡 SUPPLEMENT-补卡',
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
  KEY idx_rule_id (rule_id),
  KEY idx_shift_id (shift_id),
  KEY idx_check_type (check_type),
  KEY idx_status (status),
  KEY idx_employee_date (employee_id, attendance_date),
  KEY idx_tenant_employee_date (tenant_id, employee_id, attendance_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打卡记录表';

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
  UNIQUE KEY uk_employee_leave_year_expiry (tenant_id, employee_id, leave_type_id, year, expiry_date),
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
  quota_allocation  TEXT            DEFAULT NULL COMMENT '额度分配明细(JSON)',
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
  source_type       VARCHAR(50)     DEFAULT NULL COMMENT '来源类型：PERFORMANCE_OBJECTIVE等',
  source_id         BIGINT(20)      DEFAULT NULL COMMENT '来源业务ID',
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
  KEY idx_process_instance_id (process_instance_id),
  KEY idx_source (source_type, source_id),
  UNIQUE KEY uk_perf_source_employee (tenant_id, source_type, source_id, employee_id, deleted)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='调薪申请表';

-- 7. 绩效目标表
DROP TABLE IF EXISTS hr_performance_assignment;
DROP TABLE IF EXISTS hr_performance_objective;
CREATE TABLE hr_performance_objective (
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
  status                     VARCHAR(30)    NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT PLAN_APPROVING PLAN_APPROVED RESULT_APPROVING COMPLETED REJECTED CANCELLED',
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
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效目标表';

-- 8. 绩效分配树表
CREATE TABLE hr_performance_assignment (
  id                BIGINT(20)     NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)     NOT NULL COMMENT '租户ID',
  objective_id      BIGINT(20)     NOT NULL COMMENT '绩效目标ID',
  parent_id         BIGINT(20)     DEFAULT NULL COMMENT '父分配节点ID',
  node_key          VARCHAR(255)   NOT NULL COMMENT '节点唯一键',
  assignee_type     VARCHAR(20)    NOT NULL COMMENT '分配对象类型：DEPT-部门 EMPLOYEE-员工',
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
  quota_source      VARCHAR(20)    NOT NULL DEFAULT 'MANAGER' COMMENT '额度来源：MANAGER-经理 DEPT_OWNER-部门负责人',
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
  CONSTRAINT fk_performance_assignment_objective FOREIGN KEY (objective_id) REFERENCES hr_performance_objective(id) ON DELETE CASCADE,
  CONSTRAINT fk_performance_assignment_parent FOREIGN KEY (parent_id) REFERENCES hr_performance_assignment(id) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绩效分配树表';

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
  resume_attachment_urls TEXT       DEFAULT NULL COMMENT '简历附件URL列表，多个逗号分隔',
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
  interview_end_time DATETIME       DEFAULT NULL COMMENT '面试结束时间',
  location          VARCHAR(500)    DEFAULT NULL COMMENT '面试地点',
  meeting_room_id   BIGINT(20)      DEFAULT NULL COMMENT '关联会议室ID',
  meeting_room_name VARCHAR(100)    DEFAULT NULL COMMENT '会议室名称快照',
  schedule_event_id BIGINT(20)      DEFAULT NULL COMMENT 'OA日程事件ID',
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
  KEY idx_meeting_room_id (meeting_room_id),
  KEY idx_schedule_event_id (schedule_event_id),
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


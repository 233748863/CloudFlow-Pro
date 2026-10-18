-- =========================================================
-- CloudFlow Pro - 工作流引擎核心模块数据库脚本
-- 模块：流程定义、流程实例、任务管理、表单定义、通知
-- 版本：v1.1
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 说明：本文件仅保留表结构与约束，初始化/演示种子数据已统一迁移至 06.cloudflow-business-seed.sql。

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_process_definition;
CREATE TABLE wf_process_definition (
  definition_id     VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_name      VARCHAR(64)     NOT NULL COMMENT '流程名称',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             DEFAULT 1 COMMENT '版本号',
  lock_version      INT             DEFAULT 1 COMMENT '乐观锁版本号',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '表单ID',
  model_json        LONGTEXT COMMENT '流程模型JSON',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态',
  version_lock      INT             DEFAULT 0 COMMENT '版本锁',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '是否最新版本',
  category          VARCHAR(64)     DEFAULT NULL COMMENT '分类',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT '标签',
  start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT '启动权限类型',
  start_permission_value TEXT COMMENT '启动权限值',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '描述',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建人',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新人',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  template_id       VARCHAR(64)     DEFAULT NULL COMMENT '模板ID',
  current_version   VARCHAR(20)     DEFAULT '1.0.0' COMMENT '当前版本号',
  change_log        VARCHAR(500)    DEFAULT NULL COMMENT '版本变更说明(C6:版本体系统一后由本行承载)',
  change_type       VARCHAR(20)     DEFAULT NULL COMMENT '版本变更类型(major/minor/patch)',
  checksum          VARCHAR(64)     DEFAULT NULL COMMENT '模型内容SHA-256校验和',
  is_rollback       TINYINT(1)      DEFAULT 0 COMMENT '是否回滚产生的版本',
  rollback_from_version VARCHAR(20) DEFAULT NULL COMMENT '回滚源版本号',
  is_archived       TINYINT(1)      DEFAULT 0 COMMENT '是否归档',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  KEY idx_status (status),
  KEY idx_is_latest (is_latest),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_deleted (deleted),
  KEY idx_template (template_id),
  KEY idx_archived (is_archived),
  KEY idx_version (current_version),
  KEY idx_template_archived (template_id, is_archived) COMMENT '模板归档索引',
  KEY idx_current_version (current_version) COMMENT '当前版本索引',
  KEY idx_category_status (category, status, is_archived) COMMENT '分类状态索引',
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

--
DROP TABLE IF EXISTS `wf_process_category`;
CREATE TABLE `wf_process_category` (
    `category_id`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    `parent_id`     BIGINT       DEFAULT 0 COMMENT '父级ID',
    `category_name` VARCHAR(100) NOT NULL COMMENT '分类名称',
    `category_code` VARCHAR(100) NOT NULL COMMENT '分类编码',
    `icon`          VARCHAR(100) DEFAULT NULL COMMENT '图标',
    `sort_order`    INT          DEFAULT 0 COMMENT '排序号',
    `status`        CHAR(1)      DEFAULT '0' COMMENT '状态',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    `remark`        VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `tenant_id`     BIGINT       DEFAULT NULL COMMENT '租户ID',
    `create_by`     VARCHAR(64)  DEFAULT NULL COMMENT '创建人',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`     VARCHAR(64)  DEFAULT NULL COMMENT '更新人',
    `update_time`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`category_id`),
    UNIQUE KEY `uk_category_code` (`category_code`, `tenant_id`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程分类表';

--
DROP TABLE IF EXISTS wf_form_definition;
CREATE TABLE wf_form_definition (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '版本记录ID',
  form_id           VARCHAR(64)     NOT NULL COMMENT '表单ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  form_name         VARCHAR(64)     NOT NULL COMMENT '表单名称',
  form_key          VARCHAR(64)     DEFAULT NULL COMMENT '表单Key',
  fields_json       LONGTEXT COMMENT '字段配置JSON',
  form_schema       LONGTEXT COMMENT '表单Schema',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态',
  version           INT             DEFAULT 1 COMMENT '版本号',
  version_lock      INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '是否最新版本',
  checksum          VARCHAR(64)     DEFAULT NULL COMMENT '字段定义哈希',
  change_log        VARCHAR(500)    DEFAULT NULL COMMENT '变更说明',
  change_type       VARCHAR(30)     DEFAULT NULL COMMENT '变更类型',
  is_rollback       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否回滚产生',
  rollback_from_version INT         DEFAULT NULL COMMENT '回滚来源版本',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_form_version (tenant_id, form_id, version),
  UNIQUE KEY uk_form_key_version (tenant_id, form_key, version),
  KEY idx_form_latest (tenant_id, form_id, is_latest),
  KEY idx_form_key_latest (tenant_id, form_key, is_latest),
  KEY idx_form_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单定义表';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
  form_version      INT             DEFAULT NULL COMMENT '发起时绑定的表单版本',
  definition_id     VARCHAR(64)     DEFAULT NULL COMMENT '流程定义ID',
  business_key      VARCHAR(64)     NOT NULL COMMENT '业务主键',
  title             VARCHAR(255)    DEFAULT NULL COMMENT '标题',
  lock_version      INT             DEFAULT 1 COMMENT '乐观锁版本号',
  start_user_id     BIGINT(20)      NOT NULL COMMENT '发起人ID',
  start_user_name   VARCHAR(100)    DEFAULT NULL COMMENT '发起人姓名',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '实例状态：DRAFT/RUNNING/PASSED/AUTO_PASSED/REJECTED/TERMINATED/INVALIDATED/CANCELLED/WITHDRAWN/TASK_BACK/PAUSED/RESTARTED/PENDING/FAILED',
  starter_left      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '发起人是否已离职(0否 1是)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  variables         JSON            DEFAULT NULL COMMENT '流程变量',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '优先级',
  process_no        VARCHAR(64)     DEFAULT NULL COMMENT '流程编号',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建人',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新人',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  parent_instance_id VARCHAR(64)    DEFAULT NULL COMMENT '父流程实例ID',
  parent_node_key   VARCHAR(64)     DEFAULT NULL COMMENT '父节点Key',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  UNIQUE KEY uk_tenant_business_key (tenant_id, business_key),
  KEY idx_proc_inst_tenant (tenant_id),
  KEY idx_start_user_status (start_user_id, status),
  KEY idx_start_user_status_left (start_user_id, status, starter_left),
  KEY idx_process_key_status (process_def_key, status),
  KEY idx_start_time (start_time),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_deleted (deleted),
  KEY idx_parent_instance (parent_instance_id),
  UNIQUE KEY uk_tenant_process_no (tenant_id, process_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程实例表';

--
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     NOT NULL COMMENT '节点名称',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  assignee_name     VARCHAR(100)    DEFAULT NULL COMMENT '处理人姓名',
  proxy_user_id     BIGINT(20)      DEFAULT NULL COMMENT '代理人ID',
  agent_setting_id  VARCHAR(64)     DEFAULT NULL COMMENT '服务器关联的代理设置ID',
  execution_context JSON           DEFAULT NULL COMMENT '服务器持久执行上下文，禁止客户端写入',
  disabled_from_user_id BIGINT(20)  DEFAULT NULL COMMENT '账号停用释放前处理人ID',
  disabled_from_user_name VARCHAR(100) DEFAULT NULL COMMENT '账号停用释放前处理人姓名',
  disabled_release_version INT     DEFAULT NULL COMMENT '账号停用释放后任务版本',
  disabled_release_event_id VARCHAR(64) DEFAULT NULL COMMENT '账号停用释放来源事件ID',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT '候选角色',
  task_type         VARCHAR(30)     NOT NULL DEFAULT 'APPROVAL' COMMENT '任务语义类型',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态',
  lock_version      INT             DEFAULT 1 COMMENT '乐观锁版本号',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '优先级',
  is_timeout        TINYINT(1)      DEFAULT 0 COMMENT '是否超时',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  due_time          DATETIME        DEFAULT NULL COMMENT '截止时间',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id),
  KEY idx_task_tenant (tenant_id),
  KEY idx_disabled_handover (tenant_id, disabled_from_user_id, status),
  KEY idx_assignee_status (assignee, status),
  KEY idx_instance_status (instance_id, status),
  KEY idx_status (status),
  KEY idx_create_time (create_time),
  KEY idx_task_composite (assignee, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务表';

--
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT '历史记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(100)    DEFAULT NULL COMMENT '操作人姓名',
  on_behalf_of_user_id BIGINT(20)   DEFAULT NULL COMMENT '代理操作归属的被代理人ID',
  on_behalf_of_user_name VARCHAR(100) DEFAULT NULL COMMENT '被代理人姓名快照',
  action            VARCHAR(64)     DEFAULT NULL COMMENT '操作动作',
  task_type         VARCHAR(30)     NOT NULL DEFAULT 'APPROVAL' COMMENT '任务语义类型',
  comment           VARCHAR(1000)   DEFAULT NULL COMMENT '处理意见(预留系统拼接前缀余量)',
  duration_seconds  INT             DEFAULT NULL COMMENT '处理耗时秒数',
  variables_changed TEXT COMMENT '变量变更内容',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (history_id),
  KEY idx_instance_hist (instance_id),
  KEY idx_operator_id (operator_id),
  KEY idx_create_time (create_time),
  KEY idx_instance_create_time (instance_id, create_time),
  KEY idx_operator_create_time (operator_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务历史表';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_task_read;
CREATE TABLE wf_task_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务已读表';

--
DROP TABLE IF EXISTS wf_task_urge;
CREATE TABLE wf_task_urge (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  sender_id         BIGINT(20)      NOT NULL COMMENT '发送人ID',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  reason            VARCHAR(200)    DEFAULT NULL COMMENT '原因',
  create_time       DATETIME COMMENT '创建时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务催办表';

--
DROP TABLE IF EXISTS wf_task_attachment;
CREATE TABLE wf_task_attachment (
  attachment_id     VARCHAR(64)     NOT NULL COMMENT '附件ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID(流程级附件可为空)',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  file_name         VARCHAR(255)    NOT NULL COMMENT '文件名称',
  file_path         VARCHAR(500)    NOT NULL COMMENT '文件路径',
  file_size         BIGINT          DEFAULT 0 COMMENT '文件大小',
  file_type         VARCHAR(50)     DEFAULT NULL COMMENT '文件类型',
  upload_user_id    BIGINT(20)      DEFAULT NULL COMMENT '上传人ID',
  uploader_name     VARCHAR(100)    DEFAULT NULL COMMENT '上传人姓名',
  upload_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (attachment_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务附件表';

--
DROP TABLE IF EXISTS wf_task_delegation;
CREATE TABLE wf_task_delegation (
  delegation_id     VARCHAR(64)     NOT NULL COMMENT '委派ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID(审批代理可为空)',
  instance_id       VARCHAR(64)     DEFAULT NULL COMMENT '流程实例ID(审批代理可为空)',
  from_user_id      BIGINT(20)      NOT NULL COMMENT '原处理人ID',
  from_user_name    VARCHAR(100)    DEFAULT NULL COMMENT '原处理人姓名',
  to_user_id        BIGINT(20)      NOT NULL COMMENT '目标处理人ID',
  to_user_name      VARCHAR(100)    DEFAULT NULL COMMENT '目标处理人姓名',
  delegation_type   VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT '委派类型(DELEGATE/DELEGATE_RETURN/PROXY/TRANSFER)',
  agent_mode        VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT '模式：DELEGATE委派/AGENT代理/AGENT_ASSIST协办',
  setting_id        VARCHAR(64)     DEFAULT NULL COMMENT '代理设置来源ID，普通委派为空',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '原因',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/COMPLETED/CANCELLED)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (delegation_id),
  KEY idx_task_id (task_id),
  KEY idx_from_user (from_user_id),
  KEY idx_to_user (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务委派表';

--
DROP TABLE IF EXISTS wf_agent_setting;
CREATE TABLE wf_agent_setting (
  setting_id          VARCHAR(64) NOT NULL COMMENT '代理设置ID',
  tenant_id           BIGINT(20) NOT NULL COMMENT '租户ID',
  principal_user_id   BIGINT(20) NOT NULL COMMENT '被代理人用户ID',
  agent_user_id       BIGINT(20) NOT NULL COMMENT '代理人用户ID',
  agent_mode          VARCHAR(20) NOT NULL COMMENT 'AGENT或AGENT_ASSIST',
  definition_ids      JSON DEFAULT NULL COMMENT '适用的已发布流程定义ID集合，空集合表示全部',
  start_time          DATETIME NOT NULL COMMENT '生效时间，含此刻',
  end_time            DATETIME NOT NULL COMMENT '失效时间，不含此刻',
  reason              VARCHAR(500) DEFAULT NULL COMMENT '代理原因',
  status              VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE或DISABLED',
  version             INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by           VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by           VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (setting_id),
  KEY idx_agent_principal (tenant_id, principal_user_id, status, start_time, end_time),
  KEY idx_agent_delegate (tenant_id, agent_user_id, status),
  CONSTRAINT chk_agent_window CHECK (end_time > start_time),
  CONSTRAINT chk_agent_mode CHECK (agent_mode IN ('AGENT','AGENT_ASSIST')),
  CONSTRAINT chk_agent_distinct CHECK (principal_user_id <> agent_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户代理设置';

DROP TABLE IF EXISTS wf_task_candidate;
CREATE TABLE wf_task_candidate (
  candidate_id      VARCHAR(64)     NOT NULL COMMENT '候选记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID，发起时选人尚未产生任务可为空',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key，发起时选人的节点归属',
  source            VARCHAR(30)     NOT NULL DEFAULT 'NODE_CONFIG' COMMENT '来源：NODE_CONFIG/INITIATOR_SELECTED/ADD_SIGN',
  user_id           BIGINT(20)      NOT NULL COMMENT '候选用户ID',
  user_name         VARCHAR(100)    DEFAULT NULL COMMENT '候选用户姓名',
  candidate_type    VARCHAR(20)     NOT NULL COMMENT '候选人类型',
  status            VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '状态 PENDING/CLAIMED/CANCELLED',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  claim_time        DATETIME        DEFAULT NULL COMMENT '认领时间',
  PRIMARY KEY (candidate_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id),
  KEY idx_user_status (tenant_id, user_id, status),
  KEY idx_task_status (tenant_id, task_id, status),
  KEY idx_candidate_node_source (tenant_id, instance_id, node_key, source)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务候选人表';

--
DROP TABLE IF EXISTS wf_task_add_sign;
CREATE TABLE wf_task_add_sign (
  add_sign_id       VARCHAR(64)     NOT NULL COMMENT '加签ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  sign_type         VARCHAR(20)     NOT NULL DEFAULT 'BEFORE' COMMENT '签核类型',
  sign_user_ids     VARCHAR(500)    NOT NULL COMMENT '加签用户ID列表',
  sign_user_names   VARCHAR(500)    DEFAULT NULL COMMENT '加签用户姓名列表',
  initiator_id      BIGINT(20)      NOT NULL COMMENT '发起操作人ID',
  initiator_name    VARCHAR(100)    DEFAULT NULL COMMENT '发起操作人姓名',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '原因',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (add_sign_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id),
  KEY idx_initiator_id (initiator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务加签表';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_countersign_task;
CREATE TABLE wf_countersign_task (
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '会签ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  sign_type         VARCHAR(20)     NOT NULL COMMENT '签核类型',
  pass_percent      INT             DEFAULT NULL COMMENT '通过比例',
  total_count       INT             DEFAULT 0 COMMENT '总数',
  voted_count       INT             DEFAULT 0 COMMENT '已投票数',
  approve_count     INT             DEFAULT 0 COMMENT '同意数',
  reject_count      INT             DEFAULT 0 COMMENT '拒绝数',
  total_weight      DECIMAL(10,2)   DEFAULT NULL COMMENT '总权重',
  approve_weight    DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '同意权重累计',
  reject_weight     DECIMAL(10,2)   NOT NULL DEFAULT 0.00 COMMENT '反对权重累计',
  pass_weight       DECIMAL(10,2)   DEFAULT NULL COMMENT '通过所需权重阈值',
  status            VARCHAR(20)     DEFAULT 'VOTING' COMMENT '状态',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  assignee_order    TEXT            DEFAULT NULL COMMENT '处理人顺序',
  current_index     INT             DEFAULT NULL COMMENT '当前顺序索引',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (countersign_id),
  KEY idx_instance_id (instance_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签任务表';

--
DROP TABLE IF EXISTS wf_countersign_vote;
CREATE TABLE wf_countersign_vote (
  vote_id           VARCHAR(64)     NOT NULL COMMENT '投票ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '会签ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID',
  voter_id          BIGINT(20)      NOT NULL COMMENT '投票人ID',
  voter_name        VARCHAR(100)    DEFAULT NULL COMMENT '投票人姓名',
  vote_result       VARCHAR(20)     NOT NULL COMMENT 'APPROVE/REJECT;票权快照PENDING/REMOVED/AUTO_PASS/AUTO_REJECT',
  vote_weight       DECIMAL(6,2)    NOT NULL DEFAULT 1.00 COMMENT '投票权重',
  comment           VARCHAR(1000)   DEFAULT NULL COMMENT '处理意见(预留系统拼接前缀余量)',
  vote_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
  PRIMARY KEY (vote_id),
  UNIQUE KEY uk_countersign_voter (countersign_id, voter_id),
  KEY idx_voter_id (voter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签投票表';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_process_snapshot;
CREATE TABLE wf_process_snapshot (
  snapshot_id       VARCHAR(64)     NOT NULL COMMENT '快照ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  status            VARCHAR(20)     DEFAULT NULL COMMENT '状态',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  variables         LONGTEXT COMMENT '流程变量',
  active_tasks      LONGTEXT COMMENT '活动任务数据',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (snapshot_id),
  KEY idx_instance_id (instance_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程快照表';

--
DROP TABLE IF EXISTS wf_node_record;
CREATE TABLE wf_node_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  process_def_key   VARCHAR(64)     DEFAULT NULL COMMENT '流程定义Key',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(128)    DEFAULT NULL COMMENT '节点名称',
  node_type         VARCHAR(32)     DEFAULT NULL COMMENT '节点类型(APPROVAL/START)',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '状态',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  executor_id       BIGINT(20)      DEFAULT NULL COMMENT '执行人ID',
  executor_name     VARCHAR(100)    DEFAULT NULL COMMENT '执行人姓名',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '耗时毫秒数',
  extra_data        TEXT            DEFAULT NULL COMMENT '扩展数据',
  event_type        VARCHAR(32)     DEFAULT NULL COMMENT '事件类型(NODE_COMPLETED/NODE_CREATED)',
  event_time        DATETIME        DEFAULT NULL COMMENT '事件时间',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_instance_id (instance_id),
  KEY idx_node_key (node_key),
  KEY idx_status (status),
  KEY idx_instance_node_status (instance_id, node_key, status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点记录表';

--
DROP TABLE IF EXISTS wf_transaction_message;
CREATE TABLE wf_transaction_message (
  message_id        VARCHAR(64)     NOT NULL COMMENT '消息ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(50)     NOT NULL COMMENT '业务类型',
  business_id       VARCHAR(64)     NOT NULL COMMENT '业务ID',
  content           TEXT COMMENT '内容',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  retry_count       INT             DEFAULT 0 COMMENT '重试次数',
  max_retry_count   INT             DEFAULT 5 COMMENT '最大重试次数',
  next_retry_time   DATETIME        DEFAULT NULL COMMENT '下次重试时间',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  error_message     TEXT COMMENT '错误信息',
  PRIMARY KEY (message_id),
  KEY idx_status_retry (status, next_retry_time, retry_count),
  KEY idx_business (business_type, business_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='事务消息表';

--
DROP TABLE IF EXISTS wf_deploy_window;
CREATE TABLE wf_deploy_window (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  window_name       VARCHAR(100)    NOT NULL COMMENT '窗口名称',
  window_type       VARCHAR(20)     NOT NULL COMMENT '窗口类型(DAILY/WEEKLY/MONTHLY/CUSTOM)',
  start_time        TIME            NOT NULL COMMENT '开始时间',
  end_time          TIME            NOT NULL COMMENT '结束时间',
  week_days         VARCHAR(50)     DEFAULT NULL COMMENT '星期几',
  month_days        VARCHAR(100)    DEFAULT NULL COMMENT '每月几号',
  custom_dates      TEXT            DEFAULT NULL COMMENT '自定义日期',
  is_enabled        TINYINT(1)      DEFAULT 1 COMMENT '是否启用',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '描述',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT NULL COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_window_type (window_type),
  KEY idx_is_enabled (is_enabled),
  KEY idx_tenant_enabled (tenant_id, is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布窗口配置表';

INSERT INTO wf_deploy_window (
  tenant_id, window_name, window_type, start_time, end_time, week_days, month_days, custom_dates, is_enabled, description, create_by, create_time
) VALUES
(100000, '工作日发布窗口', 'WEEKLY', '09:00:00', '18:00:00', '1,2,3,4,5', NULL, NULL, 1, '周一至周五工作时间允许发布', 'system', NOW()),
(100000, '周末维护窗口', 'WEEKLY', '00:00:00', '23:59:59', '6,7', NULL, NULL, 0, '周末维护窗口默认禁用', 'system', NOW());

--
DROP TABLE IF EXISTS wf_deploy_record;
CREATE TABLE wf_deploy_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             NOT NULL COMMENT '版本号',
  deploy_status     VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT '发布状态',
  deploy_by         BIGINT(20)      NOT NULL COMMENT '发布人ID',
  deployer_name     VARCHAR(100)    DEFAULT NULL COMMENT '发布人姓名',
  deploy_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  deploy_note       VARCHAR(500)    DEFAULT NULL COMMENT '发布说明',
  change_log        TEXT COMMENT '变更日志',
  can_rollback      TINYINT(1)      DEFAULT 1 COMMENT '是否允许回滚',
  rollback_from_version INT         DEFAULT NULL COMMENT '回滚来源版本',
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '回滚原因',
  rollback_by       BIGINT(20)      DEFAULT NULL COMMENT '回滚人ID',
  rollback_time     DATETIME        DEFAULT NULL COMMENT '回滚时间',
  approval_id       BIGINT(20)      DEFAULT NULL COMMENT '审批ID',
  deploy_window_id  BIGINT(20)      DEFAULT NULL COMMENT '发布窗口ID',
  impact_analysis   TEXT COMMENT '影响分析',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_process_key (process_key),
  KEY idx_version (version),
  KEY idx_deploy_status (deploy_status),
  KEY idx_deploy_time (deploy_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布记录表';

--
DROP TABLE IF EXISTS wf_deploy_approval;
CREATE TABLE wf_deploy_approval (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '发布记录ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  approval_status   VARCHAR(20)     DEFAULT 'PENDING' COMMENT '审批状态',
  current_step      INT             DEFAULT 1 COMMENT '当前审批步骤',
  total_steps       INT             DEFAULT 1 COMMENT '总审批步骤数',
  approval_config   TEXT            DEFAULT NULL COMMENT '审批配置',
  submitter_id      BIGINT(20)      NOT NULL COMMENT '提交人ID',
  submit_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_submitter_id (submitter_id),
  KEY idx_approval_status (approval_status),
  KEY idx_submit_time (submit_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布审批表';

--
DROP TABLE IF EXISTS wf_deploy_approval_step;
CREATE TABLE wf_deploy_approval_step (
  id                 BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id          BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  approval_id        BIGINT(20)      NOT NULL COMMENT '审批ID',
  step_no            INT             NOT NULL COMMENT '步骤序号',
  step_name          VARCHAR(100)    DEFAULT NULL COMMENT '步骤名称',
  approver_type      VARCHAR(20)     NOT NULL COMMENT '审批人类型(USER/ROLE/DEPT)',
  approver_ids       VARCHAR(500)    NOT NULL COMMENT '审批人ID列表',
  approval_mode      VARCHAR(20)     DEFAULT 'ANY' COMMENT '审批模式(ANY/ALL/SEQUENCE)',
  step_status        VARCHAR(20)     DEFAULT 'PENDING' COMMENT '步骤状态',
  actual_approver_id BIGINT(20)      DEFAULT NULL COMMENT '实际审批人ID',
  approval_comment   VARCHAR(500)    DEFAULT NULL COMMENT '审批意见',
  approval_time      DATETIME        DEFAULT NULL COMMENT '审批时间',
  created_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_approval_id (approval_id),
  KEY idx_step_no (step_no),
  KEY idx_step_status (step_status),
  KEY idx_approver_type (approver_type),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布审批步骤表';

--
DROP TABLE IF EXISTS wf_deploy_notification;
CREATE TABLE wf_deploy_notification (
  id                   BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id            BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id            BIGINT(20)      NOT NULL COMMENT '发布记录ID',
  notification_type    VARCHAR(20)     NOT NULL COMMENT '通知类型(EMAIL/SMS/WEBSOCKET/WECHAT)',
  recipient_type       VARCHAR(20)     NOT NULL COMMENT '接收人类型(USER/ROLE/DEPT/ALL)',
  recipient_ids        VARCHAR(500)    NOT NULL COMMENT '接收人ID列表',
  notification_title   VARCHAR(200)    DEFAULT NULL COMMENT '通知标题',
  notification_content TEXT            DEFAULT NULL COMMENT '通知内容',
  send_status          VARCHAR(20)     DEFAULT 'PENDING' COMMENT '发送状态',
  send_time            DATETIME        DEFAULT NULL COMMENT '发送时间',
  error_message        TEXT            DEFAULT NULL COMMENT '错误信息',
  created_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_send_status (send_status),
  KEY idx_created_time (created_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布通知表';

-- C6: wf_process_version_snapshot 已下线(版本体系统一到 wf_process_definition 多版本行,回滚直接引用历史版本行)

-- 旧通知表已由统一消息中心（sys_message_*）替代，故不再建表。

--
DROP TABLE IF EXISTS wf_urge_effect;
CREATE TABLE wf_urge_effect (
  effect_id         VARCHAR(64)     NOT NULL COMMENT '催办效果ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  urge_id           VARCHAR(64)     NOT NULL COMMENT '催办ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  before_duration   BIGINT          DEFAULT NULL COMMENT '催办前处理时长(秒)',
  after_duration    BIGINT          DEFAULT NULL COMMENT '催办后处理时长(秒)',
  effectiveness     INT             DEFAULT NULL COMMENT '催办效果等级(1最低/5最高)',
  urge_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '催办时间',
  complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (effect_id),
  KEY idx_urge_id (urge_id),
  KEY idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='催办效果表';

--
DROP TABLE IF EXISTS wf_process_copy;
CREATE TABLE wf_process_copy (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`       BIGINT       DEFAULT NULL COMMENT '租户ID',
  `instance_id`     VARCHAR(64)  NOT NULL COMMENT '流程实例ID',
  `process_def_key` VARCHAR(128) NOT NULL COMMENT '流程定义Key',
  `title`           VARCHAR(256) DEFAULT NULL COMMENT '标题',
  `node_id`         VARCHAR(64)  DEFAULT NULL COMMENT '节点ID',
  `node_name`       VARCHAR(128) DEFAULT NULL COMMENT '节点名称',
  `start_user_id`   BIGINT       DEFAULT NULL COMMENT '发起人ID',
  `start_user_name` VARCHAR(100) DEFAULT NULL COMMENT '发起人姓名',
  `user_id`         BIGINT       NOT NULL COMMENT '用户ID',
  `form_data`       TEXT         DEFAULT NULL COMMENT '表单数据',
  `is_read`         TINYINT      NOT NULL DEFAULT 0 COMMENT '是否已读',
  `read_time`       DATETIME     DEFAULT NULL COMMENT '阅读时间',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id`     (`user_id`, `is_read`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='流程抄送表';

SET FOREIGN_KEY_CHECKS = 1;
DROP TABLE IF EXISTS wf_deploy_rollback_history;
CREATE TABLE wf_deploy_rollback_history (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  original_deploy_id BIGINT(20)     NOT NULL COMMENT '原发布记录ID',
  rollback_deploy_id BIGINT(20)     NOT NULL COMMENT '回滚发布记录ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
    from_version      INT             NOT NULL COMMENT '来源版本',
    to_version        INT             NOT NULL COMMENT '目标版本',
    rollback_type     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '回滚类型(MANUAL/AUTO)',
    rollback_status   VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT '回滚状态',
    rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '回滚原因',
    rollback_by       BIGINT(20)      NOT NULL COMMENT '回滚人ID',
  rollback_by_name  VARCHAR(100)    DEFAULT NULL COMMENT '回滚人姓名',
  rollback_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '回滚时间',
  success           TINYINT(1)      DEFAULT 1 COMMENT '是否成功',
  error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
  PRIMARY KEY (id),
  KEY idx_original_deploy (original_deploy_id),
  KEY idx_rollback_deploy (rollback_deploy_id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布回滚历史表';

--
DROP TABLE IF EXISTS wf_deploy_impact;
CREATE TABLE wf_deploy_impact (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '发布ID',
  impact_type       VARCHAR(30)     NOT NULL COMMENT '影响类型(RUNNING_INSTANCE/PENDING_TASK/FORM_CHANGE/NODE_CHANGE)',
  impact_level      VARCHAR(20)     NOT NULL COMMENT '影响级别(LOW/MEDIUM/HIGH/CRITICAL)',
  impact_count      INT             DEFAULT 0 COMMENT '影响数量',
  impact_detail     TEXT            DEFAULT NULL COMMENT '影响详情',
  mitigation_plan   TEXT            DEFAULT NULL COMMENT '缓解方案',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_impact_type (impact_type),
  KEY idx_impact_level (impact_level),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布影响表';

--
DROP TABLE IF EXISTS wf_hot_update_record;
CREATE TABLE wf_hot_update_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  process_key       VARCHAR(128)    NOT NULL COMMENT '流程Key',
  from_version      INT             NOT NULL COMMENT '源版本号',
  to_version        INT             NOT NULL COMMENT '目标版本号',
  migration_mode    VARCHAR(32)     NOT NULL COMMENT '迁移模式: COMPATIBLE/FORCE/RESTART',
  total_instances   INT             DEFAULT 0 COMMENT '受影响实例总数',
  migrated_count    INT             DEFAULT 0 COMMENT '成功迁移数',
  skipped_count     INT             DEFAULT 0 COMMENT '跳过数',
  failed_count      INT             DEFAULT 0 COMMENT '失败数',
  executed_by       VARCHAR(64)     DEFAULT NULL COMMENT '执行人',
  executed_at       DATETIME        DEFAULT NULL COMMENT '执行时间',
  details_json      TEXT            DEFAULT NULL COMMENT '迁移详情JSON',
  tenant_id         BIGINT(20)      DEFAULT NULL COMMENT '租户ID',
  PRIMARY KEY (id),
  KEY idx_process_key (process_key),
  KEY idx_executed_at (executed_at),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流热更新记录';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_template;
CREATE TABLE wf_template (
    id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(200) NOT NULL COMMENT '名称',
    description TEXT COMMENT '描述',
    category_id VARCHAR(64) COMMENT '分类ID',
    tags JSON COMMENT '标签',
    definition JSON NOT NULL COMMENT '定义内容',
    preview_image VARCHAR(500) COMMENT '预览图',
    created_by VARCHAR(64) NOT NULL COMMENT '创建人',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    usage_count INT DEFAULT 0 COMMENT '使用次数',
    is_system TINYINT(1) DEFAULT 0 COMMENT '是否系统内置',
    status VARCHAR(20) DEFAULT 'active' COMMENT '状态',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    tenant_id BIGINT(20) DEFAULT NULL COMMENT '租户ID',
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status),
    INDEX idx_tenant (tenant_id),
    INDEX idx_category_status (category_id, status) COMMENT '分类状态索引',
    INDEX idx_usage_count (usage_count DESC) COMMENT '使用次数索引',
    INDEX idx_created_at (created_at DESC) COMMENT '创建时间索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流模板表';

--
DROP TABLE IF EXISTS wf_template_category;
CREATE TABLE wf_template_category (
    id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
    name VARCHAR(100) NOT NULL COMMENT '名称',
    description VARCHAR(500) COMMENT '描述',
    parent_id VARCHAR(64) COMMENT '父级ID',
    order_num INT DEFAULT 0 COMMENT '排序号',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    tenant_id BIGINT(20) DEFAULT NULL COMMENT '租户ID',
    INDEX idx_parent (parent_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_parent_order (parent_id, order_num) COMMENT '父级排序索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='模板分类表';

-- C6: wf_template_version 已下线(版本体系统一到 wf_process_definition 多版本行,语义化版本等元数据在 definition 行新列)

--
DROP TABLE IF EXISTS wf_template_archive;
CREATE TABLE wf_template_archive (
    id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
    workflow_id VARCHAR(64) NOT NULL COMMENT '工作流ID',
    workflow_name VARCHAR(200) NOT NULL COMMENT '工作流名称',
    archived_by VARCHAR(64) NOT NULL COMMENT '归档人',
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '归档时间',
    archive_reason TEXT COMMENT '归档原因',
    can_restore TINYINT(1) DEFAULT 1 COMMENT '是否可恢复',
    original_data JSON NOT NULL COMMENT '原始数据',
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at),
    INDEX idx_tenant (tenant_id),
    INDEX idx_archived_at_desc (archived_at DESC) COMMENT '归档时间倒序索引',
    INDEX idx_archived_by_time (archived_by, archived_at DESC) COMMENT '归档人时间索引',
    INDEX idx_workflow_restore (workflow_id, can_restore) COMMENT '工作流恢复索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流归档表';

--
DROP TABLE IF EXISTS wf_process_monitor;
CREATE TABLE wf_process_monitor (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    instance_id VARCHAR(64) NOT NULL COMMENT '流程实例ID',
    process_def_id VARCHAR(64) COMMENT '流程定义ID',
    process_def_key VARCHAR(100) NOT NULL COMMENT '流程定义Key',
    process_def_name VARCHAR(200) COMMENT '流程定义名称',
    business_key VARCHAR(100) COMMENT '业务主键',
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING' COMMENT '状态',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    duration BIGINT COMMENT '耗时毫秒数',
    node_count INT NOT NULL DEFAULT 0 COMMENT '节点数量',
    task_count INT NOT NULL DEFAULT 0 COMMENT '任务数量',
    start_user_id BIGINT COMMENT '发起人ID',
    start_user_name VARCHAR(100) COMMENT '发起人姓名',
    error_message TEXT COMMENT '错误信息',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_instance_id (instance_id),
    INDEX idx_tenant_status (tenant_id, status),
    INDEX idx_process_def_key (tenant_id, process_def_key),
    INDEX idx_start_time (start_time),
    INDEX idx_business_key (business_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程监控表';

--
DROP TABLE IF EXISTS wf_task_monitor;
CREATE TABLE wf_task_monitor (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    task_id VARCHAR(64) NOT NULL COMMENT '任务ID',
    instance_id VARCHAR(64) NOT NULL COMMENT '流程实例ID',
    node_key VARCHAR(100) COMMENT '节点Key',
    task_name VARCHAR(200) COMMENT '任务名称',
    assignee_id BIGINT COMMENT '处理人ID',
    assignee_name VARCHAR(100) COMMENT '处理人姓名',
    create_time_task DATETIME NOT NULL COMMENT '任务创建时间',
    claim_time DATETIME COMMENT '认领时间',
    complete_time DATETIME COMMENT '完成时间',
    wait_duration BIGINT COMMENT '等待耗时毫秒数',
    handle_duration BIGINT COMMENT '处理耗时毫秒数',
    total_duration BIGINT COMMENT '总耗时毫秒数',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDING' COMMENT '状态',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    action VARCHAR(30) COMMENT '操作动作(APPROVE/SUBMIT/URGE/DELEGATE/DISABLE/ESCALATE_REASSIGN/TRANSFER)',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_task_id (task_id),
    INDEX idx_instance_id (instance_id),
    INDEX idx_assignee_status (tenant_id, assignee_id, status),
    INDEX idx_create_time_task (create_time_task)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务监控表';

--
DROP TABLE IF EXISTS wf_node_monitor;
CREATE TABLE wf_node_monitor (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    instance_id VARCHAR(64) NOT NULL COMMENT '流程实例ID',
    node_id VARCHAR(100) COMMENT '节点ID',
    node_key VARCHAR(100) COMMENT '节点Key',
    node_name VARCHAR(200) COMMENT '节点名称',
    node_type VARCHAR(50) COMMENT '节点类型(APPROVAL/START)',
    start_time DATETIME NOT NULL COMMENT '开始时间',
    end_time DATETIME COMMENT '结束时间',
    duration BIGINT COMMENT '耗时毫秒数',
    status VARCHAR(30) NOT NULL DEFAULT 'RUNNING' COMMENT '状态',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    error_message TEXT COMMENT '错误信息',
    retry_count INT NOT NULL DEFAULT 0 COMMENT '重试次数',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_instance_id (instance_id),
    INDEX idx_node_key (tenant_id, node_key),
    INDEX idx_status (tenant_id, status),
    INDEX idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点监控表';

--
DROP TABLE IF EXISTS wf_timeout_alert;
CREATE TABLE wf_timeout_alert (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    alert_type VARCHAR(30) NOT NULL COMMENT '告警类型(TASK/PROCESS)',
    target_id VARCHAR(64) NOT NULL COMMENT '目标ID',
    target_name VARCHAR(200) COMMENT '目标名称',
    timeout_level VARCHAR(30) NOT NULL COMMENT '超时级别(REMIND/WARNING/CRITICAL)',
    timeout_duration BIGINT COMMENT '超时时长毫秒数',
    threshold BIGINT COMMENT '阈值毫秒数',
    assignee_id BIGINT COMMENT '处理人ID',
    assignee_name VARCHAR(100) COMMENT '处理人姓名',
    alert_time DATETIME NOT NULL COMMENT '告警时间',
    notification_sent CHAR(1) NOT NULL DEFAULT 'N' COMMENT '是否已发送通知',
    escalated CHAR(1) NOT NULL DEFAULT 'N' COMMENT '是否已升级',
    escalated_to_id BIGINT COMMENT '升级接收人ID',
    escalated_to_name VARCHAR(100) COMMENT '升级接收人姓名',
    escalated_time DATETIME COMMENT '升级时间',
    resolved CHAR(1) NOT NULL DEFAULT 'N' COMMENT '是否已解决',
    resolved_by_id BIGINT COMMENT '解决人ID',
    resolved_by_name VARCHAR(100) COMMENT '解决人姓名',
    resolve_note TEXT COMMENT '解决说明',
    resolve_time DATETIME COMMENT '解决时间',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_tenant_level (tenant_id, timeout_level),
    INDEX idx_target (alert_type, target_id),
    INDEX idx_resolved (tenant_id, resolved),
    INDEX idx_escalation_todo (tenant_id, escalated, escalated_to_id, resolved, escalated_time),
    INDEX idx_alert_time (alert_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超时告警表';

-- M4-1: 超时升级链配置
DROP TABLE IF EXISTS wf_escalation_chain;
CREATE TABLE wf_escalation_chain (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT DEFAULT 100000 COMMENT '租户ID',
    biz_module VARCHAR(32) NOT NULL COMMENT '业务模块(auth/workflow/oa/crm/hr/system)',
    level_no INT NOT NULL COMMENT '升级级别',
    timeout_minutes INT NOT NULL COMMENT '超时分钟数',
    action_type VARCHAR(32) NOT NULL COMMENT '动作类型(NOTIFY/REASSIGN/ESCALATE)',
    action_target VARCHAR(128) COMMENT '动作目标(CURRENT_ASSIGNEE/DIRECT_LEADER/ROLE:xxx/USER:xxx)',
    status TINYINT(1) NOT NULL DEFAULT 1 COMMENT '状态(1启用 0停用)',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_tenant_module_level (tenant_id, biz_module, level_no),
    KEY idx_module_status (tenant_id, biz_module, status),
    KEY idx_timeout_minutes (timeout_minutes)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流超时升级链配置';

-- M4-1: 超时升级执行日志，按 task_id + level_no 去重
DROP TABLE IF EXISTS wf_escalation_log;
CREATE TABLE wf_escalation_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT DEFAULT 100000 COMMENT '租户ID',
    task_id VARCHAR(64) NOT NULL COMMENT '任务ID',
    instance_id VARCHAR(64) COMMENT '流程实例ID',
    biz_module VARCHAR(32) NOT NULL COMMENT '业务模块',
    level_no INT NOT NULL COMMENT '升级级别',
    action_type VARCHAR(32) NOT NULL COMMENT '动作类型(ESCALATE/NOTIFY/REASSIGN)',
    action_target VARCHAR(128) COMMENT '动作目标',
    target_user_id BIGINT COMMENT '目标用户ID',
    target_user_name VARCHAR(100) COMMENT '目标用户姓名',
    trigger_at DATETIME NOT NULL COMMENT '触发时间',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    UNIQUE KEY uk_task_level (task_id, level_no),
    KEY idx_tenant_module (tenant_id, biz_module),
    KEY idx_trigger_at (trigger_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流超时升级日志';

--
DROP TABLE IF EXISTS wf_anomaly_alert;
CREATE TABLE wf_anomaly_alert (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    instance_id VARCHAR(64) COMMENT '流程实例ID',
    task_id VARCHAR(64) COMMENT '任务ID',
    process_def_key VARCHAR(100) COMMENT '流程定义Key',
    process_def_name VARCHAR(200) COMMENT '流程定义名称',
    node_key VARCHAR(100) COMMENT '节点Key',
    node_name VARCHAR(200) COMMENT '节点名称',
    anomaly_type VARCHAR(50) NOT NULL COMMENT '异常类型(APPROVER_UNAVAILABLE/BUSINESS_EXCEPTION/CALLBACK_FAILED/DATA_INCONSISTENCY/DEADLOCK/EXECUTION_FAILED/NODE_TIMEOUT/NO_ASSIGNEE/SCHEDULER_EXCEPTION)',
    severity VARCHAR(30) NOT NULL COMMENT '严重程度',
    error_message TEXT COMMENT '错误信息',
    stack_trace MEDIUMTEXT COMMENT '堆栈信息',
    resolved CHAR(1) NOT NULL DEFAULT 'N' COMMENT '是否已解决',
    resolve_note TEXT COMMENT '解决说明',
    alert_time DATETIME NOT NULL COMMENT '告警时间',
    resolve_time DATETIME COMMENT '解决时间',
    notification_sent CHAR(1) NOT NULL DEFAULT 'N' COMMENT '是否已发送通知',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    INDEX idx_tenant_resolved (tenant_id, resolved),
    INDEX idx_instance_id (instance_id),
    INDEX idx_process_def_key (tenant_id, process_def_key),
    INDEX idx_anomaly_type (tenant_id, anomaly_type),
    INDEX idx_severity (tenant_id, severity),
    INDEX idx_alert_time (alert_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常告警表';

--
DROP TABLE IF EXISTS wf_performance_stats;
CREATE TABLE wf_performance_stats (
    id BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
    tenant_id BIGINT COMMENT '租户ID',
    stat_date DATE NOT NULL COMMENT '统计日期',
    process_def_key VARCHAR(100) NOT NULL COMMENT '流程定义Key',
    process_def_name VARCHAR(200) COMMENT '流程定义名称',
    total_count INT NOT NULL DEFAULT 0 COMMENT '总数',
    completed_count INT NOT NULL DEFAULT 0 COMMENT '完成数',
    failed_count INT NOT NULL DEFAULT 0 COMMENT '失败数',
    timeout_count INT NOT NULL DEFAULT 0 COMMENT '超时事件数',
    timeout_instance_count INT NOT NULL DEFAULT 0 COMMENT '超时流程实例数',
    anomaly_count INT NOT NULL DEFAULT 0 COMMENT '异常事件数',
    anomaly_instance_count INT NOT NULL DEFAULT 0 COMMENT '异常流程实例数',
    avg_duration BIGINT NOT NULL DEFAULT 0 COMMENT '平均耗时毫秒数',
    min_duration BIGINT NOT NULL DEFAULT 0 COMMENT '最短耗时毫秒数',
    max_duration BIGINT NOT NULL DEFAULT 0 COMMENT '最长耗时毫秒数',
    create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    UNIQUE KEY uk_tenant_date_process (tenant_id, stat_date, process_def_key),
    INDEX idx_stat_date (stat_date),
    INDEX idx_process_def_key (process_def_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='性能统计表';

--
--
--
--
DROP TABLE IF EXISTS wf_audit_log;
CREATE TABLE wf_audit_log (
    id VARCHAR(64) PRIMARY KEY COMMENT '主键ID',
    operation_type VARCHAR(50) NOT NULL COMMENT '操作类型',
    target_type VARCHAR(50) NOT NULL COMMENT '目标类型',
    target_id VARCHAR(64) NOT NULL COMMENT '目标ID',
    target_name VARCHAR(200) COMMENT '目标名称',
    operator_id VARCHAR(64) NOT NULL COMMENT '操作人ID',
    operator_name VARCHAR(100) COMMENT '操作人姓名',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    operation_reason TEXT COMMENT '操作原因',
    operation_details TEXT COMMENT '操作详情',
    operation_result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT '操作结果',
    error_message TEXT COMMENT '错误信息',
    ip_address VARCHAR(50) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT '用户代理',
    tenant_id BIGINT COMMENT '租户ID',
    INDEX idx_operation_type (operation_type),
    INDEX idx_target_type (target_type),
    INDEX idx_target_id (target_id),
    INDEX idx_operator_id (operator_id),
    INDEX idx_operation_time (operation_time),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_target_operation (target_type, target_id, operation_type) COMMENT '目标操作索引',
    INDEX idx_operator_time (operator_id, operation_time DESC) COMMENT '操作人时间索引'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流审计日志表';

DROP TRIGGER IF EXISTS trg_wf_audit_log_no_delete;
DROP TRIGGER IF EXISTS trg_wf_audit_log_no_update;

DELIMITER $$

CREATE TRIGGER trg_wf_audit_log_no_delete
BEFORE DELETE ON wf_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: wf_audit_log delete is forbidden';
END$$

CREATE TRIGGER trg_wf_audit_log_no_update
BEFORE UPDATE ON wf_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: wf_audit_log update is forbidden';
END$$

DELIMITER ;

-- P0-2: 回调死信队列
-- tenant_id 用于运维侧按租户筛选死信，但本表纳入 cloudflow.tenant.ignore-tables，
-- 由消费者从消息载荷显式取 tenantId 写入；MP 不会自动追加 WHERE 条件，跨租户排障可直接列出。
DROP TABLE IF EXISTS wf_callback_dead_letter;
CREATE TABLE wf_callback_dead_letter (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id           BIGINT DEFAULT 100000 COMMENT '租户ID（运维筛选用，本表不参与 MP 自动租户过滤）',
  stream_key          VARCHAR(128) NOT NULL COMMENT 'Redis Stream 键名',
  process_instance_id VARCHAR(64) COMMENT '流程实例ID',
  business_type       VARCHAR(64) COMMENT '业务类型(CRM_SALES_CONTRACT/HR_CONTRACT_RENEW/HR_RESIGNATION)',
  business_id         BIGINT COMMENT '业务主键ID',
  payload_json        JSON NOT NULL COMMENT '原始消息载荷(JSON)',
  retry_count         INT DEFAULT 0 COMMENT '已重试次数',
  last_error          TEXT COMMENT '最后一次错误信息',
  status              VARCHAR(16) DEFAULT 'PENDING' COMMENT '处理状态(PENDING/REPLAYED/DISCARDED)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_time         DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '入队时间',
  update_time         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '最近更新时间',
  UNIQUE KEY uk_process_instance (process_instance_id),
  KEY idx_dlq_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='回调死信队列';

-- 工作流回调业务副作用幂等表
-- 用于防止 DLQ 重放、Stream 重复投递导致培训人数、站内信、业务副作用重复执行。
DROP TABLE IF EXISTS wf_callback_side_effect;
CREATE TABLE wf_callback_side_effect (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id           BIGINT NOT NULL COMMENT '租户ID',
  business_type       VARCHAR(64) NOT NULL COMMENT '业务类型',
  business_id         BIGINT NOT NULL COMMENT '业务主键ID',
  process_instance_id VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  effect_key          VARCHAR(64) NOT NULL COMMENT '副作用类型',
  create_time         DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_wf_callback_side_effect (tenant_id, business_type, business_id, process_instance_id, effect_key),
  KEY idx_wf_callback_side_effect_biz (tenant_id, business_type, business_id),
  KEY idx_wf_callback_side_effect_inst (process_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流回调业务副作用幂等表';

-- P0-3: 流程-业务状态对账告警
-- tenant_id 由对账 Job 跨租户扫描后从业务行的 tenant_id 回写；本表纳入 cloudflow.tenant.ignore-tables，
-- MP 不会自动追加 WHERE 条件，平台运维侧可直接看到所有租户告警。
DROP TABLE IF EXISTS wf_reconcile_alert;
CREATE TABLE wf_reconcile_alert (
  id                  BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id           BIGINT DEFAULT 100000 COMMENT '租户ID（来自业务行；本表不参与 MP 自动租户过滤）',
  biz_module          VARCHAR(32) NOT NULL COMMENT '业务模块',
  biz_id              BIGINT NOT NULL COMMENT '业务主键ID',
  wf_instance_id      VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  biz_status          VARCHAR(32) COMMENT '业务状态',
  wf_status           VARCHAR(32) COMMENT '流程状态',
  detected_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '发现时间',
  resolved_at         DATETIME COMMENT '解决时间',
  resolved_by         BIGINT COMMENT '解决人',
  create_time         DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time         DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  UNIQUE KEY uk_reconcile_open (wf_instance_id, biz_module, biz_id, biz_status, wf_status),
  KEY idx_alert_tenant (tenant_id),
  KEY idx_detected_at (detected_at),
  KEY idx_resolved_at (resolved_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程业务状态对账告警';

DROP TABLE IF EXISTS wf_gateway_activation;
CREATE TABLE wf_gateway_activation (
  activation_id       VARCHAR(64) NOT NULL COMMENT '网关本轮激活ID',
  tenant_id           BIGINT(20) NOT NULL COMMENT '租户ID',
  instance_id         VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  gateway_id          VARCHAR(64) NOT NULL COMMENT '分流网关节点ID',
  join_node_key       VARCHAR(64) NOT NULL COMMENT '对应汇聚节点ID',
  join_type           VARCHAR(20) NOT NULL COMMENT 'PARALLEL或INCLUSIVE',
  activated_branches  JSON NOT NULL COMMENT '本轮实际激活的出口边ID集合',
  expected_count      INT NOT NULL COMMENT '本轮应到分支数',
  parent_context      JSON DEFAULT NULL COMMENT '服务器父层执行上下文',
  status              VARCHAR(20) NOT NULL DEFAULT 'WAITING' COMMENT 'WAITING或RELEASED或CANCELLED',
  released_time       DATETIME DEFAULT NULL COMMENT '本轮放行时间',
  version             INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (activation_id),
  KEY idx_activation_instance (tenant_id, instance_id, status),
  KEY idx_activation_gateway (tenant_id, instance_id, gateway_id),
  CONSTRAINT chk_activation_expected CHECK (expected_count > 0),
  CONSTRAINT chk_activation_type CHECK (join_type IN ('PARALLEL','INCLUSIVE'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='网关实际激活分支及放行状态';

DROP TABLE IF EXISTS wf_parallel_join;
CREATE TABLE wf_parallel_join (
  id                  BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '物理主键ID，保留既有类型',
  tenant_id           BIGINT(20) NOT NULL COMMENT '租户ID',
  instance_id         VARCHAR(64) NOT NULL COMMENT '流程实例ID',
  gateway_id          VARCHAR(64) NOT NULL COMMENT '分流网关节点ID',
  activation_id       VARCHAR(64) NOT NULL COMMENT '本轮网关激活ID',
  branch_key          VARCHAR(64) NOT NULL COMMENT '实际激活的出口边ID',
  join_type           VARCHAR(20) NOT NULL COMMENT 'PARALLEL或INCLUSIVE',
  expected_count      INT NOT NULL COMMENT '本轮应到分支数快照',
  create_time         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '到达时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_join_arrival (tenant_id, activation_id, branch_key),
  KEY idx_join_instance (tenant_id, instance_id, gateway_id),
  CONSTRAINT chk_join_expected CHECK (expected_count > 0),
  CONSTRAINT chk_join_type CHECK (join_type IN ('PARALLEL','INCLUSIVE'))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='网关本轮分支到达记录';

DROP TABLE IF EXISTS wf_form_field_permission;
CREATE TABLE wf_form_field_permission (
  permission_id     VARCHAR(64)     NOT NULL COMMENT '权限ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  definition_id     VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key，__START__表示发起环节',
  field_id          VARCHAR(100)    NOT NULL COMMENT '字段ID，子表列使用subTableId.columnId',
  visible_flag      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否可见',
  editable_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否可编辑',
  required_flag     TINYINT(1)      DEFAULT NULL COMMENT '是否必填，NULL继承字段定义',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (permission_id),
  UNIQUE KEY uk_wffp_def_node_field (tenant_id, definition_id, node_key, field_id),
  KEY idx_wffp_def_node (definition_id, node_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单字段权限表';

DROP TABLE IF EXISTS wf_form_draft;
CREATE TABLE wf_form_draft (
  draft_id                 VARCHAR(64)   NOT NULL COMMENT '草稿ID',
  tenant_id                BIGINT(20)    NOT NULL DEFAULT 100000 COMMENT '租户ID',
  definition_id            VARCHAR(64)   NOT NULL COMMENT '流程定义ID',
  definition_name          VARCHAR(100)  DEFAULT NULL COMMENT '流程名称快照',
  form_id                  VARCHAR(64)   DEFAULT NULL COMMENT '绑定表单ID',
  user_id                  BIGINT(20)    NOT NULL COMMENT '草稿所属用户ID',
  title                    VARCHAR(200)  DEFAULT NULL COMMENT '申请标题',
  form_data                LONGTEXT     COMMENT '表单数据JSON对象',
  node_assignees           TEXT         COMMENT '发起人自选审批人JSON对象',
  attachment_url           VARCHAR(1000) DEFAULT NULL COMMENT '预留附件引用，本轮不接受任意外部URL',
  definition_snapshot_hash CHAR(64)      NOT NULL COMMENT '流程表单及发起配置SHA256摘要',
  lock_version             INT          NOT NULL DEFAULT 1 COMMENT '草稿乐观锁版本号',
  last_save_time           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近有效保存时间',
  expire_time              DATETIME     NOT NULL COMMENT '最近有效保存30天后的到期时间',
  create_by                VARCHAR(64)   DEFAULT '' COMMENT '创建者',
  create_time              DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                VARCHAR(64)   DEFAULT '' COMMENT '更新者',
  update_time              DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (draft_id),
  UNIQUE KEY uk_wfdraft_user_def (tenant_id, user_id, definition_id),
  KEY idx_wfdraft_expire (expire_time, draft_id),
  KEY idx_wfdraft_user_save (tenant_id, user_id, last_save_time, draft_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单草稿表';

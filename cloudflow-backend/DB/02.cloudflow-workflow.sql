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
  definition_id     VARCHAR(64)     NOT NULL COMMENT 'definition_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  process_name      VARCHAR(64)     NOT NULL COMMENT 'process_name',
  process_key       VARCHAR(64)     NOT NULL COMMENT 'process_key',
  version           INT             DEFAULT 1 COMMENT 'version',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT 'form_id',
  model_json        LONGTEXT COMMENT 'model_json',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT 'status',
  version_lock      INT             DEFAULT 0 COMMENT 'version_lock',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT 'is_latest',
  category          VARCHAR(64)     DEFAULT NULL COMMENT 'category',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT 'tags',
  start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT 'start_permission_type',
  start_permission_value TEXT COMMENT 'start_permission_value',
  description       VARCHAR(500)    DEFAULT NULL COMMENT 'description',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT 'dept_id',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT 'create_by',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT 'update_by',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create_time',
  update_time       DATETIME        DEFAULT NULL COMMENT 'update_time',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT 'del_flag',
  template_id       VARCHAR(64)     DEFAULT NULL COMMENT 'template_id',
  current_version   VARCHAR(20)     DEFAULT '1.0.0' COMMENT 'current_version',
  is_archived       TINYINT(1)      DEFAULT 0 COMMENT 'is_archived',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  KEY idx_status (status),
  KEY idx_is_latest (is_latest),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag),
  KEY idx_template (template_id),
  KEY idx_archived (is_archived),
  KEY idx_version (current_version),
  KEY idx_template_archived (template_id, is_archived) COMMENT 'idx_template_archived',
  KEY idx_current_version (current_version) COMMENT 'idx_current_version',
  KEY idx_category_status (category, status, is_archived) COMMENT 'idx_category_status',
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_process_definition';

--
DROP TABLE IF EXISTS `wf_process_category`;
CREATE TABLE `wf_process_category` (
    `category_id`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'category_id',
    `parent_id`     BIGINT       DEFAULT 0 COMMENT 'parent_id',
    `category_name` VARCHAR(100) NOT NULL COMMENT 'category_name',
    `category_code` VARCHAR(100) NOT NULL COMMENT 'category_code',
    `icon`          VARCHAR(100) DEFAULT NULL COMMENT 'icon',
    `sort_order`    INT          DEFAULT 0 COMMENT 'sort_order',
    `status`        CHAR(1)      DEFAULT '0' COMMENT 'status',
    `remark`        VARCHAR(500) DEFAULT NULL COMMENT 'remark',
    `tenant_id`     BIGINT       DEFAULT NULL COMMENT 'tenant_id',
    `create_by`     VARCHAR(64)  DEFAULT NULL COMMENT 'create_by',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
    `update_by`     VARCHAR(64)  DEFAULT NULL COMMENT 'update_by',
    `update_time`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT 'update_time',
    PRIMARY KEY (`category_id`),
    UNIQUE KEY `uk_category_code` (`category_code`, `tenant_id`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_process_category';

--
DROP TABLE IF EXISTS wf_form_definition;
CREATE TABLE wf_form_definition (
  form_id           VARCHAR(64)     NOT NULL COMMENT 'form_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  form_name         VARCHAR(64)     NOT NULL COMMENT 'form_name',
  form_key          VARCHAR(64)     DEFAULT NULL COMMENT 'form_key',
  fields_json       LONGTEXT COMMENT 'fields_json',
  form_schema       LONGTEXT COMMENT 'form_schema',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT 'status',
  version           INT             DEFAULT 1 COMMENT 'version',
  version_lock      INT             DEFAULT 0 COMMENT 'version_lock',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT 'is_latest',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create_time',
  PRIMARY KEY (form_id),
  KEY idx_form_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_form_definition';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT 'process_def_key',
  definition_id     VARCHAR(64)     DEFAULT NULL COMMENT 'definition_id',
  business_key      VARCHAR(64)     NOT NULL COMMENT 'business_key',
  title             VARCHAR(255)    DEFAULT NULL COMMENT 'title',
  start_user_id     BIGINT(20)      NOT NULL COMMENT 'start_user_id',
  start_user_name   VARCHAR(64)     DEFAULT NULL COMMENT 'start_user_name',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT 'status',
  start_time        DATETIME        DEFAULT NULL COMMENT 'start_time',
  end_time          DATETIME        DEFAULT NULL COMMENT 'end_time',
  variables         JSON            DEFAULT NULL COMMENT 'variables',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT 'priority',
  process_no        VARCHAR(64)     DEFAULT NULL COMMENT 'process_no',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT 'dept_id',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT 'create_by',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT 'update_by',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create_time',
  update_time       DATETIME        DEFAULT NULL COMMENT 'update_time',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT 'del_flag',
  parent_instance_id VARCHAR(64)    DEFAULT NULL COMMENT 'parent_instance_id',
  parent_node_key   VARCHAR(64)     DEFAULT NULL COMMENT 'parent_node_key',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  KEY idx_business_key (business_key),
  KEY idx_proc_inst_tenant (tenant_id),
  KEY idx_start_user_status (start_user_id, status),
  KEY idx_process_key_status (process_def_key, status),
  KEY idx_start_time (start_time),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag),
  KEY idx_parent_instance (parent_instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_process_instance';

--
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  node_key          VARCHAR(64)     NOT NULL COMMENT 'node_key',
  node_name         VARCHAR(64)     NOT NULL COMMENT 'node_name',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT 'assignee',
  assignee_name     VARCHAR(64)     DEFAULT NULL COMMENT 'assignee_name',
  proxy_user_id     BIGINT(20)      DEFAULT NULL COMMENT 'proxy_user_id',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT 'candidate_roles',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT 'status',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT 'priority',
  is_timeout        TINYINT(1)      DEFAULT 0 COMMENT 'is_timeout',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create_time',
  due_time          DATETIME        DEFAULT NULL COMMENT 'due_time',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id),
  KEY idx_task_tenant (tenant_id),
  KEY idx_assignee_status (assignee, status),
  KEY idx_instance_status (instance_id, status),
  KEY idx_status (status),
  KEY idx_create_time (create_time),
  KEY idx_task_composite (assignee, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task';

--
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT 'history_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT 'node_name',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT 'node_key',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT 'operator_id',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT 'operator_name',
  action            VARCHAR(64)     DEFAULT NULL COMMENT 'action',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT 'comment',
  duration_seconds  INT             DEFAULT NULL COMMENT 'duration_seconds',
  variables_changed TEXT COMMENT 'variables_changed',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create_time',
  PRIMARY KEY (history_id),
  KEY idx_instance_hist (instance_id),
  KEY idx_operator_id (operator_id),
  KEY idx_create_time (create_time),
  KEY idx_instance_create_time (instance_id, create_time),
  KEY idx_operator_create_time (operator_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_history';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_task_read;
CREATE TABLE wf_task_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  user_id           BIGINT(20)      NOT NULL COMMENT 'user_id',
  read_time         DATETIME COMMENT 'read_time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_read';

--
DROP TABLE IF EXISTS wf_task_urge;
CREATE TABLE wf_task_urge (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  sender_id         BIGINT(20)      NOT NULL COMMENT 'sender_id',
  recipient_id      BIGINT(20)      NOT NULL COMMENT 'recipient_id',
  reason            VARCHAR(200)    DEFAULT NULL COMMENT 'reason',
  create_time       DATETIME COMMENT 'create_time',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_urge';

--
DROP TABLE IF EXISTS wf_task_attachment;
CREATE TABLE wf_task_attachment (
  attachment_id     VARCHAR(64)     NOT NULL COMMENT 'attachment_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  file_name         VARCHAR(255)    NOT NULL COMMENT 'file_name',
  file_path         VARCHAR(500)    NOT NULL COMMENT 'file_path',
  file_size         BIGINT          DEFAULT 0 COMMENT 'file_size',
  file_type         VARCHAR(50)     DEFAULT NULL COMMENT 'file_type',
  upload_user_id    BIGINT(20)      DEFAULT NULL COMMENT 'upload_user_id',
  upload_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'upload_time',
  PRIMARY KEY (attachment_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_attachment';

--
DROP TABLE IF EXISTS wf_task_delegation;
CREATE TABLE wf_task_delegation (
  delegation_id     VARCHAR(64)     NOT NULL COMMENT 'delegation_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  from_user_id      BIGINT(20)      NOT NULL COMMENT 'from_user_id',
  from_user_name    VARCHAR(64)     DEFAULT NULL COMMENT 'from_user_name',
  to_user_id        BIGINT(20)      NOT NULL COMMENT 'to_user_id',
  to_user_name      VARCHAR(64)     DEFAULT NULL COMMENT 'to_user_name',
  delegation_type   VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT 'delegation_type',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT 'reason',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT 'status',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (delegation_id),
  KEY idx_task_id (task_id),
  KEY idx_from_user (from_user_id),
  KEY idx_to_user (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_delegation';

--
DROP TABLE IF EXISTS wf_task_candidate;
CREATE TABLE wf_task_candidate (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  candidate_type    VARCHAR(20)     NOT NULL COMMENT 'candidate_type',
  candidate_id      VARCHAR(64)     NOT NULL COMMENT 'candidate_id',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id),
  KEY idx_candidate (candidate_type, candidate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_candidate';

--
DROP TABLE IF EXISTS wf_task_add_sign;
CREATE TABLE wf_task_add_sign (
  add_sign_id       VARCHAR(64)     NOT NULL COMMENT 'add_sign_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  sign_type         VARCHAR(20)     NOT NULL DEFAULT 'BEFORE' COMMENT 'sign_type',
  sign_user_ids     VARCHAR(500)    NOT NULL COMMENT 'sign_user_ids',
  sign_user_names   VARCHAR(500)    DEFAULT NULL COMMENT 'sign_user_names',
  initiator_id      BIGINT(20)      NOT NULL COMMENT 'initiator_id',
  initiator_name    VARCHAR(64)     DEFAULT NULL COMMENT 'initiator_name',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT 'reason',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT 'status',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  complete_time     DATETIME        DEFAULT NULL COMMENT 'complete_time',
  PRIMARY KEY (add_sign_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id),
  KEY idx_initiator_id (initiator_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_task_add_sign';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_countersign_task;
CREATE TABLE wf_countersign_task (
  countersign_id    VARCHAR(64)     NOT NULL COMMENT 'countersign_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  node_key          VARCHAR(64)     NOT NULL COMMENT 'node_key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT 'node_name',
  sign_type         VARCHAR(20)     NOT NULL COMMENT 'sign_type',
  pass_percent      INT             DEFAULT NULL COMMENT 'pass_percent',
  total_count       INT             DEFAULT 0 COMMENT 'total_count',
  voted_count       INT             DEFAULT 0 COMMENT 'voted_count',
  approve_count     INT             DEFAULT 0 COMMENT 'approve_count',
  reject_count      INT             DEFAULT 0 COMMENT 'reject_count',
  status            VARCHAR(20)     DEFAULT 'VOTING' COMMENT 'status',
  assignee_order    TEXT            DEFAULT NULL COMMENT 'assignee_order',
  current_index     INT             DEFAULT NULL COMMENT 'current_index',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  complete_time     DATETIME        DEFAULT NULL COMMENT 'complete_time',
  PRIMARY KEY (countersign_id),
  KEY idx_instance_id (instance_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_countersign_task';

--
DROP TABLE IF EXISTS wf_countersign_vote;
CREATE TABLE wf_countersign_vote (
  vote_id           VARCHAR(64)     NOT NULL COMMENT 'vote_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  countersign_id    VARCHAR(64)     NOT NULL COMMENT 'countersign_id',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT 'task_id',
  voter_id          BIGINT(20)      NOT NULL COMMENT 'voter_id',
  voter_name        VARCHAR(64)     DEFAULT NULL COMMENT 'voter_name',
  vote_result       VARCHAR(20)     NOT NULL COMMENT 'vote_result',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT 'comment',
  vote_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'vote_time',
  PRIMARY KEY (vote_id),
  KEY idx_countersign_id (countersign_id),
  KEY idx_voter_id (voter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_countersign_vote';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS wf_process_snapshot;
CREATE TABLE wf_process_snapshot (
  snapshot_id       VARCHAR(64)     NOT NULL COMMENT 'snapshot_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT 'node_key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT 'node_name',
  status            VARCHAR(20)     DEFAULT NULL COMMENT 'status',
  variables         LONGTEXT COMMENT 'variables',
  active_tasks      LONGTEXT COMMENT 'active_tasks',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (snapshot_id),
  KEY idx_instance_id (instance_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_process_snapshot';

--
DROP TABLE IF EXISTS wf_node_record;
CREATE TABLE wf_node_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  instance_id       VARCHAR(64)     NOT NULL COMMENT 'instance_id',
  process_def_key   VARCHAR(64)     DEFAULT NULL COMMENT 'process_def_key',
  node_key          VARCHAR(64)     NOT NULL COMMENT 'node_key',
  node_name         VARCHAR(128)    DEFAULT NULL COMMENT 'node_name',
  node_type         VARCHAR(32)     DEFAULT NULL COMMENT 'node_type',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT 'status',
  executor_id       BIGINT(20)      DEFAULT NULL COMMENT 'executor_id',
  executor_name     VARCHAR(64)     DEFAULT NULL COMMENT 'executor_name',
  start_time        DATETIME        DEFAULT NULL COMMENT 'start_time',
  end_time          DATETIME        DEFAULT NULL COMMENT 'end_time',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT 'duration_ms',
  extra_data        TEXT            DEFAULT NULL COMMENT 'extra_data',
  event_type        VARCHAR(32)     DEFAULT NULL COMMENT 'event_type',
  event_time        DATETIME        DEFAULT NULL COMMENT 'event_time',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (id),
  KEY idx_instance_id (instance_id),
  KEY idx_node_key (node_key),
  KEY idx_status (status),
  KEY idx_instance_node_status (instance_id, node_key, status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_node_record';

--
DROP TABLE IF EXISTS wf_transaction_message;
CREATE TABLE wf_transaction_message (
  message_id        VARCHAR(64)     NOT NULL COMMENT 'message_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  business_type     VARCHAR(50)     NOT NULL COMMENT 'business_type',
  business_id       VARCHAR(64)     NOT NULL COMMENT 'business_id',
  content           TEXT COMMENT 'content',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT 'status',
  retry_count       INT             DEFAULT 0 COMMENT 'retry_count',
  max_retry_count   INT             DEFAULT 5 COMMENT 'max_retry_count',
  next_retry_time   DATETIME        DEFAULT NULL COMMENT 'next_retry_time',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update_time',
  error_message     TEXT COMMENT 'error_message',
  PRIMARY KEY (message_id),
  KEY idx_status_retry (status, next_retry_time, retry_count),
  KEY idx_business (business_type, business_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_transaction_message';

--
DROP TABLE IF EXISTS wf_deploy_record;
CREATE TABLE wf_deploy_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT 'process_def_id',
  process_key       VARCHAR(64)     NOT NULL COMMENT 'process_key',
  version           INT             NOT NULL COMMENT 'version',
  deploy_status     VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT 'deploy_status',
  deploy_by         BIGINT(20)      NOT NULL COMMENT 'deploy_by',
  deployer_name     VARCHAR(64)     DEFAULT NULL COMMENT 'deployer_name',
  deploy_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'deploy_time',
  deploy_note       VARCHAR(500)    DEFAULT NULL COMMENT 'deploy_note',
  change_log        TEXT COMMENT 'change_log',
  can_rollback      TINYINT(1)      DEFAULT 1 COMMENT 'can_rollback',
  rollback_from_version INT         DEFAULT NULL COMMENT 'rollback_from_version',
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT 'rollback_reason',
  rollback_by       BIGINT(20)      DEFAULT NULL COMMENT 'rollback_by',
  rollback_time     DATETIME        DEFAULT NULL COMMENT 'rollback_time',
  approval_id       BIGINT(20)      DEFAULT NULL COMMENT 'approval_id',
  deploy_window_id  BIGINT(20)      DEFAULT NULL COMMENT 'deploy_window_id',
  impact_analysis   TEXT COMMENT 'impact_analysis',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'created_time',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated_time',
  PRIMARY KEY (id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_process_key (process_key),
  KEY idx_version (version),
  KEY idx_deploy_status (deploy_status),
  KEY idx_deploy_time (deploy_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_deploy_record';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'notice_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  notice_title      VARCHAR(50)     NOT NULL COMMENT 'notice_title',
  notice_type       CHAR(1)         NOT NULL COMMENT 'notice_type',
  notice_content    VARCHAR(500)    DEFAULT NULL COMMENT 'notice_content',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT 'sender_id',
  recipient_id      BIGINT(20)      NOT NULL COMMENT 'recipient_id',
  status            CHAR(1)         DEFAULT '0' COMMENT 'status',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT 'create_by',
  create_time       DATETIME COMMENT 'create_time',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT 'update_by',
  update_time       DATETIME COMMENT 'update_time',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT 'remark',
  PRIMARY KEY (notice_id)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='sys_notice';

--
DROP TABLE IF EXISTS wf_notification_log;
CREATE TABLE wf_notification_log (
  log_id            VARCHAR(64)     NOT NULL COMMENT 'log_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  notification_type VARCHAR(20)     NOT NULL COMMENT 'notification_type',
  recipient_id      BIGINT(20)      NOT NULL COMMENT 'recipient_id',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT 'recipient_name',
  title             VARCHAR(200)    DEFAULT NULL COMMENT 'title',
  content           TEXT COMMENT 'content',
  send_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT 'send_status',
  send_time         DATETIME        DEFAULT NULL COMMENT 'send_time',
  error_message     TEXT COMMENT 'error_message',
  related_type      VARCHAR(50)     DEFAULT NULL COMMENT 'related_type',
  related_id        VARCHAR(64)     DEFAULT NULL COMMENT 'related_id',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (log_id),
  KEY idx_recipient (recipient_id),
  KEY idx_send_status (send_status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_notification_log';

--
DROP TABLE IF EXISTS wf_notification_config;
CREATE TABLE wf_notification_config (
  config_id         VARCHAR(64)     NOT NULL COMMENT 'config_id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  config_name       VARCHAR(100)    NOT NULL COMMENT 'config_name',
  event_type        VARCHAR(50)     NOT NULL COMMENT 'event_type',
  notify_channel    VARCHAR(20)     NOT NULL COMMENT 'notify_channel',
  template_id       VARCHAR(64)     DEFAULT NULL COMMENT 'template_id',
  recipient_type    VARCHAR(20)     DEFAULT NULL COMMENT 'recipient_type',
  recipient_value   VARCHAR(500)    DEFAULT NULL COMMENT 'recipient_value',
  enabled           TINYINT(1)      DEFAULT 1 COMMENT 'enabled',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'update_time',
  PRIMARY KEY (config_id),
  KEY idx_event_type (event_type),
  KEY idx_enabled (enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_notification_config';

--
DROP TABLE IF EXISTS wf_urge_effect;
CREATE TABLE wf_urge_effect (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  task_id           VARCHAR(64)     NOT NULL COMMENT 'task_id',
  urge_count        INT             DEFAULT 0 COMMENT 'urge_count',
  first_urge_time   DATETIME        DEFAULT NULL COMMENT 'first_urge_time',
  last_urge_time    DATETIME        DEFAULT NULL COMMENT 'last_urge_time',
  task_complete_time DATETIME       DEFAULT NULL COMMENT 'task_complete_time',
  response_seconds  INT             DEFAULT NULL COMMENT 'response_seconds',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_urge_effect';

--
DROP TABLE IF EXISTS wf_process_copy;
CREATE TABLE wf_process_copy (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT 'id',
  `tenant_id`       BIGINT       DEFAULT NULL COMMENT 'tenant_id',
  `instance_id`     VARCHAR(64)  NOT NULL COMMENT 'instance_id',
  `process_def_key` VARCHAR(128) NOT NULL COMMENT 'process_def_key',
  `title`           VARCHAR(256) DEFAULT NULL COMMENT 'title',
  `node_id`         VARCHAR(64)  DEFAULT NULL COMMENT 'node_id',
  `node_name`       VARCHAR(128) DEFAULT NULL COMMENT 'node_name',
  `start_user_id`   BIGINT       DEFAULT NULL COMMENT 'start_user_id',
  `start_user_name` VARCHAR(64)  DEFAULT NULL COMMENT 'start_user_name',
  `user_id`         BIGINT       NOT NULL COMMENT 'user_id',
  `form_data`       TEXT         DEFAULT NULL COMMENT 'form_data',
  `is_read`         TINYINT      NOT NULL DEFAULT 0 COMMENT 'is_read',
  `read_time`       DATETIME     DEFAULT NULL COMMENT 'read_time',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (`id`),
  KEY `idx_user_id`     (`user_id`, `is_read`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='wf_process_copy';

SET FOREIGN_KEY_CHECKS = 1;
DROP TABLE IF EXISTS wf_deploy_rollback_history;
CREATE TABLE wf_deploy_rollback_history (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  original_deploy_id BIGINT(20)     NOT NULL COMMENT 'original_deploy_id',
  rollback_deploy_id BIGINT(20)     NOT NULL COMMENT 'rollback_deploy_id',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT 'process_def_id',
    from_version      INT             NOT NULL COMMENT 'from_version',
    to_version        INT             NOT NULL COMMENT 'to_version',
    rollback_type     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT 'rollback_type',
    rollback_status   VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT 'rollback_status',
    rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT 'rollback_reason',
    rollback_by       BIGINT(20)      NOT NULL COMMENT 'rollback_by',
  rollback_by_name  VARCHAR(64)     DEFAULT NULL COMMENT 'rollback_by_name',
  rollback_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'rollback_time',
  success           TINYINT(1)      DEFAULT 1 COMMENT 'success',
  error_message     TEXT            DEFAULT NULL COMMENT 'error_message',
  PRIMARY KEY (id),
  KEY idx_original_deploy (original_deploy_id),
  KEY idx_rollback_deploy (rollback_deploy_id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_deploy_rollback_history';

--
DROP TABLE IF EXISTS wf_deploy_impact;
CREATE TABLE wf_deploy_impact (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant_id',
  deploy_id         BIGINT(20)      NOT NULL COMMENT 'deploy_id',
  impact_type       VARCHAR(30)     NOT NULL COMMENT 'impact_type',
  impact_level      VARCHAR(20)     NOT NULL COMMENT 'impact_level',
  impact_count      INT             DEFAULT 0 COMMENT 'impact_count',
  impact_detail     TEXT            DEFAULT NULL COMMENT 'impact_detail',
  mitigation_plan   TEXT            DEFAULT NULL COMMENT 'mitigation_plan',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT 'create_time',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_impact_type (impact_type),
  KEY idx_impact_level (impact_level),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_deploy_impact';

-- =========================================================
--
-- =========================================================

--
DROP TABLE IF EXISTS workflow_template;
CREATE TABLE workflow_template (
    id VARCHAR(64) PRIMARY KEY COMMENT 'id',
    name VARCHAR(200) NOT NULL COMMENT 'name',
    description TEXT COMMENT 'description',
    category_id VARCHAR(64) COMMENT 'category_id',
    tags JSON COMMENT 'tags',
    definition JSON NOT NULL COMMENT 'definition',
    preview_image VARCHAR(500) COMMENT 'preview_image',
    created_by VARCHAR(64) NOT NULL COMMENT 'created_by',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created_at',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated_at',
    usage_count INT DEFAULT 0 COMMENT 'usage_count',
    is_system TINYINT(1) DEFAULT 0 COMMENT 'is_system',
    status VARCHAR(20) DEFAULT 'active' COMMENT 'status',
    tenant_id BIGINT(20) DEFAULT NULL COMMENT 'tenant_id',
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status),
    INDEX idx_tenant (tenant_id),
    INDEX idx_category_status (category_id, status) COMMENT 'idx_category_status',
    INDEX idx_usage_count (usage_count DESC) COMMENT 'idx_usage_count',
    INDEX idx_created_at (created_at DESC) COMMENT 'idx_created_at'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='workflow_template';

--
DROP TABLE IF EXISTS template_category;
CREATE TABLE template_category (
    id VARCHAR(64) PRIMARY KEY COMMENT 'id',
    name VARCHAR(100) NOT NULL COMMENT 'name',
    description VARCHAR(500) COMMENT 'description',
    parent_id VARCHAR(64) COMMENT 'parent_id',
    order_num INT DEFAULT 0 COMMENT 'order_num',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created_at',
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'updated_at',
    tenant_id BIGINT(20) DEFAULT NULL COMMENT 'tenant_id',
    INDEX idx_parent (parent_id),
    INDEX idx_tenant (tenant_id),
    INDEX idx_parent_order (parent_id, order_num) COMMENT 'idx_parent_order'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='template_category';

--
DROP TABLE IF EXISTS workflow_version;
CREATE TABLE workflow_version (
    id VARCHAR(64) PRIMARY KEY COMMENT 'id',
    workflow_id VARCHAR(64) NOT NULL COMMENT 'workflow_id',
    version_number VARCHAR(20) NOT NULL COMMENT 'version_number',
    definition JSON NOT NULL COMMENT 'definition',
    change_log TEXT COMMENT 'change_log',
    change_type VARCHAR(20) NOT NULL COMMENT 'change_type',
    created_by VARCHAR(64) NOT NULL COMMENT 'created_by',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'created_at',
    is_rollback TINYINT(1) DEFAULT 0 COMMENT 'is_rollback',
    rollback_from_version VARCHAR(20) COMMENT 'rollback_from_version',
    checksum VARCHAR(64) NOT NULL COMMENT 'checksum',
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT 'tenant_id',
    INDEX idx_workflow (workflow_id),
    INDEX idx_version (workflow_id, version_number),
    INDEX idx_created_at (created_at),
    INDEX idx_tenant (tenant_id),
    INDEX idx_workflow_created (workflow_id, created_at DESC) COMMENT 'idx_workflow_created',
    INDEX idx_workflow_version_number (workflow_id, version_number) COMMENT 'idx_workflow_version_number',
    UNIQUE KEY uk_workflow_version (workflow_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='workflow_version';

--
DROP TABLE IF EXISTS workflow_archive;
CREATE TABLE workflow_archive (
    id VARCHAR(64) PRIMARY KEY COMMENT 'id',
    workflow_id VARCHAR(64) NOT NULL COMMENT 'workflow_id',
    workflow_name VARCHAR(200) NOT NULL COMMENT 'workflow_name',
    archived_by VARCHAR(64) NOT NULL COMMENT 'archived_by',
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'archived_at',
    archive_reason TEXT COMMENT 'archive_reason',
    can_restore TINYINT(1) DEFAULT 1 COMMENT 'can_restore',
    original_data JSON NOT NULL COMMENT 'original_data',
    tenant_id BIGINT(20) DEFAULT 100000 COMMENT 'tenant_id',
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at),
    INDEX idx_tenant (tenant_id),
    INDEX idx_archived_at_desc (archived_at DESC) COMMENT 'idx_archived_at_desc',
    INDEX idx_archived_by_time (archived_by, archived_at DESC) COMMENT 'idx_archived_by_time',
    INDEX idx_workflow_restore (workflow_id, can_restore) COMMENT 'idx_workflow_restore'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='workflow_archive';

--
--
--
--
DROP TABLE IF EXISTS wf_audit_log;
CREATE TABLE wf_audit_log (
    id VARCHAR(64) PRIMARY KEY COMMENT 'id',
    operation_type VARCHAR(50) NOT NULL COMMENT 'operation_type',
    target_type VARCHAR(50) NOT NULL COMMENT 'target_type',
    target_id VARCHAR(64) NOT NULL COMMENT 'target_id',
    target_name VARCHAR(200) COMMENT 'target_name',
    operator_id VARCHAR(64) NOT NULL COMMENT 'operator_id',
    operator_name VARCHAR(100) COMMENT 'operator_name',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'operation_time',
    operation_reason TEXT COMMENT 'operation_reason',
    operation_details TEXT COMMENT 'operation_details',
    operation_result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT 'operation_result',
    error_message TEXT COMMENT 'error_message',
    ip_address VARCHAR(50) COMMENT 'ip_address',
    user_agent VARCHAR(500) COMMENT 'user_agent',
    tenant_id BIGINT COMMENT 'tenant_id',
    INDEX idx_operation_type (operation_type),
    INDEX idx_target_type (target_type),
    INDEX idx_target_id (target_id),
    INDEX idx_operator_id (operator_id),
    INDEX idx_operation_time (operation_time),
    INDEX idx_tenant_id (tenant_id),
    INDEX idx_target_operation (target_type, target_id, operation_type) COMMENT 'idx_target_operation',
    INDEX idx_operator_time (operator_id, operation_time DESC) COMMENT 'idx_operator_time'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='wf_audit_log';


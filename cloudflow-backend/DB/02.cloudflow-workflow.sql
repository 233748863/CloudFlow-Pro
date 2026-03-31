-- =========================================================
-- CloudFlow Pro - 工作流引擎核心模块数据库脚本
-- 模块：流程定义、流程实例、任务管理、表单定义、通知
-- 版本：v1.1
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

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

-- =========================================================
-- 初始化数据 - 流程分类、表单、流程定义与示例数据
-- =========================================================
INSERT INTO `wf_process_category` (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA办公',       'oa',            'Briefcase',    1, '0'),
(2, 0, '人事管理',     'hr',            'Users',        2, '0'),
(3, 0, '财务管理',     'finance',       'DollarSign',   3, '0'),
(4, 0, '行政管理',     'admin',         'Building',     4, '0'),
(5, 0, '项目管理',     'project',       'FolderKanban', 5, '0'),
(10, 1, '请假管理',    'oa_leave',      'Calendar',     1, '0'),
(11, 1, '加班管理',    'oa_overtime',   'Clock',        2, '0'),
(12, 1, '出差管理',    'oa_trip',       'Plane',        3, '0'),
(13, 1, '考勤管理',    'oa_attendance', 'UserCheck',    4, '0'),
(14, 1, '访客管理',    'oa_visitor',    'UserPlus',     5, '0'),
(20, 3, '报销管理',    'fin_expense',   'Receipt',      1, '0'),
(21, 3, '付款管理',    'fin_payment',   'CreditCard',   2, '0'),
(22, 3, '预算管理',    'fin_budget',    'PieChart',     3, '0'),
(30, 4, '车辆管理',    'adm_vehicle',   'Car',          1, '0'),
(31, 4, '会议管理',    'adm_meeting',   'Video',        2, '0'),
(32, 4, '通知管理',    'adm_notice',    'Bell',         3, '0');

-- 表单定义
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES
('form_reimburse', '财务报销表单', '[{"id":"f1","type":"SELECT","label":"报销类型","required":true,"options":["差旅费","招待费","办公费","团建费"]},{"id":"f2","type":"NUMBER","label":"报销金额","required":true},{"id":"f3","type":"DATE","label":"发生日期","required":true},{"id":"f4","type":"TEXTAREA","label":"费用明细说明","required":true}]', NOW()),
('form_payment', '对公付款申请表单', '[{"id":"p1","type":"TEXT","label":"收款方名称","required":true},{"id":"p2","type":"TEXT","label":"银行账号","required":true},{"id":"p3","type":"NUMBER","label":"付款金额","required":true},{"id":"p4","type":"TEXT","label":"合同编号","required":false}]', NOW()),
('form_leave', '请假申请表单', '[{"id":"l1","type":"SELECT","label":"请假类型","required":true,"options":["年假","事假","病假","婚假","产假"]},{"id":"l2","type":"DATE","label":"开始时间","required":true},{"id":"l3","type":"DATE","label":"结束时间","required":true},{"id":"l4","type":"NUMBER","label":"共计天数","required":true},{"id":"l5","type":"TEXTAREA","label":"请假事由","required":true}]', NOW()),
('form_contract', '合同审批表单', '[{"id":"c1","type":"TEXT","label":"合同名称","required":true},{"id":"c2","type":"TEXT","label":"对方单位","required":true},{"id":"c3","type":"NUMBER","label":"合同金额","required":true},{"id":"c4","type":"SELECT","label":"合同类型","required":true,"options":["采购合同","销售合同","服务协议"]},{"id":"c5","type":"TEXTAREA","label":"主要条款摘要","required":true}]', NOW()),
('form_recruit', '招聘申请表单', '[{"id":"r1","type":"TEXT","label":"招聘岗位","required":true},{"id":"r2","type":"NUMBER","label":"招聘人数","required":true},{"id":"r3","type":"SELECT","label":"职级","required":true,"options":["P5","P6","P7","P8"]},{"id":"r4","type":"TEXTAREA","label":"岗位职责","required":true},{"id":"r5","type":"NUMBER","label":"预算薪资（千元）","required":true}]', NOW());

-- 核心流程定义（nodes + edges）
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"nodes":[{"id":"root","type":"START","title":"提交报销"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount >= 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_leave', '员工请假流程', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"nodes":[{"id":"root","type":"START","title":"提交请假"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw_leave","type":"CONDITION","title":"天数校验"},{"id":"b1","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr","condition":"days <= 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"days > 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw_leave","source":"n1","target":"gw_leave"},{"id":"gw_leave->b1","source":"gw_leave","target":"b1"},{"id":"gw_leave->b2","source":"gw_leave","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_contract', '合同审批流程', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"nodes":[{"id":"root","type":"START","title":"发起合同"},{"id":"n1","type":"APPROVAL","title":"法务与财务会签","signType":"ALL","approverType":"USERS","approverValue":"3,6","props":{"buttons":["APPROVE","REJECT"]}},{"id":"n2","type":"APPROVAL","title":"总经理签发","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_recruit', '招聘申请流程', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"nodes":[{"id":"root","type":"START","title":"提交招聘需求"},{"id":"n1","type":"APPROVAL","title":"部门总监审批","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"n2","type":"APPROVAL","title":"HR审核","approverType":"ROLE","approverValue":"hr","props":{"buttons":["APPROVE","REJECT","DELEGATE"]}},{"id":"n3","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_payment', '对公付款流程', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"nodes":[{"id":"root","type":"START","title":"提交付款申请"},{"id":"n1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","RETURN","DELEGATE"]}},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

-- 通用 OA 流程定义
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_attendance_appeal', '补卡/外勤审批流程', 'attendance_appeal', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_overtime_request', '加班审批流程', 'overtime_request', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交加班申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_expense_claim', '报销审批流程', 'expense_claim', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交报销"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"财务审核","approverType":"ROLE","approverValue":"finance"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_leave_request', '请假审批流程', 'leave_request', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交请假"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

-- HR 审批流程定义
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_offer_approval', 'Offer审批流程', 'offer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交Offer审批"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_onboarding_approval', '入职审批流程', 'onboarding_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交入职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_probation_confirmation_approval', '转正审批流程', 'probation_confirmation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交转正申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_resignation_approval', '离职审批流程', 'resignation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交离职申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_salary_adjustment_approval', '调薪审批流程', 'salary_adjustment_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交调薪申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_transfer_approval', '调岗审批流程', 'transfer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"提交调岗申请"},{"id":"n1","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_payment_request', '付款审批流程', 'payment_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交付款申请"},{"id":"n1","type":"APPROVAL","title":"财务主管审批","approverType":"ROLE","approverValue":"finance"},{"id":"gw1","type":"CONDITION","title":"金额校验"},{"id":"b1","type":"APPROVAL","title":"财务总监审批","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000"},{"id":"end_b1","type":"END","title":"流程结束"},{"id":"b2","type":"APPROVAL","title":"总经理审批","approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000"},{"id":"end_b2","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_business_trip', '出差审批流程', 'business_trip', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交出差申请"},{"id":"n1","type":"APPROVAL","title":"部门经理审批","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR备案","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_vehicle_approval', '用车审批流程', 'vehicle_approval', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"提交用车申请"},{"id":"n1","type":"APPROVAL","title":"直属上级审批","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"行政确认派车","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"流程结束"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- 测试数据
-- 用于开发和测试环境
-- 插入测试流程实例
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key,
  title, start_user_id, start_user_name, status, start_time, end_time, variables, priority
) VALUES
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001', '张三的差旅费报销', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, '{"f1":"差旅费","f2":1500,"f3":"2026-02-08","f4":"北京客户拜访差旅报销"}', 'NORMAL'),
('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002', '张三的年假申请', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 'URGENT'),
('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003', 'XX科技采购合同审批', 2, '李经理', 'RUNNING', DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 'HIGH'),
('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004', '合同付款申请', 3, '王财务', 'RUNNING', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 'NORMAL'),
('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005', '李经理的客户招待费报销', 2, '李经理', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), '{"f1":"招待费","f2":2500,"f3":"2026-02-09","f4":"客户商务宴请"}', 'URGENT'),
('test_inst_006', 100000, 'biz_leave', 'wf_leave', 'BIZ_006', '赵HR的病假申请', 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 'NORMAL'),
('test_inst_007', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_007', '高级Java开发工程师招聘申请', 4, '赵HR', 'RUNNING', DATE_SUB(NOW(), INTERVAL 8 HOUR), NULL, '{"r1":"高级Java开发工程师","r2":2,"r3":"P7","r4":"负责核心业务系统开发","r5":35}', 'HIGH');

-- 插入待办任务
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES
('test_task_001', 100000, 'test_inst_001', 'n1', '直属上级审批', 2, '李经理', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_002', 100000, 'test_inst_002', 'n1', '部门经理审批', 2, '李经理', 'TODO', 'URGENT', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('test_task_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 6, '刘法务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_004', 100000, 'test_inst_003', 'n1', '法务与财务会签', 3, '王财务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_005', 100000, 'test_inst_004', 'n1', '财务主管审批', 3, '王财务', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_006', 100000, 'test_inst_007', 'n2', 'HR审核', 4, '赵HR', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 插入会签任务记录
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 'ALL', 2, 0, 0, 0, 'VOTING', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 插入任务历史记录
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES
('test_hist_001', 100000, 'test_task_done_001', 'test_inst_005', '直属上级审批', 'n1', 2, '李经理', 'APPROVE', '同意报销', 300, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('test_hist_002', 100000, 'test_task_done_002', 'test_inst_005', '财务主管审批', 'b1', 3, '王财务', 'APPROVE', '财务已审核', 600, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('test_hist_003', 100000, 'test_task_done_003', 'test_inst_006', '部门经理审批', 'n1', 2, '李经理', 'APPROVE', '同意请假', 180, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('test_hist_004', 100000, 'test_task_done_004', 'test_inst_006', 'HR备案', 'b1', 4, '赵HR', 'APPROVE', '已备案', 120, DATE_SUB(NOW(), INTERVAL 4 DAY));

-- 插入流程抄送记录
INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
(100000, 'test_inst_002', 'biz_leave', '张三的年假申请', 'n1', '部门经理审批', 5, '张三', 1, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'test_inst_003', 'biz_contract', 'XX科技采购合同审批', 'n1', '法务与财务会签', 2, '李经理', 1, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 'test_inst_004', 'biz_payment', '合同付款申请', 'n1', '财务主管审批', 3, '王财务', 1, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'test_inst_006', 'biz_leave', '赵HR的病假申请', 'b1', 'HR备案', 4, '赵HR', 1, '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));
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

-- =========================================================
--
-- =========================================================
-- 统一的系统模板分类（平台级，tenant_id 为空）
INSERT INTO template_category (id, name, description, order_num, tenant_id) VALUES
('cat-office', '行政办公', '日常行政、通用审批与办公协同流程模板', 1, NULL),
('cat-finance', '财务', '费用、付款、预算等财务流程模板', 2, NULL),
('cat-hr', '人事', '入转调离、培训成长等人事流程模板', 3, NULL),
('cat-sales', '销售业务', '报价、折扣、合同等销售流程模板', 4, NULL),
('cat-it', 'IT运维', '权限、发布、故障等 IT 运维流程模板', 5, NULL),
('cat-industry', '行业专属', '行业场景下的专业流程模板', 6, NULL),
('cat-other', '其他', '项目、清单等通用补充流程模板', 7, NULL);

-- 统一的系统模板库（平台级，tenant_id 为空）
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', '请假审批', '员工提交 → 部门经理审批 → 完成', 'cat-hr',
'["请假","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交请假"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-contract-001', '合同审批', '起草 → 法务审核 → 总经理签发 → 盖章归档', 'cat-office',
'["合同","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "起草合同"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "法务审核",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理签发",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "盖章归档",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-seal-001', '用印申请', '申请用印 → 部门审批 → 行政盖章 → 完成', 'cat-office',
'["用印","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请用印"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "行政盖章",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-travel-001', '出差申请', '提交出差 → 部门审批 → 总经理审批 → 完成', 'cat-office',
'["出差","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交出差申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-vehicle-001', '用车申请', '申请用车 → 行政审批 → 车辆调度 → 完成', 'cat-office',
'["用车","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请用车"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "行政审批",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "车辆调度确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-reimbursement-001', '报销审批', '提交报销 → 部门经理 → 财务审核 → 完成', 'cat-finance',
'["报销","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报销"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase-001', '采购审批', '提交采购 → 金额判断 → 分级审批 → 完成', 'cat-finance',
'["采购","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交采购申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "金额 > 5000",
      "condition": "amount > 5000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end",
      "isDefault": true
    },
    {
      "id": "n1->b2",
      "source": "n1",
      "target": "b2",
      "condition": "amount > 5000"
    },
    {
      "id": "b2->n2",
      "source": "b2",
      "target": "n2"
    },
    {
      "id": "n2->end_high",
      "source": "n2",
      "target": "end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-payment-001', '付款申请', '提交付款 → 财务审核 → 总经理审批 → 出纳付款', 'cat-finance',
'["付款","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交付款申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "财务审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "出纳付款",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-budget-001', '预算审批', '编制预算 → 部门审核 → 财务审核 → 总经理批准', 'cat-finance',
'["预算","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "编制预算"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务部审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "总经理批准",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-onboarding-001', '入职审批', '提交入职 → HR审核 → 部门确认 → IT开通账号', 'cat-hr',
'["入职","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交入职申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "部门负责人确认",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "IT开通账号",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-resignation-001', '离职审批', '提交离职 → 部门审批 → HR审核 → 资产交接', 'cat-hr',
'["离职","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交离职申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "资产交接确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-promotion-001', '晋升审批', '提名推荐 → 部门审核 → HR评估 → 总经理批准', 'cat-hr',
'["晋升","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提名推荐"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR评估",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "总经理批准",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-training-001', '培训申请', '提交培训 → 部门审批 → HR审核 → 完成', 'cat-hr',
'["培训","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交培训申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-quote-001', '报价审批', '提交报价 → 销售主管 → 金额判断 → 分级审批', 'cat-sales',
'["报价","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报价单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "销售主管审核",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "金额 > 10万",
      "condition": "amount > 100000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->end",
      "source": "n1",
      "target": "end",
      "isDefault": true
    },
    {
      "id": "n1->b2",
      "source": "n1",
      "target": "b2",
      "condition": "amount > 100000"
    },
    {
      "id": "b2->n2",
      "source": "b2",
      "target": "n2"
    },
    {
      "id": "n2->end_high",
      "source": "n2",
      "target": "end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-discount-001', '折扣审批', '申请折扣 → 销售总监 → 财务确认 → 完成', 'cat-sales',
'["折扣","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "申请折扣"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "销售总监审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "财务确认",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-server-001', '服务器申请', '提交申请 → IT审核 → 安全审查 → 运维部署', 'cat-it',
'["服务器","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交服务器申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "IT主管审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "安全审查",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "运维部署",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-permission-001', '权限申请', '提交权限 → 部门审批 → IT审核 → 安全确认', 'cat-it',
'["权限","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交权限申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "IT审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "安全确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-change-001', '变更发布', '提交变更 → 技术评审 → 测试验证 → 上线审批', 'cat-it',
'["变更发布","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交变更申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "技术评审",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "测试验证",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "上线审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-medical-001', '医疗器械采购', '科室申请 → 设备科审核 → 院长审批 → 招标采购', 'cat-industry',
'["医疗器械采购","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "科室提交申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "设备科审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "院长审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "招标采购",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-construction-001', '工程验收', '提交验收 → 监理审核 → 质检验收 → 甲方确认', 'cat-industry',
'["工程验收","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交验收申请"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "监理审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "质检验收",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "甲方确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-education-001', '课程审批', '教师提交 → 教研组审核 → 教务处审批 → 完成', 'cat-industry',
'["课程","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交课程方案"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "教研组审核",
      "approverType": "DIRECT_LEADER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "教务处审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-maintenance-001', '设备维修', '报修 → 维修主管派单 → 维修完成 → 验收确认', 'cat-industry',
'["设备维修","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交报修"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "维修主管派单",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "维修完成确认",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "报修人验收",
      "approverType": "INITIATOR"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->n3",
      "source": "n2",
      "target": "n3"
    },
    {
      "id": "n3->end",
      "source": "n3",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-logistics-001', '发货审批', '创建发货单 → 仓库确认 → 物流安排 → 完成', 'cat-industry',
'["发货","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "创建发货单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "仓库确认库存",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "物流安排",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-checklist-001', '审核清单', '提交清单 → 逐项审核 → 最终确认 → 完成', 'cat-other',
'["审核清单","其他","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交审核清单"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "逐项审核",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "最终确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->n1",
      "source": "start",
      "target": "n1"
    },
    {
      "id": "n1->n2",
      "source": "n1",
      "target": "n2"
    },
    {
      "id": "n2->end",
      "source": "n2",
      "target": "end"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase_advanced-001', '大额采购全流程', '部门审批 → 金额分级 → 多级审批 → 通知结果', 'cat-finance',
'["大额采购","财务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交采购申请"
    },
    {
      "id": "pa_n1",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "pa_n5",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "pa_b2",
      "type": "CONDITION",
      "title": "5000 < 金额 ≤ 50000",
      "condition": "amount > 5000 && amount <= 50000"
    },
    {
      "id": "pa_n2",
      "type": "APPROVAL",
      "title": "财务总监审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_b3",
      "type": "CONDITION",
      "title": "金额 > 50000",
      "condition": "amount > 50000"
    },
    {
      "id": "pa_n3",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "pa_n4",
      "type": "APPROVAL",
      "title": "财务总监审核",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_n5_mid",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end_mid",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "pa_n5_high",
      "type": "NOTIFICATION",
      "title": "通知采购结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "采购审批结果通知",
        "notificationContent": "您的采购申请（金额: ${amount}）已审批完成，请查看结果。"
      }
    },
    {
      "id": "pa_end_high",
      "type": "END",
      "title": "流程结束"
    }
  ],
  "edges": [
    {
      "id": "start->pa_n1",
      "source": "start",
      "target": "pa_n1"
    },
    {
      "id": "pa_n1->pa_n5",
      "source": "pa_n1",
      "target": "pa_n5",
      "isDefault": true
    },
    {
      "id": "pa_n5->pa_end",
      "source": "pa_n5",
      "target": "pa_end"
    },
    {
      "id": "pa_n1->pa_b2",
      "source": "pa_n1",
      "target": "pa_b2",
      "condition": "amount > 5000 && amount <= 50000"
    },
    {
      "id": "pa_b2->pa_n2",
      "source": "pa_b2",
      "target": "pa_n2"
    },
    {
      "id": "pa_n1->pa_b3",
      "source": "pa_n1",
      "target": "pa_b3",
      "condition": "amount > 50000"
    },
    {
      "id": "pa_b3->pa_n3",
      "source": "pa_b3",
      "target": "pa_n3"
    },
    {
      "id": "pa_n3->pa_n4",
      "source": "pa_n3",
      "target": "pa_n4"
    },
    {
      "id": "pa_n2->pa_n5_mid",
      "source": "pa_n2",
      "target": "pa_n5_mid"
    },
    {
      "id": "pa_n5_mid->pa_end_mid",
      "source": "pa_n5_mid",
      "target": "pa_end_mid"
    },
    {
      "id": "pa_n4->pa_n5_high",
      "source": "pa_n4",
      "target": "pa_n5_high"
    },
    {
      "id": "pa_n5_high->pa_end_high",
      "source": "pa_n5_high",
      "target": "pa_end_high"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-project_approval-001', '项目立项审批', '部门审核 → 技术+财务并行评审 → 总经理审批 → 通知', 'cat-other',
'["项目立项","其他","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交立项申请"
    },
    {
      "id": "proj_n1",
      "type": "APPROVAL",
      "title": "部门负责人审核",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "proj_n2",
      "type": "PARALLEL",
      "title": "并行评审（技术+财务）",
      "approverType": "ROLE",
      "approverValue": "admin,finance",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "proj_n5",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "proj_n6",
      "type": "NOTIFICATION",
      "title": "通知立项结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "项目立项结果",
        "notificationContent": "您的项目立项申请已完成审批，请登录系统查看详情。"
      }
    },
    {
      "id": "proj_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "proj_b1",
      "type": "CONDITION",
      "title": "技术可行性评审"
    },
    {
      "id": "proj_n3",
      "type": "APPROVAL",
      "title": "技术委员会评审",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "proj_b2",
      "type": "CONDITION",
      "title": "财务预算评估"
    },
    {
      "id": "proj_n4",
      "type": "APPROVAL",
      "title": "财务部预算评估",
      "approverType": "ROLE",
      "approverValue": "finance"
    }
  ],
  "edges": [
    {
      "id": "start->proj_n1",
      "source": "start",
      "target": "proj_n1"
    },
    {
      "id": "proj_n1->proj_n2",
      "source": "proj_n1",
      "target": "proj_n2"
    },
    {
      "id": "proj_n2->proj_n5",
      "source": "proj_n2",
      "target": "proj_n5",
      "isDefault": true
    },
    {
      "id": "proj_n5->proj_n6",
      "source": "proj_n5",
      "target": "proj_n6"
    },
    {
      "id": "proj_n6->proj_end",
      "source": "proj_n6",
      "target": "proj_end"
    },
    {
      "id": "proj_n2->proj_b1",
      "source": "proj_n2",
      "target": "proj_b1"
    },
    {
      "id": "proj_b1->proj_n3",
      "source": "proj_b1",
      "target": "proj_n3"
    },
    {
      "id": "proj_n2->proj_b2",
      "source": "proj_n2",
      "target": "proj_b2"
    },
    {
      "id": "proj_b2->proj_n4",
      "source": "proj_b2",
      "target": "proj_n4"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-regularization-001', '员工转正审批', '定时提醒 → 部门评估 → HR审核 → 并行办理 → 通知', 'cat-hr',
'["员工转正","人事","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "发起转正流程"
    },
    {
      "id": "reg_n1",
      "type": "TIMER",
      "title": "试用期到期提醒",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "reg_n2",
      "type": "APPROVAL",
      "title": "部门负责人评估",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "reg_n3",
      "type": "APPROVAL",
      "title": "HR综合审核",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "reg_n4",
      "type": "PARALLEL",
      "title": "并行办理（IT+行政）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "reg_n7",
      "type": "NOTIFICATION",
      "title": "通知转正结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "转正审批结果",
        "notificationContent": "恭喜！您的转正申请已通过，欢迎成为正式员工。"
      }
    },
    {
      "id": "reg_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "reg_b1",
      "type": "CONDITION",
      "title": "IT权限开通"
    },
    {
      "id": "reg_n5",
      "type": "MANUAL",
      "title": "IT开通正式权限",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "为转正员工开通正式员工系统权限、邮箱等",
        "priority": "HIGH"
      }
    },
    {
      "id": "reg_b2",
      "type": "CONDITION",
      "title": "行政手续办理"
    },
    {
      "id": "reg_n6",
      "type": "MANUAL",
      "title": "行政办理工牌社保",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "办理正式工牌、更新社保信息、签订正式合同",
        "priority": "MEDIUM"
      }
    }
  ],
  "edges": [
    {
      "id": "start->reg_n1",
      "source": "start",
      "target": "reg_n1"
    },
    {
      "id": "reg_n1->reg_n2",
      "source": "reg_n1",
      "target": "reg_n2"
    },
    {
      "id": "reg_n2->reg_n3",
      "source": "reg_n2",
      "target": "reg_n3"
    },
    {
      "id": "reg_n3->reg_n4",
      "source": "reg_n3",
      "target": "reg_n4"
    },
    {
      "id": "reg_n4->reg_n7",
      "source": "reg_n4",
      "target": "reg_n7",
      "isDefault": true
    },
    {
      "id": "reg_n7->reg_end",
      "source": "reg_n7",
      "target": "reg_end"
    },
    {
      "id": "reg_n4->reg_b1",
      "source": "reg_n4",
      "target": "reg_b1"
    },
    {
      "id": "reg_b1->reg_n5",
      "source": "reg_b1",
      "target": "reg_n5"
    },
    {
      "id": "reg_n4->reg_b2",
      "source": "reg_n4",
      "target": "reg_b2"
    },
    {
      "id": "reg_b2->reg_n6",
      "source": "reg_b2",
      "target": "reg_n6"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-incident-001', 'IT故障处理', '自动分级 → 按级别分流 → 处理 → 验证确认', 'cat-it',
'["IT故障","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交故障报告"
    },
    {
      "id": "inc_n1",
      "type": "SCRIPT",
      "title": "自动故障分级",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def level = severity >= 8 ? \"P1\" : severity >= 5 ? \"P2\" : \"P3\"; return [incidentLevel: level]",
        "continueOnError": false
      },
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "inc_n7",
      "type": "MANUAL",
      "title": "报修人验证确认",
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "请确认故障是否已修复，如未修复请退回重新处理",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_n8",
      "type": "NOTIFICATION",
      "title": "通知故障关闭",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "故障处理完成",
        "notificationContent": "您提交的故障报告已处理完成并关闭。"
      }
    },
    {
      "id": "inc_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "inc_b1",
      "type": "CONDITION",
      "title": "P1 紧急故障",
      "condition": "incidentLevel == \"P1\""
    },
    {
      "id": "inc_n2",
      "type": "NOTIFICATION",
      "title": "紧急通知管理层",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "【紧急】P1级故障告警",
        "notificationContent": "系统发生P1级紧急故障，请立即关注！故障描述: ${description}"
      }
    },
    {
      "id": "inc_n3",
      "type": "MANUAL",
      "title": "紧急修复处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P1级紧急故障，需立即响应并修复",
        "priority": "HIGH"
      }
    },
    {
      "id": "inc_b2",
      "type": "CONDITION",
      "title": "P2 重要故障",
      "condition": "incidentLevel == \"P2\""
    },
    {
      "id": "inc_n4",
      "type": "APPROVAL",
      "title": "运维主管派单",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "inc_n5",
      "type": "MANUAL",
      "title": "运维工程师处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P2级故障，请在4小时内完成修复",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_b3",
      "type": "CONDITION",
      "title": "P3 一般故障",
      "condition": "incidentLevel == \"P3\""
    },
    {
      "id": "inc_n6",
      "type": "MANUAL",
      "title": "运维工程师处理",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P3级一般故障，请在24小时内处理",
        "priority": "LOW"
      }
    }
  ],
  "edges": [
    {
      "id": "start->inc_n1",
      "source": "start",
      "target": "inc_n1"
    },
    {
      "id": "inc_n1->inc_n7",
      "source": "inc_n1",
      "target": "inc_n7",
      "isDefault": true
    },
    {
      "id": "inc_n7->inc_n8",
      "source": "inc_n7",
      "target": "inc_n8"
    },
    {
      "id": "inc_n8->inc_end",
      "source": "inc_n8",
      "target": "inc_end"
    },
    {
      "id": "inc_n1->inc_b1",
      "source": "inc_n1",
      "target": "inc_b1",
      "condition": "incidentLevel == \"P1\""
    },
    {
      "id": "inc_b1->inc_n2",
      "source": "inc_b1",
      "target": "inc_n2"
    },
    {
      "id": "inc_n2->inc_n3",
      "source": "inc_n2",
      "target": "inc_n3"
    },
    {
      "id": "inc_n3->inc_n7",
      "source": "inc_n3",
      "target": "inc_n7"
    },
    {
      "id": "inc_n1->inc_b2",
      "source": "inc_n1",
      "target": "inc_b2",
      "condition": "incidentLevel == \"P2\""
    },
    {
      "id": "inc_b2->inc_n4",
      "source": "inc_b2",
      "target": "inc_n4"
    },
    {
      "id": "inc_n4->inc_n5",
      "source": "inc_n4",
      "target": "inc_n5"
    },
    {
      "id": "inc_n5->inc_n7",
      "source": "inc_n5",
      "target": "inc_n7"
    },
    {
      "id": "inc_n1->inc_b3",
      "source": "inc_n1",
      "target": "inc_b3",
      "condition": "incidentLevel == \"P3\""
    },
    {
      "id": "inc_b3->inc_n6",
      "source": "inc_b3",
      "target": "inc_n6"
    },
    {
      "id": "inc_n6->inc_n7",
      "source": "inc_n6",
      "target": "inc_n7"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-sales_contract-001', '销售合同全流程', '销售审核 → 金额分级 → 法务审核 → 并行盖章 → 通知', 'cat-sales',
'["销售合同","销售业务","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交合同审批"
    },
    {
      "id": "sc_n1",
      "type": "APPROVAL",
      "title": "销售主管审核",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "sc_n5",
      "type": "APPROVAL",
      "title": "法务合规审核",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "sc_n6",
      "type": "PARALLEL",
      "title": "并行办理（财务+行政）",
      "approverType": "ROLE",
      "approverValue": "finance,admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sc_n9",
      "type": "NOTIFICATION",
      "title": "通知合同签署完成",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "合同审批完成",
        "notificationContent": "您提交的合同（金额: ${amount}）已完成全部审批流程，请及时跟进签署。"
      }
    },
    {
      "id": "sc_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "sc_b3",
      "type": "CONDITION",
      "title": "财务确认"
    },
    {
      "id": "sc_n7",
      "type": "APPROVAL",
      "title": "财务确认收款条款",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "sc_b4",
      "type": "CONDITION",
      "title": "行政盖章"
    },
    {
      "id": "sc_n8",
      "type": "MANUAL",
      "title": "行政盖章归档",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "合同盖章并归档原件",
        "priority": "HIGH"
      }
    },
    {
      "id": "sc_b1",
      "type": "CONDITION",
      "title": "金额 ≤ 10万",
      "condition": "amount <= 100000"
    },
    {
      "id": "sc_n2",
      "type": "APPROVAL",
      "title": "销售总监审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_b2",
      "type": "CONDITION",
      "title": "金额 > 10万",
      "condition": "amount > 100000"
    },
    {
      "id": "sc_n3",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_n4",
      "type": "APPROVAL",
      "title": "董事会审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    }
  ],
  "edges": [
    {
      "id": "start->sc_n1",
      "source": "start",
      "target": "sc_n1"
    },
    {
      "id": "sc_n1->sc_n5",
      "source": "sc_n1",
      "target": "sc_n5",
      "isDefault": true
    },
    {
      "id": "sc_n5->sc_n6",
      "source": "sc_n5",
      "target": "sc_n6"
    },
    {
      "id": "sc_n6->sc_n9",
      "source": "sc_n6",
      "target": "sc_n9",
      "isDefault": true
    },
    {
      "id": "sc_n9->sc_end",
      "source": "sc_n9",
      "target": "sc_end"
    },
    {
      "id": "sc_n6->sc_b3",
      "source": "sc_n6",
      "target": "sc_b3"
    },
    {
      "id": "sc_b3->sc_n7",
      "source": "sc_b3",
      "target": "sc_n7"
    },
    {
      "id": "sc_n6->sc_b4",
      "source": "sc_n6",
      "target": "sc_b4"
    },
    {
      "id": "sc_b4->sc_n8",
      "source": "sc_b4",
      "target": "sc_n8"
    },
    {
      "id": "sc_n1->sc_b1",
      "source": "sc_n1",
      "target": "sc_b1",
      "condition": "amount <= 100000"
    },
    {
      "id": "sc_b1->sc_n2",
      "source": "sc_b1",
      "target": "sc_n2"
    },
    {
      "id": "sc_n2->sc_n5",
      "source": "sc_n2",
      "target": "sc_n5"
    },
    {
      "id": "sc_n1->sc_b2",
      "source": "sc_n1",
      "target": "sc_b2",
      "condition": "amount > 100000"
    },
    {
      "id": "sc_b2->sc_n3",
      "source": "sc_b2",
      "target": "sc_n3"
    },
    {
      "id": "sc_n3->sc_n4",
      "source": "sc_n3",
      "target": "sc_n4"
    },
    {
      "id": "sc_n4->sc_n5",
      "source": "sc_n4",
      "target": "sc_n5"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-bidding-001', '招标采购流程', '需求审核 → 生成标书 → 等待投标 → 并行评标 → 审批', 'cat-industry',
'["招标采购","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交招标需求"
    },
    {
      "id": "bid_n1",
      "type": "APPROVAL",
      "title": "采购部审核需求",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_n2",
      "type": "SCRIPT",
      "title": "自动生成招标文件",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def tenderNo = \"TENDER-\" + System.currentTimeMillis(); return [tenderGenerated: true, tenderNo: tenderNo, tenderProjectName: projectName, tenderBudget: budget]",
        "continueOnError": false
      }
    },
    {
      "id": "bid_n3",
      "type": "TIMER",
      "title": "等待投标截止（7天）",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "bid_n4",
      "type": "PARALLEL",
      "title": "并行评标",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "bid_n7",
      "type": "APPROVAL",
      "title": "评标委员会定标",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "bid_n8",
      "type": "NOTIFICATION",
      "title": "通知中标结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "招标结果通知",
        "notificationContent": "招标项目「${projectName}」已完成评标，请查看中标结果。"
      }
    },
    {
      "id": "bid_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "bid_b1",
      "type": "CONDITION",
      "title": "技术评标"
    },
    {
      "id": "bid_n5",
      "type": "APPROVAL",
      "title": "技术专家评标",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_b2",
      "type": "CONDITION",
      "title": "商务评标"
    },
    {
      "id": "bid_n6",
      "type": "APPROVAL",
      "title": "商务专家评标",
      "approverType": "ROLE",
      "approverValue": "finance"
    }
  ],
  "edges": [
    {
      "id": "start->bid_n1",
      "source": "start",
      "target": "bid_n1"
    },
    {
      "id": "bid_n1->bid_n2",
      "source": "bid_n1",
      "target": "bid_n2"
    },
    {
      "id": "bid_n2->bid_n3",
      "source": "bid_n2",
      "target": "bid_n3"
    },
    {
      "id": "bid_n3->bid_n4",
      "source": "bid_n3",
      "target": "bid_n4"
    },
    {
      "id": "bid_n4->bid_n7",
      "source": "bid_n4",
      "target": "bid_n7",
      "isDefault": true
    },
    {
      "id": "bid_n7->bid_n8",
      "source": "bid_n7",
      "target": "bid_n8"
    },
    {
      "id": "bid_n8->bid_end",
      "source": "bid_n8",
      "target": "bid_end"
    },
    {
      "id": "bid_n4->bid_b1",
      "source": "bid_n4",
      "target": "bid_b1"
    },
    {
      "id": "bid_b1->bid_n5",
      "source": "bid_b1",
      "target": "bid_n5"
    },
    {
      "id": "bid_n4->bid_b2",
      "source": "bid_n4",
      "target": "bid_b2"
    },
    {
      "id": "bid_b2->bid_n6",
      "source": "bid_b2",
      "target": "bid_n6"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-safety_incident-001', '安全事故处理', '自动记录 → 并行处置+通知 → 事故调查 → 整改审批', 'cat-industry',
'["安全事故","行业专属","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "报告安全事故"
    },
    {
      "id": "sf_n1",
      "type": "SCRIPT",
      "title": "自动记录事故信息",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def summary = (accidentType ?: \"未知事故\") + \"@\" + (location ?: \"未知地点\"); return [accidentRecorded: true, accidentSummary: summary]",
        "continueOnError": true
      }
    },
    {
      "id": "sf_n2",
      "type": "PARALLEL",
      "title": "并行处置（现场+通知）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sf_n5",
      "type": "APPROVAL",
      "title": "事故调查报告审核",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n6",
      "type": "APPROVAL",
      "title": "整改方案审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n7",
      "type": "MANUAL",
      "title": "执行整改措施",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "按照整改方案执行安全整改措施",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_n8",
      "type": "APPROVAL",
      "title": "整改验收确认",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "sf_b1",
      "type": "CONDITION",
      "title": "现场处置"
    },
    {
      "id": "sf_n3",
      "type": "MANUAL",
      "title": "现场紧急处置",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "立即前往事故现场进行紧急处置，确保人员安全",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_b2",
      "type": "CONDITION",
      "title": "上报通知"
    },
    {
      "id": "sf_n4",
      "type": "NOTIFICATION",
      "title": "通知安全管理层",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "【紧急】安全事故报告",
        "notificationContent": "发生安全事故，地点: ${location}，请立即关注。"
      }
    }
  ],
  "edges": [
    {
      "id": "start->sf_n1",
      "source": "start",
      "target": "sf_n1"
    },
    {
      "id": "sf_n1->sf_n2",
      "source": "sf_n1",
      "target": "sf_n2"
    },
    {
      "id": "sf_n2->sf_n5",
      "source": "sf_n2",
      "target": "sf_n5",
      "isDefault": true
    },
    {
      "id": "sf_n5->sf_n6",
      "source": "sf_n5",
      "target": "sf_n6"
    },
    {
      "id": "sf_n6->sf_n7",
      "source": "sf_n6",
      "target": "sf_n7"
    },
    {
      "id": "sf_n7->sf_n8",
      "source": "sf_n7",
      "target": "sf_n8"
    },
    {
      "id": "sf_n8->sf_end",
      "source": "sf_n8",
      "target": "sf_end"
    },
    {
      "id": "sf_n2->sf_b1",
      "source": "sf_n2",
      "target": "sf_b1"
    },
    {
      "id": "sf_b1->sf_n3",
      "source": "sf_b1",
      "target": "sf_n3"
    },
    {
      "id": "sf_n2->sf_b2",
      "source": "sf_n2",
      "target": "sf_b2"
    },
    {
      "id": "sf_b2->sf_n4",
      "source": "sf_b2",
      "target": "sf_n4"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave_advanced-001', '请假全流程', '天数判断 → 分级审批 → 交接确认 → 定时提醒 → 通知', 'cat-hr',
'["请假","行政办公","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交请假申请"
    },
    {
      "id": "la_n1",
      "type": "APPROVAL",
      "title": "直属上级审批",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "la_n5",
      "type": "MANUAL",
      "title": "发起人确认工作交接",
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "请在休假前完成工作交接，并确认交接安排已同步给相关同事。",
        "priority": "MEDIUM"
      }
    },
    {
      "id": "la_n6",
      "type": "TIMER",
      "title": "假期结束前1天提醒",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "la_n7",
      "type": "NOTIFICATION",
      "title": "通知请假结果",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "请假审批结果",
        "notificationContent": "您的请假申请（${days}天）已审批通过，请做好工作交接。"
      }
    },
    {
      "id": "la_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "la_b1",
      "type": "CONDITION",
      "title": "请假 ≤ 3天",
      "condition": "days <= 3"
    },
    {
      "id": "la_b2",
      "type": "CONDITION",
      "title": "3天 < 请假 ≤ 7天",
      "condition": "days > 3 && days <= 7"
    },
    {
      "id": "la_n2",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_b3",
      "type": "CONDITION",
      "title": "请假 > 7天",
      "condition": "days > 7"
    },
    {
      "id": "la_n3",
      "type": "APPROVAL",
      "title": "部门经理审批",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_n4",
      "type": "APPROVAL",
      "title": "总经理审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    }
  ],
  "edges": [
    {
      "id": "start->la_n1",
      "source": "start",
      "target": "la_n1"
    },
    {
      "id": "la_n1->la_n5",
      "source": "la_n1",
      "target": "la_n5",
      "isDefault": true
    },
    {
      "id": "la_n5->la_n6",
      "source": "la_n5",
      "target": "la_n6"
    },
    {
      "id": "la_n6->la_n7",
      "source": "la_n6",
      "target": "la_n7"
    },
    {
      "id": "la_n7->la_end",
      "source": "la_n7",
      "target": "la_end"
    },
    {
      "id": "la_n1->la_b1",
      "source": "la_n1",
      "target": "la_b1",
      "condition": "days <= 3"
    },
    {
      "id": "la_n1->la_b2",
      "source": "la_n1",
      "target": "la_b2",
      "condition": "days > 3 && days <= 7"
    },
    {
      "id": "la_b1->la_n5",
      "source": "la_b1",
      "target": "la_n5"
    },
    {
      "id": "la_b2->la_n2",
      "source": "la_b2",
      "target": "la_n2"
    },
    {
      "id": "la_n2->la_n5",
      "source": "la_n2",
      "target": "la_n5"
    },
    {
      "id": "la_n1->la_b3",
      "source": "la_n1",
      "target": "la_b3",
      "condition": "days > 7"
    },
    {
      "id": "la_b3->la_n3",
      "source": "la_b3",
      "target": "la_n3"
    },
    {
      "id": "la_n3->la_n4",
      "source": "la_n3",
      "target": "la_n4"
    },
    {
      "id": "la_n4->la_n5",
      "source": "la_n4",
      "target": "la_n5"
    }
  ]
}',
1, 'active', 'system', NULL);

INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-deployment-001', '生产环境发布', '代码审查 → 自动构建 → 等待窗口 → 并行部署+监控 → 验证', 'cat-it',
'["生产环境发布","IT运维","模板"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "提交发布申请"
    },
    {
      "id": "dep_n1",
      "type": "APPROVAL",
      "title": "技术负责人代码审查",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "dep_n2",
      "type": "SCRIPT",
      "title": "自动构建与测试",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [buildStatus: \"SUCCESS\", buildBranch: branch, buildVersion: version, buildFinishedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_n3",
      "type": "APPROVAL",
      "title": "发布审批",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "dep_n4",
      "type": "TIMER",
      "title": "等待发布窗口",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "dep_n5",
      "type": "PARALLEL",
      "title": "并行执行（部署+监控）",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "dep_n8",
      "type": "MANUAL",
      "title": "发布后验证确认",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "验证发布后系统功能正常，检查关键业务指标",
        "priority": "HIGH"
      }
    },
    {
      "id": "dep_n9",
      "type": "NOTIFICATION",
      "title": "通知发布完成",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "发布完成通知",
        "notificationContent": "版本 ${version} 已成功发布到生产环境。"
      }
    },
    {
      "id": "dep_end",
      "type": "END",
      "title": "流程结束"
    },
    {
      "id": "dep_b1",
      "type": "CONDITION",
      "title": "执行部署"
    },
    {
      "id": "dep_n6",
      "type": "SCRIPT",
      "title": "执行自动部署",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [deployStatus: \"SUCCESS\", deployedVersion: version, deployedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_b2",
      "type": "CONDITION",
      "title": "监控告警"
    },
    {
      "id": "dep_n7",
      "type": "NOTIFICATION",
      "title": "通知运维团队监控",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "admin",
        "notificationTitle": "发布监控通知",
        "notificationContent": "版本 ${version} 正在发布，请密切关注系统监控指标。"
      }
    }
  ],
  "edges": [
    {
      "id": "start->dep_n1",
      "source": "start",
      "target": "dep_n1"
    },
    {
      "id": "dep_n1->dep_n2",
      "source": "dep_n1",
      "target": "dep_n2"
    },
    {
      "id": "dep_n2->dep_n3",
      "source": "dep_n2",
      "target": "dep_n3"
    },
    {
      "id": "dep_n3->dep_n4",
      "source": "dep_n3",
      "target": "dep_n4"
    },
    {
      "id": "dep_n4->dep_n5",
      "source": "dep_n4",
      "target": "dep_n5"
    },
    {
      "id": "dep_n5->dep_n8",
      "source": "dep_n5",
      "target": "dep_n8",
      "isDefault": true
    },
    {
      "id": "dep_n8->dep_n9",
      "source": "dep_n8",
      "target": "dep_n9"
    },
    {
      "id": "dep_n9->dep_end",
      "source": "dep_n9",
      "target": "dep_end"
    },
    {
      "id": "dep_n5->dep_b1",
      "source": "dep_n5",
      "target": "dep_b1"
    },
    {
      "id": "dep_b1->dep_n6",
      "source": "dep_b1",
      "target": "dep_n6"
    },
    {
      "id": "dep_n5->dep_b2",
      "source": "dep_n5",
      "target": "dep_b2"
    },
    {
      "id": "dep_b2->dep_n7",
      "source": "dep_b2",
      "target": "dep_n7"
    }
  ]
}',
1, 'active', 'system', NULL);

SET FOREIGN_KEY_CHECKS = 1;

-- 测试数据
-- 用于开发和测试环境
-- 插入测试流程实例
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key,
  title, start_user_id, start_user_name, status, start_time, end_time, variables, priority
) VALUES
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001', '张三的差旅费报销', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, '{"f1":"差旅费","f2":1500,"f3":"2026-02-08","f4":"北京客户拜访差旅报销"}', 'NORMAL'),
('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002', '张三的年假申请', 5, '张三', 'RUNNING', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 'URGENT'),
('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003', 'XX科技采购合同审批', 2, '李经理', 'RUNNING', DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 'HIGH'),
('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004', '合同付款申请', 3, '王财务', 'RUNNING', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 'NORMAL'),
('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005', '李经理的客户招待费报销', 2, '李经理', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), '{"f1":"招待费","f2":2500,"f3":"2026-02-09","f4":"客户商务宴请"}', 'URGENT'),
('test_inst_006', 100000, 'biz_leave', 'wf_leave', 'BIZ_006', '赵HR的病假申请', 4, '赵HR', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 'NORMAL'),
('test_inst_007', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_007', '高级Java开发工程师招聘申请', 4, '赵HR', 'RUNNING', DATE_SUB(NOW(), INTERVAL 8 HOUR), NULL, '{"r1":"高级Java开发工程师","r2":2,"r3":"P7","r4":"负责核心业务系统开发","r5":35}', 'HIGH');

-- 插入待办任务
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES
('test_task_001', 100000, 'test_inst_001', 'n1', '直属上级审批', 2, '李经理', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_002', 100000, 'test_inst_002', 'n1', '部门经理审批', 2, '李经理', 'TODO', 'URGENT', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('test_task_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 6, '刘法务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_004', 100000, 'test_inst_003', 'n1', '法务与财务会签', 3, '王财务', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_005', 100000, 'test_inst_004', 'n1', '财务主管审批', 3, '王财务', 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_006', 100000, 'test_inst_007', 'n2', 'HR审核', 4, '赵HR', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 插入会签任务记录
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '法务与财务会签', 'ALL', 2, 0, 0, 0, 'VOTING', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 插入任务历史记录
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES
('test_hist_001', 100000, 'test_task_done_001', 'test_inst_005', '直属上级审批', 'n1', 2, '李经理', 'APPROVE', '同意报销', 300, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('test_hist_002', 100000, 'test_task_done_002', 'test_inst_005', '财务主管审批', 'b1', 3, '王财务', 'APPROVE', '财务已审核', 600, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('test_hist_003', 100000, 'test_task_done_003', 'test_inst_006', '部门经理审批', 'n1', 2, '李经理', 'APPROVE', '同意请假', 180, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('test_hist_004', 100000, 'test_task_done_004', 'test_inst_006', 'HR备案', 'b1', 4, '赵HR', 'APPROVE', '已备案', 120, DATE_SUB(NOW(), INTERVAL 4 DAY));

-- 插入流程抄送记录
INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
(100000, 'test_inst_002', 'biz_leave', '张三的年假申请', 'n1', '部门经理审批', 5, '张三', 1, '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节返乡探亲"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'test_inst_003', 'biz_contract', 'XX科技采购合同审批', 'n1', '法务与财务会签', 2, '李经理', 1, '{"c1":"XX科技办公设备采购合同","c2":"XX科技有限公司","c3":50000,"c4":"采购合同","c5":"采购办公电脑及相关设备"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 'test_inst_004', 'biz_payment', '合同付款申请', 'n1', '财务主管审批', 3, '王财务', 1, '{"p1":"杭州云启科技有限公司","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'test_inst_006', 'biz_leave', '赵HR的病假申请', 'b1', 'HR备案', 4, '赵HR', 1, '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}', 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));
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

-- =========================================================
--
-- =========================================================
INSERT INTO template_category (id, name, description, order_num, tenant_id) VALUES
('cat-hr', '人事管理', '人力资源相关流程模板', 1, 100000),
('cat-finance', '财务管理', '财务相关流程模板', 2, 100000),
('cat-procurement', '采购管理', '采购相关流程模板', 3, 100000),
('cat-contract', '合同管理', '合同审批相关流程模板', 4, 100000),
('cat-admin', '行政管理', '行政管理流程模板', 5, 100000);

-- =========================================================
--
-- =========================================================

--
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', '请假申请', '员工请假审批流程模板', 'cat-hr',
'["请假", "审批", "人事"]',
'{
  "nodes": [
    {"id": "start_leave", "type": "START", "title": "提交请假申请"},
    {"id": "approval_leave_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "manager"},
    {"id": "end_leave", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_leave->approval_leave_manager", "source": "start_leave", "target": "approval_leave_manager"},
    {"id": "approval_leave_manager->end_leave", "source": "approval_leave_manager", "target": "end_leave"}
  ]
}',
1, 'active', 'system', 100000);

--
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-expense-001', '费用报销', '员工费用报销审批流程模板', 'cat-finance',
'["报销", "财务", "审批"]',
'{
  "nodes": [
    {"id": "start_expense", "type": "START", "title": "提交报销申请"},
    {"id": "approval_expense_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "manager"},
    {"id": "approval_expense_finance", "type": "APPROVAL", "title": "财务审核", "approverType": "ROLE", "approverValue": "finance"},
    {"id": "end_expense", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_expense->approval_expense_manager", "source": "start_expense", "target": "approval_expense_manager"},
    {"id": "approval_expense_manager->approval_expense_finance", "source": "approval_expense_manager", "target": "approval_expense_finance"},
    {"id": "approval_expense_finance->end_expense", "source": "approval_expense_finance", "target": "end_expense"}
  ]
}',
1, 'active', 'system', 100000);

--
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-purchase-001', '采购申请', '物资采购审批流程模板', 'cat-procurement',
'["采购", "审批", "物资"]',
'{
  "nodes": [
    {"id": "start_purchase", "type": "START", "title": "提交采购申请"},
    {"id": "approval_purchase_manager", "type": "APPROVAL", "title": "部门审批", "approverType": "ROLE", "approverValue": "manager"},
    {"id": "end_purchase", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_purchase->approval_purchase_manager", "source": "start_purchase", "target": "approval_purchase_manager"},
    {"id": "approval_purchase_manager->end_purchase", "source": "approval_purchase_manager", "target": "end_purchase"}
  ]
}',
1, 'active', 'system', 100000);

--
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-contract-001', '合同审批', '合同审批流程（含法务审核）', 'cat-contract',
'["合同", "审批", "法务"]',
'{
  "nodes": [
    {"id": "start_contract", "type": "START", "title": "提交合同"},
    {"id": "approval_contract_legal", "type": "APPROVAL", "title": "法务审核", "approverType": "USER", "approverValue": "6"},
    {"id": "approval_contract_leader", "type": "APPROVAL", "title": "领导审批", "approverType": "ROLE", "approverValue": "admin"},
    {"id": "end_contract", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_contract->approval_contract_legal", "source": "start_contract", "target": "approval_contract_legal"},
    {"id": "approval_contract_legal->approval_contract_leader", "source": "approval_contract_legal", "target": "approval_contract_leader"},
    {"id": "approval_contract_leader->end_contract", "source": "approval_contract_leader", "target": "end_contract"}
  ]
}',
1, 'active', 'system', 100000);

--
INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-trip-001', '出差申请', '员工出差审批流程模板', 'cat-admin',
'["出差", "审批", "行政"]',
'{
  "nodes": [
    {"id": "start_trip", "type": "START", "title": "提交出差申请"},
    {"id": "approval_trip_manager", "type": "APPROVAL", "title": "部门经理审批", "approverType": "ROLE", "approverValue": "manager"},
    {"id": "end_trip", "type": "END", "title": "流程结束"}
  ],
  "edges": [
    {"id": "start_trip->approval_trip_manager", "source": "start_trip", "target": "approval_trip_manager"},
    {"id": "approval_trip_manager->end_trip", "source": "approval_trip_manager", "target": "end_trip"}
  ]
}',
1, 'active', 'system', 100000);

SET FOREIGN_KEY_CHECKS = 1;

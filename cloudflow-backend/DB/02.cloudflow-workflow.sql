-- =========================================================
-- CloudFlow Pro - 宸ヤ綔娴佸紩鎿庢牳蹇冩ā鍧楁暟鎹簱鑴氭湰
-- 妯″潡锛氭祦绋嬪畾涔夈€佹祦绋嬪疄渚嬨€佷换鍔＄鐞嗐€佽〃鍗曞畾涔夈€侀€氱煡
-- 鐗堟湰锛歷1.1
-- 鍒涘缓鏃ユ湡锛?026-02-09
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
-- 鍒濆鍖栨暟鎹?- 娴佺▼鍒嗙被銆佽〃鍗曘€佹祦绋嬪畾涔変笌绀轰緥鏁版嵁
-- =========================================================
INSERT INTO `wf_process_category` (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA鍔炲叕',       'oa',            'Briefcase',    1, '0'),
(2, 0, '浜轰簨绠＄悊',     'hr',            'Users',        2, '0'),
(3, 0, '璐㈠姟绠＄悊',     'finance',       'DollarSign',   3, '0'),
(4, 0, '琛屾斂绠＄悊',     'admin',         'Building',     4, '0'),
(5, 0, '椤圭洰绠＄悊',     'project',       'FolderKanban', 5, '0'),
(10, 1, '璇峰亣绠＄悊',    'oa_leave',      'Calendar',     1, '0'),
(11, 1, '鍔犵彮绠＄悊',    'oa_overtime',   'Clock',        2, '0'),
(12, 1, '鍑哄樊绠＄悊',    'oa_trip',       'Plane',        3, '0'),
(13, 1, '鑰冨嫟绠＄悊',    'oa_attendance', 'UserCheck',    4, '0'),
(14, 1, '璁垮绠＄悊',    'oa_visitor',    'UserPlus',     5, '0'),
(20, 3, '鎶ラ攢绠＄悊',    'fin_expense',   'Receipt',      1, '0'),
(21, 3, '浠樻绠＄悊',    'fin_payment',   'CreditCard',   2, '0'),
(22, 3, '棰勭畻绠＄悊',    'fin_budget',    'PieChart',     3, '0'),
(30, 4, '杞﹁締绠＄悊',    'adm_vehicle',   'Car',          1, '0'),
(31, 4, '浼氳绠＄悊',    'adm_meeting',   'Video',        2, '0'),
(32, 4, '閫氱煡绠＄悊',    'adm_notice',    'Bell',         3, '0');

-- 琛ㄥ崟瀹氫箟
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES
('form_reimburse', '璐㈠姟鎶ラ攢琛ㄥ崟', '[{"id":"f1","type":"SELECT","label":"鎶ラ攢绫诲瀷","required":true,"options":["宸梾璐?,"鎷涘緟璐?,"鍔炲叕璐?,"鍥㈠缓璐?]},{"id":"f2","type":"NUMBER","label":"鎶ラ攢閲戦","required":true},{"id":"f3","type":"DATE","label":"鍙戠敓鏃ユ湡","required":true},{"id":"f4","type":"TEXTAREA","label":"璐圭敤鏄庣粏璇存槑","required":true}]', NOW()),
('form_payment', '瀵瑰叕浠樻鐢宠琛ㄥ崟', '[{"id":"p1","type":"TEXT","label":"鏀舵鏂瑰悕绉?,"required":true},{"id":"p2","type":"TEXT","label":"閾惰璐﹀彿","required":true},{"id":"p3","type":"NUMBER","label":"浠樻閲戦","required":true},{"id":"p4","type":"TEXT","label":"鍚堝悓缂栧彿","required":false}]', NOW()),
('form_leave', '璇峰亣鐢宠琛ㄥ崟', '[{"id":"l1","type":"SELECT","label":"璇峰亣绫诲瀷","required":true,"options":["骞村亣","浜嬪亣","鐥呭亣","濠氬亣","浜у亣"]},{"id":"l2","type":"DATE","label":"寮€濮嬫椂闂?,"required":true},{"id":"l3","type":"DATE","label":"缁撴潫鏃堕棿","required":true},{"id":"l4","type":"NUMBER","label":"鍏辫澶╂暟","required":true},{"id":"l5","type":"TEXTAREA","label":"璇峰亣浜嬬敱","required":true}]', NOW()),
('form_contract', '鍚堝悓瀹℃壒琛ㄥ崟', '[{"id":"c1","type":"TEXT","label":"鍚堝悓鍚嶇О","required":true},{"id":"c2","type":"TEXT","label":"瀵规柟鍗曚綅","required":true},{"id":"c3","type":"NUMBER","label":"鍚堝悓閲戦","required":true},{"id":"c4","type":"SELECT","label":"鍚堝悓绫诲瀷","required":true,"options":["閲囪喘鍚堝悓","閿€鍞悎鍚?,"鏈嶅姟鍗忚"]},{"id":"c5","type":"TEXTAREA","label":"涓昏鏉℃鎽樿","required":true}]', NOW()),
('form_recruit', '鎷涜仒鐢宠琛ㄥ崟', '[{"id":"r1","type":"TEXT","label":"鎷涜仒宀椾綅","required":true},{"id":"r2","type":"NUMBER","label":"鎷涜仒浜烘暟","required":true},{"id":"r3","type":"SELECT","label":"鑱岀骇","required":true,"options":["P5","P6","P7","P8"]},{"id":"r4","type":"TEXTAREA","label":"宀椾綅鑱岃矗","required":true},{"id":"r5","type":"NUMBER","label":"棰勭畻钖祫锛堝崈鍏冿級","required":true}]', NOW());

-- 鏍稿績娴佺▼瀹氫箟锛坣odes + edges锛?
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_reimburse', '璐㈠姟鎶ラ攢娴佺▼', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鎶ラ攢"},{"id":"n1","type":"APPROVAL","title":"鐩村睘涓婄骇瀹℃壒","approverType":"DIRECT_LEADER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw1","type":"CONDITION","title":"閲戦鏍￠獙"},{"id":"b1","type":"APPROVAL","title":"璐㈠姟涓荤瀹℃壒","approverType":"ROLE","approverValue":"finance","condition":"amount < 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"娴佺▼缁撴潫"},{"id":"b2","type":"APPROVAL","title":"璐㈠姟鎬荤洃瀹℃壒","approverType":"ROLE","approverValue":"finance","condition":"amount >= 1000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_leave', '鍛樺伐璇峰亣娴佺▼', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦璇峰亣"},{"id":"n1","type":"APPROVAL","title":"閮ㄩ棬缁忕悊瀹℃壒","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"gw_leave","type":"CONDITION","title":"澶╂暟鏍￠獙"},{"id":"b1","type":"APPROVAL","title":"HR澶囨","approverType":"ROLE","approverValue":"hr","condition":"days <= 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"娴佺▼缁撴潫"},{"id":"b2","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","condition":"days > 3","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw_leave","source":"n1","target":"gw_leave"},{"id":"gw_leave->b1","source":"gw_leave","target":"b1"},{"id":"gw_leave->b2","source":"gw_leave","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_contract', '鍚堝悓瀹℃壒娴佺▼', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"nodes":[{"id":"root","type":"START","title":"鍙戣捣鍚堝悓"},{"id":"n1","type":"APPROVAL","title":"娉曞姟涓庤储鍔′細绛?,"signType":"ALL","approverType":"USERS","approverValue":"3,6","props":{"buttons":["APPROVE","REJECT"]}},{"id":"n2","type":"APPROVAL","title":"鎬荤粡鐞嗙鍙?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_recruit', '鎷涜仒鐢宠娴佺▼', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鎷涜仒闇€姹?},{"id":"n1","type":"APPROVAL","title":"閮ㄩ棬鎬荤洃瀹℃壒","approverType":"DEPT_MANAGER","props":{"buttons":["APPROVE","RETURN"]}},{"id":"n2","type":"APPROVAL","title":"HR瀹℃牳","approverType":"ROLE","approverValue":"hr","props":{"buttons":["APPROVE","REJECT","DELEGATE"]}},{"id":"n3","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->n3","source":"n2","target":"n3"},{"id":"n3->end","source":"n3","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES
('wf_payment', '瀵瑰叕浠樻娴佺▼', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦浠樻鐢宠"},{"id":"n1","type":"APPROVAL","title":"璐㈠姟涓荤瀹℃壒","approverType":"ROLE","approverValue":"finance","props":{"buttons":["APPROVE","RETURN","DELEGATE"]}},{"id":"gw1","type":"CONDITION","title":"閲戦鏍￠獙"},{"id":"b1","type":"APPROVAL","title":"璐㈠姟鎬荤洃瀹℃壒","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b1","type":"END","title":"娴佺▼缁撴潫"},{"id":"b2","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end_b2","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

-- 閫氱敤 OA 娴佺▼瀹氫箟
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_attendance_appeal', '琛ュ崱/澶栧嫟瀹℃壒娴佺▼', 'attendance_appeal', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鐢宠"},{"id":"n1","type":"APPROVAL","title":"鐩村睘涓婄骇瀹℃壒","approverType":"DIRECT_LEADER"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_overtime_request', '鍔犵彮瀹℃壒娴佺▼', 'overtime_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鍔犵彮鐢宠"},{"id":"n1","type":"APPROVAL","title":"鐩村睘涓婄骇瀹℃壒","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"HR澶囨","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_expense_claim', '鎶ラ攢瀹℃壒娴佺▼', 'expense_claim', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鎶ラ攢"},{"id":"n1","type":"APPROVAL","title":"鐩村睘涓婄骇瀹℃壒","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"璐㈠姟瀹℃牳","approverType":"ROLE","approverValue":"finance"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_leave_request', '璇峰亣瀹℃壒娴佺▼', 'leave_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦璇峰亣"},{"id":"n1","type":"APPROVAL","title":"閮ㄩ棬缁忕悊瀹℃壒","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR澶囨","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

-- HR 瀹℃壒娴佺▼瀹氫箟
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_offer_approval', 'Offer瀹℃壒娴佺▼', 'offer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦Offer瀹℃壒"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_onboarding_approval', '鍏ヨ亴瀹℃壒娴佺▼', 'onboarding_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鍏ヨ亴鐢宠"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_probation_confirmation_approval', '杞瀹℃壒娴佺▼', 'probation_confirmation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦杞鐢宠"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_resignation_approval', '绂昏亴瀹℃壒娴佺▼', 'resignation_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦绂昏亴鐢宠"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_salary_adjustment_approval', '璋冭柂瀹℃壒娴佺▼', 'salary_adjustment_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦璋冭柂鐢宠"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_transfer_approval', '璋冨矖瀹℃壒娴佺▼', 'transfer_approval', 1, 'PUBLISHED', 1, 'HR', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦璋冨矖鐢宠"},{"id":"n1","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","props":{"buttons":["APPROVE","REJECT","RETURN","DELEGATE"]}},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->end","source":"n1","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_payment_request', '浠樻瀹℃壒娴佺▼', 'payment_request', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦浠樻鐢宠"},{"id":"n1","type":"APPROVAL","title":"璐㈠姟涓荤瀹℃壒","approverType":"ROLE","approverValue":"finance"},{"id":"gw1","type":"CONDITION","title":"閲戦鏍￠獙"},{"id":"b1","type":"APPROVAL","title":"璐㈠姟鎬荤洃瀹℃壒","approverType":"ROLE","approverValue":"finance","condition":"amount < 50000"},{"id":"end_b1","type":"END","title":"娴佺▼缁撴潫"},{"id":"b2","type":"APPROVAL","title":"鎬荤粡鐞嗗鎵?,"approverType":"ROLE","approverValue":"admin","condition":"amount >= 50000"},{"id":"end_b2","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->gw1","source":"n1","target":"gw1"},{"id":"gw1->b1","source":"gw1","target":"b1"},{"id":"gw1->b2","source":"gw1","target":"b2"},{"id":"b1->end_b1","source":"b1","target":"end_b1"},{"id":"b2->end_b2","source":"b2","target":"end_b2"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_business_trip', '鍑哄樊瀹℃壒娴佺▼', 'business_trip', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鍑哄樊鐢宠"},{"id":"n1","type":"APPROVAL","title":"閮ㄩ棬缁忕悊瀹℃壒","approverType":"DEPT_MANAGER"},{"id":"n2","type":"APPROVAL","title":"HR澶囨","approverType":"ROLE","approverValue":"hr"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_vehicle_approval', '鐢ㄨ溅瀹℃壒娴佺▼', 'vehicle_approval', 1, 'PUBLISHED', 1, 'OA', '{"nodes":[{"id":"root","type":"START","title":"鎻愪氦鐢ㄨ溅鐢宠"},{"id":"n1","type":"APPROVAL","title":"鐩村睘涓婄骇瀹℃壒","approverType":"DIRECT_LEADER"},{"id":"n2","type":"APPROVAL","title":"琛屾斂纭娲捐溅","approverType":"ROLE","approverValue":"admin"},{"id":"end","type":"END","title":"娴佺▼缁撴潫"}],"edges":[{"id":"root->n1","source":"root","target":"n1"},{"id":"n1->n2","source":"n1","target":"n2"},{"id":"n2->end","source":"n2","target":"end"}]}', NOW());

SET FOREIGN_KEY_CHECKS = 1;

-- 娴嬭瘯鏁版嵁
-- 鐢ㄤ簬寮€鍙戝拰娴嬭瘯鐜
-- 鎻掑叆娴嬭瘯娴佺▼瀹炰緥
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key,
  title, start_user_id, start_user_name, status, start_time, end_time, variables, priority
) VALUES
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001', '寮犱笁鐨勫樊鏃呰垂鎶ラ攢', 5, '寮犱笁', 'RUNNING', DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL, '{"f1":"宸梾璐?,"f2":1500,"f3":"2026-02-08","f4":"鍖椾含瀹㈡埛鎷滆宸梾鎶ラ攢"}', 'NORMAL'),
('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002', '寮犱笁鐨勫勾鍋囩敵璇?, 5, '寮犱笁', 'RUNNING', DATE_SUB(NOW(), INTERVAL 1 DAY), NULL, '{"l1":"骞村亣","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"鏄ヨ妭杩斾埂鎺翰"}', 'URGENT'),
('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003', 'XX绉戞妧閲囪喘鍚堝悓瀹℃壒', 2, '鏉庣粡鐞?, 'RUNNING', DATE_SUB(NOW(), INTERVAL 12 HOUR), NULL, '{"c1":"XX绉戞妧鍔炲叕璁惧閲囪喘鍚堝悓","c2":"XX绉戞妧鏈夐檺鍏徃","c3":50000,"c4":"閲囪喘鍚堝悓","c5":"閲囪喘鍔炲叕鐢佃剳鍙婄浉鍏宠澶?}', 'HIGH'),
('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004', '鍚堝悓浠樻鐢宠', 3, '鐜嬭储鍔?, 'RUNNING', DATE_SUB(NOW(), INTERVAL 10 HOUR), NULL, '{"p1":"鏉窞浜戝惎绉戞妧鏈夐檺鍏徃","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 'NORMAL'),
('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005', '鏉庣粡鐞嗙殑瀹㈡埛鎷涘緟璐规姤閿€', 2, '鏉庣粡鐞?, 'COMPLETED', DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY), '{"f1":"鎷涘緟璐?,"f2":2500,"f3":"2026-02-09","f4":"瀹㈡埛鍟嗗姟瀹磋"}', 'URGENT'),
('test_inst_006', 100000, 'biz_leave', 'wf_leave', 'BIZ_006', '璧礖R鐨勭梾鍋囩敵璇?, 4, '璧礖R', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY), '{"l1":"鐥呭亣","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"鎰熷啋鍙戠儳闇€瑕佷紤鎭?}', 'NORMAL'),
('test_inst_007', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_007', '楂樼骇Java寮€鍙戝伐绋嬪笀鎷涜仒鐢宠', 4, '璧礖R', 'RUNNING', DATE_SUB(NOW(), INTERVAL 8 HOUR), NULL, '{"r1":"楂樼骇Java寮€鍙戝伐绋嬪笀","r2":2,"r3":"P7","r4":"璐熻矗鏍稿績涓氬姟绯荤粺寮€鍙?,"r5":35}', 'HIGH');

-- 鎻掑叆寰呭姙浠诲姟
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES
('test_task_001', 100000, 'test_inst_001', 'n1', '鐩村睘涓婄骇瀹℃壒', 2, '鏉庣粡鐞?, 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 6 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_002', 100000, 'test_inst_002', 'n1', '閮ㄩ棬缁忕悊瀹℃壒', 2, '鏉庣粡鐞?, 'TODO', 'URGENT', DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL 1 DAY)),
('test_task_003', 100000, 'test_inst_003', 'n1', '娉曞姟涓庤储鍔′細绛?, 6, '鍒樻硶鍔?, 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_004', 100000, 'test_inst_003', 'n1', '娉曞姟涓庤储鍔′細绛?, 3, '鐜嬭储鍔?, 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 12 HOUR), DATE_ADD(NOW(), INTERVAL 3 DAY)),
('test_task_005', 100000, 'test_inst_004', 'n1', '璐㈠姟涓荤瀹℃壒', 3, '鐜嬭储鍔?, 'TODO', 'NORMAL', DATE_SUB(NOW(), INTERVAL 10 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY)),
('test_task_006', 100000, 'test_inst_007', 'n2', 'HR瀹℃牳', 4, '璧礖R', 'TODO', 'HIGH', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 鎻掑叆浼氱浠诲姟璁板綍
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '娉曞姟涓庤储鍔′細绛?, 'ALL', 2, 0, 0, 0, 'VOTING', DATE_SUB(NOW(), INTERVAL 12 HOUR));

-- 鎻掑叆浠诲姟鍘嗗彶璁板綍
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES
('test_hist_001', 100000, 'test_task_done_001', 'test_inst_005', '鐩村睘涓婄骇瀹℃壒', 'n1', 2, '鏉庣粡鐞?, 'APPROVE', '鍚屾剰鎶ラ攢', 300, DATE_SUB(NOW(), INTERVAL 3 DAY)),
('test_hist_002', 100000, 'test_task_done_002', 'test_inst_005', '璐㈠姟涓荤瀹℃壒', 'b1', 3, '鐜嬭储鍔?, 'APPROVE', '璐㈠姟宸插鏍?, 600, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('test_hist_003', 100000, 'test_task_done_003', 'test_inst_006', '閮ㄩ棬缁忕悊瀹℃壒', 'n1', 2, '鏉庣粡鐞?, 'APPROVE', '鍚屾剰璇峰亣', 180, DATE_SUB(NOW(), INTERVAL 5 DAY)),
('test_hist_004', 100000, 'test_task_done_004', 'test_inst_006', 'HR澶囨', 'b1', 4, '璧礖R', 'APPROVE', '宸插妗?, 120, DATE_SUB(NOW(), INTERVAL 4 DAY));

-- 鎻掑叆娴佺▼鎶勯€佽褰?
INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
(100000, 'test_inst_002', 'biz_leave', '寮犱笁鐨勫勾鍋囩敵璇?, 'n1', '閮ㄩ棬缁忕悊瀹℃壒', 5, '寮犱笁', 1, '{"l1":"骞村亣","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"鏄ヨ妭杩斾埂鎺翰"}', 0, NULL, DATE_SUB(NOW(), INTERVAL 20 HOUR)),
(100000, 'test_inst_003', 'biz_contract', 'XX绉戞妧閲囪喘鍚堝悓瀹℃壒', 'n1', '娉曞姟涓庤储鍔′細绛?, 2, '鏉庣粡鐞?, 1, '{"c1":"XX绉戞妧鍔炲叕璁惧閲囪喘鍚堝悓","c2":"XX绉戞妧鏈夐檺鍏徃","c3":50000,"c4":"閲囪喘鍚堝悓","c5":"閲囪喘鍔炲叕鐢佃剳鍙婄浉鍏宠澶?}', 0, NULL, DATE_SUB(NOW(), INTERVAL 12 HOUR)),
(100000, 'test_inst_004', 'biz_payment', '鍚堝悓浠樻鐢宠', 'n1', '璐㈠姟涓荤瀹℃壒', 3, '鐜嬭储鍔?, 1, '{"p1":"鏉窞浜戝惎绉戞妧鏈夐檺鍏徃","p2":"6217000012345678901","p3":30000,"p4":"HT-2026-001"}', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR), DATE_SUB(NOW(), INTERVAL 10 HOUR)),
(100000, 'test_inst_006', 'biz_leave', '璧礖R鐨勭梾鍋囩敵璇?, 'b1', 'HR澶囨', 4, '璧礖R', 1, '{"l1":"鐥呭亣","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"鎰熷啋鍙戠儳闇€瑕佷紤鎭?}', 1, DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY));
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
-- 缁熶竴鐨勭郴缁熸ā鏉垮垎绫伙紙骞冲彴绾э紝tenant_id 涓虹┖锛?INSERT INTO template_category (id, name, description, order_num, tenant_id) VALUES
('cat-office', '琛屾斂鍔炲叕', '鏃ュ父琛屾斂銆侀€氱敤瀹℃壒涓庡姙鍏崗鍚屾祦绋嬫ā鏉?, 1, NULL),
('cat-finance', '璐㈠姟', '璐圭敤銆佷粯娆俱€侀绠楃瓑璐㈠姟娴佺▼妯℃澘', 2, NULL),
('cat-hr', '浜轰簨', '鍏ヨ浆璋冪銆佸煿璁垚闀跨瓑浜轰簨娴佺▼妯℃澘', 3, NULL),
('cat-sales', '閿€鍞笟鍔?, '鎶ヤ环銆佹姌鎵ｃ€佸悎鍚岀瓑閿€鍞祦绋嬫ā鏉?, 4, NULL),
('cat-it', 'IT杩愮淮', '鏉冮檺銆佸彂甯冦€佹晠闅滅瓑 IT 杩愮淮娴佺▼妯℃澘', 5, NULL),
('cat-industry', '琛屼笟涓撳睘', '琛屼笟鍦烘櫙涓嬬殑涓撲笟娴佺▼妯℃澘', 6, NULL),
('cat-other', '鍏朵粬', '椤圭洰銆佹竻鍗曠瓑閫氱敤琛ュ厖娴佺▼妯℃澘', 7, NULL);

-- 缁熶竴鐨勭郴缁熸ā鏉垮簱锛堝钩鍙扮骇锛宼enant_id 涓虹┖锛?INSERT INTO workflow_template (id, name, description, category_id, tags, definition, is_system, status, created_by, tenant_id) VALUES
('tpl-leave-001', '璇峰亣瀹℃壒', '鍛樺伐鎻愪氦 鈫?閮ㄩ棬缁忕悊瀹℃壒 鈫?瀹屾垚', 'cat-office',
'["璇峰亣","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦璇峰亣"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-contract-001', '鍚堝悓瀹℃壒', '璧疯崏 鈫?娉曞姟瀹℃牳 鈫?鎬荤粡鐞嗙鍙?鈫?鐩栫珷褰掓。', 'cat-office',
'["鍚堝悓","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "璧疯崏鍚堝悓"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "娉曞姟瀹℃牳",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗙鍙?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鐩栫珷褰掓。",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-seal-001', '鐢ㄥ嵃鐢宠', '鐢宠鐢ㄥ嵃 鈫?閮ㄩ棬瀹℃壒 鈫?琛屾斂鐩栫珷 鈫?瀹屾垚', 'cat-office',
'["鐢ㄥ嵃","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鐢宠鐢ㄥ嵃"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "琛屾斂鐩栫珷",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-travel-001', '鍑哄樊鐢宠', '鎻愪氦鍑哄樊 鈫?閮ㄩ棬瀹℃壒 鈫?鎬荤粡鐞嗗鎵?鈫?瀹屾垚', 'cat-office',
'["鍑哄樊","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍑哄樊鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-vehicle-001', '鐢ㄨ溅鐢宠', '鐢宠鐢ㄨ溅 鈫?琛屾斂瀹℃壒 鈫?杞﹁締璋冨害 鈫?瀹屾垚', 'cat-office',
'["鐢ㄨ溅","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鐢宠鐢ㄨ溅"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "琛屾斂瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "杞﹁締璋冨害纭",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-reimbursement-001', '鎶ラ攢瀹℃壒', '鎻愪氦鎶ラ攢 鈫?閮ㄩ棬缁忕悊 鈫?璐㈠姟瀹℃牳 鈫?瀹屾垚', 'cat-finance',
'["鎶ラ攢","璐㈠姟","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鎶ラ攢"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "璐㈠姟瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-purchase-001', '閲囪喘瀹℃壒', '鎻愪氦閲囪喘 鈫?閲戦鍒ゆ柇 鈫?鍒嗙骇瀹℃壒 鈫?瀹屾垚', 'cat-finance',
'["閲囪喘","璐㈠姟","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦閲囪喘鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "閲戦 > 5000",
      "condition": "amount > 5000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-payment-001', '浠樻鐢宠', '鎻愪氦浠樻 鈫?璐㈠姟瀹℃牳 鈫?鎬荤粡鐞嗗鎵?鈫?鍑虹撼浠樻', 'cat-finance',
'["浠樻","璐㈠姟","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦浠樻鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "璐㈠姟瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鍑虹撼浠樻",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-budget-001', '棰勭畻瀹℃壒', '缂栧埗棰勭畻 鈫?閮ㄩ棬瀹℃牳 鈫?璐㈠姟瀹℃牳 鈫?鎬荤粡鐞嗘壒鍑?, 'cat-finance',
'["棰勭畻","璐㈠姟","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "缂栧埗棰勭畻"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬璐熻矗浜哄鏍?,
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "璐㈠姟閮ㄥ鏍?,
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗘壒鍑?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-onboarding-001', '鍏ヨ亴瀹℃壒', '鎻愪氦鍏ヨ亴 鈫?HR瀹℃牳 鈫?閮ㄩ棬纭 鈫?IT寮€閫氳处鍙?, 'cat-hr',
'["鍏ヨ亴","浜轰簨","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍏ヨ亴鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "HR瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "閮ㄩ棬璐熻矗浜虹‘璁?,
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "IT寮€閫氳处鍙?,
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-resignation-001', '绂昏亴瀹℃壒', '鎻愪氦绂昏亴 鈫?閮ㄩ棬瀹℃壒 鈫?HR瀹℃牳 鈫?璧勪骇浜ゆ帴', 'cat-hr',
'["绂昏亴","浜轰簨","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦绂昏亴鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "璧勪骇浜ゆ帴纭",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-promotion-001', '鏅嬪崌瀹℃壒', '鎻愬悕鎺ㄨ崘 鈫?閮ㄩ棬瀹℃牳 鈫?HR璇勪及 鈫?鎬荤粡鐞嗘壒鍑?, 'cat-hr',
'["鏅嬪崌","浜轰簨","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愬悕鎺ㄨ崘"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬璐熻矗浜哄鏍?,
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR璇勪及",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗘壒鍑?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-training-001', '鍩硅鐢宠', '鎻愪氦鍩硅 鈫?閮ㄩ棬瀹℃壒 鈫?HR瀹℃牳 鈫?瀹屾垚', 'cat-hr',
'["鍩硅","浜轰簨","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍩硅鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "HR瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-quote-001', '鎶ヤ环瀹℃壒', '鎻愪氦鎶ヤ环 鈫?閿€鍞富绠?鈫?閲戦鍒ゆ柇 鈫?鍒嗙骇瀹℃壒', 'cat-sales',
'["鎶ヤ环","閿€鍞笟鍔?,"妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鎶ヤ环鍗?
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閿€鍞富绠″鏍?,
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "b2",
      "type": "CONDITION",
      "title": "閲戦 > 10涓?,
      "condition": "amount > 100000"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end_high",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-discount-001', '鎶樻墸瀹℃壒', '鐢宠鎶樻墸 鈫?閿€鍞€荤洃 鈫?璐㈠姟纭 鈫?瀹屾垚', 'cat-sales',
'["鎶樻墸","閿€鍞笟鍔?,"妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鐢宠鎶樻墸"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閿€鍞€荤洃瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "璐㈠姟纭",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-server-001', '鏈嶅姟鍣ㄧ敵璇?, '鎻愪氦鐢宠 鈫?IT瀹℃牳 鈫?瀹夊叏瀹℃煡 鈫?杩愮淮閮ㄧ讲', 'cat-it',
'["鏈嶅姟鍣?,"IT杩愮淮","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鏈嶅姟鍣ㄧ敵璇?
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "IT涓荤瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "瀹夊叏瀹℃煡",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "杩愮淮閮ㄧ讲",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-permission-001', '鏉冮檺鐢宠', '鎻愪氦鏉冮檺 鈫?閮ㄩ棬瀹℃壒 鈫?IT瀹℃牳 鈫?瀹夊叏纭', 'cat-it',
'["鏉冮檺","IT杩愮淮","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鏉冮檺鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "IT瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "瀹夊叏纭",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-change-001', '鍙樻洿鍙戝竷', '鎻愪氦鍙樻洿 鈫?鎶€鏈瘎瀹?鈫?娴嬭瘯楠岃瘉 鈫?涓婄嚎瀹℃壒', 'cat-it',
'["鍙樻洿鍙戝竷","IT杩愮淮","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍙樻洿鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "鎶€鏈瘎瀹?,
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "娴嬭瘯楠岃瘉",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "涓婄嚎瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-medical-001', '鍖荤枟鍣ㄦ閲囪喘', '绉戝鐢宠 鈫?璁惧绉戝鏍?鈫?闄㈤暱瀹℃壒 鈫?鎷涙爣閲囪喘', 'cat-industry',
'["鍖荤枟鍣ㄦ閲囪喘","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "绉戝鎻愪氦鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "璁惧绉戝鏍?,
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "闄㈤暱瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鎷涙爣閲囪喘",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-construction-001', '宸ョ▼楠屾敹', '鎻愪氦楠屾敹 鈫?鐩戠悊瀹℃牳 鈫?璐ㄦ楠屾敹 鈫?鐢叉柟纭', 'cat-industry',
'["宸ョ▼楠屾敹","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦楠屾敹鐢宠"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "鐩戠悊瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "璐ㄦ楠屾敹",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鐢叉柟纭",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-education-001', '璇剧▼瀹℃壒', '鏁欏笀鎻愪氦 鈫?鏁欑爺缁勫鏍?鈫?鏁欏姟澶勫鎵?鈫?瀹屾垚', 'cat-industry',
'["璇剧▼","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦璇剧▼鏂规"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "鏁欑爺缁勫鏍?,
      "approverType": "DIRECT_LEADER"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鏁欏姟澶勫鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-maintenance-001', '璁惧缁翠慨', '鎶ヤ慨 鈫?缁翠慨涓荤娲惧崟 鈫?缁翠慨瀹屾垚 鈫?楠屾敹纭', 'cat-industry',
'["璁惧缁翠慨","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鎶ヤ慨"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "缁翠慨涓荤娲惧崟",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "缁翠慨瀹屾垚纭",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n3",
      "type": "APPROVAL",
      "title": "鎶ヤ慨浜洪獙鏀?,
      "approverType": "INITIATOR"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-logistics-001', '鍙戣揣瀹℃壒', '鍒涘缓鍙戣揣鍗?鈫?浠撳簱纭 鈫?鐗╂祦瀹夋帓 鈫?瀹屾垚', 'cat-industry',
'["鍙戣揣","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鍒涘缓鍙戣揣鍗?
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "浠撳簱纭搴撳瓨",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鐗╂祦瀹夋帓",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-checklist-001', '瀹℃牳娓呭崟', '鎻愪氦娓呭崟 鈫?閫愰」瀹℃牳 鈫?鏈€缁堢‘璁?鈫?瀹屾垚', 'cat-other',
'["瀹℃牳娓呭崟","鍏朵粬","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦瀹℃牳娓呭崟"
    },
    {
      "id": "n1",
      "type": "APPROVAL",
      "title": "閫愰」瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "n2",
      "type": "APPROVAL",
      "title": "鏈€缁堢‘璁?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-purchase_advanced-001', '澶ч閲囪喘鍏ㄦ祦绋?, '閮ㄩ棬瀹℃壒 鈫?閲戦鍒嗙骇 鈫?澶氱骇瀹℃壒 鈫?閫氱煡缁撴灉', 'cat-finance',
'["澶ч閲囪喘","璐㈠姟","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦閲囪喘鐢宠"
    },
    {
      "id": "pa_n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "pa_n5",
      "type": "NOTIFICATION",
      "title": "閫氱煡閲囪喘缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "閲囪喘瀹℃壒缁撴灉閫氱煡",
        "notificationContent": "鎮ㄧ殑閲囪喘鐢宠锛堥噾棰? ${amount}锛夊凡瀹℃壒瀹屾垚锛岃鏌ョ湅缁撴灉銆?
      }
    },
    {
      "id": "pa_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "pa_b2",
      "type": "CONDITION",
      "title": "5000 < 閲戦 鈮?50000",
      "condition": "amount > 5000 && amount <= 50000"
    },
    {
      "id": "pa_n2",
      "type": "APPROVAL",
      "title": "璐㈠姟鎬荤洃瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_b3",
      "type": "CONDITION",
      "title": "閲戦 > 50000",
      "condition": "amount > 50000"
    },
    {
      "id": "pa_n3",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "pa_n4",
      "type": "APPROVAL",
      "title": "璐㈠姟鎬荤洃瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "pa_n5_mid",
      "type": "NOTIFICATION",
      "title": "閫氱煡閲囪喘缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "閲囪喘瀹℃壒缁撴灉閫氱煡",
        "notificationContent": "鎮ㄧ殑閲囪喘鐢宠锛堥噾棰? ${amount}锛夊凡瀹℃壒瀹屾垚锛岃鏌ョ湅缁撴灉銆?
      }
    },
    {
      "id": "pa_end_mid",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "pa_n5_high",
      "type": "NOTIFICATION",
      "title": "閫氱煡閲囪喘缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "閲囪喘瀹℃壒缁撴灉閫氱煡",
        "notificationContent": "鎮ㄧ殑閲囪喘鐢宠锛堥噾棰? ${amount}锛夊凡瀹℃壒瀹屾垚锛岃鏌ョ湅缁撴灉銆?
      }
    },
    {
      "id": "pa_end_high",
      "type": "END",
      "title": "娴佺▼缁撴潫"
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
('tpl-project_approval-001', '椤圭洰绔嬮」瀹℃壒', '閮ㄩ棬瀹℃牳 鈫?鎶€鏈?璐㈠姟骞惰璇勫 鈫?鎬荤粡鐞嗗鎵?鈫?閫氱煡', 'cat-other',
'["椤圭洰绔嬮」","鍏朵粬","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦绔嬮」鐢宠"
    },
    {
      "id": "proj_n1",
      "type": "APPROVAL",
      "title": "閮ㄩ棬璐熻矗浜哄鏍?,
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "proj_n2",
      "type": "PARALLEL",
      "title": "骞惰璇勫锛堟妧鏈?璐㈠姟锛?,
      "approverType": "ROLE",
      "approverValue": "admin,finance",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "proj_n5",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "proj_n6",
      "type": "NOTIFICATION",
      "title": "閫氱煡绔嬮」缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "椤圭洰绔嬮」缁撴灉",
        "notificationContent": "鎮ㄧ殑椤圭洰绔嬮」鐢宠宸插畬鎴愬鎵癸紝璇风櫥褰曠郴缁熸煡鐪嬭鎯呫€?
      }
    },
    {
      "id": "proj_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "proj_b1",
      "type": "CONDITION",
      "title": "鎶€鏈彲琛屾€ц瘎瀹?
    },
    {
      "id": "proj_n3",
      "type": "APPROVAL",
      "title": "鎶€鏈鍛樹細璇勫",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "proj_b2",
      "type": "CONDITION",
      "title": "璐㈠姟棰勭畻璇勪及"
    },
    {
      "id": "proj_n4",
      "type": "APPROVAL",
      "title": "璐㈠姟閮ㄩ绠楄瘎浼?,
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
('tpl-regularization-001', '鍛樺伐杞瀹℃壒', '瀹氭椂鎻愰啋 鈫?閮ㄩ棬璇勪及 鈫?HR瀹℃牳 鈫?骞惰鍔炵悊 鈫?閫氱煡', 'cat-hr',
'["鍛樺伐杞","浜轰簨","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鍙戣捣杞娴佺▼"
    },
    {
      "id": "reg_n1",
      "type": "TIMER",
      "title": "璇曠敤鏈熷埌鏈熸彁閱?,
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "reg_n2",
      "type": "APPROVAL",
      "title": "閮ㄩ棬璐熻矗浜鸿瘎浼?,
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "reg_n3",
      "type": "APPROVAL",
      "title": "HR缁煎悎瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "hr"
    },
    {
      "id": "reg_n4",
      "type": "PARALLEL",
      "title": "骞惰鍔炵悊锛圛T+琛屾斂锛?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "reg_n7",
      "type": "NOTIFICATION",
      "title": "閫氱煡杞缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "杞瀹℃壒缁撴灉",
        "notificationContent": "鎭枩锛佹偍鐨勮浆姝ｇ敵璇峰凡閫氳繃锛屾杩庢垚涓烘寮忓憳宸ャ€?
      }
    },
    {
      "id": "reg_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "reg_b1",
      "type": "CONDITION",
      "title": "IT鏉冮檺寮€閫?
    },
    {
      "id": "reg_n5",
      "type": "MANUAL",
      "title": "IT寮€閫氭寮忔潈闄?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "涓鸿浆姝ｅ憳宸ュ紑閫氭寮忓憳宸ョ郴缁熸潈闄愩€侀偖绠辩瓑",
        "priority": "HIGH"
      }
    },
    {
      "id": "reg_b2",
      "type": "CONDITION",
      "title": "琛屾斂鎵嬬画鍔炵悊"
    },
    {
      "id": "reg_n6",
      "type": "MANUAL",
      "title": "琛屾斂鍔炵悊宸ョ墝绀句繚",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "鍔炵悊姝ｅ紡宸ョ墝銆佹洿鏂扮ぞ淇濅俊鎭€佺璁㈡寮忓悎鍚?,
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
('tpl-incident-001', 'IT鏁呴殰澶勭悊', '鑷姩鍒嗙骇 鈫?鎸夌骇鍒垎娴?鈫?澶勭悊 鈫?楠岃瘉纭', 'cat-it',
'["IT鏁呴殰","IT杩愮淮","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鏁呴殰鎶ュ憡"
    },
    {
      "id": "inc_n1",
      "type": "SCRIPT",
      "title": "鑷姩鏁呴殰鍒嗙骇",
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
      "title": "鎶ヤ慨浜洪獙璇佺‘璁?,
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "璇风‘璁ゆ晠闅滄槸鍚﹀凡淇锛屽鏈慨澶嶈閫€鍥為噸鏂板鐞?,
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_n8",
      "type": "NOTIFICATION",
      "title": "閫氱煡鏁呴殰鍏抽棴",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "鏁呴殰澶勭悊瀹屾垚",
        "notificationContent": "鎮ㄦ彁浜ょ殑鏁呴殰鎶ュ憡宸插鐞嗗畬鎴愬苟鍏抽棴銆?
      }
    },
    {
      "id": "inc_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "inc_b1",
      "type": "CONDITION",
      "title": "P1 绱ф€ユ晠闅?,
      "condition": "incidentLevel == \"P1\""
    },
    {
      "id": "inc_n2",
      "type": "NOTIFICATION",
      "title": "绱ф€ラ€氱煡绠＄悊灞?,
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "銆愮揣鎬ャ€慞1绾ф晠闅滃憡璀?,
        "notificationContent": "绯荤粺鍙戠敓P1绾х揣鎬ユ晠闅滐紝璇风珛鍗冲叧娉紒鏁呴殰鎻忚堪: ${description}"
      }
    },
    {
      "id": "inc_n3",
      "type": "MANUAL",
      "title": "绱ф€ヤ慨澶嶅鐞?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P1绾х揣鎬ユ晠闅滐紝闇€绔嬪嵆鍝嶅簲骞朵慨澶?,
        "priority": "HIGH"
      }
    },
    {
      "id": "inc_b2",
      "type": "CONDITION",
      "title": "P2 閲嶈鏁呴殰",
      "condition": "incidentLevel == \"P2\""
    },
    {
      "id": "inc_n4",
      "type": "APPROVAL",
      "title": "杩愮淮涓荤娲惧崟",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "inc_n5",
      "type": "MANUAL",
      "title": "杩愮淮宸ョ▼甯堝鐞?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P2绾ф晠闅滐紝璇峰湪4灏忔椂鍐呭畬鎴愪慨澶?,
        "priority": "MEDIUM"
      }
    },
    {
      "id": "inc_b3",
      "type": "CONDITION",
      "title": "P3 涓€鑸晠闅?,
      "condition": "incidentLevel == \"P3\""
    },
    {
      "id": "inc_n6",
      "type": "MANUAL",
      "title": "杩愮淮宸ョ▼甯堝鐞?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "P3绾т竴鑸晠闅滐紝璇峰湪24灏忔椂鍐呭鐞?,
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
('tpl-sales_contract-001', '閿€鍞悎鍚屽叏娴佺▼', '閿€鍞鏍?鈫?閲戦鍒嗙骇 鈫?娉曞姟瀹℃牳 鈫?骞惰鐩栫珷 鈫?閫氱煡', 'cat-sales',
'["閿€鍞悎鍚?,"閿€鍞笟鍔?,"妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍚堝悓瀹℃壒"
    },
    {
      "id": "sc_n1",
      "type": "APPROVAL",
      "title": "閿€鍞富绠″鏍?,
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "sc_n5",
      "type": "APPROVAL",
      "title": "娉曞姟鍚堣瀹℃牳",
      "approverType": "USER",
      "approverValue": "6"
    },
    {
      "id": "sc_n6",
      "type": "PARALLEL",
      "title": "骞惰鍔炵悊锛堣储鍔?琛屾斂锛?,
      "approverType": "ROLE",
      "approverValue": "finance,admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sc_n9",
      "type": "NOTIFICATION",
      "title": "閫氱煡鍚堝悓绛剧讲瀹屾垚",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "鍚堝悓瀹℃壒瀹屾垚",
        "notificationContent": "鎮ㄦ彁浜ょ殑鍚堝悓锛堥噾棰? ${amount}锛夊凡瀹屾垚鍏ㄩ儴瀹℃壒娴佺▼锛岃鍙婃椂璺熻繘绛剧讲銆?
      }
    },
    {
      "id": "sc_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "sc_b3",
      "type": "CONDITION",
      "title": "璐㈠姟纭"
    },
    {
      "id": "sc_n7",
      "type": "APPROVAL",
      "title": "璐㈠姟纭鏀舵鏉℃",
      "approverType": "ROLE",
      "approverValue": "finance"
    },
    {
      "id": "sc_b4",
      "type": "CONDITION",
      "title": "琛屾斂鐩栫珷"
    },
    {
      "id": "sc_n8",
      "type": "MANUAL",
      "title": "琛屾斂鐩栫珷褰掓。",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "鍚堝悓鐩栫珷骞跺綊妗ｅ師浠?,
        "priority": "HIGH"
      }
    },
    {
      "id": "sc_b1",
      "type": "CONDITION",
      "title": "閲戦 鈮?10涓?,
      "condition": "amount <= 100000"
    },
    {
      "id": "sc_n2",
      "type": "APPROVAL",
      "title": "閿€鍞€荤洃瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_b2",
      "type": "CONDITION",
      "title": "閲戦 > 10涓?,
      "condition": "amount > 100000"
    },
    {
      "id": "sc_n3",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sc_n4",
      "type": "APPROVAL",
      "title": "钁ｄ簨浼氬鎵?,
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
('tpl-bidding-001', '鎷涙爣閲囪喘娴佺▼', '闇€姹傚鏍?鈫?鐢熸垚鏍囦功 鈫?绛夊緟鎶曟爣 鈫?骞惰璇勬爣 鈫?瀹℃壒', 'cat-industry',
'["鎷涙爣閲囪喘","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鎷涙爣闇€姹?
    },
    {
      "id": "bid_n1",
      "type": "APPROVAL",
      "title": "閲囪喘閮ㄥ鏍搁渶姹?,
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_n2",
      "type": "SCRIPT",
      "title": "鑷姩鐢熸垚鎷涙爣鏂囦欢",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def tenderNo = \"TENDER-\" + System.currentTimeMillis(); return [tenderGenerated: true, tenderNo: tenderNo, tenderProjectName: projectName, tenderBudget: budget]",
        "continueOnError": false
      }
    },
    {
      "id": "bid_n3",
      "type": "TIMER",
      "title": "绛夊緟鎶曟爣鎴锛?澶╋級",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "bid_n4",
      "type": "PARALLEL",
      "title": "骞惰璇勬爣",
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "bid_n7",
      "type": "APPROVAL",
      "title": "璇勬爣濮斿憳浼氬畾鏍?,
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "bid_n8",
      "type": "NOTIFICATION",
      "title": "閫氱煡涓爣缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "鎷涙爣缁撴灉閫氱煡",
        "notificationContent": "鎷涙爣椤圭洰銆?{projectName}銆嶅凡瀹屾垚璇勬爣锛岃鏌ョ湅涓爣缁撴灉銆?
      }
    },
    {
      "id": "bid_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "bid_b1",
      "type": "CONDITION",
      "title": "鎶€鏈瘎鏍?
    },
    {
      "id": "bid_n5",
      "type": "APPROVAL",
      "title": "鎶€鏈笓瀹惰瘎鏍?,
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "bid_b2",
      "type": "CONDITION",
      "title": "鍟嗗姟璇勬爣"
    },
    {
      "id": "bid_n6",
      "type": "APPROVAL",
      "title": "鍟嗗姟涓撳璇勬爣",
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
('tpl-safety_incident-001', '瀹夊叏浜嬫晠澶勭悊', '鑷姩璁板綍 鈫?骞惰澶勭疆+閫氱煡 鈫?浜嬫晠璋冩煡 鈫?鏁存敼瀹℃壒', 'cat-industry',
'["瀹夊叏浜嬫晠","琛屼笟涓撳睘","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎶ュ憡瀹夊叏浜嬫晠"
    },
    {
      "id": "sf_n1",
      "type": "SCRIPT",
      "title": "鑷姩璁板綍浜嬫晠淇℃伅",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "def summary = (accidentType ?: \"鏈煡浜嬫晠\") + \"@\" + (location ?: \"鏈煡鍦扮偣\"); return [accidentRecorded: true, accidentSummary: summary]",
        "continueOnError": true
      }
    },
    {
      "id": "sf_n2",
      "type": "PARALLEL",
      "title": "骞惰澶勭疆锛堢幇鍦?閫氱煡锛?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "sf_n5",
      "type": "APPROVAL",
      "title": "浜嬫晠璋冩煡鎶ュ憡瀹℃牳",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n6",
      "type": "APPROVAL",
      "title": "鏁存敼鏂规瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_n7",
      "type": "MANUAL",
      "title": "鎵ц鏁存敼鎺柦",
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "鎸夌収鏁存敼鏂规鎵ц瀹夊叏鏁存敼鎺柦",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_n8",
      "type": "APPROVAL",
      "title": "鏁存敼楠屾敹纭",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "sf_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "sf_b1",
      "type": "CONDITION",
      "title": "鐜板満澶勭疆"
    },
    {
      "id": "sf_n3",
      "type": "MANUAL",
      "title": "鐜板満绱ф€ュ缃?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "绔嬪嵆鍓嶅線浜嬫晠鐜板満杩涜绱ф€ュ缃紝纭繚浜哄憳瀹夊叏",
        "priority": "HIGH"
      }
    },
    {
      "id": "sf_b2",
      "type": "CONDITION",
      "title": "涓婃姤閫氱煡"
    },
    {
      "id": "sf_n4",
      "type": "NOTIFICATION",
      "title": "閫氱煡瀹夊叏绠＄悊灞?,
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "manager",
        "notificationTitle": "銆愮揣鎬ャ€戝畨鍏ㄤ簨鏁呮姤鍛?,
        "notificationContent": "鍙戠敓瀹夊叏浜嬫晠锛屽湴鐐? ${location}锛岃绔嬪嵆鍏虫敞銆?
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
('tpl-leave_advanced-001', '璇峰亣鍏ㄦ祦绋?, '澶╂暟鍒ゆ柇 鈫?鍒嗙骇瀹℃壒 鈫?浜ゆ帴纭 鈫?瀹氭椂鎻愰啋 鈫?閫氱煡', 'cat-office',
'["璇峰亣","琛屾斂鍔炲叕","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦璇峰亣鐢宠"
    },
    {
      "id": "la_n1",
      "type": "APPROVAL",
      "title": "鐩村睘涓婄骇瀹℃壒",
      "approverType": "DIRECT_LEADER",
      "branchStrategy": "EXCLUSIVE"
    },
    {
      "id": "la_n5",
      "type": "MANUAL",
      "title": "鍙戣捣浜虹‘璁ゅ伐浣滀氦鎺?,
      "approverType": "INITIATOR",
      "props": {
        "taskDescription": "璇峰湪浼戝亣鍓嶅畬鎴愬伐浣滀氦鎺ワ紝骞剁‘璁や氦鎺ュ畨鎺掑凡鍚屾缁欑浉鍏冲悓浜嬨€?,
        "priority": "MEDIUM"
      }
    },
    {
      "id": "la_n6",
      "type": "TIMER",
      "title": "鍋囨湡缁撴潫鍓?澶╂彁閱?,
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "la_n7",
      "type": "NOTIFICATION",
      "title": "閫氱煡璇峰亣缁撴灉",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "璇峰亣瀹℃壒缁撴灉",
        "notificationContent": "鎮ㄧ殑璇峰亣鐢宠锛?{days}澶╋級宸插鎵归€氳繃锛岃鍋氬ソ宸ヤ綔浜ゆ帴銆?
      }
    },
    {
      "id": "la_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "la_b1",
      "type": "CONDITION",
      "title": "璇峰亣 鈮?3澶?,
      "condition": "days <= 3"
    },
    {
      "id": "la_b2",
      "type": "CONDITION",
      "title": "3澶?< 璇峰亣 鈮?7澶?,
      "condition": "days > 3 && days <= 7"
    },
    {
      "id": "la_n2",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_b3",
      "type": "CONDITION",
      "title": "璇峰亣 > 7澶?,
      "condition": "days > 7"
    },
    {
      "id": "la_n3",
      "type": "APPROVAL",
      "title": "閮ㄩ棬缁忕悊瀹℃壒",
      "approverType": "DEPT_MANAGER"
    },
    {
      "id": "la_n4",
      "type": "APPROVAL",
      "title": "鎬荤粡鐞嗗鎵?,
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
('tpl-deployment-001', '鐢熶骇鐜鍙戝竷', '浠ｇ爜瀹℃煡 鈫?鑷姩鏋勫缓 鈫?绛夊緟绐楀彛 鈫?骞惰閮ㄧ讲+鐩戞帶 鈫?楠岃瘉', 'cat-it',
'["鐢熶骇鐜鍙戝竷","IT杩愮淮","妯℃澘"]',
'{
  "nodes": [
    {
      "id": "start",
      "type": "START",
      "title": "鎻愪氦鍙戝竷鐢宠"
    },
    {
      "id": "dep_n1",
      "type": "APPROVAL",
      "title": "鎶€鏈礋璐ｄ汉浠ｇ爜瀹℃煡",
      "approverType": "ROLE",
      "approverValue": "admin"
    },
    {
      "id": "dep_n2",
      "type": "SCRIPT",
      "title": "鑷姩鏋勫缓涓庢祴璇?,
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [buildStatus: \"SUCCESS\", buildBranch: branch, buildVersion: version, buildFinishedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_n3",
      "type": "APPROVAL",
      "title": "鍙戝竷瀹℃壒",
      "approverType": "ROLE",
      "approverValue": "manager"
    },
    {
      "id": "dep_n4",
      "type": "TIMER",
      "title": "绛夊緟鍙戝竷绐楀彛",
      "props": {
        "timerType": "DELAY",
        "delayMinutes": 1
      }
    },
    {
      "id": "dep_n5",
      "type": "PARALLEL",
      "title": "骞惰鎵ц锛堥儴缃?鐩戞帶锛?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "branchStrategy": "PARALLEL"
    },
    {
      "id": "dep_n8",
      "type": "MANUAL",
      "title": "鍙戝竷鍚庨獙璇佺‘璁?,
      "approverType": "ROLE",
      "approverValue": "admin",
      "props": {
        "taskDescription": "楠岃瘉鍙戝竷鍚庣郴缁熷姛鑳芥甯革紝妫€鏌ュ叧閿笟鍔℃寚鏍?,
        "priority": "HIGH"
      }
    },
    {
      "id": "dep_n9",
      "type": "NOTIFICATION",
      "title": "閫氱煡鍙戝竷瀹屾垚",
      "props": {
        "recipientType": "INITIATOR",
        "notificationTitle": "鍙戝竷瀹屾垚閫氱煡",
        "notificationContent": "鐗堟湰 ${version} 宸叉垚鍔熷彂甯冨埌鐢熶骇鐜銆?
      }
    },
    {
      "id": "dep_end",
      "type": "END",
      "title": "娴佺▼缁撴潫"
    },
    {
      "id": "dep_b1",
      "type": "CONDITION",
      "title": "鎵ц閮ㄧ讲"
    },
    {
      "id": "dep_n6",
      "type": "SCRIPT",
      "title": "鎵ц鑷姩閮ㄧ讲",
      "props": {
        "scriptType": "GROOVY",
        "scriptContent": "return [deployStatus: \"SUCCESS\", deployedVersion: version, deployedAt: System.currentTimeMillis()]",
        "continueOnError": false
      }
    },
    {
      "id": "dep_b2",
      "type": "CONDITION",
      "title": "鐩戞帶鍛婅"
    },
    {
      "id": "dep_n7",
      "type": "NOTIFICATION",
      "title": "閫氱煡杩愮淮鍥㈤槦鐩戞帶",
      "props": {
        "recipientType": "ROLE",
        "recipientValue": "admin",
        "notificationTitle": "鍙戝竷鐩戞帶閫氱煡",
        "notificationContent": "鐗堟湰 ${version} 姝ｅ湪鍙戝竷锛岃瀵嗗垏鍏虫敞绯荤粺鐩戞帶鎸囨爣銆?
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

-- 娴嬭瘯鏁版嵁

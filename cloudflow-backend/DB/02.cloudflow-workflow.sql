-- =========================================================
-- CloudFlow Pro - 工作流引擎核心模块数据库脚本
-- 模块：流程定义、流程实例、任务管理、表单定义、通知
-- 版本：v1.1
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、流程定义与表单
-- =========================================================

-- 1. 流程定义表
DROP TABLE IF EXISTS wf_process_definition;
CREATE TABLE wf_process_definition (
  definition_id     VARCHAR(64)     NOT NULL COMMENT '定义ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_name      VARCHAR(64)     NOT NULL COMMENT '流程名称',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             DEFAULT 1 COMMENT '版本号',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '绑定的表单ID',
  model_json        LONGTEXT        COMMENT '流程模型JSON',
  status            VARCHAR(20)     DEFAULT 'DRAFT' COMMENT '状态 (DRAFT, PUBLISHED, ARCHIVED)',
  version_lock      INT             DEFAULT 0 COMMENT '乐观锁版本号',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '是否最新版本',
  category          VARCHAR(64)     DEFAULT NULL COMMENT '流程分类',
  tags              VARCHAR(500)    DEFAULT NULL COMMENT '流程标签(JSON数组)',
  start_permission_type VARCHAR(20) DEFAULT 'ALL' COMMENT '启动权限类型 (ALL, USER, ROLE, DEPT)',
  start_permission_value TEXT       COMMENT '启动权限值 (JSON数组)',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '流程描述',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  KEY idx_status (status),
  KEY idx_is_latest (is_latest),
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

-- 2. 表单定义表
DROP TABLE IF EXISTS wf_form_definition;
CREATE TABLE wf_form_definition (
  form_id           VARCHAR(64)     NOT NULL COMMENT '表单ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  form_name         VARCHAR(64)     NOT NULL COMMENT '表单名称',
  form_key          VARCHAR(64)     DEFAULT NULL COMMENT '表单Key',
  fields_json       LONGTEXT        COMMENT '表单字段JSON',
  form_schema       LONGTEXT        COMMENT '表单Schema JSON',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态',
  version           INT             DEFAULT 1 COMMENT '版本号',
  version_lock      INT             DEFAULT 0 COMMENT '乐观锁版本号',
  is_latest         TINYINT(1)      DEFAULT 1 COMMENT '是否最新版本',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (form_id),
  KEY idx_form_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单定义表';

-- =========================================================
-- 二、流程实例与任务
-- =========================================================

-- 3. 流程实例表
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT '实例ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
  definition_id     VARCHAR(64)     DEFAULT NULL COMMENT '流程定义ID（版本锁定）',
  business_key      VARCHAR(64)     NOT NULL COMMENT '业务主键ID',
  title             VARCHAR(255)    DEFAULT NULL COMMENT '流程标题',
  start_user_id     BIGINT(20)      NOT NULL COMMENT '发起人ID',
  start_user_name   VARCHAR(64)     DEFAULT NULL COMMENT '发起人姓名',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '状态 (RUNNING, COMPLETED, CANCELLED, REJECTED, REVOKED, SUSPENDED)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  variables         JSON            DEFAULT NULL COMMENT '流程变量(表单数据)',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '优先级',
  process_no        VARCHAR(64)     DEFAULT NULL COMMENT '流程编号',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  KEY idx_business_key (business_key),
  KEY idx_proc_inst_tenant (tenant_id),
  KEY idx_start_user_status (start_user_id, status),
  KEY idx_process_key_status (process_def_key, status),
  KEY idx_start_time (start_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流实例表';

-- 4. 流程任务表
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     NOT NULL COMMENT '节点名称',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  assignee_name     VARCHAR(64)     DEFAULT NULL COMMENT '处理人姓名',
  proxy_user_id     BIGINT(20)      DEFAULT NULL COMMENT '代理人ID',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT '候选角色',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态 (TODO, DONE, SUSPENDED)',
  priority          VARCHAR(20)     DEFAULT 'NORMAL' COMMENT '优先级 (NORMAL, URGENT, HIGH)',
  is_timeout        TINYINT(1)      DEFAULT 0 COMMENT '是否超时',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  due_time          DATETIME        DEFAULT NULL COMMENT '截止时间',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id),
  KEY idx_task_tenant (tenant_id),
  KEY idx_assignee_status (assignee, status),
  KEY idx_instance_status (instance_id, status),
  KEY idx_status (status),
  KEY idx_create_time (create_time),
  KEY idx_task_composite (assignee, status, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流任务表';

-- 5. 任务历史表
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT '历史ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '原任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  action            VARCHAR(20)     DEFAULT NULL COMMENT '动作 (APPROVE, REJECT, RECALL, DELEGATE, COUNTERSIGN_APPROVE, etc.)',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT '审批意见',
  duration_seconds  INT             DEFAULT NULL COMMENT '审批耗时(秒)',
  variables_changed TEXT            COMMENT '变量变更记录(JSON)',
  create_time       DATETIME        DEFAULT NULL COMMENT '操作时间',
  PRIMARY KEY (history_id),
  KEY idx_instance_hist (instance_id),
  KEY idx_operator_id (operator_id),
  KEY idx_create_time (create_time),
  KEY idx_instance_create_time (instance_id, create_time),
  KEY idx_operator_create_time (operator_id, create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流任务历史表';

-- =========================================================
-- 三、任务辅助功能
-- =========================================================

-- 6. 任务已读记录表
DROP TABLE IF EXISTS wf_task_read;
CREATE TABLE wf_task_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME        COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务已读记录表';

-- 7. 任务催办记录表
DROP TABLE IF EXISTS wf_task_urge;
CREATE TABLE wf_task_urge (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  sender_id         BIGINT(20)      NOT NULL COMMENT '催办人ID',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '被催办人ID',
  reason            VARCHAR(200)    DEFAULT NULL COMMENT '催办原因',
  create_time       DATETIME        COMMENT '催办时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务催办记录表';

-- 8. 任务附件表
DROP TABLE IF EXISTS wf_task_attachment;
CREATE TABLE wf_task_attachment (
  attachment_id     VARCHAR(64)     NOT NULL COMMENT '附件ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  file_name         VARCHAR(255)    NOT NULL COMMENT '文件名',
  file_path         VARCHAR(500)    NOT NULL COMMENT '文件路径',
  file_size         BIGINT          DEFAULT 0 COMMENT '文件大小(字节)',
  file_type         VARCHAR(50)     DEFAULT NULL COMMENT '文件类型',
  upload_user_id    BIGINT(20)      DEFAULT NULL COMMENT '上传人ID',
  upload_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (attachment_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务附件表';

-- 9. 任务委派记录表
DROP TABLE IF EXISTS wf_task_delegation;
CREATE TABLE wf_task_delegation (
  delegation_id     VARCHAR(64)     NOT NULL COMMENT '委派ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  from_user_id      BIGINT(20)      NOT NULL COMMENT '委派人ID',
  from_user_name    VARCHAR(64)     DEFAULT NULL COMMENT '委派人名称',
  to_user_id        BIGINT(20)      NOT NULL COMMENT '被委派人ID',
  to_user_name      VARCHAR(64)     DEFAULT NULL COMMENT '被委派人名称',
  delegation_type   VARCHAR(20)     DEFAULT 'DELEGATE' COMMENT '类型: DELEGATE(委派)/TRANSFER(转办)',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '委派原因',
  status            VARCHAR(20)     DEFAULT 'ACTIVE' COMMENT '状态',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (delegation_id),
  KEY idx_task_id (task_id),
  KEY idx_from_user (from_user_id),
  KEY idx_to_user (to_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务委派记录表';

-- 10. 任务候选人表
DROP TABLE IF EXISTS wf_task_candidate;
CREATE TABLE wf_task_candidate (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  candidate_type    VARCHAR(20)     NOT NULL COMMENT '候选类型: USER/ROLE/DEPT',
  candidate_id      VARCHAR(64)     NOT NULL COMMENT '候选人/角色/部门ID',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id),
  KEY idx_candidate (candidate_type, candidate_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务候选人表';

-- 11. 加签记录表
DROP TABLE IF EXISTS wf_task_add_sign;
CREATE TABLE wf_task_add_sign (
  add_sign_id       VARCHAR(64)     NOT NULL COMMENT '加签ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '原任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
  add_sign_type     VARCHAR(20)     DEFAULT 'BEFORE' COMMENT '加签类型: BEFORE(前加签)/AFTER(后加签)',
  from_user_id      BIGINT(20)      NOT NULL COMMENT '加签发起人ID',
  to_user_id        BIGINT(20)      NOT NULL COMMENT '被加签人ID',
  to_user_name      VARCHAR(64)     DEFAULT NULL COMMENT '被加签人名称',
  new_task_id       VARCHAR(64)     DEFAULT NULL COMMENT '新创建的任务ID',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '加签原因',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (add_sign_id),
  KEY idx_task_id (task_id),
  KEY idx_instance_id (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='加签记录表';

-- =========================================================
-- 四、会签功能
-- =========================================================

-- 12. 会签任务表
DROP TABLE IF EXISTS wf_countersign_task;
CREATE TABLE wf_countersign_task (
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '会签ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  sign_type         VARCHAR(20)     NOT NULL COMMENT '会签类型: ALL/ANY/PERCENT',
  pass_percent      INT             DEFAULT NULL COMMENT '通过比例(百分比)',
  total_count       INT             DEFAULT 0 COMMENT '总人数',
  voted_count       INT             DEFAULT 0 COMMENT '已投票人数',
  approve_count     INT             DEFAULT 0 COMMENT '同意人数',
  reject_count      INT             DEFAULT 0 COMMENT '拒绝人数',
  status            VARCHAR(20)     DEFAULT 'VOTING' COMMENT '状态: VOTING/PASSED/REJECTED',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
  PRIMARY KEY (countersign_id),
  KEY idx_instance_id (instance_id),
  KEY idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签任务表';

-- 13. 会签投票记录表
DROP TABLE IF EXISTS wf_countersign_vote;
CREATE TABLE wf_countersign_vote (
  vote_id           VARCHAR(64)     NOT NULL COMMENT '投票ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  countersign_id    VARCHAR(64)     NOT NULL COMMENT '会签任务ID',
  task_id           VARCHAR(64)     DEFAULT NULL COMMENT '关联任务ID',
  voter_id          BIGINT(20)      NOT NULL COMMENT '投票人ID',
  voter_name        VARCHAR(64)     DEFAULT NULL COMMENT '投票人名称',
  vote_result       VARCHAR(20)     NOT NULL COMMENT '投票结果: APPROVE/REJECT',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT '投票意见',
  vote_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '投票时间',
  PRIMARY KEY (vote_id),
  KEY idx_countersign_id (countersign_id),
  KEY idx_voter_id (voter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='会签投票记录表';

-- =========================================================
-- 五、流程快照与事务消息
-- =========================================================

-- 14. 流程实例快照表
DROP TABLE IF EXISTS wf_process_snapshot;
CREATE TABLE wf_process_snapshot (
  snapshot_id       VARCHAR(64)     NOT NULL COMMENT '快照ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  status            VARCHAR(20)     DEFAULT NULL COMMENT '实例状态',
  variables         LONGTEXT        COMMENT '流程变量快照(JSON)',
  active_tasks      LONGTEXT        COMMENT '活动任务快照(JSON)',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (snapshot_id),
  KEY idx_instance_id (instance_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程实例快照表';

-- 15. 本地消息表（分布式事务最终一致性）
DROP TABLE IF EXISTS wf_transaction_message;
CREATE TABLE wf_transaction_message (
  message_id        VARCHAR(64)     NOT NULL COMMENT '消息ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  business_type     VARCHAR(50)     NOT NULL COMMENT '业务类型 (PROCESS_START, TASK_COMPLETE, etc.)',
  business_id       VARCHAR(64)     NOT NULL COMMENT '业务ID',
  content           TEXT            COMMENT '消息内容(JSON)',
  status            VARCHAR(20)     DEFAULT 'PENDING' COMMENT '状态 (PENDING, PROCESSING, SUCCESS, FAILED)',
  retry_count       INT             DEFAULT 0 COMMENT '重试次数',
  max_retry_count   INT             DEFAULT 5 COMMENT '最大重试次数',
  next_retry_time   DATETIME        DEFAULT NULL COMMENT '下次重试时间',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  error_message     TEXT            COMMENT '错误信息',
  PRIMARY KEY (message_id),
  KEY idx_status_retry (status, next_retry_time, retry_count),
  KEY idx_business (business_type, business_id),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='本地消息表（分布式事务）';

-- 16. 流程发布记录表
DROP TABLE IF EXISTS wf_deploy_record;
CREATE TABLE wf_deploy_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             NOT NULL COMMENT '版本号',
  deploy_status     VARCHAR(20)     DEFAULT 'SUCCESS' COMMENT '发布状态 (SUCCESS, FAILED, ROLLBACK)',
  deploy_by         BIGINT(20)      NOT NULL COMMENT '发布人ID',
  deployer_name     VARCHAR(64)     DEFAULT NULL COMMENT '发布人姓名',
  deploy_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  deploy_note       VARCHAR(500)    DEFAULT NULL COMMENT '发布说明',
  change_log        TEXT            COMMENT '变更日志',
  can_rollback      TINYINT(1)      DEFAULT 1 COMMENT '是否可回滚',
  rollback_from_version INT         DEFAULT NULL COMMENT '回滚自哪个版本',
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '回滚原因',
  rollback_by       BIGINT(20)      DEFAULT NULL COMMENT '回滚操作人ID',
  rollback_time     DATETIME        DEFAULT NULL COMMENT '回滚时间',
  approval_id       BIGINT(20)      DEFAULT NULL COMMENT '关联的审批ID',
  deploy_window_id  BIGINT(20)      DEFAULT NULL COMMENT '关联的发布窗口ID',
  impact_analysis   TEXT            COMMENT '影响分析(JSON格式)',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_process_key (process_key),
  KEY idx_version (version),
  KEY idx_deploy_status (deploy_status),
  KEY idx_deploy_time (deploy_time),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布记录表';

-- =========================================================
-- 六、通知功能
-- =========================================================

-- 17. 系统通知表
DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  notice_title      VARCHAR(50)     NOT NULL COMMENT '公告标题',
  notice_type       CHAR(1)         NOT NULL COMMENT '公告类型（1通知 2催办）',
  notice_content    VARCHAR(500)    DEFAULT NULL COMMENT '公告内容',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT '发送者ID',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收者ID',
  status            CHAR(1)         DEFAULT '0' COMMENT '公告状态（0未读 1已读）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (notice_id)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='通知公告表';

-- 18. 通知日志表
DROP TABLE IF EXISTS wf_notification_log;
CREATE TABLE wf_notification_log (
  log_id            VARCHAR(64)     NOT NULL COMMENT '日志ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  notification_type VARCHAR(20)     NOT NULL COMMENT '通知类型: EMAIL/SMS/WEBSOCKET/WECHAT',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  recipient_name    VARCHAR(64)     DEFAULT NULL COMMENT '接收人名称',
  title             VARCHAR(200)    DEFAULT NULL COMMENT '通知标题',
  content           TEXT            COMMENT '通知内容',
  send_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '发送状态: PENDING/SUCCESS/FAILED',
  send_time         DATETIME        DEFAULT NULL COMMENT '发送时间',
  error_message     TEXT            COMMENT '错误信息',
  related_type      VARCHAR(50)     DEFAULT NULL COMMENT '关联类型 (TASK/PROCESS/DEPLOY)',
  related_id        VARCHAR(64)     DEFAULT NULL COMMENT '关联ID',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (log_id),
  KEY idx_recipient (recipient_id),
  KEY idx_send_status (send_status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知日志表';

-- 19. 通知配置表
DROP TABLE IF EXISTS wf_notification_config;
CREATE TABLE wf_notification_config (
  config_id         VARCHAR(64)     NOT NULL COMMENT '配置ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  config_name       VARCHAR(100)    NOT NULL COMMENT '配置名称',
  event_type        VARCHAR(50)     NOT NULL COMMENT '事件类型 (TASK_CREATED/TASK_COMPLETED/PROCESS_COMPLETED/etc.)',
  notification_type VARCHAR(20)     NOT NULL COMMENT '通知方式: EMAIL/SMS/WEBSOCKET/WECHAT',
  template_title    VARCHAR(200)    DEFAULT NULL COMMENT '模板标题',
  template_content  TEXT            COMMENT '模板内容',
  is_enabled        TINYINT(1)      DEFAULT 1 COMMENT '是否启用',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  KEY idx_event_type (event_type),
  KEY idx_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='通知配置表';

-- 20. 催办效果统计表
DROP TABLE IF EXISTS wf_urge_effect;
CREATE TABLE wf_urge_effect (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  urge_count        INT             DEFAULT 0 COMMENT '催办次数',
  first_urge_time   DATETIME        DEFAULT NULL COMMENT '首次催办时间',
  last_urge_time    DATETIME        DEFAULT NULL COMMENT '最近催办时间',
  task_complete_time DATETIME       DEFAULT NULL COMMENT '任务完成时间',
  response_seconds  INT             DEFAULT NULL COMMENT '响应时间(秒)',
  PRIMARY KEY (id),
  KEY idx_task_id (task_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='催办效果统计表';

-- =========================================================
-- 初始化数据 - 表单定义
-- =========================================================

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_reimburse', '通用报销申请', '[{"id": "f1", "type": "SELECT", "label": "费用类型", "required": true, "options": ["差旅费", "招待费", "办公费", "团建费"]}, {"id": "f2", "type": "NUMBER", "label": "报销金额", "required": true}, {"id": "f3", "type": "DATE", "label": "发生日期", "required": true}, {"id": "f4", "type": "TEXTAREA", "label": "费用明细说明", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_payment', '对公付款申请', '[{"id": "p1", "type": "TEXT", "label": "收款方名称", "required": true}, {"id": "p2", "type": "TEXT", "label": "银行账号", "required": true, "regex": "^\\d{10,20}$", "errorMsg": "请输入正确的银行账号"}, {"id": "p3", "type": "NUMBER", "label": "付款金额", "required": true}, {"id": "p4", "type": "TEXT", "label": "合同编号", "required": false}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_leave', '请假申请单', '[{"id": "l1", "type": "SELECT", "label": "请假类型", "required": true, "options": ["年假", "事假", "病假", "婚假", "产假"]}, {"id": "l2", "type": "DATE", "label": "开始时间", "required": true}, {"id": "l3", "type": "DATE", "label": "结束时间", "required": true}, {"id": "l4", "type": "NUMBER", "label": "共计天数", "required": true}, {"id": "l5", "type": "TEXTAREA", "label": "请假事由", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_recruit', '人员招聘需求', '[{"id": "r1", "type": "TEXT", "label": "招聘岗位", "required": true}, {"id": "r2", "type": "NUMBER", "label": "需求人数", "required": true}, {"id": "r3", "type": "SELECT", "label": "期望职级", "required": true, "options": ["P5", "P6", "P7", "P8"]}, {"id": "r4", "type": "TEXTAREA", "label": "岗位职责要求", "required": true}, {"id": "r5", "type": "NUMBER", "label": "薪资预算(k)", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_contract', '合同审批单', '[{"id": "c1", "type": "TEXT", "label": "合同名称", "required": true}, {"id": "c2", "type": "TEXT", "label": "对方单位", "required": true}, {"id": "c3", "type": "NUMBER", "label": "合同金额", "required": true}, {"id": "c4", "type": "SELECT", "label": "合同类型", "required": true, "options": ["采购合同", "销售合同", "服务协议"]}, {"id": "c5", "type": "TEXTAREA", "label": "主要条款摘要", "required": true}]', sysdate());

-- =========================================================
-- 初始化数据 - 流程定义
-- =========================================================

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务主管", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "财务总监", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "打款"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_leave', '员工请假流程', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "gw_leave", "type": "CONDITION", "title": "天数校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR备案", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "归档"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_contract', '合同审批流程', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"id": "root", "type": "START", "title": "起草合同", "next": {"id": "n1", "type": "PARALLEL", "title": "会签", "branchStrategy": "PARALLEL", "branches": [{"id": "b1", "type": "APPROVAL", "title": "法务审核", "icon": "scale", "approverType": "ROLE", "approverValue": "ADMIN"}, {"id": "b2", "type": "APPROVAL", "title": "财务审核", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE"}], "next": {"id": "n2", "type": "APPROVAL", "title": "总经理签发", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "盖章归档"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_recruit', '人员招聘流程', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"id": "root", "type": "START", "title": "提交招聘需求", "next": {"id": "n1", "type": "APPROVAL", "title": "部门总监审批", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR审核", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "n3", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "开始招聘"}}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_payment', '对公付款流程', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"id": "root", "type": "START", "title": "提交付款申请", "next": {"id": "n1", "type": "APPROVAL", "title": "财务主管审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务总监审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "财务打款"}}}}', sysdate());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 测试数据
-- 用于开发和测试环境
-- =========================================================

-- 插入测试流程实例
INSERT INTO wf_process_instance (
  instance_id, tenant_id, process_def_key, definition_id, business_key, 
  title, start_user_id, start_user_name, status, start_time, variables, priority
) VALUES 
('test_inst_001', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_001',
 '张三的差旅费报销', 1, '张三', 'RUNNING', NOW(),
 '{"f1": "差旅费", "f2": 1500, "f3": "2026-02-08", "f4": "北京出差往返机票及住宿费用"}', 'NORMAL'),

('test_inst_002', 100000, 'biz_leave', 'wf_leave', 'BIZ_002',
 '李四的年假申请', 2, '李四', 'RUNNING', NOW(),
 '{"l1": "年假", "l2": "2026-02-15", "l3": "2026-02-20", "l4": 5, "l5": "春节后休假"}', 'NORMAL'),

('test_inst_003', 100000, 'biz_contract', 'wf_contract', 'BIZ_003',
 '王五的销售合同审批', 3, '王五', 'RUNNING', NOW(),
 '{"c1": "XX公司软件采购合同", "c2": "XX科技有限公司", "c3": 50000, "c4": "销售合同", "c5": "软件授权及技术支持服务"}', 'HIGH'),

('test_inst_004', 100000, 'biz_payment', 'wf_payment', 'BIZ_004',
 '赵六的对公付款申请', 4, '赵六', 'RUNNING', NOW(),
 '{"p1": "供应商A公司", "p2": "1234567890123456", "p3": 30000, "p4": "HT-2026-001"}', 'NORMAL'),

('test_inst_005', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_005',
 '张三的办公费报销', 1, '张三', 'RUNNING', NOW(),
 '{"f1": "办公费", "f2": 500, "f3": "2026-02-05", "f4": "购买办公用品"}', 'NORMAL'),

('test_inst_006', 100000, 'biz_reimburse', 'wf_reimburse', 'BIZ_006',
 '孙七的招待费报销', 2, '孙七', 'RUNNING', NOW(),
 '{"f1": "招待费", "f2": 2500, "f3": "2026-02-09", "f4": "客户商务宴请"}', 'URGENT'),

('test_inst_007', 100000, 'biz_leave', 'wf_leave', 'BIZ_007',
 '周八的病假申请', 3, '周八', 'RUNNING', NOW(),
 '{"l1": "病假", "l2": "2026-02-11", "l3": "2026-02-13", "l4": 2, "l5": "感冒发烧需要休息"}', 'URGENT'),

('test_inst_008', 100000, 'biz_recruit', 'wf_recruit', 'BIZ_008',
 '吴九的招聘需求', 1, '吴九', 'RUNNING', NOW(),
 '{"r1": "高级Java开发工程师", "r2": 2, "r3": "P7", "r4": "负责核心业务系统开发", "r5": 35}', 'HIGH'),

('test_inst_009', 100000, 'biz_contract', 'wf_contract', 'BIZ_009',
 '郑十的采购合同审批', 4, '郑十', 'RUNNING', NOW(),
 '{"c1": "办公设备采购合同", "c2": "YY科技有限公司", "c3": 80000, "c4": "采购合同", "c5": "采购办公电脑、打印机等设备"}', 'NORMAL'),

('test_inst_010', 100000, 'biz_leave', 'wf_leave', 'BIZ_010',
 '钱十一的婚假申请', 2, '钱十一', 'COMPLETED', DATE_SUB(NOW(), INTERVAL 5 DAY),
 '{"l1": "婚假", "l2": "2026-02-01", "l3": "2026-02-05", "l4": 5, "l5": "结婚度蜜月"}', 'NORMAL');

-- 插入 test_inst_005 的待办任务（修复"待认领"问题）
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES 
('test_task_011', 100000, 'test_inst_005', 'gw1_b1', '财务主管审批',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY));

-- 更新已完成流程的结束时间
UPDATE wf_process_instance SET end_time = DATE_SUB(NOW(), INTERVAL 3 DAY) WHERE instance_id = 'test_inst_010';

-- 插入测试待办任务
INSERT INTO wf_task (
  task_id, tenant_id, instance_id, node_key, node_name,
  assignee, assignee_name, status, priority, create_time, due_time
) VALUES 
('test_task_001', 100000, 'test_inst_001', 'n1', '直属上级审批',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY)),

('test_task_002', 100000, 'test_inst_002', 'n1', '部门经理审批',
 1, '管理员', 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_003', 100000, 'test_inst_003', 'b1', '法务审核',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_004', 100000, 'test_inst_003', 'b2', '财务审核',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_005', 100000, 'test_inst_004', 'n1', '财务主管审批',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY)),

('test_task_006', 100000, 'test_inst_006', 'n1', '直属上级审批',
 1, '管理员', 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_007', 100000, 'test_inst_007', 'n1', '部门经理审批',
 1, '管理员', 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_008', 100000, 'test_inst_008', 'n1', '部门总监审批',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_009', 100000, 'test_inst_009', 'b1', '法务审核',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY)),

('test_task_010', 100000, 'test_inst_009', 'b2', '财务审核',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY));

-- 插入任务历史记录
INSERT INTO wf_task_history (
  history_id, tenant_id, task_id, instance_id, node_name, node_key,
  operator_id, operator_name, action, comment, duration_seconds, create_time
) VALUES 
('test_hist_001', 100000, 'test_task_completed_001', 'test_inst_005', '直属上级审批', 'n1',
 1, '管理员', 'APPROVE', '同意报销', 300, DATE_SUB(NOW(), INTERVAL 1 DAY)),

('test_hist_002', 100000, 'test_task_completed_002', 'test_inst_005', '财务主管审批', 'n2',
 1, '管理员', 'APPROVE', '已打款', 600, DATE_SUB(NOW(), INTERVAL 1 DAY)),

('test_hist_003', 100000, 'test_task_completed_003', 'test_inst_010', '部门经理审批', 'n1',
 1, '管理员', 'APPROVE', '同意请假', 180, DATE_SUB(NOW(), INTERVAL 4 DAY)),

('test_hist_004', 100000, 'test_task_completed_004', 'test_inst_010', 'HR备案', 'b1',
 1, '管理员', 'APPROVE', '已备案', 120, DATE_SUB(NOW(), INTERVAL 3 DAY));

-- =========================================================
-- 脚本执行完成
-- =========================================================

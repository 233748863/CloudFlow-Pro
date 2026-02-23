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
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID - 数据权限',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 1代表删除）',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  KEY idx_status (status),
  KEY idx_is_latest (is_latest),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag),
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

-- 2. 流程分类表（参考 RuoYi-Cloud-Plus FlwCategory 设计，支持树形结构）
DROP TABLE IF EXISTS `wf_process_category`;
CREATE TABLE `wf_process_category` (
    `category_id`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '分类ID',
    `parent_id`     BIGINT       DEFAULT 0               COMMENT '父分类ID（0表示顶级分类）',
    `category_name` VARCHAR(100) NOT NULL                 COMMENT '分类名称',
    `category_code` VARCHAR(100) NOT NULL                 COMMENT '分类编码（唯一标识）',
    `icon`          VARCHAR(100) DEFAULT NULL              COMMENT '分类图标',
    `sort_order`    INT          DEFAULT 0                COMMENT '排序号',
    `status`        CHAR(1)      DEFAULT '0'              COMMENT '状态（0=正常 1=停用）',
    `remark`        VARCHAR(500) DEFAULT NULL              COMMENT '备注',
    `tenant_id`     BIGINT       DEFAULT NULL              COMMENT '租户ID',
    `create_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '创建者',
    `create_time`   DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`     VARCHAR(64)  DEFAULT NULL              COMMENT '更新者',
    `update_time`   DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`category_id`),
    UNIQUE KEY `uk_category_code` (`category_code`, `tenant_id`),
    KEY `idx_parent_id` (`parent_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程分类表';

-- 3. 表单定义表
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
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID - 数据权限',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 1代表删除）',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  KEY idx_business_key (business_key),
  KEY idx_proc_inst_tenant (tenant_id),
  KEY idx_start_user_status (start_user_id, status),
  KEY idx_process_key_status (process_def_key, status),
  KEY idx_start_time (start_time),
  KEY idx_dept_id (dept_id),
  KEY idx_create_by (create_by),
  KEY idx_del_flag (del_flag)
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
  sign_type         VARCHAR(20)     NOT NULL COMMENT '会签类型: ALL/ANY/PERCENT/SEQUENTIAL',
  pass_percent      INT             DEFAULT NULL COMMENT '通过比例(百分比)',
  total_count       INT             DEFAULT 0 COMMENT '总人数',
  voted_count       INT             DEFAULT 0 COMMENT '已投票人数',
  approve_count     INT             DEFAULT 0 COMMENT '同意人数',
  reject_count      INT             DEFAULT 0 COMMENT '拒绝人数',
  status            VARCHAR(20)     DEFAULT 'VOTING' COMMENT '状态: VOTING/PASSED/REJECTED',
  assignee_order    TEXT            DEFAULT NULL COMMENT '顺序签署：有序审批人ID列表(JSON数组)，仅SEQUENTIAL类型使用',
  current_index     INT             DEFAULT NULL COMMENT '顺序签署：当前签署人索引(从0开始)，仅SEQUENTIAL类型使用',
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

-- 15. 节点执行记录表（工作流事件驱动，借鉴 poco-flow FlowProcessEventListener 设计）
DROP TABLE IF EXISTS wf_node_record;
CREATE TABLE wf_node_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  process_def_key   VARCHAR(64)     DEFAULT NULL COMMENT '流程定义Key',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(128)    DEFAULT NULL COMMENT '节点名称',
  node_type         VARCHAR(32)     DEFAULT NULL COMMENT '节点类型: APPROVAL/NOTIFICATION/SCRIPT/TIMER/COPY/MANUAL/CONDITION/PARALLEL/END',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '节点执行状态: RUNNING/COMPLETED/SKIPPED/FAILED',
  executor_id       BIGINT(20)      DEFAULT NULL COMMENT '执行人ID',
  executor_name     VARCHAR(64)     DEFAULT NULL COMMENT '执行人姓名',
  start_time        DATETIME        DEFAULT NULL COMMENT '节点开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '节点结束时间',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '执行耗时(毫秒)',
  extra_data        TEXT            DEFAULT NULL COMMENT '扩展数据(JSON格式)',
  event_type        VARCHAR(32)     DEFAULT NULL COMMENT '事件类型(兼容旧字段)',
  event_time        DATETIME        DEFAULT NULL COMMENT '事件发生时间(兼容旧字段)',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '记录创建时间',
  PRIMARY KEY (id),
  KEY idx_instance_id (instance_id),
  KEY idx_node_key (node_key),
  KEY idx_status (status),
  KEY idx_instance_node_status (instance_id, node_key, status),
  KEY idx_create_time (create_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点执行记录表（事件驱动）';

-- 16. 本地消息表（分布式事务最终一致性）
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

-- 21. 流程抄送记录表
DROP TABLE IF EXISTS wf_process_copy;
CREATE TABLE wf_process_copy (
  `id`              BIGINT       NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  `tenant_id`       BIGINT       DEFAULT NULL            COMMENT '租户ID',
  `instance_id`     VARCHAR(64)  NOT NULL                COMMENT '流程实例ID',
  `process_def_key` VARCHAR(128) NOT NULL                COMMENT '流程定义Key',
  `title`           VARCHAR(256) DEFAULT NULL            COMMENT '流程标题',
  `node_id`         VARCHAR(64)  DEFAULT NULL            COMMENT '抄送节点ID',
  `node_name`       VARCHAR(128) DEFAULT NULL            COMMENT '抄送节点名称',
  `start_user_id`   BIGINT       DEFAULT NULL            COMMENT '发起人ID',
  `start_user_name` VARCHAR(64)  DEFAULT NULL            COMMENT '发起人姓名',
  `user_id`         BIGINT       NOT NULL                COMMENT '抄送接收人ID',
  `form_data`       TEXT         DEFAULT NULL            COMMENT '表单数据快照（JSON格式）',
  `is_read`         TINYINT      NOT NULL DEFAULT 0      COMMENT '是否已读：0-未读，1-已读',
  `read_time`       DATETIME     DEFAULT NULL            COMMENT '已读时间',
  `create_time`     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '抄送时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id`     (`user_id`, `is_read`),
  KEY `idx_instance_id` (`instance_id`),
  KEY `idx_create_time` (`create_time`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci COMMENT='流程抄送记录表';

-- =========================================================
-- 初始化数据 - 流程分类（树形结构）
-- =========================================================
INSERT INTO `wf_process_category` (`category_id`, `parent_id`, `category_name`, `category_code`, `icon`, `sort_order`, `status`) VALUES
(1, 0, 'OA办公',       'oa',           'Briefcase',    1, '0'),
(2, 0, '人事管理',     'hr',           'Users',        2, '0'),
(3, 0, '财务管理',     'finance',      'DollarSign',   3, '0'),
(4, 0, '行政管理',     'admin',        'Building',     4, '0'),
(5, 0, '项目管理',     'project',      'FolderKanban', 5, '0'),
-- OA办公子分类
(10, 1, '请假管理',    'oa_leave',     'Calendar',     1, '0'),
(11, 1, '加班管理',    'oa_overtime',  'Clock',        2, '0'),
(12, 1, '出差管理',    'oa_trip',      'Plane',        3, '0'),
(13, 1, '考勤管理',    'oa_attendance','UserCheck',    4, '0'),
(14, 1, '访客管理',    'oa_visitor',   'UserPlus',     5, '0'),
-- 财务管理子分类
(20, 3, '报销管理',    'fin_expense',  'Receipt',      1, '0'),
(21, 3, '付款管理',    'fin_payment',  'CreditCard',   2, '0'),
(22, 3, '预算管理',    'fin_budget',   'PieChart',     3, '0'),
-- 行政管理子分类
(30, 4, '车辆管理',    'adm_vehicle',  'Car',          1, '0'),
(31, 4, '会议管理',    'adm_meeting',  'Video',        2, '0'),
(32, 4, '公告管理',    'adm_notice',   'Bell',         3, '0');

-- =========================================================
-- 初始化数据 - 表单定义
-- =========================================================

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_reimburse', '通用报销申请', '[{"id": "f1", "type": "SELECT", "label": "费用类型", "required": true, "options": ["差旅费", "招待费", "办公费", "团建费"]}, {"id": "f2", "type": "NUMBER", "label": "报销金额", "required": true}, {"id": "f3", "type": "DATE", "label": "发生日期", "required": true}, {"id": "f4", "type": "TEXTAREA", "label": "费用明细说明", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_payment', '对公付款申请', '[{"id": "p1", "type": "TEXT", "label": "收款方名称", "required": true}, {"id": "p2", "type": "TEXT", "label": "银行账号", "required": true, "regex": "^\\\\d{10,20}$", "errorMsg": "请输入正确的银行账号"}, {"id": "p3", "type": "NUMBER", "label": "付款金额", "required": true}, {"id": "p4", "type": "TEXT", "label": "合同编号", "required": false}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_leave', '请假申请单', '[{"id": "l1", "type": "SELECT", "label": "请假类型", "required": true, "options": ["年假", "事假", "病假", "婚假", "产假"]}, {"id": "l2", "type": "DATE", "label": "开始时间", "required": true}, {"id": "l3", "type": "DATE", "label": "结束时间", "required": true}, {"id": "l4", "type": "NUMBER", "label": "共计天数", "required": true}, {"id": "l5", "type": "TEXTAREA", "label": "请假事由", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_recruit', '人员招聘需求', '[{"id": "r1", "type": "TEXT", "label": "招聘岗位", "required": true}, {"id": "r2", "type": "NUMBER", "label": "需求人数", "required": true}, {"id": "r3", "type": "SELECT", "label": "期望职级", "required": true, "options": ["P5", "P6", "P7", "P8"]}, {"id": "r4", "type": "TEXTAREA", "label": "岗位职责要求", "required": true}, {"id": "r5", "type": "NUMBER", "label": "薪资预算(k)", "required": true}]', sysdate());

INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES 
('form_contract', '合同审批单', '[{"id": "c1", "type": "TEXT", "label": "合同名称", "required": true}, {"id": "c2", "type": "TEXT", "label": "对方单位", "required": true}, {"id": "c3", "type": "NUMBER", "label": "合同金额", "required": true}, {"id": "c4", "type": "SELECT", "label": "合同类型", "required": true, "options": ["采购合同", "销售合同", "服务协议"]}, {"id": "c5", "type": "TEXTAREA", "label": "主要条款摘要", "required": true}]', sysdate());

-- =========================================================
-- 初始化数据 - 流程定义
-- =========================================================

-- 节点级按钮权限说明：props.buttons 配置审批节点可用操作按钮
-- 可选值：APPROVE(同意), REJECT(拒绝), RETURN(驳回), DELEGATE(转办), ADD_SIGN(加签)
-- 未配置或为空数组时，前端显示所有默认按钮（向后兼容）

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'PUBLISHED', 1, 'form_reimburse', '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级", "icon": "briefcase", "approverType": "DIRECT_LEADER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务主管", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "财务总监", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "打款"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_leave', '员工请假流程', 'biz_leave', 1, 'PUBLISHED', 1, 'form_leave', '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "gw_leave", "type": "CONDITION", "title": "天数校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR备案", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "归档"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_contract', '合同审批流程', 'biz_contract', 5, 'PUBLISHED', 1, 'form_contract', '{"id": "root", "type": "START", "title": "起草合同", "next": {"id": "n1", "type": "APPROVAL", "title": "法务&财务会签审核", "icon": "scale", "signType": "ALL", "approverType": "USERS", "approverValue": "1", "props": {"buttons": ["APPROVE", "REJECT"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "总经理签发", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN"]}, "next": {"id": "end", "type": "END", "title": "盖章归档"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_recruit', '人员招聘流程', 'biz_recruit', 1, 'PUBLISHED', 1, 'form_recruit', '{"id": "root", "type": "START", "title": "提交招聘需求", "next": {"id": "n1", "type": "APPROVAL", "title": "部门总监审批", "icon": "briefcase", "approverType": "DEPT_MANAGER", "props": {"buttons": ["APPROVE", "RETURN"]}, "next": {"id": "n2", "type": "APPROVAL", "title": "HR审核", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "props": {"buttons": ["APPROVE", "REJECT", "DELEGATE"]}, "next": {"id": "n3", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "next": {"id": "end", "type": "END", "title": "开始招聘"}}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, form_id, model_json, create_time) VALUES 
('wf_payment', '对公付款流程', 'biz_payment', 1, 'PUBLISHED', 1, 'form_payment', '{"id": "root", "type": "START", "title": "提交付款申请", "next": {"id": "n1", "type": "APPROVAL", "title": "财务主管审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "RETURN", "DELEGATE"]}, "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务总监审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "props": {"buttons": ["APPROVE", "REJECT", "RETURN", "DELEGATE"]}, "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "财务打款"}}}}', sysdate());

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- OA 模块流程定义（补卡/外勤、加班、报销、请假、付款、出差）
-- =========================================================

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_attendance_appeal', '补卡/外勤审批流程', 'attendance_appeal', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交申请", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级审批", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "end", "type": "END", "title": "归档"}}}',
 sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_overtime_request', '加班审批流程', 'overtime_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交加班申请", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级审批", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR备案", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "归档"}}}}',
 sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_expense_claim', '报销审批流程', 'expense_claim', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级审批", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "财务审核", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "end", "type": "END", "title": "打款"}}}}',
 sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_leave_request', '请假审批流程', 'leave_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理审批", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR备案", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "归档"}}}}',
 sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_payment_request', '付款审批流程', 'payment_request', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交付款申请", "next": {"id": "n1", "type": "APPROVAL", "title": "财务主管审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务总监审批", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 50000"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "amount >= 50000"}], "next": {"id": "end", "type": "END", "title": "财务打款"}}}}',
 sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, status, is_latest, category, model_json, create_time) VALUES
('wf_business_trip', '出差审批流程', 'business_trip', 1, 'PUBLISHED', 1, 'OA',
 '{"id": "root", "type": "START", "title": "提交出差申请", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理审批", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "HR备案", "icon": "users", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "归档"}}}}',
 sysdate());

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

('test_task_003', 100000, 'test_inst_003', 'n1', '法务&财务会签审核',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_004', 100000, 'test_inst_003', 'n1', '法务&财务会签审核',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_005', 100000, 'test_inst_004', 'n1', '财务主管审批',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 2 DAY)),

('test_task_006', 100000, 'test_inst_006', 'n1', '直属上级审批',
 1, '管理员', 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_007', 100000, 'test_inst_007', 'n1', '部门经理审批',
 1, '管理员', 'TODO', 'URGENT', NOW(), DATE_ADD(NOW(), INTERVAL 1 DAY)),

('test_task_008', 100000, 'test_inst_008', 'n1', '部门总监审批',
 1, '管理员', 'TODO', 'HIGH', NOW(), DATE_ADD(NOW(), INTERVAL 3 DAY)),

('test_task_009', 100000, 'test_inst_009', 'n1', '法务&财务会签审核',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY)),

('test_task_010', 100000, 'test_inst_009', 'n1', '法务&财务会签审核',
 1, '管理员', 'TODO', 'NORMAL', NOW(), DATE_ADD(NOW(), INTERVAL 4 DAY));

-- 插入会签任务记录（合同审批流程的会签节点 n1）
INSERT INTO wf_countersign_task (
  countersign_id, tenant_id, instance_id, node_key, node_name,
  sign_type, total_count, voted_count, approve_count, reject_count, status, create_time
) VALUES
('cs_inst_003', 100000, 'test_inst_003', 'n1', '法务&财务会签审核',
 'ALL', 2, 0, 0, 0, 'VOTING', NOW()),
('cs_inst_009', 100000, 'test_inst_009', 'n1', '法务&财务会签审核',
 'ALL', 2, 0, 0, 0, 'VOTING', NOW());

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

-- 插入流程抄送测试数据（接收人为 admin, user_id=1）
INSERT INTO wf_process_copy (
  tenant_id, instance_id, process_def_key, title, node_id, node_name,
  start_user_id, start_user_name, user_id, form_data, is_read, read_time, create_time
) VALUES
-- 李四的年假申请 → 抄送给admin（未读）
(100000, 'test_inst_002', 'biz_leave', '李四的年假申请', 'n1', '部门经理审批',
 2, '李四', 1,
 '{"l1":"年假","l2":"2026-02-15","l3":"2026-02-20","l4":5,"l5":"春节后休假"}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 2 HOUR)),

-- 王五的销售合同审批 → 抄送给admin（未读）
(100000, 'test_inst_003', 'biz_contract', '王五的销售合同审批', 'n1', '法务&财务会签审核',
 3, '王五', 1,
 '{"c1":"XX公司软件采购合同","c2":"XX科技有限公司","c3":50000,"c4":"销售合同","c5":"软件授权及技术支持服务"}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 1 HOUR)),

-- 赵六的对公付款申请 → 抄送给admin（未读）
(100000, 'test_inst_004', 'biz_payment', '赵六的对公付款申请', 'n1', '财务主管审批',
 4, '赵六', 1,
 '{"p1":"供应商A公司","p2":"1234567890123456","p3":30000,"p4":"HT-2026-001"}',
 0, NULL, DATE_SUB(NOW(), INTERVAL 30 MINUTE)),

-- 孙七的招待费报销 → 抄送给admin（已读）
(100000, 'test_inst_006', 'biz_reimburse', '孙七的招待费报销', 'n1', '直属上级审批',
 2, '孙七', 1,
 '{"f1":"招待费","f2":2500,"f3":"2026-02-09","f4":"客户商务宴请"}',
 1, DATE_SUB(NOW(), INTERVAL 3 HOUR), DATE_SUB(NOW(), INTERVAL 1 DAY)),

-- 周八的病假申请 → 抄送给admin（已读）
(100000, 'test_inst_007', 'biz_leave', '周八的病假申请', 'n1', '部门经理审批',
 3, '周八', 1,
 '{"l1":"病假","l2":"2026-02-11","l3":"2026-02-13","l4":2,"l5":"感冒发烧需要休息"}',
 1, DATE_SUB(NOW(), INTERVAL 5 HOUR), DATE_SUB(NOW(), INTERVAL 1 DAY)),

-- 郑十的采购合同审批 → 抄送给admin（已读）
(100000, 'test_inst_009', 'biz_contract', '郑十的采购合同审批', 'n1', '法务&财务会签审核',
 4, '郑十', 1,
 '{"c1":"办公设备采购合同","c2":"YY科技有限公司","c3":80000,"c4":"采购合同","c5":"采购办公电脑、打印机等设备"}',
 1, DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY)),

-- 钱十一的婚假申请（已完成流程）→ 抄送给admin（已读）
(100000, 'test_inst_010', 'biz_leave', '钱十一的婚假申请', 'b1', 'HR备案',
 2, '钱十一', 1,
 '{"l1":"婚假","l2":"2026-02-01","l3":"2026-02-05","l4":5,"l5":"结婚度蜜月"}',
 1, DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 5 DAY));

-- =========================================================
-- 七、流程执行监控（Phase 2: 性能与监控）
-- =========================================================

-- 22. 流程执行监控表
DROP TABLE IF EXISTS wf_process_monitor;
CREATE TABLE wf_process_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    business_key      VARCHAR(100)    DEFAULT NULL COMMENT '业务键',
    start_time        DATETIME        NOT NULL COMMENT '开始时间',
    end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '执行时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：RUNNING/COMPLETED/FAILED/TERMINATED',
    node_count        INT(11)         DEFAULT 0 COMMENT '已执行节点数量',
    task_count        INT(11)         DEFAULT 0 COMMENT '已完成任务数量',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    start_user_id     BIGINT(20)      DEFAULT NULL COMMENT '发起人ID',
    start_user_name   VARCHAR(50)     DEFAULT NULL COMMENT '发起人姓名',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_instance (instance_id),
    KEY idx_tenant (tenant_id),
    KEY idx_process_def (process_def_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程执行监控表';

-- 23. 节点执行监控表
DROP TABLE IF EXISTS wf_node_monitor;
CREATE TABLE wf_node_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    node_id           VARCHAR(64)     NOT NULL COMMENT '节点ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
    node_name         VARCHAR(100)    NOT NULL COMMENT '节点名称',
    node_type         VARCHAR(20)     NOT NULL COMMENT '节点类型',
    start_time        DATETIME        NOT NULL COMMENT '开始时间',
    end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
    duration          BIGINT(20)      DEFAULT NULL COMMENT '执行时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：RUNNING/COMPLETED/FAILED/SKIPPED',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    retry_count       INT(11)         DEFAULT 0 COMMENT '重试次数',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_node (node_key),
    KEY idx_status (status),
    KEY idx_start_time (start_time),
    KEY idx_duration (duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='节点执行监控表';

-- 24. 任务执行监控表
DROP TABLE IF EXISTS wf_task_monitor;
CREATE TABLE wf_task_monitor (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
    task_name         VARCHAR(100)    NOT NULL COMMENT '任务名称',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '处理人姓名',
    create_time_task  DATETIME        NOT NULL COMMENT '任务创建时间',
    claim_time        DATETIME        DEFAULT NULL COMMENT '认领时间',
    complete_time     DATETIME        DEFAULT NULL COMMENT '完成时间',
    wait_duration     BIGINT(20)      DEFAULT NULL COMMENT '等待时长(毫秒)',
    handle_duration   BIGINT(20)      DEFAULT NULL COMMENT '处理时长(毫秒)',
    total_duration    BIGINT(20)      DEFAULT NULL COMMENT '总时长(毫秒)',
    status            VARCHAR(20)     NOT NULL COMMENT '状态：PENDING/CLAIMED/COMPLETED/TIMEOUT',
    action            VARCHAR(20)     DEFAULT NULL COMMENT '操作：APPROVE/REJECT/TRANSFER/DELEGATE',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_task (task_id),
    KEY idx_tenant (tenant_id),
    KEY idx_instance (instance_id),
    KEY idx_assignee (assignee_id),
    KEY idx_status (status),
    KEY idx_create_time (create_time_task),
    KEY idx_total_duration (total_duration)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务执行监控表';

-- =========================================================
-- 八、超时告警
-- =========================================================

-- 25. 超时告警记录表
DROP TABLE IF EXISTS wf_timeout_alert;
CREATE TABLE wf_timeout_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    alert_type        VARCHAR(20)     NOT NULL COMMENT '告警类型：TASK/PROCESS',
    target_id         VARCHAR(64)     NOT NULL COMMENT '目标ID（任务ID或流程实例ID）',
    target_name       VARCHAR(100)    NOT NULL COMMENT '目标名称',
    timeout_level     VARCHAR(20)     NOT NULL COMMENT '超时级别：REMIND/WARNING/CRITICAL',
    timeout_duration  BIGINT(20)      NOT NULL COMMENT '超时时长(毫秒)',
    threshold         BIGINT(20)      NOT NULL COMMENT '阈值(毫秒)',
    assignee_id       BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
    assignee_name     VARCHAR(50)     DEFAULT NULL COMMENT '处理人姓名',
    alert_time        DATETIME        NOT NULL COMMENT '告警时间',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '是否已发送通知（Y是 N否）',
    escalated         CHAR(1)         DEFAULT 'N' COMMENT '是否已升级（Y是 N否）',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '是否已解决（Y是 N否）',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '解决时间',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_alert_type (alert_type),
    KEY idx_target (target_id),
    KEY idx_timeout_level (timeout_level),
    KEY idx_assignee (assignee_id),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='超时告警记录表';

-- =========================================================
-- 九、异常检测
-- =========================================================

-- 26. 异常流程记录表
DROP TABLE IF EXISTS wf_anomaly_alert;
CREATE TABLE wf_anomaly_alert (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    anomaly_type      VARCHAR(30)     NOT NULL COMMENT '异常类型：EXECUTION_FAILED/DEADLOCK/INFINITE_LOOP/NO_ASSIGNEE/PERMISSION_ERROR/DATA_INCONSISTENCY',
    instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    node_key          VARCHAR(64)     DEFAULT NULL COMMENT '节点Key',
    node_name         VARCHAR(100)    DEFAULT NULL COMMENT '节点名称',
    task_id           VARCHAR(64)     DEFAULT NULL COMMENT '任务ID',
    error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
    stack_trace       TEXT            DEFAULT NULL COMMENT '堆栈跟踪',
    severity          VARCHAR(20)     NOT NULL COMMENT '严重程度：LOW/MEDIUM/HIGH/CRITICAL',
    alert_time        DATETIME        NOT NULL COMMENT '告警时间',
    notification_sent CHAR(1)         DEFAULT 'N' COMMENT '是否已发送通知（Y是 N否）',
    resolved          CHAR(1)         DEFAULT 'N' COMMENT '是否已解决（Y是 N否）',
    resolve_time      DATETIME        DEFAULT NULL COMMENT '解决时间',
    resolve_note      TEXT            DEFAULT NULL COMMENT '解决说明',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    KEY idx_tenant (tenant_id),
    KEY idx_anomaly_type (anomaly_type),
    KEY idx_instance (instance_id),
    KEY idx_process_def (process_def_key),
    KEY idx_severity (severity),
    KEY idx_alert_time (alert_time),
    KEY idx_resolved (resolved)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='异常流程记录表';

-- =========================================================
-- 十、监控统计
-- =========================================================

-- 27. 流程性能统计表（按天汇总）
DROP TABLE IF EXISTS wf_performance_stats;
CREATE TABLE wf_performance_stats (
    id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
    tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
    stat_date         DATE            NOT NULL COMMENT '统计日期',
    process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
    process_def_name  VARCHAR(100)    NOT NULL COMMENT '流程定义名称',
    total_count       INT(11)         DEFAULT 0 COMMENT '总流程数',
    completed_count   INT(11)         DEFAULT 0 COMMENT '完成数',
    failed_count      INT(11)         DEFAULT 0 COMMENT '失败数',
    avg_duration      BIGINT(20)      DEFAULT 0 COMMENT '平均执行时长(毫秒)',
    max_duration      BIGINT(20)      DEFAULT 0 COMMENT '最大执行时长(毫秒)',
    min_duration      BIGINT(20)      DEFAULT 0 COMMENT '最小执行时长(毫秒)',
    timeout_count     INT(11)         DEFAULT 0 COMMENT '超时数',
    anomaly_count     INT(11)         DEFAULT 0 COMMENT '异常数',
    create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_stat (tenant_id, stat_date, process_def_key),
    KEY idx_tenant (tenant_id),
    KEY idx_stat_date (stat_date),
    KEY idx_process_def (process_def_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程性能统计表';

-- =========================================================
-- 十一、发布增强功能（Phase 1）
-- =========================================================

-- 28. 发布窗口配置表
DROP TABLE IF EXISTS wf_deploy_window;
CREATE TABLE wf_deploy_window (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  window_name       VARCHAR(100)    NOT NULL COMMENT '窗口名称',
  window_type       VARCHAR(20)     NOT NULL COMMENT '窗口类型：DAILY/WEEKLY/MONTHLY/CUSTOM',
  start_time        TIME            DEFAULT NULL COMMENT '开始时间（时分秒）',
  end_time          TIME            DEFAULT NULL COMMENT '结束时间（时分秒）',
  week_days         VARCHAR(50)     DEFAULT NULL COMMENT '星期几（1-7，逗号分隔）',
  month_days        VARCHAR(100)    DEFAULT NULL COMMENT '每月几号（1-31，逗号分隔）',
  custom_dates      TEXT            DEFAULT NULL COMMENT '自定义日期列表（JSON格式，CUSTOM类型使用）',
  is_enabled        TINYINT(1)      DEFAULT 1 COMMENT '是否启用',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '描述',
  created_by        BIGINT(20)      DEFAULT NULL COMMENT '创建者ID',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_by        BIGINT(20)      DEFAULT NULL COMMENT '更新者ID',
  updated_time      DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_tenant_id (tenant_id),
  KEY idx_window_type (window_type),
  KEY idx_is_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布窗口配置表';

-- 29. 发布通知表
DROP TABLE IF EXISTS wf_deploy_notification;
CREATE TABLE wf_deploy_notification (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '发布记录ID',
  notification_type VARCHAR(20)     NOT NULL COMMENT '通知类型：EMAIL/SMS/WEBSOCKET/WECHAT',
  recipient_type    VARCHAR(20)     NOT NULL COMMENT '接收人类型：USER/ROLE/DEPT',
  recipient_value   VARCHAR(500)    NOT NULL COMMENT '接收人值（ID列表，逗号分隔）',
  title             VARCHAR(200)    DEFAULT NULL COMMENT '通知标题',
  content           TEXT            DEFAULT NULL COMMENT '通知内容',
  send_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SUCCESS/FAILED',
  send_time         DATETIME        DEFAULT NULL COMMENT '发送时间',
  error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_send_status (send_status),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布通知表';

-- 30. 发布审批流程表
DROP TABLE IF EXISTS wf_deploy_approval;
CREATE TABLE wf_deploy_approval (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '发布记录ID',
  submitter_id      BIGINT(20)      NOT NULL COMMENT '提交人ID',
  submitter_name    VARCHAR(64)     DEFAULT NULL COMMENT '提交人姓名',
  approval_status   VARCHAR(20)     DEFAULT 'PENDING' COMMENT '审批状态：PENDING/APPROVED/REJECTED/CANCELLED',
  current_step      INT             DEFAULT 1 COMMENT '当前步骤',
  total_steps       INT             DEFAULT 1 COMMENT '总步骤数',
  start_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  submit_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  create_by         VARCHAR(64)     DEFAULT NULL COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_submitter_id (submitter_id),
  KEY idx_approval_status (approval_status),
  KEY idx_tenant_id (tenant_id),
  KEY idx_submit_time (submit_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布审批流程表';

-- 31. 审批步骤表
DROP TABLE IF EXISTS wf_deploy_approval_step;
CREATE TABLE wf_deploy_approval_step (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  approval_id       BIGINT(20)      NOT NULL COMMENT '审批流程ID',
  step_no           INT             NOT NULL COMMENT '步骤序号',
  step_name         VARCHAR(100)    DEFAULT NULL COMMENT '步骤名称',
  approver_type     VARCHAR(20)     NOT NULL COMMENT '审批人类型：USER/ROLE/DEPT',
  approver_value    VARCHAR(500)    NOT NULL COMMENT '审批人值（ID列表）',
  approver_ids      VARCHAR(500)    NOT NULL COMMENT '审批人ID列表（逗号分隔，用于FIND_IN_SET查询）',
  approval_mode     VARCHAR(20)     DEFAULT 'ANY' COMMENT '审批模式：ANY/ALL/SEQUENCE',
  step_status       VARCHAR(20)     DEFAULT 'PENDING' COMMENT '步骤状态：PENDING/APPROVED/REJECTED',
  approver_id       BIGINT(20)      DEFAULT NULL COMMENT '实际审批人ID',
  approver_name     VARCHAR(64)     DEFAULT NULL COMMENT '实际审批人姓名',
  approval_time     DATETIME        DEFAULT NULL COMMENT '审批时间',
  approval_comment  VARCHAR(500)    DEFAULT NULL COMMENT '审批意见',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_approval_id (approval_id),
  KEY idx_step_status (step_status),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='审批步骤表';

-- 32. 流程版本快照表
DROP TABLE IF EXISTS wf_process_version_snapshot;
CREATE TABLE wf_process_version_snapshot (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             NOT NULL COMMENT '版本号',
  snapshot_data     LONGTEXT        NOT NULL COMMENT '快照数据（完整的流程定义JSON）',
  bpmn_xml          LONGTEXT        DEFAULT NULL COMMENT 'BPMN XML（如果有）',
  form_config       TEXT            DEFAULT NULL COMMENT '表单配置快照',
  node_config       TEXT            DEFAULT NULL COMMENT '节点配置快照',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_process_version (process_def_id, version),
  KEY idx_process_key (process_key),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程版本快照表';

-- 33. 回滚历史表
DROP TABLE IF EXISTS wf_deploy_rollback_history;
CREATE TABLE wf_deploy_rollback_history (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  original_deploy_id BIGINT(20)     NOT NULL COMMENT '原发布记录ID',
  rollback_deploy_id BIGINT(20)     NOT NULL COMMENT '回滚后的发布记录ID',
  process_def_id    VARCHAR(64)     NOT NULL COMMENT '流程定义ID',
  from_version      INT             NOT NULL COMMENT '回滚前版本',
  to_version        INT             NOT NULL COMMENT '回滚到版本',
  rollback_type     VARCHAR(20)     DEFAULT 'MANUAL' COMMENT '回滚类型：MANUAL/AUTO',
  rollback_reason   VARCHAR(500)    DEFAULT NULL COMMENT '回滚原因',
  rollback_by       BIGINT(20)      NOT NULL COMMENT '回滚操作人ID',
  rollback_by_name  VARCHAR(64)     DEFAULT NULL COMMENT '回滚操作人姓名',
  rollback_time     DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '回滚时间',
  success           TINYINT(1)      DEFAULT 1 COMMENT '是否成功',
  error_message     TEXT            DEFAULT NULL COMMENT '错误信息',
  PRIMARY KEY (id),
  KEY idx_original_deploy (original_deploy_id),
  KEY idx_rollback_deploy (rollback_deploy_id),
  KEY idx_process_def_id (process_def_id),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='回滚历史表';

-- 34. 发布影响分析表
DROP TABLE IF EXISTS wf_deploy_impact;
CREATE TABLE wf_deploy_impact (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT(20)      NOT NULL COMMENT '发布记录ID',
  impact_type       VARCHAR(30)     NOT NULL COMMENT '影响类型：RUNNING_INSTANCE/PENDING_TASK/FORM_CHANGE/NODE_CHANGE/PERMISSION_CHANGE',
  impact_level      VARCHAR(20)     NOT NULL COMMENT '影响级别：LOW/MEDIUM/HIGH/CRITICAL',
  impact_count      INT             DEFAULT 0 COMMENT '影响数量',
  impact_detail     TEXT            DEFAULT NULL COMMENT '影响详情（JSON格式）',
  mitigation_plan   TEXT            DEFAULT NULL COMMENT '缓解方案',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_deploy_id (deploy_id),
  KEY idx_impact_type (impact_type),
  KEY idx_impact_level (impact_level),
  KEY idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布影响分析表';

-- =========================================================
-- 初始化数据 - 发布窗口
-- =========================================================

INSERT INTO wf_deploy_window (tenant_id, window_name, window_type, start_time, end_time, week_days, month_days, custom_dates, is_enabled, description) VALUES
(100000, '工作日发布窗口', 'WEEKLY', '09:00:00', '18:00:00', '1,2,3,4,5', NULL, NULL, 1, '周一至周五的工作时间可以发布'),
(100000, '周末维护窗口', 'WEEKLY', '00:00:00', '23:59:59', '6,7', NULL, NULL, 0, '周末维护窗口（默认禁用）');

-- =========================================================
-- 脚本执行完成
-- =========================================================

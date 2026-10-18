# 批次 A 技术设计 · 01 建表 DDL

| 项 | 内容 |
| --- | --- |
| 覆盖 | A1 SYS-07（2 表）· A2 SYS-01（5 表）· A3 SYS-02（3 表）· A4 HR-04（2 表）· A5 LC-05（0 表） |
| 新增表 | **12 张**，全部放 `DB/01.cloudflow-common.sql` |
| 删除表 | **4 张**（`wf_notice`、`wf_notification_log`、`wf_notification_config`、`hr_self_service_message`） |
| 改动表 | `sys_dept`（+1 列）、`sys_file`（0 列，本批不改）|
| 净变化 | 244 → 245 表 |
| 版本 | v1 · 2026-08-31 |

## 0. 遵循的既有规范（实测 `01.cloudflow-common.sql` 提取）

```
类型写法：    BIGINT(20) / VARCHAR(n) / TINYINT(1) / DECIMAL(18,2) / INT / DATETIME / TEXT
列对齐：      列名 17 字符宽，类型 16 字符宽，每列必带 COMMENT
租户列：      tenant_id  BIGINT(20)  DEFAULT 100000 COMMENT '租户ID'
逻辑删除：    deleted    TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)'
乐观锁：      version    INT         NOT NULL DEFAULT 0 COMMENT '乐观锁版本号'
审计四列：    create_by  VARCHAR(64) DEFAULT '' COMMENT '创建者'
             create_time DATETIME   DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间'
             update_by  VARCHAR(64) DEFAULT '' COMMENT '更新者'
             update_time DATETIME   DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间'
表尾：        ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='表说明'
建表前：      DROP TABLE IF EXISTS xxx;
分节注释：    -- N. 表说明
```

**注意**：`deleted` 只在 8 张表上有（非全表标配）。本批遵循原则 —— **业务配置表加 `deleted`，日志/流水表不加**（日志按归档策略清理，不做逻辑删除）。

---

## 1. A1 SYS-07 代码生成器（2 表）

```sql
-- 33. 代码生成业务表
DROP TABLE IF EXISTS sys_codegen_table;
CREATE TABLE sys_codegen_table (
  table_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  table_name        VARCHAR(100)    NOT NULL COMMENT '数据库表名',
  table_comment     VARCHAR(200)    DEFAULT '' COMMENT '表描述',
  module_name       VARCHAR(30)     NOT NULL COMMENT '模块名：system/oa/crm/hr/workflow',
  business_name     VARCHAR(50)     NOT NULL COMMENT '业务名（URL与权限码资源段）',
  class_name        VARCHAR(100)    NOT NULL COMMENT '实体类名',
  function_name     VARCHAR(100)    NOT NULL COMMENT '功能中文名',
  package_name      VARCHAR(200)    NOT NULL COMMENT '生成包路径',
  author            VARCHAR(50)     DEFAULT 'CloudFlow' COMMENT '作者',
  tpl_category      VARCHAR(20)     NOT NULL DEFAULT 'CRUD' COMMENT '模板类型：CRUD/TREE/SUB/INNER',
  parent_menu_id    BIGINT(20)      DEFAULT NULL COMMENT '上级菜单ID',
  sub_table_name    VARCHAR(100)    DEFAULT NULL COMMENT '子表名（SUB用）',
  sub_table_fk      VARCHAR(64)     DEFAULT NULL COMMENT '子表外键（SUB用）',
  tree_parent_code  VARCHAR(64)     DEFAULT NULL COMMENT '树父字段（TREE用）',
  tree_name_code    VARCHAR(64)     DEFAULT NULL COMMENT '树显示字段（TREE用）',
  tenant_field_flag TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否含租户字段',
  logic_delete_flag TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否逻辑删除',
  version_field_flag TINYINT(1)     NOT NULL DEFAULT 1 COMMENT '是否乐观锁',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (table_id),
  UNIQUE KEY uk_codegen_table_name (tenant_id, table_name),
  KEY idx_codegen_module (module_name)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='代码生成业务表';

-- 34. 代码生成字段表
DROP TABLE IF EXISTS sys_codegen_column;
CREATE TABLE sys_codegen_column (
  column_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  table_id          BIGINT(20)      NOT NULL COMMENT '归属表ID',
  column_name       VARCHAR(100)    NOT NULL COMMENT '列名',
  column_comment    VARCHAR(200)    DEFAULT '' COMMENT '列描述',
  column_type       VARCHAR(100)    NOT NULL COMMENT '数据库类型',
  java_type         VARCHAR(100)    NOT NULL COMMENT 'Java类型',
  java_field        VARCHAR(100)    NOT NULL COMMENT 'Java字段名',
  pk_flag           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否主键',
  increment_flag    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否自增',
  required_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否必填',
  insert_flag       TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否参与新增',
  edit_flag         TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否参与编辑',
  list_flag         TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否参与列表',
  query_flag        TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否参与查询',
  query_type        VARCHAR(20)     DEFAULT 'EQ' COMMENT '查询方式：EQ/NE/GT/GE/LT/LE/LIKE/BETWEEN/IN',
  html_type         VARCHAR(30)     DEFAULT 'input' COMMENT '控件类型（供手写前端参考）',
  dict_type         VARCHAR(100)    DEFAULT NULL COMMENT '关联字典类型',
  audit_field_flag  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否审计列（自动识别）',
  sort_no           INT             NOT NULL DEFAULT 0 COMMENT '排序号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (column_id),
  KEY idx_codegen_column_table (table_id, sort_no)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='代码生成字段表';
```

**设计说明**：
- `sys_codegen_column` 不加 `deleted`/`version` —— 它随主表整体重建（重新同步表结构时全量替换），无独立逻辑删除需求
- `uk_codegen_table_name` 含 `tenant_id`：多租户下不同租户可导入同名表

---

## 2. A2 SYS-01 统一消息中心（5 表）

```sql
-- 35. 消息渠道配置表
DROP TABLE IF EXISTS sys_message_channel;
CREATE TABLE sys_message_channel (
  channel_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  channel_type      VARCHAR(20)     NOT NULL COMMENT '渠道类型：INTERNAL/EMAIL/SMS/WECOM/DINGTALK/FEISHU/WEBHOOK',
  channel_code      VARCHAR(50)     NOT NULL COMMENT '渠道编码',
  channel_name      VARCHAR(100)    NOT NULL COMMENT '渠道名称',
  provider          VARCHAR(50)     DEFAULT NULL COMMENT '服务商标识',
  signature         VARCHAR(100)    DEFAULT NULL COMMENT '短信签名',
  api_key           VARCHAR(200)    DEFAULT NULL COMMENT 'API Key',
  api_secret_cipher VARCHAR(500)    DEFAULT NULL COMMENT 'API Secret（加密存储）',
  endpoint          VARCHAR(300)    DEFAULT NULL COMMENT '服务端点',
  smtp_host         VARCHAR(200)    DEFAULT NULL COMMENT 'SMTP主机',
  smtp_port         INT             DEFAULT NULL COMMENT 'SMTP端口',
  smtp_ssl_flag     TINYINT(1)      NOT NULL DEFAULT 1 COMMENT 'SMTP是否启用SSL',
  smtp_username     VARCHAR(200)    DEFAULT NULL COMMENT 'SMTP用户名',
  smtp_pwd_cipher   VARCHAR(500)    DEFAULT NULL COMMENT 'SMTP密码（加密存储）',
  from_address      VARCHAR(200)    DEFAULT NULL COMMENT '发件地址',
  from_name         VARCHAR(100)    DEFAULT NULL COMMENT '发件人名称',
  callback_url      VARCHAR(300)    DEFAULT NULL COMMENT '回调地址',
  priority          INT             NOT NULL DEFAULT 100 COMMENT '优先级，数值越小越优先',
  rate_limit_minute INT             DEFAULT NULL COMMENT '每分钟发送上限',
  daily_limit       INT             DEFAULT NULL COMMENT '每日发送上限',
  retry_count       INT             NOT NULL DEFAULT 3 COMMENT '失败重试次数',
  retry_interval_sec INT            NOT NULL DEFAULT 60 COMMENT '重试间隔（秒）',
  implemented_flag  TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已有实现类（本批仅INTERNAL为1）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED/DISABLED',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (channel_id),
  UNIQUE KEY uk_msg_channel_code (tenant_id, channel_code),
  KEY idx_msg_channel_type (tenant_id, channel_type, status, priority)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='消息渠道配置表';

-- 36. 消息模板表
DROP TABLE IF EXISTS sys_message_template;
CREATE TABLE sys_message_template (
  template_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  template_code     VARCHAR(100)    NOT NULL COMMENT '模板编码（业务引用）',
  template_name     VARCHAR(100)    NOT NULL COMMENT '模板名称',
  channel_type      VARCHAR(20)     NOT NULL COMMENT '渠道类型',
  biz_module        VARCHAR(30)     DEFAULT NULL COMMENT '归属模块：system/oa/crm/hr/workflow',
  message_category  VARCHAR(30)     NOT NULL DEFAULT 'SYSTEM' COMMENT '消息分类：TODO/CC/ANNOUNCEMENT/SYSTEM/BIZ_REMINDER',
  title_template    VARCHAR(500)    DEFAULT NULL COMMENT '标题模板',
  content_template  TEXT            NOT NULL COMMENT '内容模板',
  params_declare    TEXT            DEFAULT NULL COMMENT '参数声明JSON：[{name,required,desc}]',
  force_send_flag   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否强制发送（忽略订阅与免打扰）',
  dedupe_window_sec INT             NOT NULL DEFAULT 300 COMMENT '去重窗口（秒），0为不去重',
  link_url_template VARCHAR(500)    DEFAULT NULL COMMENT '跳转链接模板',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED/DISABLED',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_id),
  UNIQUE KEY uk_msg_tpl_code_channel (tenant_id, template_code, channel_type),
  KEY idx_msg_tpl_module (biz_module, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='消息模板表';

-- 37. 消息发送记录表
DROP TABLE IF EXISTS sys_message_record;
CREATE TABLE sys_message_record (
  record_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  trace_id          VARCHAR(64)     DEFAULT NULL COMMENT '链路追踪ID',
  template_code     VARCHAR(100)    DEFAULT NULL COMMENT '模板编码',
  channel_type      VARCHAR(20)     NOT NULL COMMENT '渠道类型',
  channel_id        BIGINT(20)      DEFAULT NULL COMMENT '实际使用渠道ID',
  receiver_type     VARCHAR(20)     NOT NULL COMMENT '接收方类型：USER/PHONE/EMAIL/ROLE/DEPT',
  receiver_id       BIGINT(20)      DEFAULT NULL COMMENT '接收人用户ID',
  receiver_addr_mask VARCHAR(200)   DEFAULT NULL COMMENT '接收地址（脱敏展示值）',
  receiver_addr_cipher VARCHAR(500) DEFAULT NULL COMMENT '接收地址（加密存储完整值）',
  receiver_name     VARCHAR(100)    DEFAULT NULL COMMENT '接收人名称',
  title             VARCHAR(500)    DEFAULT NULL COMMENT '消息标题',
  content           TEXT            DEFAULT NULL COMMENT '消息内容',
  message_category  VARCHAR(30)     NOT NULL DEFAULT 'SYSTEM' COMMENT '消息分类',
  biz_type          VARCHAR(50)     DEFAULT NULL COMMENT '业务类型',
  biz_id            VARCHAR(64)     DEFAULT NULL COMMENT '业务ID',
  link_url          VARCHAR(500)    DEFAULT NULL COMMENT '跳转链接',
  send_status       VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SENDING/SUCCESS/FAILED/CANCELLED/SKIPPED',
  skip_reason       VARCHAR(30)     DEFAULT NULL COMMENT '跳过原因：UNSUBSCRIBED/QUIET_HOURS/DEDUPED/NO_CHANNEL/NOT_IMPLEMENTED',
  retry_count       INT             NOT NULL DEFAULT 0 COMMENT '已重试次数',
  error_msg         VARCHAR(1000)   DEFAULT NULL COMMENT '错误信息',
  send_time         DATETIME        DEFAULT NULL COMMENT '发送时间',
  read_flag         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已读',
  read_time         DATETIME        DEFAULT NULL COMMENT '已读时间',
  resend_from_id    BIGINT(20)      DEFAULT NULL COMMENT '重发来源记录ID',
  outbox_event_id   VARCHAR(64)     DEFAULT NULL COMMENT '关联outbox事件ID（幂等键）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (record_id),
  UNIQUE KEY uk_msg_rec_outbox (outbox_event_id, channel_type, receiver_id),
  KEY idx_msg_rec_receiver (tenant_id, receiver_id, read_flag, create_time),
  KEY idx_msg_rec_status (send_status, create_time),
  KEY idx_msg_rec_biz (biz_type, biz_id),
  KEY idx_msg_rec_trace (trace_id),
  KEY idx_msg_rec_category (tenant_id, receiver_id, message_category, read_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='消息发送记录表';

-- 38. 消息订阅配置表
DROP TABLE IF EXISTS sys_message_subscribe;
CREATE TABLE sys_message_subscribe (
  subscribe_id      BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  message_category  VARCHAR(30)     NOT NULL COMMENT '消息分类',
  channel_type      VARCHAR(20)     NOT NULL COMMENT '渠道类型',
  enabled_flag      TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否订阅',
  quiet_start       TIME            DEFAULT NULL COMMENT '免打扰开始时间',
  quiet_end         TIME            DEFAULT NULL COMMENT '免打扰结束时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (subscribe_id),
  UNIQUE KEY uk_msg_sub_user (tenant_id, user_id, message_category, channel_type)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='消息订阅配置表';

-- 39. 短信验证码表
DROP TABLE IF EXISTS sys_sms_code;
CREATE TABLE sys_sms_code (
  code_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  phone             VARCHAR(30)     NOT NULL COMMENT '手机号',
  code_hash         VARCHAR(128)    NOT NULL COMMENT '验证码哈希（不存明文）',
  biz_scene         VARCHAR(50)     NOT NULL COMMENT '业务场景',
  expire_time       DATETIME        NOT NULL COMMENT '过期时间',
  used_flag         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已使用',
  used_time         DATETIME        DEFAULT NULL COMMENT '使用时间',
  send_ip           VARCHAR(64)     DEFAULT NULL COMMENT '请求IP',
  verify_fail_count INT             NOT NULL DEFAULT 0 COMMENT '校验失败次数',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (code_id),
  KEY idx_sms_code_phone (phone, biz_scene, create_time),
  KEY idx_sms_code_expire (expire_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='短信验证码表';
```

**设计说明**：
- `sys_message_record` 的 `uk_msg_rec_outbox(outbox_event_id, channel_type, receiver_id)` 是**幂等键** —— 保证同一 outbox 事件重复投递不产生重复记录（PRD 的 AC-2C）
- 接收地址**双列设计**：`receiver_addr_mask` 存脱敏值供查询展示，`receiver_addr_cipher` 存加密完整值供发送。避免每次展示都解密
- `implemented_flag`：本批只有 `INTERNAL` 渠道为 1，配置了 EMAIL/SMS 但无实现类时该标记为 0，发送时直接返回 `NOT_IMPLEMENTED`（对应新增的 `skip_reason` 取值）
- `sys_message_record`、`sys_message_subscribe`、`sys_sms_code` **不加 `deleted`/`version`**（记录类表，消息记录按归档策略清理；订阅配置以唯一键 upsert；验证码按过期清理）
- `message_category` 冗余在 record 与 template 两处：查询"我的待办消息"时避免关联模板表

---

## 3. A3 SYS-02 定时任务平台（3 表）

```sql
-- 40. 定时任务表
DROP TABLE IF EXISTS sys_job;
CREATE TABLE sys_job (
  job_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID（平台级任务为0）',
  job_name          VARCHAR(100)    NOT NULL COMMENT '任务名称',
  job_group         VARCHAR(50)     NOT NULL DEFAULT 'DEFAULT' COMMENT '任务分组',
  service_name      VARCHAR(50)     NOT NULL COMMENT '归属服务：auth/workflow/oa/crm/hr',
  handler_name      VARCHAR(100)    NOT NULL COMMENT 'Handler标识',
  handler_param     VARCHAR(500)    DEFAULT NULL COMMENT 'Handler参数',
  trigger_type      VARCHAR(20)     NOT NULL DEFAULT 'CRON' COMMENT '触发类型：CRON/FIXED_RATE/FIXED_DELAY',
  cron_expression   VARCHAR(100)    DEFAULT NULL COMMENT 'CRON表达式',
  interval_ms       BIGINT(20)      DEFAULT NULL COMMENT '固定间隔（毫秒）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED/PAUSED',
  concurrent_flag   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否允许并发执行',
  misfire_strategy  VARCHAR(20)     NOT NULL DEFAULT 'IGNORE' COMMENT '错过策略：IGNORE/FIRE_ONCE/FIRE_ALL',
  retry_count       INT             NOT NULL DEFAULT 0 COMMENT '执行失败重试次数',
  retry_interval_sec INT            NOT NULL DEFAULT 60 COMMENT '执行失败重试间隔（秒）',
  dispatch_retry_count INT          NOT NULL DEFAULT 3 COMMENT 'Feign调用失败重试次数',
  dispatch_retry_interval_sec INT   NOT NULL DEFAULT 10 COMMENT '调用失败重试间隔（秒）',
  timeout_seconds   INT             NOT NULL DEFAULT 1800 COMMENT '超时阈值（秒），也是回报丢失判定阈值',
  lock_time_seconds INT             NOT NULL DEFAULT 300 COMMENT '分布式锁持有时间（秒）',
  critical_flag     TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否关键任务（暂停需二次确认）',
  log_success_flag  TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '成功是否落日志（高频任务可关）',
  alarm_on_fail_flag TINYINT(1)     NOT NULL DEFAULT 1 COMMENT '失败是否告警',
  alarm_receiver    VARCHAR(500)    DEFAULT NULL COMMENT '告警接收人（用户ID逗号分隔）',
  consecutive_fail_count INT        NOT NULL DEFAULT 0 COMMENT '连续失败计数',
  last_fire_time    DATETIME        DEFAULT NULL COMMENT '上次触发时间',
  next_fire_time    DATETIME        DEFAULT NULL COMMENT '下次触发时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (job_id),
  UNIQUE KEY uk_job_handler (service_name, handler_name, handler_param(100)),
  KEY idx_job_status (status, next_fire_time),
  KEY idx_job_service (service_name, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='定时任务表';

-- 41. 定时任务执行日志表
DROP TABLE IF EXISTS sys_job_log;
CREATE TABLE sys_job_log (
  log_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  job_id            BIGINT(20)      NOT NULL COMMENT '任务ID',
  job_name          VARCHAR(100)    NOT NULL COMMENT '任务名称',
  handler_name      VARCHAR(100)    NOT NULL COMMENT 'Handler标识',
  execute_no        VARCHAR(64)     NOT NULL COMMENT '执行编号（幂等键）',
  trigger_type      VARCHAR(20)     NOT NULL DEFAULT 'CRON' COMMENT '触发方式：CRON/MANUAL/RETRY',
  trigger_by        VARCHAR(64)     DEFAULT NULL COMMENT '手动触发人',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '耗时（毫秒）',
  execute_status    VARCHAR(20)     NOT NULL DEFAULT 'RUNNING' COMMENT '执行状态：RUNNING/SUCCESS/FAILED/TIMEOUT/SKIPPED/DISPATCH_FAILED',
  affected_rows     INT             DEFAULT NULL COMMENT '处理条数',
  result_msg        VARCHAR(1000)   DEFAULT NULL COMMENT '结果摘要',
  exception_stack   TEXT            DEFAULT NULL COMMENT '异常栈',
  executor_ip       VARCHAR(64)     DEFAULT NULL COMMENT '实际执行实例IP',
  dispatcher_ip     VARCHAR(64)     DEFAULT NULL COMMENT '发起调度的auth实例IP',
  dispatch_retry_index INT          NOT NULL DEFAULT 0 COMMENT '第几次调用重试',
  retry_index       INT             NOT NULL DEFAULT 0 COMMENT '第几次执行重试',
  report_time       DATETIME        DEFAULT NULL COMMENT '回报到达时间（空=回报未到）',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (log_id),
  UNIQUE KEY uk_job_log_execute_no (execute_no),
  KEY idx_job_log_job (job_id, start_time),
  KEY idx_job_log_status (execute_status, start_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='定时任务执行日志表';

-- 42. 定时任务Handler注册表
DROP TABLE IF EXISTS sys_job_handler;
CREATE TABLE sys_job_handler (
  handler_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  service_name      VARCHAR(50)     NOT NULL COMMENT '归属服务',
  handler_name      VARCHAR(100)    NOT NULL COMMENT 'Handler标识',
  handler_desc      VARCHAR(200)    DEFAULT NULL COMMENT '中文说明',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ONLINE' COMMENT '状态：ONLINE/OFFLINE',
  last_report_time  DATETIME        DEFAULT NULL COMMENT '最近上报时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (handler_id),
  UNIQUE KEY uk_job_handler_svc (service_name, handler_name)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='定时任务Handler注册表';
```

**设计说明**：
- `uk_job_handler(service_name, handler_name, handler_param(100))`：**前缀索引**（`handler_param` 是 VARCHAR(500)，全长做唯一键会超 MySQL 索引长度限制）。同一 handler 可用不同参数注册多个任务
- `uk_job_log_execute_no`：幂等键，防重复回报产生重复日志（PRD AC-3 的幂等要求）
- `log_success_flag`：PRD §12-3 的待确认项已在此落地 —— 高频任务可只记失败
- `sys_job_handler` 无 `tenant_id`：handler 是代码级注册，与租户无关
- `sys_job_log` 不加 `deleted`/`version`：日志表按保留期清理

---

## 4. A4 HR-04 节假日日历（2 表 + 1 列改动）

```sql
-- 43. 节假日日历表
DROP TABLE IF EXISTS sys_holiday_calendar;
CREATE TABLE sys_holiday_calendar (
  calendar_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID（0为平台公共日历）',
  calendar_code     VARCHAR(50)     NOT NULL COMMENT '日历编码',
  calendar_name     VARCHAR(100)    NOT NULL COMMENT '日历名称',
  region            VARCHAR(50)     DEFAULT NULL COMMENT '适用地区',
  default_flag      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否租户默认日历',
  weekly_rest_days  VARCHAR(20)     NOT NULL DEFAULT '6,7' COMMENT '每周固定休息日（1-7逗号分隔）',
  work_start_time   TIME            NOT NULL DEFAULT '09:00:00' COMMENT '标准工作开始时间',
  work_end_time     TIME            NOT NULL DEFAULT '18:00:00' COMMENT '标准工作结束时间',
  lunch_start_time  TIME            DEFAULT '12:00:00' COMMENT '午休开始时间（半天分界）',
  lunch_end_time    TIME            DEFAULT '13:00:00' COMMENT '午休结束时间',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态：ENABLED/DISABLED',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (calendar_id),
  UNIQUE KEY uk_holiday_cal_code (tenant_id, calendar_code),
  KEY idx_holiday_cal_default (tenant_id, default_flag, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='节假日日历表';

-- 44. 节假日日期明细表
DROP TABLE IF EXISTS sys_holiday_date;
CREATE TABLE sys_holiday_date (
  date_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  calendar_id       BIGINT(20)      NOT NULL COMMENT '日历ID',
  holiday_date      DATE            NOT NULL COMMENT '日期',
  date_type         VARCHAR(20)     NOT NULL COMMENT '日期类型：WORKDAY(调休上班)/HOLIDAY(法定节假日)/REST(休息日)',
  holiday_name      VARCHAR(50)     DEFAULT NULL COMMENT '节假日名称',
  triple_pay_flag   TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否三倍工资日（法定当天=1，调休日=0）',
  year_no           SMALLINT        NOT NULL COMMENT '年份（冗余，便于按年查询与缓存）',
  remark            VARCHAR(200)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (date_id),
  UNIQUE KEY uk_holiday_date (tenant_id, calendar_id, holiday_date),
  KEY idx_holiday_date_year (calendar_id, year_no)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='节假日日期明细表';
```

**`sys_dept` 改动**（A4 的 FR-4B.2，日历归属第二级回退）：
```sql
-- 在 sys_dept 建表语句的 remark 列之前插入：
  holiday_calendar_id BIGINT(20)    DEFAULT NULL COMMENT '节假日日历ID（空=继承租户默认）',
```

**设计说明**：
- 明细表只存**例外日期**（法定节假日 + 调休上班日）。普通周末由 `weekly_rest_days` 表达，不逐日落库 —— 一年只需约 30 条明细而非 365 条
- `triple_pay_flag` 是中国加班倍率本地化必需（法定当天 3 倍 vs 调休日 2 倍），批次 H 的 HR-09 依赖它
- `year_no` 冗余是为了整年缓存加载（A4 的 FR-4.1）

---

## 5. 删除的 4 张表

```sql
-- DB/02.cloudflow-workflow.sql 删除以下三张表的 DROP+CREATE 语句块：
--   wf_notice              (580-581 行起)
--   wf_notification_log
--   wf_notification_config
-- 表数 46 → 43

-- DB/03.cloudflow-hr.sql 删除：
--   hr_self_service_message
-- 表数 86 → 85
```

**同步清理**（M0 排查已定位精确位置，见 `A2-存量引用点排查.md` §2）：

| 脚本 | 清理内容 |
| --- | --- |
| `06.cloudflow-business-seed.sql` | `wf_notice` 5 处 INSERT + 6 处 DELETE；`wf_notification_log` 11 处；`wf_notification_config` 7 处；`hr_self_service_message` 3 处 |
| `06` 字典 | `wf_notice_type`（4 处）**改名** `sys_message_category`，取值扩展为 TODO/CC/ANNOUNCEMENT/SYSTEM/BIZ_REMINDER 五类 |
| `07.cloudflow-demo-seed.sql` | **必须用 `scripts/generate-demo-seed.ps1` 重新生成**（约 2500+ 引用行，手改不可行） |

---

## 6. 表数核对

| 脚本 | 改前 | 改后 | 变化 |
| --- | --- | --- | --- |
| `01.cloudflow-common.sql` | 32 | **44** | +12（本批全部新表） |
| `02.cloudflow-workflow.sql` | 46 | **43** | −3 |
| `03.cloudflow-hr.sql` | 86 | **85** | −1 |
| `04.cloudflow-oa.sql` | 63 | 63 | 0 |
| `05.cloudflow-crm.sql` | 17 | 17 | 0 |
| **合计** | **244** | **252** | **+8** |

> ⚠️ **与 PRD 的表数差异**：A2 的 PRD §6.6 写"244 → 245（删 4 增 5）"，那只算了 A2 自己的 5 张表。**批次 A 整体是 +12 −4 = +8，最终 252 张表**。索引中的表数需同步更正。

## 7. 执行顺序

因为选择了"一次性做完统一验收"，建表脚本改动一次完成：

1. `01.cloudflow-common.sql` 追加 12 张表（编号 33-44）+ `sys_dept` 加列
2. `02.cloudflow-workflow.sql` 删 3 张表
3. `03.cloudflow-hr.sql` 删 1 张表
4. `06.cloudflow-business-seed.sql` 清理旧数据 + 改字典 + 加种子数据（见 `A-批次A技术设计-04-种子数据.md`）
5. `07.cloudflow-demo-seed.sql` 重新生成

**空库验证**：按 `01→02→03→04→05→06` 顺序执行应无报错，且 `sys_dept.holiday_calendar_id` 的外键指向在 `01` 内部（`sys_holiday_calendar` 编号 43 在 `sys_dept` 之后，**MySQL 不强制外键顺序，但若加 FK 约束需注意 —— 本设计不加物理外键，与项目现有风格一致**）。

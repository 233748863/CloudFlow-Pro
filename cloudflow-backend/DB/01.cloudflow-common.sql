-- =========================================================
-- CloudFlow Pro - 公共基础模块数据库脚本
-- 模块：用户管理、角色权限、部门组织、菜单、多租户、文件管理
-- 版本：v1.0
-- 创建日期：2026-02-09
-- =========================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- 说明：本文件仅保留表结构与约束，初始化/演示种子数据已统一迁移至 06.cloudflow-business-seed.sql。

-- =========================================================
-- 一、租户管理
-- =========================================================

-- 1. 租户表
DROP TABLE IF EXISTS sys_tenant;
CREATE TABLE sys_tenant (
  tenant_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '租户ID',
  tenant_code       VARCHAR(50)     NOT NULL COMMENT '租户编码',
  tenant_name       VARCHAR(50)     NOT NULL COMMENT '租户名称',
  contact_name      VARCHAR(50)     DEFAULT NULL COMMENT '联系人',
  contact_phone     VARCHAR(20)     DEFAULT NULL COMMENT '联系电话',
  contact_email     VARCHAR(50)     DEFAULT NULL COMMENT '联系邮箱',
  allowed_email_domains VARCHAR(500) DEFAULT NULL COMMENT '允许注册的邮箱域名白名单，多个值使用逗号分隔',
  domain            VARCHAR(100)    DEFAULT NULL COMMENT '域名(可选)',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0正常 1停用）',
  expire_time       DATETIME        DEFAULT NULL COMMENT '过期时间',
  user_limit        INT(11)         DEFAULT 100 COMMENT '用户数量限制',
  storage_limit     BIGINT(20)      DEFAULT 10240 COMMENT '存储空间限制(MB)',
  storage_used      BIGINT(20)      DEFAULT 0 COMMENT '已使用存储空间(MB)',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (tenant_id),
  UNIQUE KEY uk_tenant_code (tenant_code),
  KEY idx_tenant_status (status),
  KEY idx_tenant_deleted (deleted)
) ENGINE=InnoDB AUTO_INCREMENT=100000 DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- =========================================================
-- 二、组织架构管理
-- =========================================================

-- 2. 部门表
DROP TABLE IF EXISTS sys_dept;
CREATE TABLE sys_dept (
  dept_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '部门id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  parent_id         BIGINT(20)      DEFAULT 0 COMMENT '父部门id',
  ancestors         VARCHAR(50)     DEFAULT '' COMMENT '祖级列表',
  dept_name         VARCHAR(30)     DEFAULT '' COMMENT '部门名称',
  order_num         INT(4)          DEFAULT 0 COMMENT '显示顺序',
  leader            VARCHAR(20)     DEFAULT NULL COMMENT '负责人',
  phone             VARCHAR(11)     DEFAULT NULL COMMENT '联系电话',
  email             VARCHAR(50)     DEFAULT NULL COMMENT '邮箱',
  status            CHAR(1)         DEFAULT '0' COMMENT '部门状态（0正常 1停用）',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  PRIMARY KEY (dept_id),
  KEY idx_dept_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=200 DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

-- 3. 用户表
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
  user_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  dept_id           BIGINT(20)      DEFAULT NULL COMMENT '部门ID',
  user_name         VARCHAR(30)     NOT NULL COMMENT '用户账号',
  nick_name         VARCHAR(30)     NOT NULL COMMENT '用户昵称',
  email             VARCHAR(50)     DEFAULT '' COMMENT '用户邮箱',
  phonenumber       VARCHAR(11)     DEFAULT '' COMMENT '手机号码',
  sex               CHAR(1)         DEFAULT '0' COMMENT '用户性别（0男 1女 2未知）',
  password          VARCHAR(100)    DEFAULT '' COMMENT '密码',
  status            CHAR(1)         DEFAULT '0' COMMENT '帐号状态（0正常 1停用）',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  pwd_reset_required CHAR(1)        DEFAULT '0' COMMENT '是否首次登录强制改密（0否 1是）',
  login_ip          VARCHAR(128)    DEFAULT '' COMMENT '最后登录IP',
  login_date        DATETIME        DEFAULT NULL COMMENT '最后登录时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  avatar            VARCHAR(500)    DEFAULT '' COMMENT '头像地址',
  PRIMARY KEY (user_id),
  KEY idx_user_tenant (tenant_id),
  UNIQUE KEY uk_user_name_tenant (user_name, tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';

DROP TABLE IF EXISTS sys_user_login_history;
CREATE TABLE sys_user_login_history (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  login_ip          VARCHAR(128)    DEFAULT '' COMMENT '登录IP',
  network_segment   VARCHAR(128)    DEFAULT '' COMMENT '网络指纹',
  location_label    VARCHAR(128)    DEFAULT '' COMMENT '登录位置标签',
  login_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '登录时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (id),
  KEY idx_login_history_user_time (tenant_id, user_id, login_time),
  KEY idx_login_history_segment (tenant_id, network_segment)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户登录历史表';

-- =========================================================
-- 三、权限管理
-- =========================================================

-- 4. 角色表
DROP TABLE IF EXISTS sys_role;
CREATE TABLE sys_role (
  role_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '角色ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  role_name         VARCHAR(30)     NOT NULL COMMENT '角色名称',
  role_key          VARCHAR(100)    NOT NULL COMMENT '角色权限字符串',
  role_sort         INT(4)          NOT NULL COMMENT '显示顺序',
  data_scope        CHAR(1)         DEFAULT '1' COMMENT '数据范围（1：全部数据权限 2：自定数据权限 3：本部门数据权限 4：本部门及以下数据权限）',
  ds_type           INT(1)          DEFAULT 1 COMMENT '数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人）',
  ds_scope          VARCHAR(500)    DEFAULT NULL COMMENT '自定义数据权限（部门ID列表，逗号分隔）',
  status            CHAR(1)         DEFAULT '0' COMMENT '角色状态（0正常 1停用）',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (role_id),
  KEY idx_role_tenant (tenant_id),
  UNIQUE KEY uk_role_key_tenant (role_key, tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='角色信息表';

-- 5. 菜单权限表
DROP TABLE IF EXISTS sys_menu;
CREATE TABLE sys_menu (
  menu_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  menu_name         VARCHAR(50)     NOT NULL COMMENT '菜单名称',
  parent_id         BIGINT(20)      DEFAULT 0 COMMENT '父菜单ID',
  order_num         INT(4)          DEFAULT 0 COMMENT '显示顺序',
  path              VARCHAR(200)    DEFAULT '' COMMENT '路由地址',
  component         VARCHAR(255)    DEFAULT NULL COMMENT '组件路径',
  query             VARCHAR(255)    DEFAULT NULL COMMENT '路由参数',
  is_frame          INT(1)          DEFAULT 0 COMMENT '是否为外链（0是 1否）',
  is_cache          INT(1)          DEFAULT 0 COMMENT '是否缓存（0缓存 1不缓存）',
  menu_type         CHAR(1)         DEFAULT '' COMMENT '菜单类型（M目录 C菜单 F按钮）',
  visible           CHAR(1)         DEFAULT '0' COMMENT '菜单状态（0显示 1隐藏）',
  status            CHAR(1)         DEFAULT '0' COMMENT '菜单状态（0正常 1停用）',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  perms             VARCHAR(100)    DEFAULT NULL COMMENT '权限标识',
  icon              VARCHAR(100)    DEFAULT '#' COMMENT '菜单图标',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT '' COMMENT '备注',
  PRIMARY KEY (menu_id)
) ENGINE=InnoDB AUTO_INCREMENT=2000 DEFAULT CHARSET=utf8mb4 COMMENT='菜单权限表';

-- 6. 用户和角色关联表
DROP TABLE IF EXISTS sys_user_role;
CREATE TABLE sys_user_role (
  user_id   BIGINT(20) NOT NULL COMMENT '用户ID',
  role_id   BIGINT(20) NOT NULL COMMENT '角色ID',
  tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户和角色关联表';

-- 7. 角色和菜单关联表
DROP TABLE IF EXISTS sys_role_menu;
CREATE TABLE sys_role_menu (
  role_id   BIGINT(20) NOT NULL COMMENT '角色ID',
  menu_id   BIGINT(20) NOT NULL COMMENT '菜单ID',
  tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色和菜单关联表';

DROP TABLE IF EXISTS sys_role_mutex;
CREATE TABLE sys_role_mutex (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  role_id_1         BIGINT(20)      NOT NULL COMMENT '互斥角色ID 1',
  role_id_2         BIGINT(20)      NOT NULL COMMENT '互斥角色ID 2',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_role_mutex_pair (tenant_id, role_id_1, role_id_2),
  KEY idx_role_mutex_role1 (role_id_1),
  KEY idx_role_mutex_role2 (role_id_2)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色互斥规则表';

-- =========================================================
-- 四、岗位管理
-- =========================================================

-- 8. 岗位信息表
DROP TABLE IF EXISTS sys_post;
CREATE TABLE sys_post (
  post_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '岗位ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  post_code         VARCHAR(64)     NOT NULL COMMENT '岗位编码',
  post_name         VARCHAR(50)     NOT NULL COMMENT '岗位名称',
  post_sort         INT(4)          NOT NULL COMMENT '显示顺序',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0正常 1停用）',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (post_id),
  UNIQUE KEY uk_post_tenant_code (tenant_id, post_code),
  KEY idx_post_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='岗位信息表';

-- 9. 用户与岗位关联表
DROP TABLE IF EXISTS sys_user_post;
CREATE TABLE sys_user_post (
  user_id   BIGINT(20) NOT NULL COMMENT '用户ID',
  post_id   BIGINT(20) NOT NULL COMMENT '岗位ID',
  tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  PRIMARY KEY (user_id, post_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户与岗位关联表';

-- =========================================================
-- 五、文件管理
-- =========================================================

-- 10. 文件管理表
DROP TABLE IF EXISTS sys_file;
CREATE TABLE sys_file (
  file_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '文件ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  file_name         VARCHAR(255)    DEFAULT '' COMMENT '原始文件名',
  file_path         VARCHAR(255)    DEFAULT '' COMMENT '存储路径',
  url               VARCHAR(500)    DEFAULT '' COMMENT '访问地址',
  storage_type      VARCHAR(20)     DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS）',
  file_size         BIGINT(20)      DEFAULT 0  COMMENT '文件大小',
  file_type         VARCHAR(50)     DEFAULT '' COMMENT '文件类型',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '上传者',
  create_time       DATETIME        COMMENT '上传时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (file_id),
  KEY idx_file_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件管理表';

-- =========================================================
-- 六、操作日志与审计日志
-- =========================================================

-- 11. 操作日志表
DROP TABLE IF EXISTS sys_log;
CREATE TABLE sys_log (
  log_id            BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  log_type          VARCHAR(10)     DEFAULT '0' COMMENT '日志类型（0正常 9错误）',
  title             VARCHAR(255)    DEFAULT '' COMMENT '操作描述',
  service_id        VARCHAR(64)     DEFAULT '' COMMENT '服务名称',
  remote_addr       VARCHAR(128)    DEFAULT '' COMMENT '客户端IP',
  user_agent        VARCHAR(500)    DEFAULT '' COMMENT 'User-Agent',
  request_uri       VARCHAR(255)    DEFAULT '' COMMENT '请求URI',
  method            VARCHAR(10)     DEFAULT '' COMMENT 'HTTP方法',
  params            TEXT            COMMENT '请求参数',
  time              BIGINT(20)      DEFAULT 0 COMMENT '执行时间(ms)',
  exception         TEXT            COMMENT '异常信息',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '操作人',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (log_id),
  KEY idx_log_tenant (tenant_id),
  KEY idx_log_type (log_type),
  KEY idx_log_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='操作日志表';

-- 12. 审计日志表
DROP TABLE IF EXISTS sys_audit_log;
CREATE TABLE sys_audit_log (
  audit_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '审计ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  biz_module        VARCHAR(64)     NOT NULL DEFAULT 'system' COMMENT '业务模块',
  audit_name        VARCHAR(255)    DEFAULT '' COMMENT '审计业务名称',
  audit_field       VARCHAR(255)    DEFAULT '' COMMENT '变更字段名',
  before_val        TEXT            COMMENT '变更前值',
  after_val         TEXT            COMMENT '变更后值',
  before_json       TEXT            COMMENT '变更前完整 JSON',
  after_json        TEXT            COMMENT '变更后完整 JSON',
  diff_json         TEXT            COMMENT 'JSON diff',
  high_risk         TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否高风险',
  risk_level        VARCHAR(20)     NOT NULL DEFAULT 'NORMAL' COMMENT '风险等级',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '操作人',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (audit_id),
  KEY idx_audit_tenant (tenant_id),
  KEY idx_audit_biz_module_create_time (biz_module, create_time),
  KEY idx_audit_name (audit_name),
  KEY idx_audit_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';

DROP TABLE IF EXISTS sys_audit_archive_policy;
CREATE TABLE sys_audit_archive_policy (
  id                BIGINT          NOT NULL AUTO_INCREMENT COMMENT '主键',
  biz_module        VARCHAR(64)     NOT NULL COMMENT '业务模块',
  retain_days       INT             NOT NULL DEFAULT 90 COMMENT '主表保留天数',
  archive_table     VARCHAR(64)     NOT NULL COMMENT '归档冷表',
  status            VARCHAR(16)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态：ACTIVE/INACTIVE',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_audit_archive_policy_biz_module (biz_module),
  KEY idx_audit_archive_policy_status (status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='审计归档策略表';

-- 13. Outbox 事件表
DROP TABLE IF EXISTS outbox_event;
CREATE TABLE outbox_event (
  id              BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
  aggregate_type  VARCHAR(100) NOT NULL COMMENT '聚合根类型',
  aggregate_id    BIGINT NOT NULL COMMENT '聚合根 ID',
  event_id        VARCHAR(64) NOT NULL COMMENT '业务事件唯一ID',
  event_type      VARCHAR(100) NOT NULL COMMENT '事件类型',
  payload_json    LONGTEXT NOT NULL COMMENT '事件负载 JSON',
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态',
  retry_count     INT NOT NULL DEFAULT 0 COMMENT '重试次数',
  next_retry_at   DATETIME NOT NULL COMMENT '下次重试时间',
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  published_at    DATETIME NULL COMMENT '发布成功时间',
  last_error      VARCHAR(500) NULL COMMENT '最后错误信息',
  tenant_id       BIGINT NULL COMMENT '租户 ID',
  locked_by       VARCHAR(64) NULL COMMENT '抢占实例标识',
  locked_until    DATETIME NULL COMMENT '抢占过期时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_outbox_event_id (event_id),
  KEY idx_status_retry (status, next_retry_at, locked_until),
  KEY idx_aggregate (aggregate_type, aggregate_id),
  KEY idx_owner_status (locked_by, status),
  KEY idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='Outbox 事件表';

-- =========================================================
-- 七、字典管理
-- =========================================================

-- 13. 字典类型表
DROP TABLE IF EXISTS `sys_dict_type`;
CREATE TABLE `sys_dict_type` (
    `dict_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典主键',
    `tenant_id`   BIGINT       DEFAULT 100000 COMMENT '租户ID',
    `dict_name`   VARCHAR(100) NOT NULL COMMENT '字典名称',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型（唯一标识）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_id`),
    UNIQUE KEY `uk_dict_type` (`dict_type`, `tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表';

-- 14. 字典数据表
DROP TABLE IF EXISTS `sys_dict_data`;
CREATE TABLE `sys_dict_data` (
    `dict_code`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典编码',
    `tenant_id`   BIGINT       DEFAULT 100000 COMMENT '租户ID',
    `dict_sort`   INT          DEFAULT 0 COMMENT '字典排序',
    `dict_label`  VARCHAR(100) NOT NULL COMMENT '字典标签',
    `dict_value`  VARCHAR(100) NOT NULL COMMENT '字典键值',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型',
    `css_class`   VARCHAR(100) DEFAULT NULL COMMENT '样式属性（前端扩展）',
    `list_class`  VARCHAR(100) DEFAULT NULL COMMENT '表格回显样式（如 success/warning/danger）',
    `is_default`  CHAR(1)      DEFAULT 'N' COMMENT '是否默认（Y是 N否）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    `risk_level`  VARCHAR(20)  NOT NULL DEFAULT 'LOW' COMMENT '风险等级（LOW/MID/HIGH）',
    version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_code`),
    KEY `idx_dict_type` (`dict_type`),
    KEY `idx_dict_data_tenant_type` (`tenant_id`, `dict_type`, `dict_value`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典数据表';

DROP TABLE IF EXISTS `sys_dict_version`;
CREATE TABLE `sys_dict_version` (
    `id`            BIGINT       NOT NULL AUTO_INCREMENT COMMENT '版本ID',
    `tenant_id`     BIGINT       DEFAULT 100000 COMMENT '租户ID',
    `dict_type`     VARCHAR(100) NOT NULL COMMENT '字典类型',
    `version_no`    INT          NOT NULL COMMENT '版本号',
    `snapshot_json` LONGTEXT     NOT NULL COMMENT '快照JSON',
    `published_by`  VARCHAR(64)  DEFAULT NULL COMMENT '发布人',
    `published_at`  DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
    PRIMARY KEY (`id`),
    UNIQUE KEY `uk_dict_version` (`tenant_id`, `dict_type`, `version_no`),
    KEY `idx_dict_version_type` (`dict_type`, `published_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典版本快照表';

DROP TABLE IF EXISTS `sys_dict_change_approval`;
CREATE TABLE `sys_dict_change_approval` (
    `approval_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '审批单ID',
    `tenant_id`       BIGINT       DEFAULT 100000 COMMENT '租户ID',
    `approval_no`     VARCHAR(50)  NOT NULL COMMENT '审批单号',
    `dict_type`       VARCHAR(100) NOT NULL COMMENT '字典类型',
    `change_scope`    VARCHAR(32)  NOT NULL COMMENT '变更范围（DICT_DATA）',
    `action_type`     VARCHAR(32)  NOT NULL COMMENT '动作类型（ADD/UPDATE/DELETE）',
    `risk_level`      VARCHAR(20)  NOT NULL DEFAULT 'HIGH' COMMENT '风险等级',
    `target_ids`      VARCHAR(500) DEFAULT NULL COMMENT '目标主键列表',
    `target_summary`  VARCHAR(255) DEFAULT NULL COMMENT '目标摘要',
    `payload_json`    LONGTEXT     NOT NULL COMMENT '审批快照载荷',
    `applicant_id`    BIGINT       DEFAULT NULL COMMENT '申请人ID',
    `applicant_name`  VARCHAR(64)  DEFAULT NULL COMMENT '申请人姓名',
    `dept_id`         BIGINT       DEFAULT NULL COMMENT '申请部门ID',
    `dept_name`       VARCHAR(64)  DEFAULT NULL COMMENT '申请部门名称',
    `status`          VARCHAR(20)  NOT NULL DEFAULT 'PENDING' COMMENT '审批状态',
    `instance_id`     VARCHAR(64)  DEFAULT NULL COMMENT '流程实例ID',
    `approval_comment` VARCHAR(500) DEFAULT NULL COMMENT '审批意见',
    `remark`          VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `version`         INT          NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
    `create_by`       VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time`     DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`       VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time`     DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`approval_id`),
    UNIQUE KEY `uk_dict_change_approval_no` (`tenant_id`, `approval_no`),
    KEY `idx_dict_change_type_status` (`tenant_id`, `dict_type`, `status`),
    KEY `idx_dict_change_instance` (`instance_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='高风险字典变更审批表';

-- 14.1 字典隐式引用告警表
DROP TABLE IF EXISTS sys_dict_orphan_alert;
CREATE TABLE sys_dict_orphan_alert (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    dict_type VARCHAR(100) NOT NULL COMMENT '字典类型编码',
    reason VARCHAR(255) NOT NULL COMMENT '告警原因',
    binding_summary VARCHAR(2000) NOT NULL COMMENT '绑定摘要',
    binding_count INT NOT NULL DEFAULT 0 COMMENT '绑定数量',
    create_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_sys_dict_orphan_alert_tenant_type (tenant_id, dict_type),
    KEY idx_sys_dict_orphan_alert_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典隐式引用告警表';

-- =========================================================
-- 八、系统参数配置
-- =========================================================

-- 15. 系统参数配置表
DROP TABLE IF EXISTS sys_config;
CREATE TABLE sys_config (
  config_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '参数主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  config_name       VARCHAR(100)    DEFAULT '' COMMENT '参数名称',
  config_key        VARCHAR(100)    DEFAULT '' COMMENT '参数键名',
  config_value      VARCHAR(500)    DEFAULT '' COMMENT '参数键值',
  config_type       CHAR(1)         DEFAULT 'N' COMMENT '系统内置（Y是 N否）',
  config_scope      CHAR(1)         DEFAULT '1' COMMENT '配置作用域（0=全局 1=租户）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_config_key_tenant (config_key, tenant_id),
  KEY idx_config_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统参数配置表';

-- 16. 登录条款发布批次
DROP TABLE IF EXISTS sys_legal_release;
CREATE TABLE sys_legal_release (
  release_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '发布批次ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '租户ID，0表示全局默认',
  release_code      VARCHAR(64)     NOT NULL COMMENT '发布批次编码',
  title             VARCHAR(120)    NOT NULL COMMENT '发布标题',
  effective_date    DATE            NOT NULL COMMENT '生效日期',
  description       VARCHAR(500)    DEFAULT NULL COMMENT '发布说明',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DRAFT' COMMENT '状态：DRAFT/PUBLISHED/ARCHIVED',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (release_id),
  UNIQUE KEY uk_legal_release_code_tenant (tenant_id, release_code),
  KEY idx_legal_release_active (tenant_id, status, effective_date)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='登录条款发布批次表';

-- 17. 登录条款文档
DROP TABLE IF EXISTS sys_legal_document;
CREATE TABLE sys_legal_document (
  document_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '文档ID',
  release_id        BIGINT(20)      NOT NULL COMMENT '发布批次ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '租户ID，0表示全局默认',
  release_code      VARCHAR(64)     NOT NULL COMMENT '发布批次编码',
  doc_type          VARCHAR(32)     NOT NULL COMMENT '文档类型：terms/privacy/security/regions',
  title             VARCHAR(120)    NOT NULL COMMENT '文档标题',
  version           VARCHAR(32)     NOT NULL COMMENT '文档版本',
  content           MEDIUMTEXT      DEFAULT NULL COMMENT '正文内容',
  external_url      VARCHAR(500)    DEFAULT NULL COMMENT '外部文档链接',
  required          TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否必读',
  sort_order        INT             NOT NULL DEFAULT 100 COMMENT '排序',
  status            CHAR(1)         NOT NULL DEFAULT '0' COMMENT '状态：0正常 1停用',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (document_id),
  UNIQUE KEY uk_legal_doc_release_type (release_id, doc_type),
  KEY idx_legal_doc_release (tenant_id, release_code, sort_order)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='登录条款文档表';

-- 18. 登录条款同意记录
DROP TABLE IF EXISTS sys_legal_consent;
CREATE TABLE sys_legal_consent (
  consent_id        BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '同意记录ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  user_name         VARCHAR(64)     NOT NULL COMMENT '用户名',
  release_code      VARCHAR(64)     NOT NULL COMMENT '发布批次编码',
  document_snapshot VARCHAR(2000)   DEFAULT NULL COMMENT '同意时文档快照',
  accepted_at       DATETIME        NOT NULL COMMENT '同意时间',
  accepted_ip       VARCHAR(64)     DEFAULT NULL COMMENT '同意IP',
  user_agent        VARCHAR(512)    DEFAULT NULL COMMENT '浏览器User-Agent',
  source            VARCHAR(20)     NOT NULL DEFAULT 'LOGIN' COMMENT '来源：LOGIN/REGISTER/ADMIN',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (consent_id),
  UNIQUE KEY uk_legal_consent_user_release (tenant_id, user_id, release_code),
  KEY idx_legal_consent_release_time (tenant_id, release_code, accepted_at)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='登录条款同意记录表';

-- 16. 业务规则表
DROP TABLE IF EXISTS sys_business_rule;
CREATE TABLE sys_business_rule (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '规则ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  rule_code         VARCHAR(100)    NOT NULL COMMENT '规则编码',
  rule_name         VARCHAR(100)    NOT NULL COMMENT '规则名称',
  module            VARCHAR(32)     NOT NULL COMMENT '所属模块',
  threshold_value   DECIMAL(18,2)   DEFAULT NULL COMMENT '阈值',
  effect            VARCHAR(16)     NOT NULL DEFAULT 'WARN' COMMENT '命中效果：BLOCK/ALERT/WARN/PASS',
  enabled           TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否启用：1启用 0停用',
  priority          INT             NOT NULL DEFAULT 100 COMMENT '优先级，数值越小越优先',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_tenant_code (tenant_id, rule_code),
  KEY idx_rule_code_enabled (tenant_id, rule_code, enabled),
  KEY idx_rule_module_enabled (module, enabled)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='业务规则表';

DROP TABLE IF EXISTS sys_business_rule_version;
CREATE TABLE sys_business_rule_version (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '版本ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  rule_id           BIGINT(20)      NOT NULL COMMENT '规则ID',
  rule_code         VARCHAR(100)    NOT NULL COMMENT '规则编码',
  version_no        INT             NOT NULL COMMENT '版本号',
  threshold_value   DECIMAL(18,2)   DEFAULT NULL COMMENT '阈值',
  effect            VARCHAR(16)     NOT NULL DEFAULT 'WARN' COMMENT '命中效果：BLOCK/ALERT/WARN/PASS',
  enabled           TINYINT(1)      NOT NULL DEFAULT 1 COMMENT '是否启用：1启用 0停用',
  priority          INT             NOT NULL DEFAULT 100 COMMENT '优先级',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  status            VARCHAR(16)     NOT NULL DEFAULT 'DRAFT' COMMENT '版本状态：DRAFT/PUBLISHED/ARCHIVED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  publisher_name    VARCHAR(64)     DEFAULT NULL COMMENT '发布人',
  published_time    DATETIME        DEFAULT NULL COMMENT '发布时间',
  snapshot_json     JSON            DEFAULT NULL COMMENT '规则快照',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_rule_version (rule_id, version_no),
  KEY idx_rule_code_status (tenant_id, rule_code, status),
  KEY idx_rule_status_time (rule_id, status, published_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='业务规则版本表';

DROP TABLE IF EXISTS sys_business_rule_hit_record;
CREATE TABLE sys_business_rule_hit_record (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '命中记录ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  rule_code         VARCHAR(100)    NOT NULL COMMENT '规则编码',
  business_type     VARCHAR(64)     NOT NULL COMMENT '业务类型',
  business_id       BIGINT(20)      DEFAULT NULL COMMENT '业务ID',
  threshold_value   DECIMAL(18,2)   DEFAULT NULL COMMENT '阈值',
  actual_value      DECIMAL(18,2)   DEFAULT NULL COMMENT '实际值',
  effect            VARCHAR(16)     NOT NULL COMMENT '命中效果',
  hit_result        VARCHAR(16)     NOT NULL COMMENT '处理结果',
  created_time      DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '命中时间',
  PRIMARY KEY (id),
  KEY idx_rule_hit_code_time (tenant_id, rule_code, created_time),
  KEY idx_rule_hit_business (business_type, business_id),
  KEY idx_rule_hit_result (hit_result, created_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='业务规则命中记录表';

-- =========================================================
-- GOV-P1-1 API 动态限流规则
-- =========================================================
DROP TABLE IF EXISTS sys_api_ratelimit_rule;
CREATE TABLE sys_api_ratelimit_rule (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID(0或100000表示全租户)',
  rule_code         VARCHAR(60)     NOT NULL COMMENT '规则编码',
  rule_name         VARCHAR(200)    NOT NULL COMMENT '规则名称',
  service_name      VARCHAR(60)     DEFAULT NULL COMMENT '目标服务名(为空匹配全部)',
  path_pattern      VARCHAR(500)    NOT NULL COMMENT '路径模板(Ant风格 /xx/**)',
  http_method       VARCHAR(20)     DEFAULT 'ALL' COMMENT 'HTTP方法(GET/POST/PUT/DELETE/ALL)',
  dimension         VARCHAR(20)     NOT NULL DEFAULT 'IP' COMMENT '限流维度(IP/USER/TENANT/GLOBAL)',
  rps               INT(11)         NOT NULL DEFAULT 10 COMMENT '时间窗口内请求数上限',
  burst             INT(11)         DEFAULT NULL COMMENT '突发上限(默认 rps)',
  window_seconds    INT(11)         NOT NULL DEFAULT 1 COMMENT '限流时间窗口(秒)',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  priority          INT(11)         NOT NULL DEFAULT 100 COMMENT '优先级(数小先匹配)',
  reject_strategy   VARCHAR(20)     DEFAULT 'REJECT' COMMENT '超限策略(REJECT直接拒绝/QUEUE排队/LOG仅记录)',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_api_ratelimit_code (tenant_id, rule_code),
  KEY idx_api_ratelimit_match (status, priority, service_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='API动态限流规则';

-- ----------------------------
-- GOV-P0-1 IP 黑白名单
-- ----------------------------
DROP TABLE IF EXISTS sys_ip_acl;
CREATE TABLE sys_ip_acl (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID(0或100000表示全租户)',
  rule_code         VARCHAR(60)     NOT NULL COMMENT '规则编码',
  rule_name         VARCHAR(200)    NOT NULL COMMENT '规则名称',
  ip_pattern        VARCHAR(120)    NOT NULL COMMENT 'IP/CIDR/区间表达式',
  rule_type         VARCHAR(20)     NOT NULL DEFAULT 'EXACT' COMMENT '匹配类型(EXACT精确/CIDR网段/RANGE区间)',
  mode              VARCHAR(20)     NOT NULL COMMENT '名单类型(BLACK黑名单/WHITE白名单)',
  priority          INT(11)         NOT NULL DEFAULT 100 COMMENT '优先级(数小先匹配)',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE/INACTIVE)',
  expire_at         DATETIME        DEFAULT NULL COMMENT '过期时间(NULL=永不过期)',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '原因/备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_ip_acl_code (tenant_id, rule_code),
  KEY idx_ip_acl_status (status, mode, priority),
  KEY idx_ip_acl_tenant (tenant_id, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='IP黑白名单';

-- ----------------------------
-- GOV-P0-1 用户黑名单(白名单等价 RBAC,不建)
-- ----------------------------
DROP TABLE IF EXISTS sys_user_blacklist;
CREATE TABLE sys_user_blacklist (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '被拉黑用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '被拉黑用户名(冗余)',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ACTIVE' COMMENT '状态(ACTIVE生效/INACTIVE解除)',
  expire_at         DATETIME        DEFAULT NULL COMMENT '过期时间(NULL=永久)',
  reason            VARCHAR(500)    DEFAULT NULL COMMENT '拉黑原因',
  op_user_id        BIGINT(20)      DEFAULT NULL COMMENT '操作人用户ID',
  op_user_name      VARCHAR(64)     DEFAULT NULL COMMENT '操作人姓名',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  KEY idx_user_blacklist_user (user_id, deleted),
  KEY idx_user_blacklist_status (tenant_id, status, deleted)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户黑名单(GOV-P0-1)';

DROP TRIGGER IF EXISTS trg_sys_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_log_no_update;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_update;

DELIMITER $$

CREATE TRIGGER trg_sys_log_no_delete
BEFORE DELETE ON sys_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log delete is forbidden';
END$$

CREATE TRIGGER trg_sys_log_no_update
BEFORE UPDATE ON sys_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log update is forbidden';
END$$

CREATE TRIGGER trg_sys_audit_log_no_delete
BEFORE DELETE ON sys_audit_log
FOR EACH ROW
BEGIN
    IF COALESCE(@cloudflow_audit_archive_allow_delete, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_audit_log delete is forbidden';
    END IF;
END$$

CREATE TRIGGER trg_sys_audit_log_no_update
BEFORE UPDATE ON sys_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_audit_log update is forbidden';
END$$

DELIMITER ;

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

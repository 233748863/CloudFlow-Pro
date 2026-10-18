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
  package_id        BIGINT(20)      DEFAULT NULL COMMENT '租户套餐ID，空保留既有授权行为',
  package_version   INT             DEFAULT NULL COMMENT '已应用套餐版本',
  package_override  JSON            DEFAULT NULL COMMENT '明确的增减菜单和配额覆盖，不被套餐同步静默覆盖',
  effective_menu_ids JSON           DEFAULT NULL COMMENT '套餐及覆盖合成后的服务器功能上限',
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

DROP TABLE IF EXISTS sys_tenant_package;
CREATE TABLE sys_tenant_package (
  package_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '租户套餐ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '平台管理租户ID，非被授权租户',
  package_code VARCHAR(64) NOT NULL COMMENT '套餐编码',
  package_name VARCHAR(100) NOT NULL COMMENT '套餐名称',
  menu_ids JSON NOT NULL COMMENT '已校验的菜单及按钮ID集合',
  max_users INT NOT NULL COMMENT '用户数量配额',
  max_storage_mb BIGINT(20) NOT NULL COMMENT '存储配额MB，与现有租户字段单位一致',
  enabled_modules JSON NOT NULL COMMENT 'WORKFLOW或OA或CRM或HR模块集合',
  price DECIMAL(14,2) NOT NULL DEFAULT 0 COMMENT '展示价格，不创建自动扣费',
  billing_cycle VARCHAR(20) NOT NULL DEFAULT 'NONE' COMMENT 'NONE或MONTHLY或YEARLY',
  sort_no INT NOT NULL DEFAULT 0 COMMENT '排序',
  status VARCHAR(20) NOT NULL DEFAULT 'DRAFT' COMMENT 'DRAFT或ACTIVE或DISABLED',
  remark VARCHAR(500) DEFAULT NULL COMMENT '备注',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '套餐版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (package_id),
  UNIQUE KEY uk_tenant_package_code (tenant_id, package_code),
  CONSTRAINT chk_tenant_package_limits CHECK (max_users > 0 AND max_storage_mb > 0 AND price >= 0)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='平台维护的租户功能及容量套餐';

DROP TABLE IF EXISTS sys_tenant_package_sync;
CREATE TABLE sys_tenant_package_sync (
  sync_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '套餐同步批次ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '平台管理租户ID',
  package_id BIGINT(20) NOT NULL COMMENT '套餐ID',
  package_version INT NOT NULL COMMENT '预览时套餐版本',
  target_tenant_ids JSON NOT NULL COMMENT '明确的目标租户集合',
  preview_hash CHAR(64) NOT NULL COMMENT '预览差异及目标版本摘要',
  preview_expire_time DATETIME NOT NULL COMMENT '预览确认有效期',
  requested_by BIGINT(20) NOT NULL COMMENT '发起平台用户ID',
  confirmed_time DATETIME DEFAULT NULL COMMENT '二次确认时间',
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED' COMMENT 'PREVIEWED或RUNNING或COMPLETED或PARTIAL或CANCELLED',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (sync_id),
  KEY idx_package_sync (tenant_id, package_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='套餐批量变更的预览和确认批次';

DROP TABLE IF EXISTS sys_tenant_package_sync_item;
CREATE TABLE sys_tenant_package_sync_item (
  item_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '套餐同步租户项ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '平台管理租户ID',
  sync_id BIGINT(20) NOT NULL COMMENT '同步批次ID',
  target_tenant_id BIGINT(20) NOT NULL COMMENT '目标租户ID',
  expected_version INT NOT NULL COMMENT '预览时目标租户版本',
  before_snapshot JSON NOT NULL COMMENT '原菜单配额和个别覆盖快照',
  proposed_snapshot JSON NOT NULL COMMENT '拟同步菜单配额及保留覆盖结果',
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED' COMMENT 'PREVIEWED或APPLIED或CONFLICT或FAILED',
  error_code VARCHAR(64) DEFAULT NULL COMMENT '失败原因码，无密钥信息',
  applied_time DATETIME DEFAULT NULL COMMENT '实际生效时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_package_sync_tenant (tenant_id, sync_id, target_tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='可恢复且逐租户审计的套餐变更结果';

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
  holiday_calendar_id BIGINT(20)    DEFAULT NULL COMMENT '节假日日历ID（空=继承租户默认）',
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
  nick_name         VARCHAR(100)    NOT NULL COMMENT '用户昵称',
  email             VARCHAR(254)    DEFAULT '' COMMENT '用户邮箱',
  phonenumber       VARCHAR(16)     DEFAULT '' COMMENT '手机号码',
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

DROP TABLE IF EXISTS sys_user_totp;
CREATE TABLE sys_user_totp (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  secret_ciphertext VARCHAR(512)    NOT NULL COMMENT 'TOTP密钥密文（AES-GCM）',
  enabled           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否启用（0否 1是）',
  enabled_at        DATETIME        DEFAULT NULL COMMENT '启用时间',
  last_used_step    BIGINT(20)      DEFAULT NULL COMMENT '最近一次验证通过的时间步（防重放，RFC 6238 §5.2）',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_user_totp_tenant_user (tenant_id, user_id),
  KEY idx_user_totp_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户双因素认证表';

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
  PRIMARY KEY (menu_id),
  KEY idx_sys_menu_perms (perms)
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
  storage_type      VARCHAR(20)     DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS/MINIO/S3/COS）',
  file_size         BIGINT(20)      DEFAULT 0  COMMENT '文件大小',
  file_type         VARCHAR(50)     DEFAULT '' COMMENT '文件类型',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '上传者',
  create_time       DATETIME        COMMENT '上传时间',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除(0=未删除 1=已删除)',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  config_id         BIGINT(20) DEFAULT NULL COMMENT '所用存储配置ID',
  file_hash         VARCHAR(64) DEFAULT NULL COMMENT 'SHA256（去重用）',
  bucket            VARCHAR(100) DEFAULT NULL COMMENT '桶名',
  object_key        VARCHAR(500) DEFAULT NULL COMMENT '对象键',
  access_type       VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' COMMENT '访问类型（PRIVATE/PUBLIC）',
  biz_type          VARCHAR(50) DEFAULT NULL COMMENT '业务类型（权限校验分派用）',
  biz_id            VARCHAR(64) DEFAULT NULL COMMENT '业务ID',
  portal_owner_id   BIGINT(20) DEFAULT NULL COMMENT '门户上传者ID，不能作为内部用户ID解释',
  ref_count         INT NOT NULL DEFAULT 1 COMMENT '引用计数（去重后多处引用）',
  PRIMARY KEY (file_id),
  KEY idx_file_tenant (tenant_id),
  KEY idx_sf_hash (tenant_id, file_hash),
  KEY idx_sf_biz (tenant_id, biz_type, biz_id),
  KEY idx_file_portal_owner (tenant_id, portal_owner_id)
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
  trace_id          VARCHAR(64) DEFAULT NULL COMMENT '链路追踪ID',
  service_name      VARCHAR(64) DEFAULT NULL COMMENT '服务名',
  request_method    VARCHAR(10) DEFAULT NULL COMMENT '请求方法',
  request_url       VARCHAR(500) DEFAULT NULL COMMENT '请求URL（敏感参数已脱敏）',
  duration_ms       BIGINT(20) DEFAULT NULL COMMENT '请求耗时（毫秒）',
  result_code       INT DEFAULT NULL COMMENT '业务响应码（无业务响应体时为空）',
  client_ip         VARCHAR(64) DEFAULT NULL COMMENT '客户端IP',
  slow_flag         TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否慢请求（0否1是）',
  PRIMARY KEY (log_id),
  KEY idx_log_tenant (tenant_id),
  KEY idx_log_type (log_type),
  KEY idx_log_create_time (create_time),
  KEY idx_log_trace (tenant_id, trace_id),
  KEY idx_log_slow (tenant_id, slow_flag, create_time),
  KEY idx_log_service (tenant_id, service_name, create_time)
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
  status          VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT '状态(PENDING/PUBLISHED/FAILED)',
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
  config_type       CHAR(1)         DEFAULT 'N' COMMENT '系统内置（Y是 N否）(Y/N)',
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
  business_type     VARCHAR(64)     NOT NULL COMMENT '业务类型(BUDGET)',
  business_id       BIGINT(20)      DEFAULT NULL COMMENT '业务ID',
  threshold_value   DECIMAL(18,2)   DEFAULT NULL COMMENT '阈值',
  actual_value      DECIMAL(18,2)   DEFAULT NULL COMMENT '实际值',
  effect            VARCHAR(16)     NOT NULL COMMENT '命中效果',
  hit_result        VARCHAR(16)     NOT NULL COMMENT '处理结果(PASSED/REJECTED/BLOCK/ALERT/WARN)',
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
  tpl_category      VARCHAR(20)     NOT NULL DEFAULT 'CRUD' COMMENT '模板类型：CRUD/TREE/SUB/INNER/HR_TYPED',
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
  record_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id           BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  trace_id            VARCHAR(64)     DEFAULT NULL COMMENT '链路追踪ID',
  template_code       VARCHAR(100)    DEFAULT NULL COMMENT '模板编码',
  channel_type        VARCHAR(20)     NOT NULL COMMENT '渠道类型',
  channel_id          BIGINT(20)      DEFAULT NULL COMMENT '实际使用渠道ID',
  receiver_type       VARCHAR(20)     NOT NULL COMMENT '接收方类型：USER/PHONE/EMAIL/ROLE/DEPT',
  receiver_id         BIGINT(20)      DEFAULT NULL COMMENT '接收人用户ID',
  receiver_addr_mask  VARCHAR(200)    DEFAULT NULL COMMENT '接收地址（脱敏展示值）',
  receiver_addr_cipher VARCHAR(500)   DEFAULT NULL COMMENT '接收地址（加密存储完整值）',
  receiver_name       VARCHAR(100)    DEFAULT NULL COMMENT '接收人名称',
  title               VARCHAR(500)    DEFAULT NULL COMMENT '消息标题',
  content             TEXT            DEFAULT NULL COMMENT '消息内容',
  message_category    VARCHAR(30)     NOT NULL DEFAULT 'SYSTEM' COMMENT '消息分类',
  biz_type            VARCHAR(50)     DEFAULT NULL COMMENT '业务类型',
  biz_id              VARCHAR(64)     DEFAULT NULL COMMENT '业务ID',
  link_url            VARCHAR(500)    DEFAULT NULL COMMENT '跳转链接',
  send_status         VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT '发送状态：PENDING/SENDING/SUCCESS/FAILED/CANCELLED/SKIPPED',
  skip_reason         VARCHAR(30)     DEFAULT NULL COMMENT '跳过原因：UNSUBSCRIBED/QUIET_HOURS/DEDUPED/NO_CHANNEL/NOT_IMPLEMENTED',
  retry_count         INT             NOT NULL DEFAULT 0 COMMENT '已重试次数',
  error_msg           VARCHAR(1000)   DEFAULT NULL COMMENT '错误信息',
  send_time           DATETIME        DEFAULT NULL COMMENT '发送时间',
  read_flag           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否已读',
  read_time           DATETIME        DEFAULT NULL COMMENT '已读时间',
  resend_from_id      BIGINT(20)      DEFAULT NULL COMMENT '重发来源记录ID',
  outbox_event_id     VARCHAR(64)     DEFAULT NULL COMMENT '关联outbox事件ID（幂等键）',
  create_by           VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time         DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by           VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time         DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (record_id),
  UNIQUE KEY uk_msg_rec_outbox (outbox_event_id, channel_type, receiver_id),
  KEY idx_msg_rec_receiver (tenant_id, receiver_id, read_flag, create_time),
  KEY idx_msg_rec_status (send_status, create_time),
  KEY idx_msg_rec_biz (biz_type, biz_id),
  KEY idx_msg_rec_trace (trace_id),
  KEY idx_msg_rec_category (tenant_id, receiver_id, message_category, read_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='消息发送记录表';

DROP TABLE IF EXISTS sys_message_delivery;
CREATE TABLE sys_message_delivery (
  delivery_id        BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '外发投递占位ID',
  tenant_id          BIGINT(20) NOT NULL COMMENT '租户ID',
  record_id          BIGINT(20) NOT NULL COMMENT '统一消息记录ID',
  outbox_event_id    VARCHAR(64) NOT NULL COMMENT '来源业务事件ID',
  channel_type       VARCHAR(20) NOT NULL COMMENT '消息渠道',
  receiver_key       CHAR(64) NOT NULL COMMENT '收件人类型及规范化身份哈希',
  payload_hash       CHAR(64) NOT NULL COMMENT '同源内容一致性摘要',
  payload_encrypted MEDIUMTEXT DEFAULT NULL COMMENT '含敏感链接变量的加密发送载荷，普通记录仅留脱敏正文',
  status             VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或CLAIMED或SENDING或SENT或RETRYABLE或FAILED或UNKNOWN或SKIPPED或CANCELLED',
  claim_owner        VARCHAR(64) DEFAULT NULL COMMENT '发送执行者标识',
  claim_until        DATETIME DEFAULT NULL COMMENT '占位租约截止时间',
  send_started_time DATETIME DEFAULT NULL COMMENT '开始外发时间，之后崩溃不得盲重试',
  attempt_count      INT NOT NULL DEFAULT 0 COMMENT '实际尝试次数',
  next_attempt_time DATETIME DEFAULT NULL COMMENT '确定可安全重试的下次时间',
  provider_message_id VARCHAR(255) DEFAULT NULL COMMENT '稳定的SMTP Message-ID或提供商请求标识',
  accepted_time      DATETIME DEFAULT NULL COMMENT '提供商确认接纳时间，不等于收件箱送达',
  bounced_time       DATETIME DEFAULT NULL COMMENT 'SMTP明确同步拒收时间，不推断异步退信',
  last_error_code   VARCHAR(64) DEFAULT NULL COMMENT '脱敏失败原因码',
  resolved_by       BIGINT(20) DEFAULT NULL COMMENT '结果未明的人工核验人',
  resolution_reason VARCHAR(1000) DEFAULT NULL COMMENT '服务商查询或人工核验依据',
  version            INT NOT NULL DEFAULT 0 COMMENT '状态竞争版本',
  create_by          VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by          VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (delivery_id),
  UNIQUE KEY uk_message_delivery_receiver (tenant_id, outbox_event_id, channel_type, receiver_key),
  UNIQUE KEY uk_message_delivery_record (tenant_id, record_id),
  KEY idx_message_delivery_due (status, next_attempt_time, claim_until),
  KEY idx_message_delivery_provider (tenant_id, provider_message_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='先持久占位后外发且保留结果未明状态的投递记录';

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

DROP TRIGGER IF EXISTS trg_sys_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_log_no_update;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_update;

DELIMITER $$

CREATE TRIGGER trg_sys_log_no_delete
BEFORE DELETE ON sys_log
FOR EACH ROW
BEGIN
    IF COALESCE(@cloudflow_observability_archive_allow_delete, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log delete is forbidden';
    END IF;
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

DROP TABLE IF EXISTS sys_file_config;
CREATE TABLE sys_file_config (
  config_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID（0为平台级）',
  config_code       VARCHAR(50)     NOT NULL COMMENT '配置编码',
  config_name       VARCHAR(100)    NOT NULL COMMENT '配置名称',
  storage_type      VARCHAR(20)     NOT NULL COMMENT '存储类型（LOCAL/MINIO/S3/OSS/COS）',
  master_flag       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否主用（0否1是）',
  endpoint          VARCHAR(300)    DEFAULT NULL COMMENT '端点',
  region            VARCHAR(50)     DEFAULT NULL COMMENT '区域',
  bucket            VARCHAR(100)    DEFAULT NULL COMMENT '桶名',
  access_key        VARCHAR(200)    DEFAULT NULL COMMENT 'AccessKey',
  secret_key_cipher VARCHAR(500)    DEFAULT NULL COMMENT 'SecretKey（加密存储）',
  base_path         VARCHAR(300)    DEFAULT NULL COMMENT '基础路径',
  domain            VARCHAR(300)    DEFAULT NULL COMMENT '访问域名',
  max_file_size     BIGINT(20)      DEFAULT 52428800 COMMENT '单文件上限（字节，默认50MiB）',
  allowed_extensions VARCHAR(1000)  DEFAULT NULL COMMENT '允许扩展名（逗号分隔，空为系统默认白名单）',
  signed_url_expire_seconds INT     NOT NULL DEFAULT 300 COMMENT '签名URL有效期（秒）',
  access_policy     VARCHAR(10)     NOT NULL DEFAULT '0' COMMENT '访问策略（0私有1公共读2自定义，非LOCAL强制为0）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态（ENABLED/DISABLED）',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除（0未删除1已删除）',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本号',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_sfc_code (tenant_id, config_code),
  KEY idx_sfc_master (tenant_id, master_flag, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件存储配置表';

DROP TABLE IF EXISTS sys_api_error_log;
CREATE TABLE sys_api_error_log (
  error_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  trace_id          VARCHAR(64)     DEFAULT NULL COMMENT '链路追踪ID',
  service_name      VARCHAR(50)     DEFAULT NULL COMMENT '服务名',
  user_id           BIGINT(20)      DEFAULT NULL COMMENT '用户ID',
  user_name         VARCHAR(64)     DEFAULT NULL COMMENT '用户名',
  request_method    VARCHAR(10)     DEFAULT NULL COMMENT '请求方法',
  request_url       VARCHAR(500)    DEFAULT NULL COMMENT '请求URL（敏感参数已脱敏）',
  request_params    TEXT            DEFAULT NULL COMMENT '请求参数（已脱敏）',
  exception_class   VARCHAR(200)    DEFAULT NULL COMMENT '异常类',
  exception_message VARCHAR(2000)   DEFAULT NULL COMMENT '异常消息（已脱敏）',
  exception_stack   TEXT            DEFAULT NULL COMMENT '异常栈（已脱敏）',
  client_ip         VARCHAR(64)     DEFAULT NULL COMMENT '客户端IP',
  user_agent        VARCHAR(500)    DEFAULT NULL COMMENT 'UserAgent',
  occur_time        DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '发生时间',
  process_status    VARCHAR(20)     NOT NULL DEFAULT 'TODO' COMMENT '处理状态（TODO/PROCESSING/DONE/IGNORED）',
  process_by        VARCHAR(64)     DEFAULT NULL COMMENT '处理人',
  process_time      DATETIME        DEFAULT NULL COMMENT '处理时间',
  process_remark    VARCHAR(500)    DEFAULT NULL COMMENT '处理说明',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (error_id),
  KEY idx_sael_trace (tenant_id, trace_id),
  KEY idx_sael_time (occur_time),
  KEY idx_sael_status (tenant_id, process_status, occur_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='API错误日志表';

DROP TABLE IF EXISTS sys_import_task;
CREATE TABLE sys_import_task (
  task_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  task_no           VARCHAR(64)     NOT NULL COMMENT '任务编号（租户内唯一）',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '导入业务类型',
  biz_name          VARCHAR(100)    NOT NULL COMMENT '导入业务名称快照',
  file_name         VARCHAR(255)    NOT NULL COMMENT '原始文件名',
  file_url          VARCHAR(500)    NOT NULL COMMENT '原文件持久引用（sys_file，非签名URL）',
  file_size         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '原文件大小（字节）',
  total_rows        INT             NOT NULL DEFAULT 0 COMMENT '总数据行数（不含表头）',
  valid_rows        INT             NOT NULL DEFAULT 0 COMMENT '校验通过行数',
  invalid_rows      INT             NOT NULL DEFAULT 0 COMMENT '校验失败行数',
  success_rows      INT             NOT NULL DEFAULT 0 COMMENT '导入成功行数',
  fail_rows         INT             NOT NULL DEFAULT 0 COMMENT '导入失败行数',
  status            VARCHAR(20)     NOT NULL DEFAULT 'UPLOADED' COMMENT '任务状态（UPLOADED/VALIDATING/VALIDATED/IMPORTING/SUCCESS/PARTIAL/FAILED/CANCELLED）',
  error_file_url    VARCHAR(500)    DEFAULT NULL COMMENT '错误标注文件持久引用（sys_file，非签名URL）',
  operator_id       BIGINT(20)      NOT NULL COMMENT '操作人ID',
  operator_name     VARCHAR(64)     NOT NULL COMMENT '操作人姓名快照',
  start_time        DATETIME        DEFAULT NULL COMMENT '任务开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '任务结束时间',
  duration_ms       BIGINT(20)      DEFAULT NULL COMMENT '任务耗时（毫秒，未开始时为空）',
  error_message     VARCHAR(2000)   DEFAULT NULL COMMENT '整体错误信息（已脱敏）',
  job_log_id        BIGINT(20)      DEFAULT NULL COMMENT '异步执行关联的sys_job_log主键',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (task_id),
  UNIQUE KEY uk_sit_no (tenant_id, task_no),
  KEY idx_sit_biz (tenant_id, biz_type, status, create_time),
  KEY idx_sit_operator (tenant_id, operator_id, create_time),
  KEY idx_sit_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='Excel导入任务表';

DROP TABLE IF EXISTS sys_import_error;
CREATE TABLE sys_import_error (
  error_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID（与所属导入任务一致）',
  task_id           BIGINT(20)      NOT NULL COMMENT '所属导入任务ID',
  row_no            INT             NOT NULL COMMENT 'Excel原始行号（从1开始，包含表头位置）',
  column_name       VARCHAR(100)    DEFAULT NULL COMMENT '错误列名（整行错误时为空）',
  cell_value        MEDIUMTEXT      DEFAULT NULL COMMENT '单元格原始值',
  error_type        VARCHAR(20)     NOT NULL COMMENT '错误类型（REQUIRED/FORMAT/RANGE/DUPLICATE/REFERENCE/BUSINESS）',
  error_message     VARCHAR(2000)   NOT NULL COMMENT '错误说明',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (error_id),
  KEY idx_sie_task (tenant_id, task_id, row_no, error_id),
  KEY idx_sie_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='Excel导入错误明细表';

DROP TABLE IF EXISTS sys_print_template;
CREATE TABLE sys_print_template (
  template_id       BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_code     VARCHAR(50)     NOT NULL COMMENT '模板编码（租户内唯一）',
  template_name     VARCHAR(100)    NOT NULL COMMENT '模板名称',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '打印业务类型',
  template_format   VARCHAR(20)     NOT NULL DEFAULT 'HTML' COMMENT '模板格式（HTML/EXCEL）',
  output_format     VARCHAR(20)     NOT NULL DEFAULT 'PDF' COMMENT '输出格式（PDF/EXCEL/HTML）',
  template_content  LONGTEXT        DEFAULT NULL COMMENT 'HTML模板内容（EXCEL时为空）',
  template_file_url VARCHAR(500)    DEFAULT NULL COMMENT 'EXCEL模板持久引用（sys_file，HTML时为空）',
  paper_size        VARCHAR(20)     NOT NULL DEFAULT 'A4' COMMENT '纸张规格（A4/A5/LETTER/CUSTOM）',
  orientation       VARCHAR(20)     NOT NULL DEFAULT 'PORTRAIT' COMMENT '方向（PORTRAIT纵向/LANDSCAPE横向）',
  paper_width_mm    DECIMAL(6,2)    DEFAULT NULL COMMENT '自定义纸张基础宽度（mm，仅CUSTOM必填）',
  paper_height_mm   DECIMAL(6,2)    DEFAULT NULL COMMENT '自定义纸张基础高度（mm，仅CUSTOM必填）',
  margin_top        DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '上边距（mm）',
  margin_bottom     DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '下边距（mm）',
  margin_left       DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '左边距（mm）',
  margin_right      DECIMAL(6,2)    NOT NULL DEFAULT 10.00 COMMENT '右边距（mm）',
  variables_declare JSON            DEFAULT NULL COMMENT '可用变量声明（JSON，仅作配置参考）',
  default_flag      TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否该业务类型默认模板（0否1是）',
  version           INT             NOT NULL DEFAULT 0 COMMENT '模板修订及乐观锁版本号（修改递增）',
  status            VARCHAR(20)     NOT NULL DEFAULT 'ENABLED' COMMENT '状态（ENABLED/DISABLED）',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除（0未删除1已删除）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (template_id),
  UNIQUE KEY uk_spt_code (tenant_id, template_code),
  KEY idx_spt_biz (tenant_id, biz_type, status, default_flag)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打印模板配置表';

DROP TABLE IF EXISTS sys_print_record;
CREATE TABLE sys_print_record (
  record_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      NOT NULL DEFAULT 100000 COMMENT '租户ID',
  template_id       BIGINT(20)      NOT NULL COMMENT '打印模板ID',
  template_code     VARCHAR(50)     NOT NULL COMMENT '打印时模板编码快照',
  biz_type          VARCHAR(50)     NOT NULL COMMENT '打印业务类型',
  biz_id            VARCHAR(64)     NOT NULL COMMENT '被打印业务记录ID',
  output_format     VARCHAR(20)     NOT NULL COMMENT '实际输出格式（PDF/EXCEL/HTML）',
  file_url          VARCHAR(500)    DEFAULT NULL COMMENT '输出文件持久引用（sys_file，直接流式返回时可为空）',
  operator_id       BIGINT(20)      NOT NULL COMMENT '打印操作人ID',
  operator_name     VARCHAR(64)     NOT NULL COMMENT '打印操作人姓名快照',
  print_time        DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '打印时间',
  ip_address        VARCHAR(45)     DEFAULT NULL COMMENT '服务端采集的来源IP（支持IPv4和IPv6）',
  file_size         BIGINT(20)      NOT NULL DEFAULT 0 COMMENT '生成文件大小（字节）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (record_id),
  KEY idx_spr_biz (tenant_id, biz_type, biz_id, print_time),
  KEY idx_spr_template (tenant_id, template_id, print_time),
  KEY idx_spr_operator (tenant_id, operator_id, print_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='打印记录表';

DROP TABLE IF EXISTS sys_portal_user;
CREATE TABLE sys_portal_user (
  portal_user_id    BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '外部门户用户ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '租户ID',
  user_type         VARCHAR(30)     NOT NULL COMMENT 'CUSTOMER_CONTACT，本期仅保留SUPPLIER_CONTACT扩展类型',
  ref_biz_type      VARCHAR(30)     NOT NULL COMMENT 'CRM_CONTACT，本期只启用客户联系人',
  ref_biz_id        BIGINT(20)      NOT NULL COMMENT '可信邀请绑定的联系人ID',
  customer_id       BIGINT(20)      NOT NULL COMMENT '经CRM核验所属客户ID',
  login_account     VARCHAR(100)    NOT NULL COMMENT '租户内规范化登录账号',
  password_hash     VARCHAR(255)    DEFAULT NULL COMMENT '加盐密码哈希，未激活时可为空',
  email             VARCHAR(254)    NOT NULL COMMENT '邀请及验证邮箱',
  phone             VARCHAR(32)     DEFAULT NULL COMMENT '联系电话',
  status            VARCHAR(20)     NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或ACTIVE或DISABLED或LOCKED',
  last_login_time   DATETIME        DEFAULT NULL COMMENT '上次登录时间',
  last_login_ip     VARCHAR(64)     DEFAULT NULL COMMENT '上次登录IP',
  fail_count        INT             NOT NULL DEFAULT 0 COMMENT '连续失败次数',
  locked_until      DATETIME        DEFAULT NULL COMMENT '锁定截止时间',
  activate_token_hash CHAR(64)      DEFAULT NULL COMMENT '激活令牌SHA256，不存明文',
  activate_expire_time DATETIME     DEFAULT NULL COMMENT '激活令牌失效时间',
  activate_consumed_time DATETIME   DEFAULT NULL COMMENT '激活令牌使用时间',
  session_version   INT             NOT NULL DEFAULT 0 COMMENT '禁用或重设密码后的会话撤销版本',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version           INT             NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (portal_user_id),
  UNIQUE KEY uk_portal_account (tenant_id, login_account),
  UNIQUE KEY uk_portal_contact (tenant_id, ref_biz_type, ref_biz_id),
  UNIQUE KEY uk_portal_activation (activate_token_hash),
  CONSTRAINT chk_portal_active_password CHECK (status <> 'ACTIVE' OR password_hash IS NOT NULL)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='与内部账号隔离的客户门户账号';

DROP TABLE IF EXISTS sys_data_source_config;
CREATE TABLE sys_data_source_config (
  config_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '数据源配置ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '平台管理租户ID',
  config_name       VARCHAR(100)    NOT NULL COMMENT '配置名称',
  ds_key            VARCHAR(64)     NOT NULL COMMENT '注册键，禁止覆盖主数据源',
  url               VARCHAR(1000)   NOT NULL COMMENT '白名单MySQL JDBC地址，不接受查询参数',
  driver_class      VARCHAR(100)    NOT NULL DEFAULT 'com.mysql.cj.jdbc.Driver' COMMENT '只允许已安装的MySQL驱动',
  username          VARCHAR(100)    NOT NULL COMMENT '独立数据库用户名',
  password_encrypted VARCHAR(2000)  NOT NULL COMMENT '带随机IV及认证标签的加密密码',
  init_size         INT             NOT NULL DEFAULT 0 COMMENT '初始连接数',
  max_active        INT             NOT NULL DEFAULT 5 COMMENT '最大连接数',
  target_services   JSON            NOT NULL COMMENT '获准接收配置的服务名集合',
  status            VARCHAR(20)     NOT NULL DEFAULT 'DISABLED' COMMENT 'DISABLED或ENABLED',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '用途说明',
  deleted           TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version           INT             NOT NULL DEFAULT 0 COMMENT '配置版本',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_data_source_key (tenant_id, ds_key),
  CONSTRAINT chk_data_source_pool CHECK (init_size >= 0 AND max_active BETWEEN 1 AND 20 AND init_size <= max_active)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='受平台超管和网络白名单控制的运行时数据源';

DROP TABLE IF EXISTS sys_data_source_registration;
CREATE TABLE sys_data_source_registration (
  registration_id   BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '服务实例注册结果ID',
  tenant_id         BIGINT(20)      NOT NULL COMMENT '平台管理租户ID',
  config_id         BIGINT(20)      NOT NULL COMMENT '数据源配置ID',
  service_name      VARCHAR(64)     NOT NULL COMMENT '服务注册名',
  instance_key      VARCHAR(128)    NOT NULL COMMENT '服务发现实例标识',
  applied_version   INT             NOT NULL COMMENT '该实例实际采用版本',
  status            VARCHAR(20)     NOT NULL COMMENT 'ACTIVE或DISABLED或FAILED或STALE',
  error_code        VARCHAR(64)     DEFAULT NULL COMMENT '错误码，不记录完整异常连接信息',
  checked_time      DATETIME        NOT NULL COMMENT '最后核验时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (registration_id),
  UNIQUE KEY uk_data_source_instance (tenant_id, config_id, service_name, instance_key)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='多实例数据源动态注册的真实结果';


DROP TABLE IF EXISTS sys_oauth2_client;
CREATE TABLE sys_oauth2_client (
  client_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '客户端内部ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '客户端所属租户',
  client_key VARCHAR(64) NOT NULL COMMENT 'OAuth协议中的公开client_id',
  client_secret_encrypted VARCHAR(2000) DEFAULT NULL COMMENT '机密客户端密钥加密值，公共客户端为空',
  client_type VARCHAR(20) NOT NULL COMMENT 'PUBLIC或CONFIDENTIAL',
  client_name VARCHAR(100) NOT NULL COMMENT '客户端名称',
  logo_file_id BIGINT(20) DEFAULT NULL COMMENT '已核验图片文件ID',
  description VARCHAR(1000) DEFAULT NULL COMMENT '用途说明',
  service_user_id BIGINT(20) DEFAULT NULL COMMENT '客户端凭据模式专用内部服务账号，不能自动提权',
  access_token_validity_seconds INT NOT NULL DEFAULT 900 COMMENT '访问令牌有效秒数',
  refresh_token_validity_seconds INT NOT NULL DEFAULT 604800 COMMENT '刷新令牌有效秒数',
  redirect_uris JSON NOT NULL COMMENT '精确匹配的回调URI集合',
  grant_types JSON NOT NULL COMMENT 'authorization_code或client_credentials',
  scopes JSON NOT NULL COMMENT '获准申请的服务器注册scope集合',
  auto_approve_scopes JSON DEFAULT NULL COMMENT '受限自动同意scope子集，默认空',
  authorities JSON DEFAULT NULL COMMENT '注册资源权限上限，禁止任意角色或星号',
  resource_ids JSON DEFAULT NULL COMMENT '允许的有限资源接口集合',
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED' COMMENT 'DISABLED或ACTIVE',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '客户端策略版本，变化可使既有令牌失效',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (client_id),
  UNIQUE KEY uk_oauth_client_key (client_key),
  CONSTRAINT chk_oauth_client_secret CHECK ((client_type = 'PUBLIC' AND client_secret_encrypted IS NULL) OR (client_type = 'CONFIDENTIAL' AND client_secret_encrypted IS NOT NULL)),
  CONSTRAINT chk_oauth_client_ttl CHECK (access_token_validity_seconds BETWEEN 60 AND 3600 AND refresh_token_validity_seconds BETWEEN 3600 AND 2592000)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='有限授权模式的OAuth2客户端';


DROP TABLE IF EXISTS sys_oauth2_code;
CREATE TABLE sys_oauth2_code (
  code_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '授权请求及授权码ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  client_id BIGINT(20) NOT NULL COMMENT '客户端内部ID',
  user_id BIGINT(20) NOT NULL COMMENT '当前内部授权用户ID',
  request_hash CHAR(64) NOT NULL COMMENT '浏览器授权事务随机令牌哈希',
  session_binding_hash CHAR(64) NOT NULL COMMENT '绑定当前内部登录会话的哈希',
  code_hash CHAR(64) DEFAULT NULL COMMENT '授权码SHA256，仅同意后生成',
  redirect_uri VARCHAR(1000) NOT NULL COMMENT '经过精确匹配的回调URI',
  requested_scopes JSON NOT NULL COMMENT '本次申请scope集合',
  approved_scopes JSON DEFAULT NULL COMMENT '实际同意scope集合',
  state_value VARCHAR(1024) DEFAULT NULL COMMENT '原样回传的不透明state，不写入日志',
  code_challenge VARCHAR(128) NOT NULL COMMENT 'PKCE S256挑战值',
  code_challenge_method VARCHAR(10) NOT NULL DEFAULT 'S256' COMMENT '只接受S256',
  client_version INT NOT NULL COMMENT '申请时客户端策略版本',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或ISSUED或USED或DENIED',
  expires_time DATETIME NOT NULL COMMENT '授权事务或签发后授权码的截止时间',
  consumed_time DATETIME DEFAULT NULL COMMENT '成功兑换授权码时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (code_id),
  UNIQUE KEY uk_oauth_request_hash (request_hash),
  UNIQUE KEY uk_oauth_code_hash (code_hash),
  KEY idx_oauth_code_expire (tenant_id, status, expires_time),
  CONSTRAINT chk_oauth_pkce_method CHECK (code_challenge_method = 'S256')
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='绑定浏览器会话的授权确认与一次性授权码';


DROP TABLE IF EXISTS sys_oauth2_access_token;
CREATE TABLE sys_oauth2_access_token (
  access_token_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '访问令牌记录ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  client_id BIGINT(20) NOT NULL COMMENT '客户端内部ID',
  user_id BIGINT(20) NOT NULL COMMENT '授权用户或专用服务账号ID',
  token_hash CHAR(64) NOT NULL COMMENT '访问令牌SHA256，不存明文',
  grant_type VARCHAR(30) NOT NULL COMMENT 'authorization_code或client_credentials',
  scopes JSON NOT NULL COMMENT '实际授权scope子集',
  client_version INT NOT NULL COMMENT '签发时客户端策略版本',
  refresh_family_id VARCHAR(64) DEFAULT NULL COMMENT '所属刷新令牌族ID',
  issued_time DATETIME NOT NULL COMMENT '签发时间',
  expires_time DATETIME NOT NULL COMMENT '过期时间',
  revoked_time DATETIME DEFAULT NULL COMMENT '撤销时间',
  revoke_reason VARCHAR(100) DEFAULT NULL COMMENT '撤销原因码',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (access_token_id),
  UNIQUE KEY uk_oauth_access_hash (token_hash),
  KEY idx_oauth_access_client_user (tenant_id, client_id, user_id),
  KEY idx_oauth_access_family (tenant_id, refresh_family_id),
  CONSTRAINT chk_oauth_access_time CHECK (expires_time > issued_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='仅保存哈希的OAuth2访问令牌';


DROP TABLE IF EXISTS sys_oauth2_refresh_token;
CREATE TABLE sys_oauth2_refresh_token (
  refresh_token_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '刷新令牌记录ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  client_id BIGINT(20) NOT NULL COMMENT '客户端内部ID',
  user_id BIGINT(20) NOT NULL COMMENT '授权用户ID',
  token_hash CHAR(64) NOT NULL COMMENT '刷新令牌SHA256，不存明文',
  family_id VARCHAR(64) NOT NULL COMMENT '刷新令牌族ID',
  scopes JSON NOT NULL COMMENT '不能在刷新时扩大scope',
  client_version INT NOT NULL COMMENT '客户端策略版本',
  previous_token_id BIGINT(20) DEFAULT NULL COMMENT '轮换前令牌ID',
  replaced_by_id BIGINT(20) DEFAULT NULL COMMENT '轮换后令牌ID',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE或USED或REVOKED',
  issued_time DATETIME NOT NULL COMMENT '签发时间',
  expires_time DATETIME NOT NULL COMMENT '有效期',
  consumed_time DATETIME DEFAULT NULL COMMENT '轮换时间',
  revoked_time DATETIME DEFAULT NULL COMMENT '撤销时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (refresh_token_id),
  UNIQUE KEY uk_oauth_refresh_hash (token_hash),
  UNIQUE KEY uk_oauth_refresh_previous (tenant_id, previous_token_id),
  KEY idx_oauth_refresh_family (tenant_id, family_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='一次性轮换且能整族撤销的刷新令牌';


DROP TABLE IF EXISTS sys_oauth2_approve;
CREATE TABLE sys_oauth2_approve (
  approve_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '用户授权同意记录ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  client_id BIGINT(20) NOT NULL COMMENT '客户端内部ID',
  user_id BIGINT(20) NOT NULL COMMENT '授权用户ID',
  scopes JSON NOT NULL COMMENT '当前明确同意scope集合',
  client_version INT NOT NULL COMMENT '确认时客户端策略版本',
  approved_time DATETIME NOT NULL COMMENT '同意时间',
  expires_time DATETIME NOT NULL COMMENT '同意有效期',
  revoked_time DATETIME DEFAULT NULL COMMENT '撤回同意时间',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (approve_id),
  UNIQUE KEY uk_oauth_approve (tenant_id, client_id, user_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户对客户端的可撤销授权同意';

DROP TABLE IF EXISTS sys_report_dataset;
CREATE TABLE sys_report_dataset (
  dataset_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '预置报表数据集ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  dataset_code VARCHAR(64) NOT NULL COMMENT '服务器注册的数据集编码',
  dataset_name VARCHAR(100) NOT NULL COMMENT '数据集名称',
  module VARCHAR(20) NOT NULL COMMENT 'system或oa或crm或hr或workflow',
  mapper_method VARCHAR(200) NOT NULL COMMENT '服务器注册映射名，仅展示不可自由填写或反射执行',
  field_meta JSON NOT NULL COMMENT '固定字段类型、维度、度量、过滤及权限白名单',
  default_filters JSON DEFAULT NULL COMMENT '类型化默认筛选值',
  tenant_isolated_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '必须为一，租户隔离不可关闭',
  data_scope_flag TINYINT(1) NOT NULL DEFAULT 1 COMMENT '是否叠加注册的数据权限策略，不由普通用户修改',
  permission_code VARCHAR(150) NOT NULL COMMENT '注册的数据集访问权限',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE或DISABLED',
  remark VARCHAR(500) DEFAULT NULL COMMENT '口径说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '注册元数据版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (dataset_id),
  UNIQUE KEY uk_report_dataset (tenant_id, dataset_code),
  CONSTRAINT chk_dataset_tenant CHECK (tenant_isolated_flag = 1)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='无自由SQL且仅允许注册查询的报表数据集';

DROP TABLE IF EXISTS sys_report_chart;
CREATE TABLE sys_report_chart (
  chart_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '自助图表ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  dataset_id BIGINT(20) NOT NULL COMMENT '预置数据集ID',
  chart_name VARCHAR(100) NOT NULL COMMENT '图表名称',
  chart_type VARCHAR(20) NOT NULL COMMENT 'BAR或LINE或PIE或FUNNEL或TABLE或METRIC',
  dimensions JSON NOT NULL COMMENT '白名单维度编码',
  measures JSON NOT NULL COMMENT '白名单双向校验的字段及聚合枚举',
  filters JSON DEFAULT NULL COMMENT '白名单字段、操作符及绑定参数',
  sort_config JSON DEFAULT NULL COMMENT '白名单排序字段及ASC或DESC',
  limit_rows INT NOT NULL DEFAULT 500 COMMENT '结果行数上限',
  style_config JSON DEFAULT NULL COMMENT '限定语义色与展示选项，不含代码HTML或URL',
  owner_id BIGINT(20) NOT NULL COMMENT '图表创建者ID',
  owner_dept_id BIGINT(20) NOT NULL COMMENT '创建者部门快照',
  share_scope VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' COMMENT 'PRIVATE或DEPT或TENANT',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (chart_id),
  KEY idx_report_chart_scope (tenant_id, owner_id, share_scope),
  CONSTRAINT chk_report_rows CHECK (limit_rows BETWEEN 1 AND 2000)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='只含受限配置的自助图表';

DROP TABLE IF EXISTS sys_report_dashboard;
CREATE TABLE sys_report_dashboard (
  dashboard_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '自助仪表盘ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  dashboard_name VARCHAR(100) NOT NULL COMMENT '仪表盘名称',
  owner_id BIGINT(20) NOT NULL COMMENT '所有者ID',
  owner_dept_id BIGINT(20) NOT NULL COMMENT '部门快照',
  share_scope VARCHAR(20) NOT NULL DEFAULT 'PRIVATE' COMMENT 'PRIVATE或DEPT或TENANT',
  remark VARCHAR(500) DEFAULT NULL COMMENT '说明',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (dashboard_id),
  KEY idx_report_dashboard_scope (tenant_id, owner_id, share_scope)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='按查看者权限重新取数的共享仪表盘';

DROP TABLE IF EXISTS sys_report_dashboard_item;
CREATE TABLE sys_report_dashboard_item (
  item_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '仪表盘图表布局ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  dashboard_id BIGINT(20) NOT NULL COMMENT '仪表盘ID',
  chart_id BIGINT(20) NOT NULL COMMENT '图表ID',
  grid_x INT NOT NULL COMMENT '十二列网格横坐标',
  grid_y INT NOT NULL COMMENT '网格纵坐标',
  grid_w INT NOT NULL COMMENT '网格宽度',
  grid_h INT NOT NULL COMMENT '网格高度',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (item_id),
  UNIQUE KEY uk_report_dashboard_chart (tenant_id, dashboard_id, chart_id),
  CONSTRAINT chk_report_grid CHECK (grid_x BETWEEN 0 AND 11 AND grid_y BETWEEN 0 AND 1000 AND grid_w BETWEEN 1 AND 12 AND grid_h BETWEEN 1 AND 100 AND grid_x + grid_w <= 12)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='仪表盘图表拖拽布局';

DROP TABLE IF EXISTS sys_im_config;
CREATE TABLE sys_im_config (
  config_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '企业通信应用配置ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  im_type VARCHAR(20) NOT NULL COMMENT 'WECOM，其他厂商本期仅预留标识',
  corp_id VARCHAR(100) NOT NULL COMMENT '企业标识',
  agent_id VARCHAR(100) NOT NULL COMMENT '应用标识',
  app_key_encrypted VARCHAR(2000) DEFAULT NULL COMMENT '应用Key密文，适用厂商启用时必填',
  app_secret_encrypted VARCHAR(2000) NOT NULL COMMENT '应用Secret密文',
  token_encrypted VARCHAR(2000) DEFAULT NULL COMMENT '回调Token密文',
  aes_key_encrypted VARCHAR(2000) DEFAULT NULL COMMENT '回调解密Key密文',
  callback_url VARCHAR(1000) DEFAULT NULL COMMENT '部署允许的HTTPS回调地址',
  sync_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用单向组织同步',
  sync_cron VARCHAR(100) DEFAULT NULL COMMENT 'A3集中任务周期',
  login_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用扫码及内嵌登录',
  message_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用应用消息',
  todo_enabled TINYINT(1) NOT NULL DEFAULT 0 COMMENT '是否启用待办卡片',
  sync_scope JSON DEFAULT NULL COMMENT '明确同步的远端部门范围及本地根部门',
  last_sync_time DATETIME DEFAULT NULL COMMENT '最近完整成功同步时间',
  status VARCHAR(20) NOT NULL DEFAULT 'DISABLED' COMMENT 'DISABLED或ENABLED',
  deleted TINYINT(1) NOT NULL DEFAULT 0 COMMENT '逻辑删除',
  version INT NOT NULL DEFAULT 0 COMMENT '配置版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (config_id),
  UNIQUE KEY uk_im_config_type (tenant_id, im_type),
  CONSTRAINT chk_im_callback_keys CHECK ((login_enabled = 0 AND todo_enabled = 0) OR (callback_url IS NOT NULL AND token_encrypted IS NOT NULL AND aes_key_encrypted IS NOT NULL))
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='首家企业通信提供商的按租户应用配置';

DROP TABLE IF EXISTS sys_im_user_mapping;
CREATE TABLE sys_im_user_mapping (
  mapping_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '企业通信用户绑定ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  config_id BIGINT(20) NOT NULL COMMENT '应用配置ID',
  user_id BIGINT(20) NOT NULL COMMENT '本地内部用户ID',
  im_type VARCHAR(20) NOT NULL COMMENT '提供商类型',
  im_user_id VARCHAR(128) NOT NULL COMMENT '企业内用户标识',
  im_open_id VARCHAR(128) DEFAULT NULL COMMENT '外部开放标识',
  im_union_id VARCHAR(128) DEFAULT NULL COMMENT '联合身份标识',
  im_name VARCHAR(100) DEFAULT NULL COMMENT '外部姓名快照',
  im_avatar VARCHAR(1000) DEFAULT NULL COMMENT '经过域名校验的头像地址',
  bind_type VARCHAR(20) NOT NULL COMMENT 'AUTO_SYNC或MANUAL_BIND或SCAN_BIND',
  bind_time DATETIME NOT NULL COMMENT '完成双方身份核实后的绑定时间',
  last_sync_time DATETIME DEFAULT NULL COMMENT '最近同步时间',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE或DISABLED或OUT_OF_SCOPE（保留绑定且停止本范围同步，回到范围后恢复）',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (mapping_id),
  UNIQUE KEY uk_user_im (tenant_id, user_id, im_type),
  UNIQUE KEY uk_im_user (tenant_id, config_id, im_user_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='IM同步和登录共用的唯一用户绑定关系';

DROP TABLE IF EXISTS sys_im_dept_mapping;
CREATE TABLE sys_im_dept_mapping (
  mapping_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '企业通信部门映射ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  config_id BIGINT(20) NOT NULL COMMENT '应用配置ID',
  dept_id BIGINT(20) NOT NULL COMMENT '本地部门ID',
  im_type VARCHAR(20) NOT NULL COMMENT '提供商类型',
  im_dept_id VARCHAR(128) NOT NULL COMMENT '外部部门ID',
  im_dept_name VARCHAR(100) NOT NULL COMMENT '外部部门名称',
  im_parent_dept_id VARCHAR(128) DEFAULT NULL COMMENT '外部父部门ID',
  sync_time DATETIME DEFAULT NULL COMMENT '最近同步时间',
  status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' COMMENT 'ACTIVE或DISABLED',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (mapping_id),
  UNIQUE KEY uk_im_dept (tenant_id, config_id, im_dept_id),
  UNIQUE KEY uk_im_local_dept (tenant_id, config_id, dept_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='企业通信部门到本地组织的映射';

DROP TABLE IF EXISTS sys_im_todo_mapping;
CREATE TABLE sys_im_todo_mapping (
  mapping_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '企业通信待办投影ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  config_id BIGINT(20) NOT NULL COMMENT '应用配置ID',
  task_id VARCHAR(64) NOT NULL COMMENT '工作流任务ID',
  assignment_version INT NOT NULL COMMENT '分派或代理生效版本',
  receiver_user_id BIGINT(20) NOT NULL COMMENT '本地实际卡片接收人ID',
  im_type VARCHAR(20) NOT NULL COMMENT '提供商类型',
  im_todo_id VARCHAR(255) DEFAULT NULL COMMENT '提供商卡片或待办ID',
  im_user_id VARCHAR(128) NOT NULL COMMENT '外部接收人ID',
  card_key_hash CHAR(64) NOT NULL COMMENT '不可预测卡片业务键哈希',
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' COMMENT 'PENDING或SENT或COMPLETED或CANCELLED或FAILED或UNKNOWN',
  delivery_id BIGINT(20) DEFAULT NULL COMMENT '统一投递占位ID',
  last_event_key VARCHAR(128) DEFAULT NULL COMMENT '最近投影事件ID',
  version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (mapping_id),
  UNIQUE KEY uk_im_task_receiver (tenant_id, config_id, task_id, assignment_version, receiver_user_id),
  UNIQUE KEY uk_im_card_key (card_key_hash),
  KEY idx_im_todo_task (tenant_id, task_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='按真实任务分派版本更新的企业通信待办卡片';

DROP TABLE IF EXISTS sys_im_sync_run;
CREATE TABLE sys_im_sync_run (
  sync_run_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '组织同步预览及执行批次ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  config_id BIGINT(20) NOT NULL COMMENT '应用配置ID',
  config_version INT NOT NULL COMMENT '快照对应配置版本',
  mode VARCHAR(20) NOT NULL COMMENT 'PREVIEW或APPLY',
  snapshot_encrypted MEDIUMTEXT DEFAULT NULL COMMENT '外部组织完整快照及差异加密载荷',
  snapshot_hash CHAR(64) NOT NULL COMMENT '快照一致性摘要',
  full_snapshot_flag TINYINT(1) NOT NULL DEFAULT 0 COMMENT '全部分页和部门拉取成功才能为一',
  progress_cursor VARCHAR(128) DEFAULT NULL COMMENT '可恢复处理位置',
  result_summary JSON DEFAULT NULL COMMENT '新增更新禁用冲突统计和受保护报告引用',
  status VARCHAR(20) NOT NULL DEFAULT 'PREVIEWED' COMMENT 'PREVIEWED或RUNNING或COMPLETED或PARTIAL或FAILED',
  requested_by BIGINT(20) NOT NULL COMMENT '操作人或调度身份ID',
  started_time DATETIME DEFAULT NULL COMMENT '开始时间',
  completed_time DATETIME DEFAULT NULL COMMENT '结束时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (sync_run_id),
  KEY idx_im_sync_run (tenant_id, config_id, status)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='先完整预览再应用且可恢复的组织同步批次';

DROP TABLE IF EXISTS sys_im_callback_event;
CREATE TABLE sys_im_callback_event (
  callback_id BIGINT(20) NOT NULL AUTO_INCREMENT COMMENT '企业通信验签后回调事件ID',
  tenant_id BIGINT(20) NOT NULL COMMENT '租户ID',
  config_id BIGINT(20) NOT NULL COMMENT '应用配置ID',
  event_key VARCHAR(128) NOT NULL COMMENT '提供商事件或稳定业务指纹',
  payload_hash CHAR(64) NOT NULL COMMENT '已验证载荷摘要',
  event_type VARCHAR(64) NOT NULL COMMENT '组织变动或卡片动作类型',
  im_user_id VARCHAR(128) DEFAULT NULL COMMENT '经提供商校验的操作人',
  task_mapping_id BIGINT(20) DEFAULT NULL COMMENT '待办映射ID',
  action_type VARCHAR(30) DEFAULT NULL COMMENT '白名单动作类型',
  status VARCHAR(20) NOT NULL DEFAULT 'RECEIVED' COMMENT 'RECEIVED或PROCESSING或COMPLETED或REJECTED或RETRYABLE',
  claim_until DATETIME DEFAULT NULL COMMENT '处理租约截止时间',
  result_code VARCHAR(64) DEFAULT NULL COMMENT '业务执行结果，协议接收成功不代表审批成功',
  source_ip VARCHAR(64) DEFAULT NULL COMMENT '可信代理链核实后的来源IP',
  occurred_time DATETIME NOT NULL COMMENT '提供商事件时间',
  processed_time DATETIME DEFAULT NULL COMMENT '实际处理完成时间',
  create_by VARCHAR(64) DEFAULT '' COMMENT '创建者',
  create_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by VARCHAR(64) DEFAULT '' COMMENT '更新者',
  update_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (callback_id),
  UNIQUE KEY uk_im_callback_event (tenant_id, config_id, event_key),
  KEY idx_im_callback_pending (status, claim_until, tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='数据库持久回调去重及真实审批结果';

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

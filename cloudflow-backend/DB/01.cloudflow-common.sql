-- =========================================================
-- CloudFlow Pro - 公共基础模块数据库脚本
-- 模块：用户管理、角色权限、部门组织、菜单、多租户、文件管理
-- 版本：v1.0
-- 创建日期：2026-02-09
-- =========================================================

-- 创建数据库
CREATE DATABASE IF NOT EXISTS cloud_flow_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、租户管理
-- =========================================================

-- 1. 租户表
DROP TABLE IF EXISTS sys_tenant;
CREATE TABLE sys_tenant (
  tenant_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '租户ID',
  tenant_name       VARCHAR(50)     NOT NULL COMMENT '租户名称',
  contact_name      VARCHAR(50)     DEFAULT NULL COMMENT '联系人',
  contact_phone     VARCHAR(20)     DEFAULT NULL COMMENT '联系电话',
  contact_email     VARCHAR(50)     DEFAULT NULL COMMENT '联系邮箱',
  domain            VARCHAR(100)    DEFAULT NULL COMMENT '域名(可选)',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0正常 1停用）',
  expire_time       DATETIME        DEFAULT NULL COMMENT '过期时间',
  user_limit        INT(11)         DEFAULT 100 COMMENT '用户数量限制',
  storage_limit     BIGINT(20)      DEFAULT 10240 COMMENT '存储空间限制(MB)',
  storage_used      BIGINT(20)      DEFAULT 0 COMMENT '已使用存储空间(MB)',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (tenant_id),
  KEY idx_tenant_status (status),
  KEY idx_tenant_del_flag (del_flag)
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
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
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
  login_ip          VARCHAR(128)    DEFAULT '' COMMENT '最后登录IP',
  login_date        DATETIME        DEFAULT NULL COMMENT '最后登录时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (user_id),
  KEY idx_user_tenant (tenant_id),
  UNIQUE KEY uk_user_name_tenant (user_name, tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';

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
  status            CHAR(1)         DEFAULT '0' COMMENT '角色状态（0正常 1停用）',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
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
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (post_id),
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
  file_size         BIGINT(20)      DEFAULT 0  COMMENT '文件大小',
  file_type         VARCHAR(50)     DEFAULT '' COMMENT '文件类型',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '上传者',
  create_time       DATETIME        COMMENT '上传时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (file_id),
  KEY idx_file_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件管理表';

-- =========================================================
-- 初始化数据
-- =========================================================

-- 1. 初始化租户
INSERT INTO sys_tenant (tenant_id, tenant_name, status, user_limit, storage_limit, storage_used, del_flag, expire_time, create_time) 
VALUES (100000, '默认租户', '0', 100, 10240, 0, '0', DATE_ADD(NOW(), INTERVAL 1 YEAR), NOW());

-- 2. 初始化部门数据
INSERT INTO sys_dept VALUES(100,  100000, 0,   '0',          'CloudFlow 科技',   0, 'admin', '15888888888', 'admin@cloudflow.com', '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(101,  100000, 100, '0,100',      '研发部',           1, 'zhang_san', '15888888888', 'zhang_san@cloudflow.com', '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(102,  100000, 100, '0,100',      '财务部',           2, 'li_si',     '15888888888', 'li_si@cloudflow.com',     '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(103,  100000, 100, '0,100',      '人力资源部',       3, 'wang_wu',   '15888888888', 'wang_wu@cloudflow.com',   '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(104,  100000, 100, '0,100',      '法务部',           4, 'liu_fa',    '15888888888', 'liu_fa@cloudflow.com',    '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(105,  100000, 100, '0,100',      'IT部',             5, 'chen_it',   '15888888888', 'chen_it@cloudflow.com',   '0', '0', 'admin', sysdate(), '', null);

-- 3. 初始化角色数据
INSERT INTO sys_role VALUES(1, 100000, 'ADMIN',   'admin',    1, '1', '0', '0', 'admin', sysdate(), '', null, '系统管理员，拥有最高权限');
INSERT INTO sys_role VALUES(2, 100000, 'MANAGER', 'manager',  2, '3', '0', '0', 'admin', sysdate(), '', null, '部门经理，负责业务审批');
INSERT INTO sys_role VALUES(3, 100000, 'FINANCE', 'finance',  3, '3', '0', '0', 'admin', sysdate(), '', null, '财务专员，负责资金相关审批');
INSERT INTO sys_role VALUES(4, 100000, 'HR',      'hr',       4, '3', '0', '0', 'admin', sysdate(), '', null, '人事专员，负责人员相关审批');
INSERT INTO sys_role VALUES(5, 100000, 'EMPLOYEE','employee', 5, '2', '0', '0', 'admin', sysdate(), '', null, '普通员工，仅能发起申请');

-- 4. 初始化用户数据 (密码统一为: 123456, 存储格式为 BCrypt(SHA256(明文密码)))
INSERT INTO sys_user VALUES(1,  100000, 100, 'admin', 'Admin', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '超级管理员');
INSERT INTO sys_user VALUES(2,  100000, 101, 'li', '李经理', 'li@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '研发部经理');
INSERT INTO sys_user VALUES(3,  100000, 102, 'wang', '王财务', 'wang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '财务专员');
INSERT INTO sys_user VALUES(4,  100000, 103, 'zhao', '赵HR', 'zhao@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, 'HR经理');
INSERT INTO sys_user VALUES(5,  100000, 101, 'zhang', '张三', 'zhang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '研发工程师');
INSERT INTO sys_user VALUES(6,  100000, 104, 'liu', '刘法务', 'liu@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '法务总监');
INSERT INTO sys_user VALUES(7,  100000, 105, 'chen', '陈IT', 'chen@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', sysdate(), '', null, '系统管理员');

-- 5. 初始化用户角色关联
INSERT INTO sys_user_role VALUES(1, 1, 100000);
INSERT INTO sys_user_role VALUES(2, 2, 100000);
INSERT INTO sys_user_role VALUES(3, 3, 100000);
INSERT INTO sys_user_role VALUES(4, 4, 100000);
INSERT INTO sys_user_role VALUES(5, 5, 100000);
INSERT INTO sys_user_role VALUES(6, 1, 100000);
INSERT INTO sys_user_role VALUES(7, 1, 100000);

-- 6. 初始化菜单权限（二级菜单结构）
-- ═══════════════════════════════════════════════════
-- 一级目录（M类型）
-- ═══════════════════════════════════════════════════
INSERT INTO sys_menu VALUES(1,   '工作台',     0, 1, 'workspace',     NULL, NULL, 0, 0, 'M', '0', '0', '', 'LayoutDashboard', 'admin', sysdate(), '', null, '工作台目录');
INSERT INTO sys_menu VALUES(2,   '办公协同',   0, 2, 'office',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Briefcase',       'admin', sysdate(), '', null, '办公协同目录');
INSERT INTO sys_menu VALUES(3,   '流程中心',   0, 3, 'process',       NULL, NULL, 0, 0, 'M', '0', '0', '', 'GitMerge',        'admin', sysdate(), '', null, '流程中心目录');
INSERT INTO sys_menu VALUES(4,   '流程管理',   0, 4, 'workflow-mgmt', NULL, NULL, 0, 0, 'M', '0', '0', '', 'Settings',        'admin', sysdate(), '', null, '流程管理目录');
INSERT INTO sys_menu VALUES(5,   '行政管理',   0, 5, 'admin-mgmt',    NULL, NULL, 0, 0, 'M', '0', '0', '', 'Building2',       'admin', sysdate(), '', null, '行政管理目录');
INSERT INTO sys_menu VALUES(6,   '系统管理',   0, 6, 'system',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Wrench',          'admin', sysdate(), '', null, '系统管理目录');

-- ═══════════════════════════════════════════════════
-- 二级菜单（C类型）
-- ═══════════════════════════════════════════════════

-- 工作台 (parent_id=1)
INSERT INTO sys_menu VALUES(100, '仪表盘',     1, 1, '/',                    'pages/Dashboard',              NULL, 0, 0, 'C', '0', '0', 'workspace:dashboard',       'LayoutDashboard', 'admin', sysdate(), '', null, '仪表盘');
INSERT INTO sys_menu VALUES(101, '我的日程',   1, 2, '/schedule',            'pages/SchedulePage',           NULL, 0, 0, 'C', '0', '0', 'workspace:schedule',        'Calendar',        'admin', sysdate(), '', null, '我的日程');

-- 办公协同 (parent_id=2)
INSERT INTO sys_menu VALUES(200, '会议室',     2, 1, '/meeting-room',        'pages/MeetingRoomPage',        NULL, 0, 0, 'C', '0', '0', 'office:meeting',            'Monitor',         'admin', sysdate(), '', null, '会议室管理');
INSERT INTO sys_menu VALUES(201, '公告中心',   2, 2, '/announcement',        'pages/AnnouncementPage',       NULL, 0, 0, 'C', '0', '0', 'office:announcement',       'Megaphone',       'admin', sysdate(), '', null, '公告中心');
INSERT INTO sys_menu VALUES(202, '考勤打卡',   2, 3, '/admin/attendance/checkin', 'pages/admin/attendance/AttendanceCheckIn', NULL, 0, 0, 'C', '0', '0', 'office:attendance:checkin', 'ClipboardCheck', 'admin', sysdate(), '', null, '考勤打卡');

-- 流程中心 (parent_id=3)
INSERT INTO sys_menu VALUES(300, '发起流程',   3, 1, '/workplace',           'pages/Workplace',              NULL, 0, 0, 'C', '0', '0', 'process:start',             'PlayCircle',      'admin', sysdate(), '', null, '发起流程');
INSERT INTO sys_menu VALUES(301, '我的申请',   3, 2, '/my-apps',             'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:myapps',            'FileText',        'admin', sysdate(), '', null, '我的申请');
INSERT INTO sys_menu VALUES(302, '审批待办',   3, 3, '/tasks',               'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:tasks',             'CheckCircle2',    'admin', sysdate(), '', null, '审批待办');

-- 流程管理 (parent_id=4)
INSERT INTO sys_menu VALUES(400, '流程设计',   4, 1, '/workflow',            'pages/WorkflowDesign',         NULL, 0, 0, 'C', '0', '0', 'workflow:model:list',        'GitMerge',        'admin', sysdate(), '', null, '流程设计');
INSERT INTO sys_menu VALUES(401, '流程监控',   4, 2, '/workflow/monitor',    'pages/WorkflowMonitor',        NULL, 0, 0, 'C', '0', '0', 'workflow:monitor:list',      'Monitor',         'admin', sysdate(), '', null, '流程监控');
INSERT INTO sys_menu VALUES(402, '发布管理',   4, 3, '/workflow/deploy',     'pages/DeployManagement',       NULL, 0, 0, 'C', '0', '0', 'workflow:deploy:list',       'Rocket',          'admin', sysdate(), '', null, '发布管理');
INSERT INTO sys_menu VALUES(403, '表单设计',   4, 4, '/forms',              'pages/FormDesign',             NULL, 0, 0, 'C', '0', '0', 'workflow:form:list',         'FormInput',       'admin', sysdate(), '', null, '表单设计');

-- 行政管理 (parent_id=5)
INSERT INTO sys_menu VALUES(500, '组织架构',   5, 1, '/users',              'pages/OrgStructurePage',       NULL, 0, 0, 'C', '0', '0', 'admin:org:list',             'Users',           'admin', sysdate(), '', null, '组织架构');
INSERT INTO sys_menu VALUES(501, '资产管理',   5, 2, '/admin/asset',        'pages/admin/asset/AssetList',  NULL, 0, 0, 'C', '0', '0', 'admin:asset:list',           'Package',         'admin', sysdate(), '', null, '资产管理');
INSERT INTO sys_menu VALUES(502, '车辆管理',   5, 3, '/admin/vehicle/list', 'pages/admin/vehicle/VehicleList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:list',      'Car',             'admin', sysdate(), '', null, '车辆管理');
INSERT INTO sys_menu VALUES(503, '用车申请',   5, 4, '/admin/vehicle/booking', 'pages/admin/vehicle/VehicleBooking', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:booking', 'Car',          'admin', sysdate(), '', null, '用车申请');
INSERT INTO sys_menu VALUES(504, '用车记录',   5, 5, '/admin/vehicle/usage', 'pages/admin/vehicle/VehicleUsageList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:usage',   'Car',             'admin', sysdate(), '', null, '用车记录');
INSERT INTO sys_menu VALUES(505, '考勤规则',   5, 6, '/admin/attendance/rule', 'pages/admin/attendance/AttendanceRule', NULL, 0, 0, 'C', '0', '0', 'admin:attendance:rule', 'ClipboardCheck', 'admin', sysdate(), '', null, '考勤规则设置');

-- 系统管理 (parent_id=6)
INSERT INTO sys_menu VALUES(600, '用户管理',   6, 1, '/system/users',       'pages/system/UserList',        NULL, 0, 0, 'C', '0', '0', 'system:user:list',           'Users',           'admin', sysdate(), '', null, '用户管理');
INSERT INTO sys_menu VALUES(601, '角色管理',   6, 2, '/system/roles',       'pages/system/RoleList',        NULL, 0, 0, 'C', '0', '0', 'system:role:list',           'ShieldCheck',     'admin', sysdate(), '', null, '角色管理');
INSERT INTO sys_menu VALUES(602, '菜单管理',   6, 3, '/system/menus',       'pages/system/MenuList',        NULL, 0, 0, 'C', '0', '0', 'system:menu:list',           'LayoutDashboard', 'admin', sysdate(), '', null, '菜单管理');
INSERT INTO sys_menu VALUES(603, '文件管理',   6, 4, '/system/files',       'pages/system/FileList',        NULL, 0, 0, 'C', '0', '0', 'system:file:list',           'FileArchive',     'admin', sysdate(), '', null, '文件管理');
INSERT INTO sys_menu VALUES(604, '源码生成',   6, 5, '/code',               'pages/CodeGeneration',         NULL, 0, 0, 'C', '0', '0', 'system:code:list',           'Code',            'admin', sysdate(), '', null, '源码生成');
INSERT INTO sys_menu VALUES(605, '租户管理',   6, 6, '/system/tenant',      'pages/system/TenantList',      NULL, 0, 0, 'C', '0', '0', 'system:tenant:list',         'Building2',       'admin', sysdate(), '', null, '租户管理');

-- 7. 初始化岗位数据
INSERT INTO sys_post VALUES(1, 100000, 'ceo',      '董事长',     1, '0', 'admin', sysdate(), '', null, '公司最高管理者');
INSERT INTO sys_post VALUES(2, 100000, 'manager',   '部门经理',   2, '0', 'admin', sysdate(), '', null, '部门负责人');
INSERT INTO sys_post VALUES(3, 100000, 'director',  '总监',       3, '0', 'admin', sysdate(), '', null, '业务线总监');
INSERT INTO sys_post VALUES(4, 100000, 'staff',     '普通员工',   4, '0', 'admin', sysdate(), '', null, '普通岗位');

-- 8. 初始化用户岗位关联
INSERT INTO sys_user_post VALUES(1, 1, 100000);  -- admin → 董事长
INSERT INTO sys_user_post VALUES(2, 2, 100000);  -- 李经理 → 部门经理
INSERT INTO sys_user_post VALUES(3, 2, 100000);  -- 王财务 → 部门经理（财务主管）
INSERT INTO sys_user_post VALUES(4, 2, 100000);  -- 赵HR → 部门经理（人事经理）
INSERT INTO sys_user_post VALUES(5, 4, 100000);  -- 张三 → 普通员工
INSERT INTO sys_user_post VALUES(6, 3, 100000);  -- 刘法务 → 总监
INSERT INTO sys_user_post VALUES(7, 4, 100000);  -- 陈IT → 普通员工

-- 9. 初始化角色菜单关联（新二级菜单结构）
-- ═══════════════════════════════════════════════════
-- ADMIN (role_id=1): 拥有所有菜单（不需要配置，代码中 isAdmin 直接返回全部）
-- ═══════════════════════════════════════════════════

-- MANAGER (role_id=2): 工作台 + 办公协同 + 流程中心 + 流程管理 + 行政管理
-- 一级目录
INSERT INTO sys_role_menu VALUES(2, 1, 100000);
INSERT INTO sys_role_menu VALUES(2, 2, 100000);
INSERT INTO sys_role_menu VALUES(2, 3, 100000);
INSERT INTO sys_role_menu VALUES(2, 4, 100000);
INSERT INTO sys_role_menu VALUES(2, 5, 100000);
-- 工作台子菜单
INSERT INTO sys_role_menu VALUES(2, 100, 100000);
INSERT INTO sys_role_menu VALUES(2, 101, 100000);
-- 办公协同子菜单
INSERT INTO sys_role_menu VALUES(2, 200, 100000);
INSERT INTO sys_role_menu VALUES(2, 201, 100000);
INSERT INTO sys_role_menu VALUES(2, 202, 100000);
-- 流程中心子菜单
INSERT INTO sys_role_menu VALUES(2, 300, 100000);
INSERT INTO sys_role_menu VALUES(2, 301, 100000);
INSERT INTO sys_role_menu VALUES(2, 302, 100000);
-- 流程管理子菜单
INSERT INTO sys_role_menu VALUES(2, 400, 100000);
INSERT INTO sys_role_menu VALUES(2, 401, 100000);
INSERT INTO sys_role_menu VALUES(2, 402, 100000);
INSERT INTO sys_role_menu VALUES(2, 403, 100000);
-- 行政管理子菜单
INSERT INTO sys_role_menu VALUES(2, 500, 100000);
INSERT INTO sys_role_menu VALUES(2, 501, 100000);
INSERT INTO sys_role_menu VALUES(2, 502, 100000);
INSERT INTO sys_role_menu VALUES(2, 503, 100000);
INSERT INTO sys_role_menu VALUES(2, 504, 100000);
INSERT INTO sys_role_menu VALUES(2, 505, 100000);

-- FINANCE (role_id=3): 工作台 + 办公协同 + 流程中心
INSERT INTO sys_role_menu VALUES(3, 1, 100000);
INSERT INTO sys_role_menu VALUES(3, 2, 100000);
INSERT INTO sys_role_menu VALUES(3, 3, 100000);
INSERT INTO sys_role_menu VALUES(3, 100, 100000);
INSERT INTO sys_role_menu VALUES(3, 101, 100000);
INSERT INTO sys_role_menu VALUES(3, 200, 100000);
INSERT INTO sys_role_menu VALUES(3, 201, 100000);
INSERT INTO sys_role_menu VALUES(3, 202, 100000);
INSERT INTO sys_role_menu VALUES(3, 300, 100000);
INSERT INTO sys_role_menu VALUES(3, 301, 100000);
INSERT INTO sys_role_menu VALUES(3, 302, 100000);

-- HR (role_id=4): 工作台 + 办公协同 + 流程中心 + 流程管理 + 行政管理
INSERT INTO sys_role_menu VALUES(4, 1, 100000);
INSERT INTO sys_role_menu VALUES(4, 2, 100000);
INSERT INTO sys_role_menu VALUES(4, 3, 100000);
INSERT INTO sys_role_menu VALUES(4, 4, 100000);
INSERT INTO sys_role_menu VALUES(4, 5, 100000);
INSERT INTO sys_role_menu VALUES(4, 100, 100000);
INSERT INTO sys_role_menu VALUES(4, 101, 100000);
INSERT INTO sys_role_menu VALUES(4, 200, 100000);
INSERT INTO sys_role_menu VALUES(4, 201, 100000);
INSERT INTO sys_role_menu VALUES(4, 202, 100000);
INSERT INTO sys_role_menu VALUES(4, 300, 100000);
INSERT INTO sys_role_menu VALUES(4, 301, 100000);
INSERT INTO sys_role_menu VALUES(4, 302, 100000);
INSERT INTO sys_role_menu VALUES(4, 400, 100000);
INSERT INTO sys_role_menu VALUES(4, 401, 100000);
INSERT INTO sys_role_menu VALUES(4, 402, 100000);
INSERT INTO sys_role_menu VALUES(4, 403, 100000);
INSERT INTO sys_role_menu VALUES(4, 500, 100000);
INSERT INTO sys_role_menu VALUES(4, 505, 100000);

-- EMPLOYEE (role_id=5): 工作台 + 办公协同 + 流程中心（仅基础功能）
INSERT INTO sys_role_menu VALUES(5, 1, 100000);
INSERT INTO sys_role_menu VALUES(5, 2, 100000);
INSERT INTO sys_role_menu VALUES(5, 3, 100000);
INSERT INTO sys_role_menu VALUES(5, 100, 100000);
INSERT INTO sys_role_menu VALUES(5, 101, 100000);
INSERT INTO sys_role_menu VALUES(5, 200, 100000);
INSERT INTO sys_role_menu VALUES(5, 201, 100000);
INSERT INTO sys_role_menu VALUES(5, 202, 100000);
INSERT INTO sys_role_menu VALUES(5, 300, 100000);
INSERT INTO sys_role_menu VALUES(5, 301, 100000);
INSERT INTO sys_role_menu VALUES(5, 302, 100000);

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

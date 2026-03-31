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
  avatar            VARCHAR(500)    DEFAULT '' COMMENT '头像地址',
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
  ds_type           INT(1)          DEFAULT 1 COMMENT '数据权限类型（0全部 1自定义 2本级及下级 3本级 4本人）',
  ds_scope          VARCHAR(500)    DEFAULT NULL COMMENT '自定义数据权限（部门ID列表，逗号分隔）',
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
  storage_type      VARCHAR(20)     DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS）',
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
INSERT INTO sys_dept VALUES(100,  100000, 0,   '0',          'CloudFlow 科技',   0, 'admin', '15888888888', 'admin@cloudflow.com', '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(101,  100000, 100, '0,100',      '研发部',           1, 'zhang_san', '15888888888', 'zhang_san@cloudflow.com', '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(102,  100000, 100, '0,100',      '财务部',           2, 'li_si',     '15888888888', 'li_si@cloudflow.com',     '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(103,  100000, 100, '0,100',      '人力资源部',       3, 'wang_wu',   '15888888888', 'wang_wu@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(104,  100000, 100, '0,100',      '法务部',           4, 'liu_fa',    '15888888888', 'liu_fa@cloudflow.com',    '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(105,  100000, 100, '0,100',      'IT部',             5, 'chen_it',   '15888888888', 'chen_it@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(106,  100000, 101, '0,100,101',  '前端组',           1, 'qian_duan', '15888888888', 'qian_duan@cloudflow.com', '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(107,  100000, 101, '0,100,101',  '后端组',           2, 'hou_duan',  '15888888888', 'hou_duan@cloudflow.com',  '0', '0', 'admin', NOW(), '', null);
INSERT INTO sys_dept VALUES(108,  100000, 102, '0,100,102',  '会计组',           1, 'kuai_ji',   '15888888888', 'kuai_ji@cloudflow.com',   '0', '0', 'admin', NOW(), '', null);

-- 3. 初始化角色数据（包含数据权限配置）
INSERT INTO sys_role VALUES(1, 100000, 'ADMIN',   'admin',    1, '1', 0, NULL, '0', '0', 'admin', NOW(), '', null, '系统管理员，拥有最高权限');
INSERT INTO sys_role VALUES(2, 100000, 'MANAGER', 'manager',  2, '3', 2, NULL, '0', '0', 'admin', NOW(), '', null, '部门经理，负责业务审批');
INSERT INTO sys_role VALUES(3, 100000, 'FINANCE', 'finance',  3, '3', 3, NULL, '0', '0', 'admin', NOW(), '', null, '财务专员，负责资金相关审批');
INSERT INTO sys_role VALUES(4, 100000, 'HR',      'hr',       4, '3', 2, NULL, '0', '0', 'admin', NOW(), '', null, '人事专员，负责人员相关审批');
INSERT INTO sys_role VALUES(5, 100000, 'EMPLOYEE','employee', 5, '2', 4, NULL, '0', '0', 'admin', NOW(), '', null, '普通员工，仅能发起申请');

-- 4. 初始化用户数据 (密码统一为: 123456, 存储格式为 BCrypt(SHA256(明文密码)))
INSERT INTO sys_user VALUES(1,  100000, 100, 'admin', 'Admin', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '超级管理员', '');
INSERT INTO sys_user VALUES(2,  100000, 101, 'li', '李经理', 'li@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '研发部经理', '');
INSERT INTO sys_user VALUES(3,  100000, 102, 'wang', '王财务', 'wang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '财务专员', '');
INSERT INTO sys_user VALUES(4,  100000, 103, 'zhao', '赵HR', 'zhao@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, 'HR经理', '');
INSERT INTO sys_user VALUES(5,  100000, 101, 'zhang', '张三', 'zhang@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '研发工程师', '');
INSERT INTO sys_user VALUES(6,  100000, 104, 'liu', '刘法务', 'liu@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '法务总监', '');
INSERT INTO sys_user VALUES(7,  100000, 105, 'chen', '陈IT', 'chen@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '系统管理员', '');
INSERT INTO sys_user VALUES(8,  100000, 106, 'test_fe', '前端测试', 'test_fe@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '前端组员工', '');
INSERT INTO sys_user VALUES(9,  100000, 107, 'test_be', '后端测试', 'test_be@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', null, 'admin', NOW(), '', null, '后端组员工', '');

-- 5. 初始化用户角色关联
INSERT INTO sys_user_role VALUES(1, 1, 100000);
INSERT INTO sys_user_role VALUES(2, 2, 100000);
INSERT INTO sys_user_role VALUES(3, 3, 100000);
INSERT INTO sys_user_role VALUES(4, 4, 100000);
INSERT INTO sys_user_role VALUES(5, 5, 100000);
INSERT INTO sys_user_role VALUES(6, 1, 100000);
INSERT INTO sys_user_role VALUES(7, 1, 100000);
INSERT INTO sys_user_role VALUES(8, 5, 100000);
INSERT INTO sys_user_role VALUES(9, 5, 100000);

-- 6. 初始化菜单权限（二级菜单结构）
-- ═══════════════════════════════════════════════════
-- 一级目录（M类型）
-- ═══════════════════════════════════════════════════
INSERT INTO sys_menu VALUES(1,   '工作台',     0, 1, 'workspace',     NULL, NULL, 0, 0, 'M', '0', '0', '', 'LayoutDashboard', 'admin', NOW(), '', null, '工作台目录');
INSERT INTO sys_menu VALUES(2,   '办公协同',   0, 2, 'office',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Briefcase',       'admin', NOW(), '', null, '办公协同目录');
INSERT INTO sys_menu VALUES(3,   '流程中心',   0, 3, 'process',       NULL, NULL, 0, 0, 'M', '0', '0', '', 'GitMerge',        'admin', NOW(), '', null, '流程中心目录');
INSERT INTO sys_menu VALUES(4,   '流程管理',   0, 4, 'workflow-mgmt', NULL, NULL, 0, 0, 'M', '0', '0', '', 'Settings',        'admin', NOW(), '', null, '流程管理目录');
INSERT INTO sys_menu VALUES(5,   '行政管理',   0, 5, 'admin-mgmt',    NULL, NULL, 0, 0, 'M', '0', '0', '', 'Building2',       'admin', NOW(), '', null, '行政管理目录');
INSERT INTO sys_menu VALUES(6,   '系统管理',   0, 6, 'system',        NULL, NULL, 0, 0, 'M', '0', '0', '', 'Wrench',          'admin', NOW(), '', null, '系统管理目录');

-- ═══════════════════════════════════════════════════
-- 二级菜单（C类型）
-- ═══════════════════════════════════════════════════

-- 工作台 (parent_id=1)
INSERT INTO sys_menu VALUES(100, '仪表盘',     1, 1, '/',                    'pages/Dashboard',              NULL, 0, 0, 'C', '0', '0', 'workspace:dashboard',       'LayoutDashboard', 'admin', NOW(), '', null, '仪表盘');
INSERT INTO sys_menu VALUES(101, '我的日程',   1, 2, '/schedule',            'pages/SchedulePage',           NULL, 0, 0, 'C', '0', '0', 'workspace:schedule',        'Calendar',        'admin', NOW(), '', null, '我的日程');

-- 办公协同 (parent_id=2)
INSERT INTO sys_menu VALUES(200, '会议室',     2, 1, '/meeting-room',        'pages/MeetingRoomPage',        NULL, 0, 0, 'C', '0', '0', 'office:meeting',            'Monitor',         'admin', NOW(), '', null, '会议室管理');
INSERT INTO sys_menu VALUES(201, '公告中心',   2, 2, '/announcement',        'pages/AnnouncementPage',       NULL, 0, 0, 'C', '0', '0', 'office:announcement',       'Megaphone',       'admin', NOW(), '', null, '公告中心');
INSERT INTO sys_menu VALUES(202, '考勤打卡',   7, 11, '/hr/attendance/checkin', 'pages/hr/HrAttendanceCheckInPage', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:checkin', 'ClipboardCheck', 'admin', NOW(), '', null, 'HR考勤打卡');

-- 流程中心 (parent_id=3)
INSERT INTO sys_menu VALUES(300, '发起流程',   3, 1, '/workplace',           'pages/Workplace',              NULL, 0, 0, 'C', '0', '0', 'process:start',             'PlayCircle',      'admin', NOW(), '', null, '发起流程');
INSERT INTO sys_menu VALUES(301, '我的申请',   3, 2, '/my-apps',             'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:myapps',            'FileText',        'admin', NOW(), '', null, '我的申请');
INSERT INTO sys_menu VALUES(302, '审批待办',   3, 3, '/tasks',               'pages/TaskListPage',           NULL, 0, 0, 'C', '0', '0', 'process:tasks',             'CheckCircle2',    'admin', NOW(), '', null, '审批待办');
INSERT INTO sys_menu VALUES(303, '抄送我的',   3, 4, '/my-copies',           'pages/CopyListPage',           NULL, 0, 0, 'C', '0', '0', 'process:copy:list',         'MailOpen',        'admin', NOW(), '', null, '抄送我的');

-- 流程管理 (parent_id=4)
INSERT INTO sys_menu VALUES(400, '流程设计',   4, 1, '/workflow',            'pages/WorkflowDesign',         NULL, 0, 0, 'C', '0', '0', 'workflow:model:list',        'GitMerge',        'admin', NOW(), '', null, '流程设计');
INSERT INTO sys_menu VALUES(401, '流程监控',   4, 2, '/workflow/monitor',    'pages/WorkflowMonitor',        NULL, 0, 0, 'C', '0', '0', 'workflow:monitor:list',      'Monitor',         'admin', NOW(), '', null, '流程监控');
INSERT INTO sys_menu VALUES(402, '发布管理',   4, 3, '/workflow/deploy',     'pages/DeployManagement',       NULL, 0, 0, 'C', '0', '0', 'workflow:deploy:list',       'Rocket',          'admin', NOW(), '', null, '发布管理');
INSERT INTO sys_menu VALUES(403, '表单设计',   4, 4, '/forms',              'pages/FormDesign',             NULL, 0, 0, 'C', '0', '0', 'workflow:form:list',         'FormInput',       'admin', NOW(), '', null, '表单设计');
INSERT INTO sys_menu VALUES(404, '批量编辑',   4, 5, '/workflow/management', 'pages/admin/ProcessManagement', NULL, 0, 0, 'C', '0', '0', 'workflow:process:manage',    'Settings',        'admin', NOW(), '', null, '流程批量管理（分类、标签）');

-- 行政管理 (parent_id=5)
INSERT INTO sys_menu VALUES(500, '组织架构',   5, 1, '/users',              'pages/OrgStructurePage',       NULL, 0, 0, 'C', '0', '0', 'admin:org:list',             'Users',           'admin', NOW(), '', null, '组织架构');
INSERT INTO sys_menu VALUES(501, '资产管理',   5, 2, '/admin/asset',        'pages/admin/asset/AssetList',  NULL, 0, 0, 'C', '0', '0', 'admin:asset:list',           'Package',         'admin', NOW(), '', null, '资产管理');
INSERT INTO sys_menu VALUES(502, '车辆管理',   5, 3, '/admin/vehicle/list', 'pages/admin/vehicle/VehicleList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:list',      'Car',             'admin', NOW(), '', null, '车辆管理');
INSERT INTO sys_menu VALUES(503, '用车申请',   5, 4, '/admin/vehicle/booking', 'pages/admin/vehicle/VehicleBooking', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:booking', 'Car',          'admin', NOW(), '', null, '用车申请');
INSERT INTO sys_menu VALUES(504, '用车记录',   5, 5, '/admin/vehicle/usage', 'pages/admin/vehicle/VehicleUsageList', NULL, 0, 0, 'C', '0', '0', 'admin:vehicle:usage',   'Car',             'admin', NOW(), '', null, '用车记录');
INSERT INTO sys_menu VALUES(505, '考勤规则',   7, 12, '/hr/attendance/rule', 'pages/hr/HrAttendanceRulePage', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:rule', 'ClipboardCheck', 'admin', NOW(), '', null, 'HR考勤规则设置');

-- 系统管理 (parent_id=6)
INSERT INTO sys_menu VALUES(600, '用户管理',   6, 1, '/system/users',       'pages/system/UserList',        NULL, 0, 0, 'C', '0', '0', 'system:user:list',           'Users',           'admin', NOW(), '', null, '用户管理');
INSERT INTO sys_menu VALUES(601, '角色管理',   6, 2, '/system/roles',       'pages/system/RoleList',        NULL, 0, 0, 'C', '0', '0', 'system:role:list',           'ShieldCheck',     'admin', NOW(), '', null, '角色管理');
INSERT INTO sys_menu VALUES(602, '菜单管理',   6, 3, '/system/menus',       'pages/system/MenuList',        NULL, 0, 0, 'C', '0', '0', 'system:menu:list',           'LayoutDashboard', 'admin', NOW(), '', null, '菜单管理');
INSERT INTO sys_menu VALUES(603, '文件管理',   6, 4, '/system/files',       'pages/system/FileList',        NULL, 0, 0, 'C', '0', '0', 'system:file:list',           'FileArchive',     'admin', NOW(), '', null, '文件管理');
INSERT INTO sys_menu VALUES(604, '源码生成',   6, 5, '/code',               'pages/CodeGeneration',         NULL, 0, 0, 'C', '0', '0', 'system:code:list',           'Code',            'admin', NOW(), '', null, '源码生成');
INSERT INTO sys_menu VALUES(605, '租户管理',   6, 6, '/system/tenant',      'pages/system/TenantList',      NULL, 0, 0, 'C', '0', '0', 'system:tenant:list',         'Building2',       'admin', NOW(), '', null, '租户管理');
INSERT INTO sys_menu VALUES(606, '操作日志',   6, 7, '/system/log',         'pages/system/OperationLogPage', NULL, 0, 0, 'C', '0', '0', 'system:log:list',           'ScrollText',      'admin', NOW(), '', null, '操作日志');
INSERT INTO sys_menu VALUES(607, '审计日志',   6, 8, '/system/audit-log',   'pages/system/AuditLogPage',    NULL, 0, 0, 'C', '0', '0', 'system:audit:list',          'ClipboardList',   'admin', NOW(), '', null, '审计日志');
INSERT INTO sys_menu VALUES(608, '岗位管理',   6, 9, '/system/post',        'pages/system/PostList',        NULL, 0, 0, 'C', '0', '0', 'system:post:list',           'Landmark',        'admin', NOW(), '', null, '岗位管理');
INSERT INTO sys_menu VALUES(609, '参数配置',   6, 10, '/system/config',     'pages/system/ConfigList',      NULL, 0, 0, 'C', '0', '0', 'system:config:list',         'SlidersHorizontal','admin', NOW(), '', null, '参数配置');
INSERT INTO sys_menu VALUES(610, '缓存监控',   6, 11, '/system/cache',      'pages/system/CacheMonitor',    NULL, 0, 0, 'C', '0', '0', 'system:cache:list',          'DatabaseZap',     'admin', NOW(), '', null, '缓存监控');
INSERT INTO sys_menu VALUES(611, '字典管理',   6, 12, '/system/dict',       'pages/admin/DictPage',         NULL, 0, 0, 'C', '0', '0', 'system:dict:list',           'BookOpen',        'admin', NOW(), '', null, '字典管理');
INSERT INTO sys_menu VALUES(612, '流程分类',   4, 6, '/workflow/category',  'pages/admin/ProcessCategoryPage', NULL, 0, 0, 'C', '0', '0', 'workflow:category:list',  'FolderTree',      'admin', NOW(), '', null, '流程分类管理');
INSERT INTO sys_menu VALUES(613, '模板库',     3, 5, '/templates',          'pages/TemplateLibrary',        NULL, 0, 0, 'C', '0', '0', 'workflow:template:list',  'Sparkles',        'admin', NOW(), '', null, '流程模板库');
INSERT INTO sys_menu VALUES(614, '流程导入',   4, 7, '/workflow/import',    'pages/admin/WorkflowImport',   NULL, 0, 0, 'C', '0', '0', 'workflow:import:manage',  'Upload',          'admin', NOW(), '', null, '流程导入');
INSERT INTO sys_menu VALUES(615, '归档管理',   4, 8, '/workflow/archived',  'pages/admin/ArchivedWorkflows', NULL, 0, 0, 'C', '0', '0', 'workflow:archive:manage', 'Archive',         'admin', NOW(), '', null, '归档流程管理');
INSERT INTO sys_menu VALUES(616, '登录日志',   6, 13, '/system/login-log',   'pages/system/LoginLogPage',     NULL, 0, 0, 'C', '0', '0', 'system:login-log:list',    'LogIn',           'admin', NOW(), '', null, '登录日志');
INSERT INTO sys_menu VALUES(617, '在线用户',   6, 14, '/system/online',      'pages/system/OnlineUserPage',   NULL, 0, 0, 'C', '0', '0', 'system:online:list',       'Monitor',         'admin', NOW(), '', null, '在线用户管理');
INSERT INTO sys_menu VALUES(7,   '人力资源',   0, 7, 'hr',                   NULL,                             NULL, 0, 0, 'M', '0', '0', '',                     'Users',           'admin', NOW(), '', null, '人力资源目录');
INSERT INTO sys_menu VALUES(720, 'HR工作台',   7, 1, '/hr/dashboard',       'pages/hr/HrDashboardPage',      NULL, 0, 0, 'C', '0', '0', 'hr:dashboard:view',    'LayoutDashboard', 'admin', NOW(), '', null, 'HR桌面端工作台');
INSERT INTO sys_menu VALUES(721, '员工档案',   7, 2, '/hr/employees',       'pages/hr/HrEmployeePage',       NULL, 0, 0, 'C', '0', '0', 'hr:employee:list',     'Users',           'admin', NOW(), '', null, '员工档案管理');
INSERT INTO sys_menu VALUES(722, '招聘中心',   7, 3, '/hr/recruitment',     'pages/hr/HrRecruitmentPage',    NULL, 0, 0, 'C', '0', '0', 'hr:recruitment:list',  'Briefcase',       'admin', NOW(), '', null, '招聘与候选人管理');
INSERT INTO sys_menu VALUES(728, '编制管理',   7, 4, '/hr/headcount',       'pages/hr/HrHeadcountPage',      NULL, 0, 0, 'C', '0', '0', 'hr:headcount:list',    'Layers3',         'admin', NOW(), '', null, '部门与岗位编制管理');
INSERT INTO sys_menu VALUES(729, '薪酬管理',   7, 5, '/hr/salary',          'pages/hr/HrSalaryPage',         NULL, 0, 0, 'C', '0', '0', 'hr:salary:list',       'Landmark',        'admin', NOW(), '', null, '薪资项目、结构、现薪与调薪管理');
INSERT INTO sys_menu VALUES(727, 'Offer管理',  7, 6, '/hr/offer',           'pages/hr/HrOfferPage',          NULL, 0, 0, 'C', '0', '0', 'hr:offer:list',        'Send',            'admin', NOW(), '', null, 'Offer审批、发送与转入职');
INSERT INTO sys_menu VALUES(723, '入职办理',   7, 7, '/hr/onboarding',      'pages/hr/HrOnboardingPage',     NULL, 0, 0, 'C', '0', '0', 'hr:onboarding:list',   'ClipboardCheck',  'admin', NOW(), '', null, '入职申请与任务办理');
INSERT INTO sys_menu VALUES(724, '转正申请',   7, 8, '/hr/probation',       'pages/hr/HrProbationPage',      NULL, 0, 0, 'C', '0', '0', 'hr:probation:list',    'ShieldCheck',     'admin', NOW(), '', null, '转正申请管理');
INSERT INTO sys_menu VALUES(725, '调岗管理',   7, 9, '/hr/transfer',        'pages/hr/HrTransferPage',       NULL, 0, 0, 'C', '0', '0', 'hr:transfer:list',     'GitMerge',        'admin', NOW(), '', null, '调岗申请管理');
INSERT INTO sys_menu VALUES(726, '离职办理',   7, 10, '/hr/resignation',    'pages/hr/HrResignationPage',    NULL, 0, 0, 'C', '0', '0', 'hr:resignation:list',  'LogOut',          'admin', NOW(), '', null, '离职申请与交接办理');

-- 办公协同(parent_id=2)扩展菜单：出差申请、通讯录
INSERT INTO sys_menu VALUES(203, '补卡申请',   7, 13, '/hr/attendance/appeal', 'pages/hr/HrAttendanceAppealPage', NULL, 0, 0, 'C', '0', '0', 'hr:attendance:appeal', 'ClipboardEdit', 'admin', NOW(), '', null, 'HR补卡/外勤申请');
INSERT INTO sys_menu VALUES(204, '加班申请',   7, 14, '/hr/overtime',          'pages/hr/HrOvertimePage',        NULL, 0, 0, 'C', '0', '0', 'hr:overtime:list',     'Clock',         'admin', NOW(), '', null, 'HR加班申请');
INSERT INTO sys_menu VALUES(205, '出差申请',   2, 6, '/office/business-trip',     'pages/BusinessTripPage',       NULL, 0, 0, 'C', '0', '0', 'office:trip:list',          'Plane',           'admin', NOW(), '', null, '出差申请');
INSERT INTO sys_menu VALUES(206, '通讯录',     2, 7, '/office/contact',           'pages/ContactPage',            NULL, 0, 0, 'C', '0', '0', 'office:contact:list',       'BookUser',        'admin', NOW(), '', null, '企业通讯录');

-- 行政管理(parent_id=5)扩展菜单：访客管理、值班排班
INSERT INTO sys_menu VALUES(506, '访客管理',   5, 7, '/admin/visitor',            'pages/VisitorPage',            NULL, 0, 0, 'C', '0', '0', 'admin:visitor:list',        'UserCheck',       'admin', NOW(), '', null, '访客预约管理');
INSERT INTO sys_menu VALUES(507, '值班排班',   5, 8, '/admin/duty-schedule',      'pages/DutySchedulePage',       NULL, 0, 0, 'C', '0', '0', 'admin:duty:list',           'CalendarClock',   'admin', NOW(), '', null, '值班排班管理');

-- 流程管理(parent_id=4)扩展菜单：Phase 2 监控告警功能（2026-02-22新增）
INSERT INTO sys_menu VALUES(700, '告警管理',   4, 7, '/workflow/alerts',          'pages/AlertList',              NULL, 0, 0, 'C', '0', '0', 'workflow:alert:list',       'Bell',            'admin', NOW(), '', null, '查看和处理超时告警和异常告警');
INSERT INTO sys_menu VALUES(701, '性能统计',   4, 8, '/workflow/performance',     'pages/PerformanceStats',       NULL, 0, 0, 'C', '0', '0', 'workflow:performance:view', 'BarChart3',       'admin', NOW(), '', null, '查看流程执行性能统计和趋势分析');

-- 7. 初始化岗位数据
INSERT INTO sys_post VALUES(1, 100000, 'ceo',      '董事长',     1, '0', 'admin', NOW(), '', null, '公司最高管理者');
INSERT INTO sys_post VALUES(2, 100000, 'manager',   '部门经理',   2, '0', 'admin', NOW(), '', null, '部门负责人');
INSERT INTO sys_post VALUES(3, 100000, 'director',  '总监',       3, '0', 'admin', NOW(), '', null, '业务线总监');
INSERT INTO sys_post VALUES(4, 100000, 'staff',     '普通员工',   4, '0', 'admin', NOW(), '', null, '普通岗位');

-- 8. 初始化用户岗位关联
INSERT INTO sys_user_post VALUES(1, 1, 100000);  -- admin → 董事长
INSERT INTO sys_user_post VALUES(2, 2, 100000);  -- 李经理 → 部门经理
INSERT INTO sys_user_post VALUES(3, 2, 100000);  -- 王财务 → 部门经理（财务主管）
INSERT INTO sys_user_post VALUES(4, 2, 100000);  -- 赵HR → 部门经理（人事经理）
INSERT INTO sys_user_post VALUES(5, 4, 100000);  -- 张三 → 普通员工
INSERT INTO sys_user_post VALUES(6, 3, 100000);  -- 刘法务 → 总监
INSERT INTO sys_user_post VALUES(7, 4, 100000);  -- 陈IT → 普通员工
INSERT INTO sys_user_post VALUES(8, 4, 100000);  -- 前端测试 → 普通员工
INSERT INTO sys_user_post VALUES(9, 4, 100000);  -- 后端测试 → 普通员工

-- 9. 初始化角色菜单关联（新二级菜单结构）
-- ═══════════════════════════════════════════════════
-- ADMIN (role_id=1): keep explicit sys_role_menu mappings for permission aggregation
-- ═══════════════════════════════════════════════════

-- MANAGER (role_id=2): 工作台 + 办公协同 + 流程中心 + 流程管理 + 行政管理
-- 一级目录
-- Ensure ADMIN keeps full menu-permission mappings for auth permission checks.
INSERT IGNORE INTO sys_role_menu (role_id, menu_id, tenant_id)
SELECT 1, menu_id, 100000 FROM sys_menu;

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
INSERT INTO sys_role_menu VALUES(2, 303, 100000);
INSERT INTO sys_role_menu VALUES(2, 613, 100000);  -- 模板库
-- 流程管理子菜单
INSERT INTO sys_role_menu VALUES(2, 400, 100000);
INSERT INTO sys_role_menu VALUES(2, 401, 100000);
INSERT INTO sys_role_menu VALUES(2, 402, 100000);
INSERT INTO sys_role_menu VALUES(2, 403, 100000);
INSERT INTO sys_role_menu VALUES(2, 404, 100000);  -- 批量编辑
INSERT INTO sys_role_menu VALUES(2, 612, 100000);  -- 流程分类
INSERT INTO sys_role_menu VALUES(2, 614, 100000);  -- 流程导入
INSERT INTO sys_role_menu VALUES(2, 615, 100000);  -- 归档管理
-- 行政管理子菜单
INSERT INTO sys_role_menu VALUES(2, 500, 100000);
INSERT INTO sys_role_menu VALUES(2, 501, 100000);
INSERT INTO sys_role_menu VALUES(2, 502, 100000);
INSERT INTO sys_role_menu VALUES(2, 503, 100000);
INSERT INTO sys_role_menu VALUES(2, 504, 100000);
INSERT INTO sys_role_menu VALUES(2, 505, 100000);
-- 办公协同扩展菜单
INSERT INTO sys_role_menu VALUES(2, 203, 100000);
INSERT INTO sys_role_menu VALUES(2, 204, 100000);
INSERT INTO sys_role_menu VALUES(2, 205, 100000);
INSERT INTO sys_role_menu VALUES(2, 206, 100000);
-- 行政管理扩展菜单
INSERT INTO sys_role_menu VALUES(2, 506, 100000);
INSERT INTO sys_role_menu VALUES(2, 507, 100000);
-- Phase 2 监控告警菜单
INSERT INTO sys_role_menu VALUES(2, 700, 100000);
INSERT INTO sys_role_menu VALUES(2, 701, 100000);

-- FINANCE (role_id=3): 工作台 + 办公协同 + 流程中心
INSERT INTO sys_role_menu VALUES(3, 1, 100000);
INSERT INTO sys_role_menu VALUES(3, 2, 100000);
INSERT INTO sys_role_menu VALUES(3, 3, 100000);
INSERT INTO sys_role_menu VALUES(3, 100, 100000);
INSERT INTO sys_role_menu VALUES(3, 101, 100000);
INSERT INTO sys_role_menu VALUES(3, 200, 100000);
INSERT INTO sys_role_menu VALUES(3, 201, 100000);
INSERT INTO sys_role_menu VALUES(3, 202, 100000);
INSERT INTO sys_role_menu VALUES(3, 203, 100000);
INSERT INTO sys_role_menu VALUES(3, 204, 100000);
INSERT INTO sys_role_menu VALUES(3, 205, 100000);
INSERT INTO sys_role_menu VALUES(3, 206, 100000);
INSERT INTO sys_role_menu VALUES(3, 300, 100000);
INSERT INTO sys_role_menu VALUES(3, 301, 100000);
INSERT INTO sys_role_menu VALUES(3, 302, 100000);
INSERT INTO sys_role_menu VALUES(3, 303, 100000);
INSERT INTO sys_role_menu VALUES(3, 613, 100000);  -- 模板库
-- Phase 2 监控告警菜单（仅查看）
INSERT INTO sys_role_menu VALUES(3, 4, 100000);
INSERT INTO sys_role_menu VALUES(3, 401, 100000);
INSERT INTO sys_role_menu VALUES(3, 701, 100000);

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
INSERT INTO sys_role_menu VALUES(4, 303, 100000);
INSERT INTO sys_role_menu VALUES(4, 613, 100000);  -- 模板库
INSERT INTO sys_role_menu VALUES(4, 400, 100000);
INSERT INTO sys_role_menu VALUES(4, 401, 100000);
INSERT INTO sys_role_menu VALUES(4, 402, 100000);
INSERT INTO sys_role_menu VALUES(4, 403, 100000);
INSERT INTO sys_role_menu VALUES(4, 404, 100000);  -- 批量编辑
INSERT INTO sys_role_menu VALUES(4, 612, 100000);  -- 流程分类
INSERT INTO sys_role_menu VALUES(4, 614, 100000);  -- 流程导入
INSERT INTO sys_role_menu VALUES(4, 615, 100000);  -- 归档管理
INSERT INTO sys_role_menu VALUES(4, 500, 100000);
INSERT INTO sys_role_menu VALUES(4, 505, 100000);
INSERT INTO sys_role_menu VALUES(4, 203, 100000);
INSERT INTO sys_role_menu VALUES(4, 204, 100000);
INSERT INTO sys_role_menu VALUES(4, 205, 100000);
INSERT INTO sys_role_menu VALUES(4, 206, 100000);
INSERT INTO sys_role_menu VALUES(4, 506, 100000);
INSERT INTO sys_role_menu VALUES(4, 507, 100000);
-- Phase 2 监控告警菜单
INSERT INTO sys_role_menu VALUES(4, 700, 100000);
INSERT INTO sys_role_menu VALUES(4, 701, 100000);
-- HR 菜单
INSERT INTO sys_role_menu VALUES(4, 7, 100000);
INSERT INTO sys_role_menu VALUES(4, 720, 100000);
INSERT INTO sys_role_menu VALUES(4, 721, 100000);
INSERT INTO sys_role_menu VALUES(4, 722, 100000);
INSERT INTO sys_role_menu VALUES(4, 728, 100000);
INSERT INTO sys_role_menu VALUES(4, 729, 100000);
INSERT INTO sys_role_menu VALUES(4, 723, 100000);
INSERT INTO sys_role_menu VALUES(4, 724, 100000);
INSERT INTO sys_role_menu VALUES(4, 725, 100000);
INSERT INTO sys_role_menu VALUES(4, 726, 100000);
INSERT INTO sys_role_menu VALUES(4, 727, 100000);

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
INSERT INTO sys_role_menu VALUES(5, 303, 100000);
INSERT INTO sys_role_menu VALUES(5, 613, 100000);  -- 模板库（普通用户可查看）
INSERT INTO sys_role_menu VALUES(5, 203, 100000);
INSERT INTO sys_role_menu VALUES(5, 204, 100000);
INSERT INTO sys_role_menu VALUES(5, 205, 100000);
INSERT INTO sys_role_menu VALUES(5, 206, 100000);
-- Phase 2 监控告警菜单（仅查看流程监控）
INSERT INTO sys_role_menu VALUES(5, 4, 100000);
INSERT INTO sys_role_menu VALUES(5, 401, 100000);

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
  audit_name        VARCHAR(255)    DEFAULT '' COMMENT '审计业务名称',
  audit_field       VARCHAR(255)    DEFAULT '' COMMENT '变更字段名',
  before_val        TEXT            COMMENT '变更前值',
  after_val         TEXT            COMMENT '变更后值',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '操作人',
  create_time       DATETIME        DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  PRIMARY KEY (audit_id),
  KEY idx_audit_tenant (tenant_id),
  KEY idx_audit_name (audit_name),
  KEY idx_audit_create_time (create_time)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='审计日志表';

-- =========================================================
-- 七、字典管理
-- =========================================================

-- 13. 字典类型表
CREATE TABLE IF NOT EXISTS `sys_dict_type` (
    `dict_id`     BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典主键',
    `tenant_id`   BIGINT       DEFAULT NULL COMMENT '租户ID',
    `dict_name`   VARCHAR(100) NOT NULL COMMENT '字典名称',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型（唯一标识）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_id`),
    UNIQUE KEY `uk_dict_type` (`dict_type`, `tenant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典类型表';

-- 14. 字典数据表
CREATE TABLE IF NOT EXISTS `sys_dict_data` (
    `dict_code`   BIGINT       NOT NULL AUTO_INCREMENT COMMENT '字典编码',
    `tenant_id`   BIGINT       DEFAULT NULL COMMENT '租户ID',
    `dict_sort`   INT          DEFAULT 0 COMMENT '字典排序',
    `dict_label`  VARCHAR(100) NOT NULL COMMENT '字典标签',
    `dict_value`  VARCHAR(100) NOT NULL COMMENT '字典键值',
    `dict_type`   VARCHAR(100) NOT NULL COMMENT '字典类型',
    `css_class`   VARCHAR(100) DEFAULT NULL COMMENT '样式属性（前端扩展）',
    `list_class`  VARCHAR(100) DEFAULT NULL COMMENT '表格回显样式（如 success/warning/danger）',
    `is_default`  CHAR(1)      DEFAULT 'N' COMMENT '是否默认（Y是 N否）',
    `status`      CHAR(1)      DEFAULT '0' COMMENT '状态（0正常 1停用）',
    `remark`      VARCHAR(500) DEFAULT NULL COMMENT '备注',
    `create_by`   VARCHAR(64)  DEFAULT NULL COMMENT '创建者',
    `create_time` DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    `update_by`   VARCHAR(64)  DEFAULT NULL COMMENT '更新者',
    `update_time` DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (`dict_code`),
    KEY `idx_dict_type` (`dict_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='字典数据表';

-- 10. 初始化字典类型数据
INSERT INTO `sys_dict_type` (`dict_name`, `dict_type`, `remark`) VALUES
('用户性别', 'sys_user_sex', '用户性别列表'),
('系统状态', 'sys_normal_disable', '系统开关状态'),
('是否', 'sys_yes_no', '系统是否列表'),
('通知类型', 'sys_notice_type', '通知类型列表'),
('审批状态', 'oa_approval_status', 'OA审批状态'),
('请假类型', 'hr_leave_type', '请假类型列表'),
('加班类型', 'hr_overtime_type', '加班类型列表'),
('出差状态', 'oa_trip_status', '出差状态列表'),
('费用类型', 'oa_expense_type', '费用报销类型');

-- 11. 初始化字典数据
-- 用户性别
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '男', '0', 'sys_user_sex', 'default'),
(2, '女', '1', 'sys_user_sex', 'default'),
(3, '未知', '2', 'sys_user_sex', 'default');

-- 系统状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '正常', '0', 'sys_normal_disable', 'success'),
(2, '停用', '1', 'sys_normal_disable', 'danger');

-- 是否
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '是', 'Y', 'sys_yes_no', 'success'),
(2, '否', 'N', 'sys_yes_no', 'danger');

-- 通知类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '通知', '1', 'sys_notice_type', 'warning'),
(2, '公告', '2', 'sys_notice_type', 'success');

-- 审批状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待审批', 'PENDING', 'oa_approval_status', 'warning'),
(2, '审批中', 'IN_PROGRESS', 'oa_approval_status', 'processing'),
(3, '已通过', 'APPROVED', 'oa_approval_status', 'success'),
(4, '已驳回', 'REJECTED', 'oa_approval_status', 'danger'),
(5, '已撤销', 'CANCELLED', 'oa_approval_status', 'default');

-- 请假类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '年假', 'ANNUAL', 'hr_leave_type', 'success'),
(2, '事假', 'PERSONAL', 'hr_leave_type', 'default'),
(3, '病假', 'SICK', 'hr_leave_type', 'warning'),
(4, '婚假', 'MARRIAGE', 'hr_leave_type', 'success'),
(5, '产假', 'MATERNITY', 'hr_leave_type', 'success'),
(6, '丧假', 'BEREAVEMENT', 'hr_leave_type', 'default');

-- 加班类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '工作日加班', 'WORKDAY', 'hr_overtime_type', 'default'),
(2, '周末加班', 'WEEKEND', 'hr_overtime_type', 'warning'),
(3, '节假日加班', 'HOLIDAY', 'hr_overtime_type', 'danger');

-- 出差状态
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '待出发', 'NOT_STARTED', 'oa_trip_status', 'default'),
(2, '出差中', 'IN_PROGRESS', 'oa_trip_status', 'processing'),
(3, '已返回', 'COMPLETED', 'oa_trip_status', 'success');

-- 费用类型
INSERT INTO `sys_dict_data` (`dict_sort`, `dict_label`, `dict_value`, `dict_type`, `list_class`) VALUES
(1, '差旅费', 'TRAVEL', 'oa_expense_type', 'default'),
(2, '交通费', 'TRANSPORT', 'oa_expense_type', 'default'),
(3, '餐饮费', 'MEAL', 'oa_expense_type', 'default'),
(4, '住宿费', 'ACCOMMODATION', 'oa_expense_type', 'default'),
(5, '办公用品', 'OFFICE', 'oa_expense_type', 'default'),
(6, '其他', 'OTHER', 'oa_expense_type', 'default');

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

-- 12. 初始化系统参数数据
-- config_scope: 0=全局（所有租户共享） 1=租户（每个租户可独立配置）
-- 用户管理配置（租户级：不同租户可设不同密码策略）
INSERT INTO sys_config VALUES(1, 100000, '用户管理-账号初始密码',       'sys.user.initPassword',        '123456',   'Y', '1', 'admin', NOW(), '', null, '初始化密码 123456');
INSERT INTO sys_config VALUES(2, 100000, '用户管理-密码最小长度',       'sys.user.password.minLength',   '6',        'Y', '1', 'admin', NOW(), '', null, '密码最小长度限制');
INSERT INTO sys_config VALUES(3, 100000, '用户管理-密码最大长度',       'sys.user.password.maxLength',   '20',       'Y', '1', 'admin', NOW(), '', null, '密码最大长度限制');
INSERT INTO sys_config VALUES(4, 100000, '用户管理-登录失败锁定次数',   'sys.user.login.maxRetry',       '5',        'Y', '1', 'admin', NOW(), '', null, '登录失败超过此次数将锁定账号');
INSERT INTO sys_config VALUES(5, 100000, '用户管理-登录锁定时间(分钟)', 'sys.user.login.lockTime',       '10',       'Y', '1', 'admin', NOW(), '', null, '账号锁定持续时间');
-- 系统安全配置（全局：安全策略统一管控）
INSERT INTO sys_config VALUES(6, 100000, '系统管理-是否开启验证码',     'sys.captcha.enabled',           'true',     'Y', '0', 'admin', NOW(), '', null, '是否开启登录验证码功能');
-- 注册开关（租户级：不同租户可独立控制）
INSERT INTO sys_config VALUES(7, 100000, '系统管理-是否开启用户注册',   'sys.account.registerUser',      'false',    'Y', '1', 'admin', NOW(), '', null, '是否开启注册用户功能');
-- 文件上传配置（全局：安全策略统一管控）
INSERT INTO sys_config VALUES(8, 100000, '文件上传-单文件大小限制(MB)', 'sys.upload.maxFileSize',        '50',       'Y', '0', 'admin', NOW(), '', null, '单个文件上传大小限制');
INSERT INTO sys_config VALUES(9, 100000, '文件上传-允许的文件类型',     'sys.upload.allowedTypes',       'jpg,jpeg,png,gif,bmp,doc,docx,xls,xlsx,ppt,pptx,pdf,txt,zip,rar', 'Y', '0', 'admin', NOW(), '', null, '允许上传的文件扩展名');

-- 验证码配置（全局：安全策略统一管控）
INSERT INTO sys_config VALUES(10, 100000, '验证码-滑块容错值(像素)',       'sys.captcha.tolerance',         '8',        'Y', '0', 'admin', NOW(), '', null, '滑块验证码允许的像素偏差范围');
INSERT INTO sys_config VALUES(11, 100000, '验证码-有效期(秒)',             'sys.captcha.ttl',               '300',      'Y', '0', 'admin', NOW(), '', null, '验证码生成后的有效时间');
INSERT INTO sys_config VALUES(12, 100000, '验证码-每日单IP验证次数限制',   'sys.captcha.dailyLimit',        '100',      'Y', '0', 'admin', NOW(), '', null, '同一IP每天最多验证次数');
INSERT INTO sys_config VALUES(13, 100000, '验证码-通过Token有效期(秒)',    'sys.captcha.passTokenTtl',      '120',      'Y', '0', 'admin', NOW(), '', null, '验证通过后Token的有效时间');

-- 考勤配置（租户级：不同租户上下班时间不同）
INSERT INTO sys_config VALUES(14, 100000, '考勤管理-上班时间',             'sys.attendance.workStartTime',  '09:00',    'Y', '1', 'admin', NOW(), '', null, '每日上班打卡时间，格式 HH:mm');
INSERT INTO sys_config VALUES(15, 100000, '考勤管理-下班时间',             'sys.attendance.workEndTime',    '18:00',    'Y', '1', 'admin', NOW(), '', null, '每日下班打卡时间，格式 HH:mm');
INSERT INTO sys_config VALUES(16, 100000, '考勤管理-迟到阈值(分钟)',       'sys.attendance.lateThreshold',  '15',       'Y', '1', 'admin', NOW(), '', null, '超过上班时间多少分钟算迟到');
INSERT INTO sys_config VALUES(17, 100000, '考勤管理-早退阈值(分钟)',       'sys.attendance.earlyLeaveThreshold', '15',  'Y', '1', 'admin', NOW(), '', null, '早于下班时间多少分钟算早退');
INSERT INTO sys_config VALUES(18, 100000, '考勤管理-加班阈值(分钟)',       'sys.attendance.overtimeThreshold',   '30',  'Y', '1', 'admin', NOW(), '', null, '超过下班时间多少分钟算加班');
INSERT INTO sys_config VALUES(19, 100000, '考勤管理-打卡半径(米)',         'sys.attendance.checkInRadius',  '500',      'Y', '1', 'admin', NOW(), '', null, '允许打卡的地理围栏半径');

-- 公告配置（租户级）
INSERT INTO sys_config VALUES(20, 100000, '公告管理-默认过期天数',         'sys.announcement.defaultExpireDays', '30',  'Y', '1', 'admin', NOW(), '', null, '公告默认过期天数');
INSERT INTO sys_config VALUES(21, 100000, '公告管理-最大附件大小(MB)',     'sys.announcement.maxAttachmentSize', '10',  'Y', '1', 'admin', NOW(), '', null, '公告附件最大上传大小');

-- 车辆管理配置（租户级）
INSERT INTO sys_config VALUES(22, 100000, '车辆管理-最大预订天数',         'sys.vehicle.maxBookingDays',    '7',        'Y', '1', 'admin', NOW(), '', null, '单次车辆预订最大天数');
INSERT INTO sys_config VALUES(23, 100000, '车辆管理-提前预订小时数',       'sys.vehicle.advanceBookingHours', '2',      'Y', '1', 'admin', NOW(), '', null, '需提前多少小时预订车辆');

-- 会议室配置（租户级）
INSERT INTO sys_config VALUES(24, 100000, '会议室-最大预订小时数',         'sys.meetingRoom.maxBookingHours', '4',      'Y', '1', 'admin', NOW(), '', null, '单次会议室预订最大小时数');
INSERT INTO sys_config VALUES(25, 100000, '会议室-自动释放分钟数',         'sys.meetingRoom.autoReleaseMinutes', '15',  'Y', '1', 'admin', NOW(), '', null, '预订开始后未签到自动释放的分钟数');

-- 资产管理配置（租户级）
INSERT INTO sys_config VALUES(26, 100000, '资产管理-二维码前缀',           'sys.asset.qrCodePrefix',        'ASSET-',   'Y', '1', 'admin', NOW(), '', null, '资产二维码编号前缀');
INSERT INTO sys_config VALUES(27, 100000, '资产管理-折旧方法',             'sys.asset.depreciationMethod',  'STRAIGHT_LINE', 'Y', '1', 'admin', NOW(), '', null, '资产折旧计算方法：STRAIGHT_LINE(直线法)');

-- 工作流配置（全局：引擎级参数统一管控）
INSERT INTO sys_config VALUES(28, 100000, '工作流-流程最大深度',           'sys.workflow.maxDepth',         '500',      'Y', '0', 'admin', NOW(), '', null, '流程执行最大深度，防止循环流程导致堆栈溢出');
INSERT INTO sys_config VALUES(29, 100000, '工作流-撤回时间窗口(小时)',     'sys.workflow.recallTimeoutHours', '24',     'Y', '1', 'admin', NOW(), '', null, '流程提交后允许撤回的时间窗口，0表示不限制');
INSERT INTO sys_config VALUES(30, 100000, '工作流-失败最大重试次数',       'sys.workflow.maxRetryCount',    '5',        'Y', '0', 'admin', NOW(), '', null, '工作流节点执行失败后的最大重试次数');

-- 日志配置（全局：基础设施统一管控）
INSERT INTO sys_config VALUES(31, 100000, '日志管理-请求参数最大长度',     'sys.log.maxLength',             '2000',     'Y', '0', 'admin', NOW(), '', null, '操作日志记录请求参数的最大字符长度');
INSERT INTO sys_config VALUES(32, 100000, '日志管理-是否开启操作日志',     'sys.log.enabled',               'true',     'Y', '0', 'admin', NOW(), '', null, '是否开启操作日志记录功能');
INSERT INTO sys_config VALUES(33, 100000, '日志管理-是否记录请求报文体',   'sys.log.requestEnabled',        'true',     'Y', '0', 'admin', NOW(), '', null, '是否记录请求参数到日志中');

-- 安全认证配置（全局：Token策略统一管控）
INSERT INTO sys_config VALUES(34, 100000, '安全认证-Token过期时间(分钟)',   'sys.security.token.expiration', '30',       'Y', '0', 'admin', NOW(), '', null, '登录 Token 过期时间，单位分钟');
INSERT INTO sys_config VALUES(35, 100000, '安全认证-Token刷新时间(分钟)',   'sys.security.token.refreshTime','20',       'Y', '0', 'admin', NOW(), '', null, 'Token距过期不足此时间时自动刷新');

-- 滑块验证码图片配置（全局）
INSERT INTO sys_config VALUES(36, 100000, '验证码-背景图宽度(像素)',       'sys.captcha.width',             '300',      'Y', '0', 'admin', NOW(), '', null, '滑块验证码背景图宽度');
INSERT INTO sys_config VALUES(37, 100000, '验证码-背景图高度(像素)',       'sys.captcha.height',            '150',      'Y', '0', 'admin', NOW(), '', null, '滑块验证码背景图高度');
INSERT INTO sys_config VALUES(38, 100000, '验证码-拼图块大小(像素)',       'sys.captcha.puzzleSize',        '44',       'Y', '0', 'admin', NOW(), '', null, '滑块验证码拼图块逻辑宽度');
INSERT INTO sys_config VALUES(39, 100000, '验证码-圆弧半径(像素)',         'sys.captcha.circleRadius',      '8',        'Y', '0', 'admin', NOW(), '', null, '滑块验证码凸出圆弧半径');

-- 工作流引擎扩展配置（全局）
INSERT INTO sys_config VALUES(40, 100000, '工作流-定时器扫描最大重试次数', 'sys.workflow.timerMaxRetry',     '3',        'Y', '0', 'admin', NOW(), '', null, '定时器节点执行失败后的最大重试次数');
INSERT INTO sys_config VALUES(41, 100000, '工作流-定时器重试间隔(分钟)',   'sys.workflow.timerRetryInterval','2',        'Y', '0', 'admin', NOW(), '', null, '定时器节点重试间隔时间');
INSERT INTO sys_config VALUES(42, 100000, '工作流-事务重试基数(秒)',       'sys.workflow.retryBaseInterval', '30',       'Y', '0', 'admin', NOW(), '', null, '事务一致性重试间隔基数，采用指数退避');
INSERT INTO sys_config VALUES(43, 100000, '工作流-异步状态过期(分钟)',     'sys.workflow.asyncStatusExpire', '10',       'Y', '0', 'admin', NOW(), '', null, '异步工作流状态在Redis中的过期时间');
INSERT INTO sys_config VALUES(44, 100000, '工作流-Nonce防重放过期(分钟)',  'sys.workflow.nonceExpireMinutes','5',        'Y', '0', 'admin', NOW(), '', null, '请求Nonce防重放攻击的过期时间');

-- 分布式锁配置（全局）
INSERT INTO sys_config VALUES(45, 100000, '分布式锁-会签锁等待(秒)',       'sys.workflow.lock.countersignWait',  '10',   'Y', '0', 'admin', NOW(), '', null, '会签操作获取分布式锁的等待超时');
INSERT INTO sys_config VALUES(46, 100000, '分布式锁-会签锁持有(秒)',       'sys.workflow.lock.countersignLease', '30',   'Y', '0', 'admin', NOW(), '', null, '会签操作分布式锁的自动释放时间');
INSERT INTO sys_config VALUES(47, 100000, '分布式锁-死锁检测超时(秒)',     'sys.workflow.lock.deadlockTimeout', '60',   'Y', '0', 'admin', NOW(), '', null, '锁持有超过此时间视为可能死锁');
INSERT INTO sys_config VALUES(48, 100000, '分布式锁-死锁牺牲记录上限',     'sys.workflow.lock.maxVictimRecords',     '100',      'Y', '0', 'admin', NOW(), '', null, '死锁牺牲记录最大保留数量');

-- SSE实时推送配置（全局）
INSERT INTO sys_config VALUES(49, 100000, 'SSE-连接超时时间(毫秒)',        'sys.sse.timeout',               '0',        'Y', '0', 'admin', NOW(), '', null, 'SSE连接超时时间，0表示永不超时');

-- 分页配置（全局）
INSERT INTO sys_config VALUES(50, 100000, '分页-默认页码',                 'sys.page.defaultPageNum',       '1',        'Y', '0', 'admin', NOW(), '', null, '分页查询默认起始页码');
INSERT INTO sys_config VALUES(51, 100000, '分页-默认每页条数',             'sys.page.defaultPageSize',      '10',       'Y', '0', 'admin', NOW(), '', null, '分页查询默认每页显示条数');

-- 租户配置（全局）
INSERT INTO sys_config VALUES(52, 100000, '租户-默认租户ID',               'sys.tenant.defaultId',          '100000',   'Y', '0', 'admin', NOW(), '', null, '系统默认租户ID');
INSERT INTO sys_config VALUES(53, 100000, '租户-默认用户数量限制',         'sys.tenant.defaultUserLimit',   '100',      'Y', '0', 'admin', NOW(), '', null, '新建租户默认用户数量上限');
INSERT INTO sys_config VALUES(54, 100000, '租户-默认存储空间(MB)',         'sys.tenant.defaultStorageLimit','10240',    'Y', '0', 'admin', NOW(), '', null, '新建租户默认存储空间限制');

-- OA补充配置（租户级）
INSERT INTO sys_config VALUES(55, 100000, '公告管理-是否允许匿名阅读',     'sys.announcement.allowAnonymous','false',   'Y', '1', 'admin', NOW(), '', null, '是否允许未登录用户查看公告');
INSERT INTO sys_config VALUES(56, 100000, '资产管理-二维码大小(像素)',     'sys.asset.qrCodeSize',          '200',      'Y', '1', 'admin', NOW(), '', null, '资产二维码图片尺寸');
INSERT INTO sys_config VALUES(57, 100000, '资产管理-是否启用二维码',       'sys.asset.enableQrCode',        'true',     'Y', '1', 'admin', NOW(), '', null, '是否为资产自动生成二维码');
INSERT INTO sys_config VALUES(58, 100000, '车辆管理-是否允许并发预订',     'sys.vehicle.allowConcurrent',   'false',    'Y', '1', 'admin', NOW(), '', null, '同一车辆是否允许时间段重叠预订');
INSERT INTO sys_config VALUES(59, 100000, '车辆管理-油价更新Cron表达式',   'sys.vehicle.fuelPriceUpdateCron','0 0 2 * * ?','Y','1','admin', NOW(), '', null, '油价自动更新定时任务Cron表达式');
INSERT INTO sys_config VALUES(60, 100000, '会议室-提前预订小时数',         'sys.meetingRoom.advanceBookingHours','1',    'Y', '1', 'admin', NOW(), '', null, '需提前多少小时预订会议室');
INSERT INTO sys_config VALUES(61, 100000, '会议室-是否允许并发预订',       'sys.meetingRoom.allowConcurrent','false',   'Y', '1', 'admin', NOW(), '', null, '同一会议室是否允许时间段重叠预订');

-- 加密配置（全局：安全策略统一管控）
INSERT INTO sys_config VALUES(62, 100000, '加密-是否启用字段加密',         'sys.encrypt.enabled',           'true',     'Y', '0', 'admin', NOW(), '', null, '是否启用数据库字段加密功能');

-- 数据权限配置（全局）
INSERT INTO sys_config VALUES(63, 100000, '数据权限-部门字段名',           'sys.datascope.deptColumn',      'dept_id',  'Y', '0', 'admin', NOW(), '', null, '数据权限过滤使用的部门字段名');
INSERT INTO sys_config VALUES(64, 100000, '数据权限-用户字段名',           'sys.datascope.userColumn',      'create_by','Y', '0', 'admin', NOW(), '', null, '数据权限过滤使用的用户字段名');

-- 工作流Stream配置（全局）
INSERT INTO sys_config VALUES(65, 100000, '工作流-Stream Key',             'sys.workflow.stream.key',       'workflow:stream:timeout', 'Y', '0', 'admin', NOW(), '', null, 'Redis Stream消息队列Key名称');
INSERT INTO sys_config VALUES(66, 100000, '工作流-Stream消费组',           'sys.workflow.stream.group',     'group:workflow:engine',   'Y', '0', 'admin', NOW(), '', null, 'Redis Stream消费者组名称');

-- 网关配置（全局）
INSERT INTO sys_config VALUES(67, 100000, '网关-默认租户ID',               'sys.gateway.defaultTenantId',   '100000',   'Y', '0', 'admin', NOW(), '', null, '请求未携带租户ID时使用的默认值');

-- OSS对象存储配置（全局）
INSERT INTO sys_config VALUES(68, 100000, 'OSS-是否启用HTTPS',             'sys.oss.isHttps',               'N',        'Y', '0', 'admin', NOW(), '', null, '对象存储是否使用HTTPS协议');
INSERT INTO sys_config VALUES(69, 100000, 'OSS-默认访问策略',              'sys.oss.accessPolicy',          '1',        'Y', '0', 'admin', NOW(), '', null, '桶默认访问策略：0私有 1公共读 2公共读写');

-- =========================================================
-- Phase 2: 性能优化与监控告警配置（全局）
-- =========================================================

-- 异步线程池配置 - 工作流执行器
INSERT INTO sys_config VALUES(70, 100000, '异步-工作流核心线程数',         'sys.workflow.async.workflow.corePoolSize',    '10',  'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器核心线程数');
INSERT INTO sys_config VALUES(71, 100000, '异步-工作流最大线程数',         'sys.workflow.async.workflow.maxPoolSize',     '20',  'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器最大线程数');
INSERT INTO sys_config VALUES(72, 100000, '异步-工作流队列容量',           'sys.workflow.async.workflow.queueCapacity',   '200', 'Y', '0', 'admin', NOW(), '', null, '工作流异步执行器队列容量');

-- 异步线程池配置 - 通知执行器
INSERT INTO sys_config VALUES(73, 100000, '异步-通知核心线程数',           'sys.workflow.async.notification.corePoolSize', '5',  'Y', '0', 'admin', NOW(), '', null, '通知异步执行器核心线程数');
INSERT INTO sys_config VALUES(74, 100000, '异步-通知最大线程数',           'sys.workflow.async.notification.maxPoolSize',  '10', 'Y', '0', 'admin', NOW(), '', null, '通知异步执行器最大线程数');
INSERT INTO sys_config VALUES(75, 100000, '异步-通知队列容量',             'sys.workflow.async.notification.queueCapacity','100','Y', '0', 'admin', NOW(), '', null, '通知异步执行器队列容量');

-- 异步线程池配置 - 审计执行器
INSERT INTO sys_config VALUES(76, 100000, '异步-审计核心线程数',           'sys.workflow.async.audit.corePoolSize',       '3',  'Y', '0', 'admin', NOW(), '', null, '审计异步执行器核心线程数');
INSERT INTO sys_config VALUES(77, 100000, '异步-审计最大线程数',           'sys.workflow.async.audit.maxPoolSize',        '5',  'Y', '0', 'admin', NOW(), '', null, '审计异步执行器最大线程数');
INSERT INTO sys_config VALUES(78, 100000, '异步-审计队列容量',             'sys.workflow.async.audit.queueCapacity',      '500','Y', '0', 'admin', NOW(), '', null, '审计异步执行器队列容量');

-- Redis缓存配置
INSERT INTO sys_config VALUES(79, 100000, '缓存-流程定义TTL(秒)',          'sys.workflow.cache.definition.ttl',           '3600','Y', '0', 'admin', NOW(), '', null, '流程定义缓存过期时间（1小时）');
INSERT INTO sys_config VALUES(80, 100000, '缓存-表单定义TTL(秒)',          'sys.workflow.cache.form.ttl',                 '3600','Y', '0', 'admin', NOW(), '', null, '表单定义缓存过期时间（1小时）');
INSERT INTO sys_config VALUES(81, 100000, '缓存-用户信息TTL(秒)',          'sys.workflow.cache.user.ttl',                 '1800','Y', '0', 'admin', NOW(), '', null, '用户信息缓存过期时间（30分钟）');

-- 流程监控配置
INSERT INTO sys_config VALUES(82, 100000, '监控-数据保留天数',             'sys.workflow.monitor.retentionDays',          '90',  'Y', '0', 'admin', NOW(), '', null, '流程监控数据保留天数');
INSERT INTO sys_config VALUES(83, 100000, '监控-采样间隔(秒)',             'sys.workflow.monitor.sampleInterval',         '60',  'Y', '0', 'admin', NOW(), '', null, '流程监控数据采样间隔');

-- 超时告警配置
INSERT INTO sys_config VALUES(84, 100000, '告警-超时检测间隔(分钟)',       'sys.workflow.alert.timeout.checkInterval',    '5',   'Y', '0', 'admin', NOW(), '', null, '超时任务检测间隔');
INSERT INTO sys_config VALUES(85, 100000, '告警-超时提醒阈值(小时)',       'sys.workflow.alert.timeout.warningHours',     '24',  'Y', '0', 'admin', NOW(), '', null, '任务超时提醒阈值');
INSERT INTO sys_config VALUES(86, 100000, '告警-超时严重阈值(小时)',       'sys.workflow.alert.timeout.criticalHours',    '72',  'Y', '0', 'admin', NOW(), '', null, '任务超时严重告警阈值');

-- 异常检测配置
INSERT INTO sys_config VALUES(87, 100000, '告警-异常检测间隔(分钟)',       'sys.workflow.alert.anomaly.checkInterval',    '10',  'Y', '0', 'admin', NOW(), '', null, '异常流程检测间隔');
INSERT INTO sys_config VALUES(88, 100000, '告警-失败重试阈值',             'sys.workflow.alert.anomaly.retryThreshold',   '3',   'Y', '0', 'admin', NOW(), '', null, '流程失败重试次数告警阈值');

-- 性能优化配置
INSERT INTO sys_config VALUES(89, 100000, '性能-批量查询大小',             'sys.workflow.performance.batchSize',          '100', 'Y', '0', 'admin', NOW(), '', null, '批量查询单次最大记录数');
INSERT INTO sys_config VALUES(90, 100000, '性能-慢查询阈值(毫秒)',         'sys.workflow.performance.slowQueryThreshold', '1000','Y', '0', 'admin', NOW(), '', null, '慢查询告警阈值');

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

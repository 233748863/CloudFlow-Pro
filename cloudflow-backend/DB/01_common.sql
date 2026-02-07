-- =========================================================
-- CloudFlow Pro - 公共模块数据库初始化脚本
-- 包含：用户管理、角色权限、部门组织、菜单、多租户
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 1. 用户表 (User)
-- ----------------------------
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
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (user_id),
  KEY idx_user_tenant (tenant_id),
  UNIQUE KEY uk_user_name_tenant (user_name, tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';

-- ----------------------------
-- 2. 部门表 (Department)
-- ----------------------------
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

-- ----------------------------
-- 3. 角色表 (Role)
-- ----------------------------
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

-- ----------------------------
-- 4. 菜单权限表 (Menu)
-- ----------------------------
DROP TABLE IF EXISTS sys_menu;
CREATE TABLE sys_menu (
  menu_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  menu_name         VARCHAR(50)     NOT NULL COMMENT '菜单名称',
  parent_id         BIGINT(20)      DEFAULT 0 COMMENT '父菜单ID',
  order_num         INT(4)          DEFAULT 0 COMMENT '显示顺序',
  path              VARCHAR(200)    DEFAULT '' COMMENT '路由地址',
  component         VARCHAR(255)    DEFAULT NULL COMMENT '组件路径',
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

-- ----------------------------
-- 5. 用户和角色关联表 (User-Role)
-- ----------------------------
DROP TABLE IF EXISTS sys_user_role;
CREATE TABLE sys_user_role (
  user_id   BIGINT(20) NOT NULL COMMENT '用户ID',
  role_id   BIGINT(20) NOT NULL COMMENT '角色ID',
  tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户和角色关联表';

-- ----------------------------
-- 6. 角色和菜单关联表 (Role-Menu)
-- ----------------------------
DROP TABLE IF EXISTS sys_role_menu;
CREATE TABLE sys_role_menu (
  role_id   BIGINT(20) NOT NULL COMMENT '角色ID',
  menu_id   BIGINT(20) NOT NULL COMMENT '菜单ID',
  tenant_id BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色和菜单关联表';

-- ----------------------------
-- 7. 租户表
-- ----------------------------
DROP TABLE IF EXISTS sys_tenant;
CREATE TABLE sys_tenant (
  tenant_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '租户ID',
  tenant_name       VARCHAR(50)     NOT NULL COMMENT '租户名称',
  domain            VARCHAR(100)    DEFAULT NULL COMMENT '域名(可选)',
  contact           VARCHAR(50)     DEFAULT NULL COMMENT '联系人',
  phone             VARCHAR(20)     DEFAULT NULL COMMENT '联系电话',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0正常 1停用）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100000 DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- ----------------------------
-- 8. 文件管理表
-- ----------------------------
DROP TABLE IF EXISTS sys_file;
CREATE TABLE sys_file (
  file_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '文件ID',
  file_name         VARCHAR(255)    DEFAULT '' COMMENT '原始文件名',
  file_path         VARCHAR(255)    DEFAULT '' COMMENT '存储路径',
  url               VARCHAR(500)    DEFAULT '' COMMENT '访问地址',
  file_size         BIGINT(20)      DEFAULT 0  COMMENT '文件大小',
  file_type         VARCHAR(50)     DEFAULT '' COMMENT '文件类型',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '上传者',
  create_time       DATETIME        COMMENT '上传时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志（0代表存在 2代表删除）',
  remark            VARCHAR(255)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (file_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='文件管理表';

-- =========================================================
-- 初始化数据
-- =========================================================

-- 1. 初始化租户
INSERT INTO sys_tenant (tenant_id, tenant_name, status, create_time) VALUES (100000, '默认租户', '0', NOW());

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

-- 4. 初始化用户数据 (密码统一为: 123456)
INSERT INTO sys_user VALUES(1,  100000, 100, 'admin', 'Admin', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '超级管理员');
INSERT INTO sys_user VALUES(2,  100000, 101, 'li', '李经理', 'li@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '研发部经理');
INSERT INTO sys_user VALUES(3,  100000, 102, 'wang', '王财务', 'wang@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '财务专员');
INSERT INTO sys_user VALUES(4,  100000, 103, 'zhao', '赵HR', 'zhao@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, 'HR经理');
INSERT INTO sys_user VALUES(5,  100000, 101, 'zhang', '张三', 'zhang@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '研发工程师');
INSERT INTO sys_user VALUES(6,  100000, 104, 'liu', '刘法务', 'liu@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '法务总监');
INSERT INTO sys_user VALUES(7,  100000, 105, 'chen', '陈IT', 'chen@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '系统管理员');

-- 5. 初始化用户角色关联
INSERT INTO sys_user_role VALUES(1, 1, 100000);
INSERT INTO sys_user_role VALUES(2, 2, 100000);
INSERT INTO sys_user_role VALUES(3, 3, 100000);
INSERT INTO sys_user_role VALUES(4, 4, 100000);
INSERT INTO sys_user_role VALUES(5, 5, 100000);
INSERT INTO sys_user_role VALUES(6, 1, 100000);
INSERT INTO sys_user_role VALUES(7, 1, 100000);

-- 6. 初始化菜单权限
INSERT INTO sys_menu VALUES(1, '系统管理', 0, 1, 'system', NULL, 0, 0, 'M', '0', '0', '', '#', 'admin', sysdate(), '', null, '系统管理目录');
INSERT INTO sys_menu VALUES(100, '用户管理', 1, 1, 'user', 'system/user/index', 0, 0, 'C', '0', '0', 'system:user:list', '#', 'admin', sysdate(), '', null, '用户管理菜单');
INSERT INTO sys_menu VALUES(101, '角色管理', 1, 2, 'role', 'system/role/index', 0, 0, 'C', '0', '0', 'system:role:list', '#', 'admin', sysdate(), '', null, '角色管理菜单');

INSERT INTO sys_menu VALUES(2, '工作流', 0, 2, 'workflow', NULL, 0, 0, 'M', '0', '0', '', '#', 'admin', sysdate(), '', null, '工作流目录');
INSERT INTO sys_menu VALUES(200, '我的待办', 2, 1, 'task', 'workflow/task/index', 0, 0, 'C', '0', '0', 'workflow:task:list', '#', 'admin', sysdate(), '', null, '我的待办');
INSERT INTO sys_menu VALUES(201, '流程设计', 2, 2, 'model', 'workflow/model/index', 0, 0, 'C', '0', '0', 'workflow:model:list', '#', 'admin', sysdate(), '', null, '流程设计');

-- 7. 初始化角色菜单关联
INSERT INTO sys_role_menu VALUES(2, 2, 100000);
INSERT INTO sys_role_menu VALUES(2, 200, 100000);
INSERT INTO sys_role_menu VALUES(3, 2, 100000);
INSERT INTO sys_role_menu VALUES(3, 200, 100000);
INSERT INTO sys_role_menu VALUES(4, 2, 100000);
INSERT INTO sys_role_menu VALUES(4, 200, 100000);
INSERT INTO sys_role_menu VALUES(5, 2, 100000);
INSERT INTO sys_role_menu VALUES(5, 200, 100000);

SET FOREIGN_KEY_CHECKS = 1;

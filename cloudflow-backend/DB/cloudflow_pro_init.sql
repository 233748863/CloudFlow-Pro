-- CloudFlow Pro Database Initialization Script
-- This script initializes the database schema and default data.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- Import from 01_schema.sql
-- =========================================================
-- ----------------------------
-- 1. 用户表 (User)
-- ----------------------------
DROP TABLE IF EXISTS sys_user;
CREATE TABLE sys_user (
  user_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '用户ID',
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
  PRIMARY KEY (user_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='用户信息表';

-- ----------------------------
-- 2. 部门表 (Department)
-- ----------------------------
DROP TABLE IF EXISTS sys_dept;
CREATE TABLE sys_dept (
  dept_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '部门id',
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
  PRIMARY KEY (dept_id)
) ENGINE=InnoDB AUTO_INCREMENT=200 DEFAULT CHARSET=utf8mb4 COMMENT='部门表';

-- ----------------------------
-- 3. 角色表 (Role)
-- ----------------------------
DROP TABLE IF EXISTS sys_role;
CREATE TABLE sys_role (
  role_id           BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '角色ID',
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
  PRIMARY KEY (role_id)
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
  PRIMARY KEY (user_id, role_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='用户和角色关联表';

-- ----------------------------
-- 6. 角色和菜单关联表 (Role-Menu)
-- ----------------------------
DROP TABLE IF EXISTS sys_role_menu;
CREATE TABLE sys_role_menu (
  role_id   BIGINT(20) NOT NULL COMMENT '角色ID',
  menu_id   BIGINT(20) NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (role_id, menu_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='角色和菜单关联表';


-- =========================================================
-- Import from 03_workflow_engine.sql
-- =========================================================
-- ----------------------------
-- 1. 流程实例表 (Process Instance)
-- 记录每一次发起的业务申请
-- ----------------------------
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT '实例ID (UUID)',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key (如 purchase_request)',
  business_key      VARCHAR(64)     NOT NULL COMMENT '业务主键ID',
  title             VARCHAR(255)    DEFAULT NULL COMMENT '流程标题',
  start_user_id     BIGINT(20)      NOT NULL COMMENT '发起人ID',
  start_user_name   VARCHAR(64)     DEFAULT NULL COMMENT '发起人姓名',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '状态 (RUNNING, COMPLETED, CANCELLED)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  variables         JSON            DEFAULT NULL COMMENT '流程变量(表单数据)',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流实例表';

-- ----------------------------
-- 2. 流程任务表 (Task)
-- 记录当前待办任务
-- ----------------------------
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID (UUID)',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key (前端设计的节点ID)',
  node_name         VARCHAR(64)     NOT NULL COMMENT '节点名称',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT '候选角色(JSON/逗号分隔)',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态 (TODO, DONE)',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  due_time          DATETIME        DEFAULT NULL COMMENT '截止时间',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流任务表';

-- ----------------------------
-- 3. 任务历史表 (Task History)
-- 记录审批日志
-- ----------------------------
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT '历史ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '原任务ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_name         VARCHAR(64)     DEFAULT NULL COMMENT '节点名称',
  operator_id       BIGINT(20)      DEFAULT NULL COMMENT '操作人ID',
  action            VARCHAR(20)     DEFAULT NULL COMMENT '动作 (APPROVE, REJECT)',
  comment           VARCHAR(500)    DEFAULT NULL COMMENT '审批意见',
  create_time       DATETIME        DEFAULT NULL COMMENT '操作时间',
  PRIMARY KEY (history_id),
  KEY idx_instance_hist (instance_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流任务历史表';


-- ----------------------------
-- 4. 流程定义表 (Process Definition)
-- 存储流程元数据和模型
-- ----------------------------
DROP TABLE IF EXISTS wf_process_definition;
CREATE TABLE wf_process_definition (
  definition_id     VARCHAR(64)     NOT NULL COMMENT '定义ID',
  process_name      VARCHAR(64)     NOT NULL COMMENT '流程名称',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             DEFAULT 1 COMMENT '版本号',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '绑定的表单ID',
  model_json        LONGTEXT        COMMENT '流程模型JSON',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';


-- ----------------------------
-- 5. 表单定义表 (Form Definition)
-- 存储动态表单结构
-- ----------------------------
DROP TABLE IF EXISTS wf_form_definition;
CREATE TABLE wf_form_definition (
  form_id           VARCHAR(64)     NOT NULL COMMENT '表单ID',
  form_name         VARCHAR(64)     NOT NULL COMMENT '表单名称',
  form_key          VARCHAR(64)     DEFAULT NULL COMMENT '表单Key',
  fields_json       LONGTEXT        COMMENT '表单字段JSON',
  version           INT             DEFAULT 1 COMMENT '版本号',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (form_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单定义表';


-- =========================================================
-- Import from 08_notification.sql
-- =========================================================
-- ----------------------------
-- 7. 系统通知表
-- ----------------------------
DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '公告ID',
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

-- ----------------------------
-- 8. 任务已读记录表
-- ----------------------------
DROP TABLE IF EXISTS wf_task_read;
CREATE TABLE wf_task_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME        COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_task_user (task_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务已读记录表';

-- ----------------------------
-- 9. 任务催办记录表
-- ----------------------------
DROP TABLE IF EXISTS wf_task_urge;
CREATE TABLE wf_task_urge (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'ID',
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID',
  sender_id         BIGINT(20)      NOT NULL COMMENT '催办人ID',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '被催办人ID',
  reason            VARCHAR(200)    DEFAULT NULL COMMENT '催办原因',
  create_time       DATETIME        COMMENT '催办时间',
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='任务催办记录表';


-- =========================================================
-- Import from 09_file_module.sql
-- =========================================================
-- ----------------------------
-- 10. 文件管理表
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
-- Import from 10_sys_work_task.sql
-- =========================================================
-- ----------------------------
-- Table structure for sys_work_task
-- ----------------------------
DROP TABLE IF EXISTS `sys_work_task`;
CREATE TABLE `sys_work_task` (
  `task_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '任务ID',
  `title` varchar(255) NOT NULL COMMENT '任务标题',
  `description` text COMMENT '任务描述',
  `assignee_id` bigint(20) DEFAULT NULL COMMENT '负责人ID',
  `owner_id` bigint(20) DEFAULT NULL COMMENT '创建人/所有者ID',
  `priority` int(4) DEFAULT '1' COMMENT '优先级 (0:低, 1:中, 2:高)',
  `status` varchar(20) DEFAULT 'TODO' COMMENT '状态 (TODO, DOING, DONE)',
  `due_date` datetime DEFAULT NULL COMMENT '截止时间',
  `tags` varchar(500) DEFAULT NULL COMMENT '标签 (JSON数组)',
  `parent_id` bigint(20) DEFAULT NULL COMMENT '父任务ID',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志 (0代表存在 2代表删除)',
  PRIMARY KEY (`task_id`),
  KEY `idx_assignee` (`assignee_id`),
  KEY `idx_owner` (`owner_id`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='协作任务表';

-- ----------------------------
-- Init Data for sys_work_task
-- ----------------------------
INSERT INTO `sys_work_task` (`title`, `description`, `assignee_id`, `owner_id`, `priority`, `status`, `create_time`, `create_by`) VALUES 
('完成OA系统任务管理模块设计', '包括数据库设计和前后端接口定义', 1, 1, 2, 'DONE', NOW(), 'admin'),
('开发任务看板功能', '前端使用 dnd-kit 实现拖拽看板', 1, 1, 2, 'DOING', NOW(), 'admin'),
('编写用户手册', '更新系统使用文档', 1, 1, 1, 'TODO', NOW(), 'admin');


-- =========================================================
-- Import from 11_sys_announcement.sql
-- =========================================================
-- ----------------------------
-- Table structure for sys_announcement
-- ----------------------------
DROP TABLE IF EXISTS `sys_announcement`;
CREATE TABLE `sys_announcement` (
  `announcement_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  `title` varchar(255) NOT NULL COMMENT '公告标题',
  `content` longtext COMMENT '公告内容(HTML)',
  `type` char(1) DEFAULT '1' COMMENT '类型 (1:通知, 2:公告, 3:紧急)',
  `scope_type` varchar(20) DEFAULT 'ALL' COMMENT '发布范围 (ALL, DEPT, ROLE)',
  `scope_value` varchar(255) DEFAULT NULL COMMENT '范围值 (部门ID或角色ID)',
  `status` char(1) DEFAULT '0' COMMENT '状态 (0:草稿, 1:已发布, 2:已撤销)',
  `priority` char(1) DEFAULT 'M' COMMENT '优先级 (L:低, M:中, H:高)',
  `sender_id` bigint(20) DEFAULT NULL COMMENT '发布人ID',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志 (0代表存在 2代表删除)',
  PRIMARY KEY (`announcement_id`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统公告表';

-- ----------------------------
-- Table structure for sys_announcement_read
-- ----------------------------
DROP TABLE IF EXISTS `sys_announcement_read`;
CREATE TABLE `sys_announcement_read` (
  `id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '主键',
  `announcement_id` bigint(20) NOT NULL COMMENT '公告ID',
  `user_id` bigint(20) NOT NULL COMMENT '用户ID',
  `read_time` datetime DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_announcement_user` (`announcement_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告阅读记录表';

-- ----------------------------
-- Init Data for sys_announcement
-- ----------------------------
INSERT INTO `sys_announcement` (`title`, `content`, `type`, `scope_type`, `status`, `priority`, `sender_id`, `create_time`, `create_by`) VALUES 
('关于系统OA模块升级的通知', '<p>各位同事：</p><p>系统将于本周五晚进行升级，新增任务管理和公告中心模块，请知悉。</p>', '1', 'ALL', '1', 'H', 1, NOW(), 'admin'),
('2026年春节放假安排', '<p>春节放假7天，请各位同事提前安排好工作。</p>', '2', 'ALL', '1', 'M', 1, NOW(), 'admin');


-- =========================================================
-- Import from 12_sys_schedule.sql
-- =========================================================
-- ----------------------------
-- Table structure for sys_meeting_room
-- ----------------------------
DROP TABLE IF EXISTS `sys_meeting_room`;
CREATE TABLE `sys_meeting_room` (
  `room_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '会议室ID',
  `name` varchar(64) NOT NULL COMMENT '会议室名称',
  `capacity` int(11) DEFAULT NULL COMMENT '容量',
  `location` varchar(255) DEFAULT NULL COMMENT '位置',
  `equipment` varchar(500) DEFAULT NULL COMMENT '设备设施(JSON)',
  `status` char(1) DEFAULT '1' COMMENT '状态 (1:可用, 0:维护中)',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (`room_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COMMENT='会议室资源表';

-- ----------------------------
-- Table structure for sys_schedule_event
-- ----------------------------
DROP TABLE IF EXISTS `sys_schedule_event`;
CREATE TABLE `sys_schedule_event` (
  `event_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '事件ID',
  `title` varchar(255) NOT NULL COMMENT '日程主题',
  `description` text COMMENT '描述',
  `start_time` datetime NOT NULL COMMENT '开始时间',
  `end_time` datetime NOT NULL COMMENT '结束时间',
  `is_all_day` tinyint(1) DEFAULT '0' COMMENT '是否全天',
  `type` varchar(20) DEFAULT 'PERSONAL' COMMENT '类型 (MEETING, PERSONAL, WORK)',
  `room_id` bigint(20) DEFAULT NULL COMMENT '关联会议室ID',
  `creator_id` bigint(20) NOT NULL COMMENT '创建人ID',
  `attendees` varchar(1000) DEFAULT NULL COMMENT '参与人ID列表(JSON)',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `del_flag` char(1) DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (`event_id`),
  KEY `idx_creator` (`creator_id`),
  KEY `idx_room_time` (`room_id`, `start_time`, `end_time`)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='日程事件表';

-- ----------------------------
-- Init Data
-- ----------------------------
INSERT INTO `sys_meeting_room` (`name`, `capacity`, `location`, `equipment`, `status`, `create_time`) VALUES 
('大会议室A', 50, '3楼东侧', '["投影仪", "音响", "白板"]', '1', NOW()),
('小会议室B', 10, '3楼西侧', '["电视", "白板"]', '1', NOW()),
('VIP接待室', 8, '4楼', '["沙发", "茶具"]', '1', NOW());

INSERT INTO `sys_schedule_event` (`title`, `description`, `start_time`, `end_time`, `is_all_day`, `type`, `room_id`, `creator_id`, `attendees`, `create_time`) VALUES 
('项目周会', '本周工作进度汇报', DATE_ADD(NOW(), INTERVAL 1 DAY), DATE_ADD(NOW(), INTERVAL '1 1' DAY_HOUR), 0, 'MEETING', 1, 1, '[1,2]', NOW()),
('拜访客户', '去客户现场演示Demo', DATE_ADD(NOW(), INTERVAL 2 DAY), DATE_ADD(NOW(), INTERVAL 2 DAY), 1, 'WORK', NULL, 1, '[]', NOW());


-- =========================================================
-- Import from 13_multi_tenancy.sql
-- =========================================================
-- ----------------------------
-- 1. Create Tenant Table
-- ----------------------------
DROP TABLE IF EXISTS `sys_tenant`;
CREATE TABLE `sys_tenant` (
  `tenant_id` bigint(20) NOT NULL AUTO_INCREMENT COMMENT '租户ID',
  `tenant_name` varchar(50) NOT NULL COMMENT '租户名称',
  `domain` varchar(100) DEFAULT NULL COMMENT '域名(可选)',
  `contact` varchar(50) DEFAULT NULL COMMENT '联系人',
  `phone` varchar(20) DEFAULT NULL COMMENT '联系电话',
  `status` char(1) DEFAULT '0' COMMENT '状态（0正常 1停用）',
  `create_by` varchar(64) DEFAULT '' COMMENT '创建者',
  `create_time` datetime DEFAULT NULL COMMENT '创建时间',
  `update_by` varchar(64) DEFAULT '' COMMENT '更新者',
  `update_time` datetime DEFAULT NULL COMMENT '更新时间',
  `remark` varchar(500) DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (`tenant_id`)
) ENGINE=InnoDB AUTO_INCREMENT=100000 DEFAULT CHARSET=utf8mb4 COMMENT='租户表';

-- ----------------------------
-- 2. Init Default Tenant
-- ----------------------------
INSERT INTO `sys_tenant` (`tenant_id`, `tenant_name`, `status`, `create_time`) VALUES (100000, '默认租户', '0', NOW());

-- ----------------------------
-- 3. Add tenant_id to System Tables
-- ----------------------------

-- sys_user
ALTER TABLE `sys_user` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID' AFTER `user_id`;
CREATE INDEX `idx_user_tenant` ON `sys_user` (`tenant_id`);

-- sys_dept
ALTER TABLE `sys_dept` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID' AFTER `dept_id`;
CREATE INDEX `idx_dept_tenant` ON `sys_dept` (`tenant_id`);

-- sys_role
ALTER TABLE `sys_role` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID' AFTER `role_id`;
CREATE INDEX `idx_role_tenant` ON `sys_role` (`tenant_id`);

-- sys_post (Assuming it exists, if not, this will fail or warn. Based on roadmap, maybe not used yet, but good practice)
-- ALTER TABLE `sys_post` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- sys_user_role
ALTER TABLE `sys_user_role` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- sys_role_menu
ALTER TABLE `sys_role_menu` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- ----------------------------
-- 4. Add tenant_id to Workflow Tables
-- ----------------------------

-- wf_process_definition
ALTER TABLE `wf_process_definition` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- wf_process_instance
ALTER TABLE `wf_process_instance` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';
CREATE INDEX `idx_proc_inst_tenant` ON `wf_process_instance` (`tenant_id`);

-- wf_task
ALTER TABLE `wf_task` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';
CREATE INDEX `idx_task_tenant` ON `wf_task` (`tenant_id`);

-- wf_task_log
ALTER TABLE `wf_task_log` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- wf_node_config (Assuming exists)
-- ALTER TABLE `wf_node_config` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- ----------------------------
-- 5. Add tenant_id to Business Tables
-- ----------------------------

-- sys_work_task
ALTER TABLE `sys_work_task` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';
CREATE INDEX `idx_work_task_tenant` ON `sys_work_task` (`tenant_id`);

-- sys_announcement
ALTER TABLE `sys_announcement` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- sys_announcement_read
ALTER TABLE `sys_announcement_read` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';

-- sys_schedule_event
ALTER TABLE `sys_schedule_event` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';
CREATE INDEX `idx_schedule_tenant` ON `sys_schedule_event` (`tenant_id`);

-- sys_meeting_room
ALTER TABLE `sys_meeting_room` ADD COLUMN `tenant_id` bigint(20) DEFAULT 100000 COMMENT '租户ID';



-- =========================================================
-- Import from 06_add_indexes.sql
-- =========================================================
-- Add indexes for performance optimization

-- Index for wf_task assignee (High frequency query for Todo list)
CREATE INDEX idx_wf_task_assignee ON wf_task(assignee);

-- Index for wf_process_instance business_key (Business correlation query)
CREATE INDEX idx_wf_inst_business_key ON wf_process_instance(business_key);

-- Additional useful indexes
CREATE INDEX idx_wf_inst_start_user ON wf_process_instance(start_user_id);
CREATE INDEX idx_wf_task_instance_id ON wf_task(instance_id);


-- =========================================================
-- Import from 14_tenant_fixes.sql
-- =========================================================
-- ----------------------------
-- Fix Unique Indexes for Multi-Tenancy
-- 将全局唯一索引调整为 (tenant_id + column) 的联合唯一索引
-- ----------------------------

-- 1. Sys User (username -> username + tenant_id)
-- 先尝试删除可能存在的旧索引 (如果不存在可能会报错，生产环境建议先检查)
DROP INDEX `uk_user_name` ON `sys_user`; 
-- 如果之前没有唯一索引，则直接创建新的
CREATE UNIQUE INDEX `uk_user_name_tenant` ON `sys_user` (`user_name`, `tenant_id`);

-- 2. Sys Role (role_key -> role_key + tenant_id)
-- 角色Key在同一租户下不能重复
DROP INDEX `uk_role_key` ON `sys_role`;
CREATE UNIQUE INDEX `uk_role_key_tenant` ON `sys_role` (`role_key`, `tenant_id`);

-- 3. Sys Dept (同一父部门下的子部门名称不能重复 -> 增加 tenant_id 维度)
-- 部门表通常没有严格的唯一索引，但如果有业务约束建议加上
-- 这里假设不做严格约束，或者仅对 parent_id + dept_name + tenant_id 做约束

-- 4. Sys Post (岗位编码)
-- DROP INDEX `uk_post_code` ON `sys_post`;
-- CREATE UNIQUE INDEX `uk_post_code_tenant` ON `sys_post` (`post_code`, `tenant_id`);

-- 5. Sys Config (Config Key)
DROP INDEX `uk_config_key` ON `sys_config`;
CREATE UNIQUE INDEX `uk_config_key_tenant` ON `sys_config` (`config_key`, `tenant_id`);

-- 6. Workflow Definition (Key + Version + Tenant)
-- 流程定义的Key在同一租户下应唯一（或者 Key+Version 唯一）
-- wf_process_definition 表通常由引擎维护，这里手动添加业务层的唯一约束
CREATE UNIQUE INDEX `uk_proc_def_key_ver_tenant` ON `wf_process_definition` (`process_key`, `version`, `tenant_id`);


-- =========================================================
-- Import from 04_nacos_config.sql
-- =========================================================
-- ----------------------------
-- Nacos Config Init Script
-- ----------------------------

-- 1. Gateway Configuration
INSERT INTO config_info (data_id, group_id, content, tenant_id, type, gmt_create, gmt_modified) VALUES ('cloudflow-gateway.yaml', 'DEFAULT_GROUP', 'server:
  port: 9000
spring:
  application:
    name: cloudflow-gateway
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
  cloud:
    nacos:
      discovery:
        server-addr: localhost:8848
    gateway:
      discovery:
        locator:
          enabled: true
      routes:
        - id: cloudflow-auth
          uri: lb://cloudflow-auth
          predicates:
            - Path=/auth/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@ipKeyResolver}"
                redis-rate-limiter.replenishRate: 20
                redis-rate-limiter.burstCapacity: 40
        - id: cloudflow-workflow
          uri: lb://cloudflow-workflow
          predicates:
            - Path=/workflow/**
          filters:
            - StripPrefix=0
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@userKeyResolver}"
                redis-rate-limiter.replenishRate: 50
                redis-rate-limiter.burstCapacity: 100
ignore:
  whites:
    - /auth/login
    - /auth/register
    - /doc.html
    - /swagger-ui.html
', '', 'yaml', NOW(), NOW());

-- 2. Auth Configuration
INSERT INTO config_info (data_id, group_id, content, tenant_id, type, gmt_create, gmt_modified) VALUES ('cloudflow-auth.yaml', 'DEFAULT_GROUP', 'server:
  port: 9001
spring:
  datasource:
    driver-class-name: "com.mysql.cj.jdbc.Driver"
    url: "jdbc:mysql://localhost:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=GMT%2B8"
    username: root
    password: password
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
mybatis-plus:
  mapper-locations: classpath*:mapper/**/*Mapper.xml
  type-aliases-package: com.cloudflow.auth.domain
  configuration:
    map-underscore-to-camel-case: true
logging:
  level:
    com.cloudflow: debug
', '', 'yaml', NOW(), NOW());

-- 3. Workflow Configuration
INSERT INTO config_info (data_id, group_id, content, tenant_id, type, gmt_create, gmt_modified) VALUES ('cloudflow-service-workflow.yaml', 'DEFAULT_GROUP', 'server:
  port: 9002
spring:
  datasource:
    driver-class-name: "com.mysql.cj.jdbc.Driver"
    url: "jdbc:mysql://localhost:3306/cloud_flow_db?useUnicode=true&characterEncoding=utf8&zeroDateTimeBehavior=convertToNull&useSSL=false&serverTimezone=GMT%2B8"
    username: root
    password: password
  data:
    redis:
      host: localhost
      port: 6379
      database: 0
mybatis-plus:
  mapper-locations: classpath*:mapper/**/*Mapper.xml
  type-aliases-package: com.cloudflow.workflow.domain
  configuration:
    map-underscore-to-camel-case: true
logging:
  level:
    com.cloudflow: debug
', '', 'yaml', NOW(), NOW());


-- =========================================================
-- Import from 02_test_data.sql
-- =========================================================
-- ----------------------------
-- 1. 初始化部门数据
-- ----------------------------
INSERT INTO sys_dept VALUES(100,  0,   '0',          'CloudFlow 科技',   0, 'admin', '15888888888', 'admin@cloudflow.com', '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(101,  100, '0,100',      '研发部',           1, 'zhang_san', '15888888888', 'zhang_san@cloudflow.com', '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(102,  100, '0,100',      '财务部',           2, 'li_si',     '15888888888', 'li_si@cloudflow.com',     '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(103,  100, '0,100',      '人力资源部',       3, 'wang_wu',   '15888888888', 'wang_wu@cloudflow.com',   '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(104,  100, '0,100',      '法务部',           4, 'liu_fa',    '15888888888', 'liu_fa@cloudflow.com',    '0', '0', 'admin', sysdate(), '', null);
INSERT INTO sys_dept VALUES(105,  100, '0,100',      'IT部',             5, 'chen_it',   '15888888888', 'chen_it@cloudflow.com',   '0', '0', 'admin', sysdate(), '', null);

-- ----------------------------
-- 2. 初始化角色数据
-- ----------------------------
INSERT INTO sys_role VALUES(1, 'ADMIN',   'admin',    1, '1', '0', '0', 'admin', sysdate(), '', null, '系统管理员，拥有最高权限');
INSERT INTO sys_role VALUES(2, 'MANAGER', 'manager',  2, '3', '0', '0', 'admin', sysdate(), '', null, '部门经理，负责业务审批');
INSERT INTO sys_role VALUES(3, 'FINANCE', 'finance',  3, '3', '0', '0', 'admin', sysdate(), '', null, '财务专员，负责资金相关审批');
INSERT INTO sys_role VALUES(4, 'HR',      'hr',       4, '3', '0', '0', 'admin', sysdate(), '', null, '人事专员，负责人员相关审批');
INSERT INTO sys_role VALUES(5, 'EMPLOYEE','employee', 5, '2', '0', '0', 'admin', sysdate(), '', null, '普通员工，仅能发起申请');

-- ----------------------------
-- 3. 初始化用户数据
-- 密码统一为: 123456
-- BCrypt 加密后 (示例): $2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK
-- ----------------------------

-- 3.1 Admin (管理员)
-- id: 1, name: Admin, email: admin@cloudflow.com
INSERT INTO sys_user VALUES(1,  100, 'admin', 'Admin', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '超级管理员');

-- 3.2 李经理 (Manager) - 研发部
-- id: 2, name: 李经理, email: li@cloudflow.com
INSERT INTO sys_user VALUES(2,  101, 'li', '李经理', 'li@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '研发部经理');

-- 3.3 王财务 (Finance) - 财务部
-- id: 3, name: 王财务, email: wang@cloudflow.com
INSERT INTO sys_user VALUES(3,  102, 'wang', '王财务', 'wang@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '财务专员');

-- 3.4 赵HR (HR) - 人力资源部
-- id: 4, name: 赵HR, email: zhao@cloudflow.com
INSERT INTO sys_user VALUES(4,  103, 'zhao', '赵HR', 'zhao@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, 'HR经理');

-- 3.5 张三 (员工) - 研发部
-- id: 5, name: 张三, email: zhang@cloudflow.com
INSERT INTO sys_user VALUES(5,  101, 'zhang', '张三', 'zhang@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '研发工程师');

-- 3.6 刘法务 (Legal) - 法务部 (Mock as ADMIN for now based on frontend code)
-- id: 6, name: 刘法务, email: liu@cloudflow.com
INSERT INTO sys_user VALUES(6,  104, 'liu', '刘法务', 'liu@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '法务总监');

-- 3.7 陈IT (IT Admin) - IT部
-- id: 7, name: 陈IT, email: chen@cloudflow.com
INSERT INTO sys_user VALUES(7,  105, 'chen', '陈IT', 'chen@cloudflow.com', '15888888888', '1', '$2a$10$7JB720yubVSZv5W8vNGkxOW4Q.WBFGvMay.k.e3nA.YJ.Libn.qK', '0', '0', 'admin', sysdate(), '', null, '系统管理员');

-- ----------------------------
-- 4. 初始化用户角色关联
-- ----------------------------
-- 4.1 Admin -> ADMIN
INSERT INTO sys_user_role VALUES(1, 1);

-- 4.2 李经理 -> MANAGER
INSERT INTO sys_user_role VALUES(2, 2);

-- 4.3 王财务 -> FINANCE
INSERT INTO sys_user_role VALUES(3, 3);

-- 4.4 赵HR -> HR
INSERT INTO sys_user_role VALUES(4, 4);

-- 4.5 张三 -> EMPLOYEE
INSERT INTO sys_user_role VALUES(5, 5);

-- 4.6 刘法务 -> ADMIN (Mocked in frontend)
INSERT INTO sys_user_role VALUES(6, 1);

-- 4.7 陈IT -> ADMIN
INSERT INTO sys_user_role VALUES(7, 1);

-- ----------------------------
-- 5. 初始化菜单权限 (示例部分核心权限)
-- ----------------------------
-- 系统管理
INSERT INTO sys_menu VALUES(1, '系统管理', 0, 1, 'system', NULL, 0, 0, 'M', '0', '0', '', '#', 'admin', sysdate(), '', null, '系统管理目录');
INSERT INTO sys_menu VALUES(100, '用户管理', 1, 1, 'user', 'system/user/index', 0, 0, 'C', '0', '0', 'system:user:list', '#', 'admin', sysdate(), '', null, '用户管理菜单');
INSERT INTO sys_menu VALUES(101, '角色管理', 1, 2, 'role', 'system/role/index', 0, 0, 'C', '0', '0', 'system:role:list', '#', 'admin', sysdate(), '', null, '角色管理菜单');

-- 工作流管理
INSERT INTO sys_menu VALUES(2, '工作流', 0, 2, 'workflow', NULL, 0, 0, 'M', '0', '0', '', '#', 'admin', sysdate(), '', null, '工作流目录');
INSERT INTO sys_menu VALUES(200, '我的待办', 2, 1, 'task', 'workflow/task/index', 0, 0, 'C', '0', '0', 'workflow:task:list', '#', 'admin', sysdate(), '', null, '我的待办');
INSERT INTO sys_menu VALUES(201, '流程设计', 2, 2, 'model', 'workflow/model/index', 0, 0, 'C', '0', '0', 'workflow:model:list', '#', 'admin', sysdate(), '', null, '流程设计');

-- ----------------------------
-- 6. 初始化角色菜单关联 (授权)
-- ----------------------------
-- ADMIN (Role 1) 拥有所有权限 (代码逻辑通常放行，这里可不配或全配)

-- MANAGER (Role 2)
INSERT INTO sys_role_menu VALUES(2, 2);   -- 工作流目录
INSERT INTO sys_role_menu VALUES(2, 200); -- 我的待办

-- FINANCE (Role 3)
INSERT INTO sys_role_menu VALUES(3, 2);
INSERT INTO sys_role_menu VALUES(3, 200);

-- HR (Role 4)
INSERT INTO sys_role_menu VALUES(4, 2);
INSERT INTO sys_role_menu VALUES(4, 200);

-- EMPLOYEE (Role 5)
INSERT INTO sys_role_menu VALUES(5, 2);
INSERT INTO sys_role_menu VALUES(5, 200); -- 员工也需要查看待办(我的申请)


-- =========================================================
-- Import from 05_init_data.sql (Forms & Processes Only)
-- =========================================================

-- ----------------------------
-- 7. 初始化表单定义 (Mock Forms)
-- ----------------------------
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_reimburse', '通用报销申请', '[{"id": "f1", "type": "SELECT", "label": "费用类型", "required": true, "options": ["差旅费", "招待费", "办公费", "团建费"]}, {"id": "f2", "type": "NUMBER", "label": "报销金额", "required": true}, {"id": "f3", "type": "DATE", "label": "发生日期", "required": true}, {"id": "f4", "type": "TEXTAREA", "label": "费用明细说明", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_payment', '对公付款申请', '[{"id": "p1", "type": "TEXT", "label": "收款方名称", "required": true}, {"id": "p2", "type": "TEXT", "label": "银行账号", "required": true, "regex": "^\\d{10,20}$", "errorMsg": "请输入正确的银行账号"}, {"id": "p3", "type": "NUMBER", "label": "付款金额", "required": true}, {"id": "p4", "type": "TEXT", "label": "合同编号", "required": false}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_leave', '请假申请单', '[{"id": "l1", "type": "SELECT", "label": "请假类型", "required": true, "options": ["年假", "事假", "病假", "婚假", "产假"]}, {"id": "l2", "type": "DATE", "label": "开始时间", "required": true}, {"id": "l3", "type": "DATE", "label": "结束时间", "required": true}, {"id": "l4", "type": "NUMBER", "label": "共计天数", "required": true}, {"id": "l5", "type": "TEXTAREA", "label": "请假事由", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_recruit', '人员招聘需求', '[{"id": "r1", "type": "TEXT", "label": "招聘岗位", "required": true}, {"id": "r2", "type": "NUMBER", "label": "需求人数", "required": true}, {"id": "r3", "type": "SELECT", "label": "期望职级", "required": true, "options": ["P5", "P6", "P7", "P8"]}, {"id": "r4", "type": "TEXTAREA", "label": "岗位职责要求", "required": true}, {"id": "r5", "type": "NUMBER", "label": "薪资预算(k)", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_overtime', '加班申请单', '[{"id": "o1", "type": "DATE", "label": "加班日期", "required": true}, {"id": "o2", "type": "NUMBER", "label": "加班时长(小时)", "required": true}, {"id": "o3", "type": "TEXTAREA", "label": "工作内容", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_resign', '离职申请表', '[{"id": "rs1", "type": "DATE", "label": "预计最后工作日", "required": true}, {"id": "rs2", "type": "SELECT", "label": "离职原因", "required": true, "options": ["个人发展", "薪资不满意", "家庭原因", "其他"]}, {"id": "rs3", "type": "TEXTAREA", "label": "详细说明", "required": false}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_supplies', '办公用品领用', '[{"id": "s1", "type": "SELECT", "label": "物品类别", "required": true, "options": ["笔记本", "显示器", "键盘鼠标", "文具"]}, {"id": "s2", "type": "NUMBER", "label": "数量", "required": true}, {"id": "s3", "type": "TEXT", "label": "用途说明", "required": false}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_stamp', '印章使用申请', '[{"id": "st1", "type": "SELECT", "label": "印章类型", "required": true, "options": ["公章", "合同章", "财务章", "法人章"]}, {"id": "st2", "type": "TEXT", "label": "文件名称", "required": true}, {"id": "st3", "type": "NUMBER", "label": "用印份数", "required": true}, {"id": "st4", "type": "SELECT", "label": "是否外带", "required": true, "options": ["否", "是"]}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_it_access', 'IT权限申请', '[{"id": "it1", "type": "TEXT", "label": "系统名称", "required": true}, {"id": "it2", "type": "SELECT", "label": "权限级别", "required": true, "options": ["只读", "读写", "管理员"]}, {"id": "it3", "type": "TEXTAREA", "label": "申请理由", "required": true}, {"id": "it4", "type": "DATE", "label": "有效期至", "required": false}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_vpn', 'VPN开通申请', '[{"id": "v1", "type": "TEXT", "label": "工号", "required": true}, {"id": "v2", "type": "TEXT", "label": "手机号", "required": true, "regex": "^1[3-9]\\d{9}$", "errorMsg": "手机号格式错误"}, {"id": "v3", "type": "TEXTAREA", "label": "业务需求", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_contract', '合同审批单', '[{"id": "c1", "type": "TEXT", "label": "合同名称", "required": true}, {"id": "c2", "type": "TEXT", "label": "对方单位", "required": true}, {"id": "c3", "type": "NUMBER", "label": "合同金额", "required": true}, {"id": "c4", "type": "SELECT", "label": "合同类型", "required": true, "options": ["采购合同", "销售合同", "服务协议"]}, {"id": "c5", "type": "TEXTAREA", "label": "主要条款摘要", "required": true}]', sysdate());
INSERT INTO wf_form_definition (form_id, form_name, fields_json, create_time) VALUES ('form_project', '项目立项申请', '[{"id": "pr1", "type": "TEXT", "label": "项目名称", "required": true}, {"id": "pr2", "type": "NUMBER", "label": "预算金额(万)", "required": true}, {"id": "pr3", "type": "DATE", "label": "预计开始", "required": true}, {"id": "pr4", "type": "DATE", "label": "预计结束", "required": true}, {"id": "pr5", "type": "TEXTAREA", "label": "项目背景及价值", "required": true}]', sysdate());

-- ----------------------------
-- 8. 初始化流程定义 (Mock Workflows)
-- ----------------------------
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'form_reimburse', '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务主管", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "财务总监", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "打款"}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_leave', '员工请假流程', 'biz_leave', 1, 'form_leave', '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "gw_leave", "type": "CONDITION", "title": "天数校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR备案", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "归档"}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_recruit', '人员招聘流程', 'biz_recruit', 2, 'form_recruit', '{"id": "root", "type": "START", "title": "提出需求", "next": {"id": "n1", "type": "APPROVAL", "title": "HRBP初审", "icon": "user-check", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "n2", "type": "APPROVAL", "title": "部门负责人", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n3", "type": "APPROVAL", "title": "总经理终审", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "发布职位"}}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_it', 'IT系统权限申请', 'biz_it_access', 1, 'form_it_access', '{"id": "root", "type": "START", "title": "提交申请", "next": {"id": "n1", "type": "APPROVAL", "title": "直属领导", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "系统管理员", "icon": "server", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "开通权限"}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_contract', '合同审批流程', 'biz_contract', 5, 'form_contract', '{"id": "root", "type": "START", "title": "起草合同", "next": {"id": "n1", "type": "PARALLEL", "title": "会签", "branches": [{"id": "b1", "type": "APPROVAL", "title": "法务审核", "icon": "scale", "approverType": "ROLE", "approverValue": "ADMIN"}, {"id": "b2", "type": "APPROVAL", "title": "财务审核", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE"}], "next": {"id": "n2", "type": "APPROVAL", "title": "总经理签发", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "盖章归档"}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_stamp', '印章使用流程', 'biz_stamp', 1, 'form_stamp', '{"id": "root", "type": "START", "title": "用印申请", "next": {"id": "n1", "type": "APPROVAL", "title": "部门负责人", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "印章管理员", "icon": "stamp", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "盖章"}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_project', '项目立项审批', 'biz_project_init', 1, 'form_project', '{"id": "root", "type": "START", "title": "立项申请", "next": {"id": "n1", "type": "APPROVAL", "title": "PMO审核", "icon": "clipboard-list", "approverType": "ROLE", "approverValue": "MANAGER", "next": {"id": "n2", "type": "APPROVAL", "title": "技术委员会", "icon": "code", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "n3", "type": "APPROVAL", "title": "预算委员会", "icon": "dollar-sign", "approverType": "ROLE", "approverValue": "FINANCE", "next": {"id": "end", "type": "END", "title": "立项成功"}}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_supplies', '办公用品领用', 'biz_supplies', 1, 'form_supplies', '{"id": "root", "type": "START", "title": "领用申请", "next": {"id": "n1", "type": "APPROVAL", "title": "行政专员", "icon": "package", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "发放"}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_resign', '离职审批流程', 'biz_resign', 2, 'form_resign', '{"id": "root", "type": "START", "title": "提交离职", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级面谈", "icon": "message-circle", "approverType": "DIRECT_LEADER", "next": {"id": "n2", "type": "APPROVAL", "title": "部门负责人确认", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "n3", "type": "APPROVAL", "title": "HR离职办理", "icon": "user-x", "approverType": "ROLE", "approverValue": "HR", "next": {"id": "end", "type": "END", "title": "离职生效"}}}}}', sysdate());
INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES ('wf_payment', '对公付款审批', 'biz_payment', 4, 'form_payment', '{"id": "root", "type": "START", "title": "发起付款", "next": {"id": "n1", "type": "APPROVAL", "title": "业务负责人", "icon": "user", "approverType": "DIRECT_LEADER", "next": {"id": "gw_pay", "type": "CONDITION", "title": "金额分级", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务经理", "icon": "dollar-sign", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount <= 50000"}, {"id": "b2", "type": "APPROVAL", "title": "总经理", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "amount > 50000"}], "next": {"id": "end", "type": "END", "title": "出纳付款"}}}}', sysdate());

-- ----------------------------


SET FOREIGN_KEY_CHECKS = 1;

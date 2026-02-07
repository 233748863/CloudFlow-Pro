-- =========================================================
-- CloudFlow Pro - 工作流引擎模块数据库初始化脚本
-- 包含：流程定义、流程实例、任务管理、表单定义
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- ----------------------------
-- 1. 流程实例表 (Process Instance)
-- ----------------------------
DROP TABLE IF EXISTS wf_process_instance;
CREATE TABLE wf_process_instance (
  instance_id       VARCHAR(64)     NOT NULL COMMENT '实例ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_def_key   VARCHAR(64)     NOT NULL COMMENT '流程定义Key',
  business_key      VARCHAR(64)     NOT NULL COMMENT '业务主键ID',
  title             VARCHAR(255)    DEFAULT NULL COMMENT '流程标题',
  start_user_id     BIGINT(20)      NOT NULL COMMENT '发起人ID',
  start_user_name   VARCHAR(64)     DEFAULT NULL COMMENT '发起人姓名',
  status            VARCHAR(20)     DEFAULT 'RUNNING' COMMENT '状态 (RUNNING, COMPLETED, CANCELLED)',
  start_time        DATETIME        DEFAULT NULL COMMENT '开始时间',
  end_time          DATETIME        DEFAULT NULL COMMENT '结束时间',
  variables         JSON            DEFAULT NULL COMMENT '流程变量(表单数据)',
  PRIMARY KEY (instance_id),
  KEY idx_start_user (start_user_id),
  KEY idx_business_key (business_key),
  KEY idx_proc_inst_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流实例表';

-- ----------------------------
-- 2. 流程任务表 (Task)
-- ----------------------------
DROP TABLE IF EXISTS wf_task;
CREATE TABLE wf_task (
  task_id           VARCHAR(64)     NOT NULL COMMENT '任务ID (UUID)',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  instance_id       VARCHAR(64)     NOT NULL COMMENT '流程实例ID',
  node_key          VARCHAR(64)     NOT NULL COMMENT '节点Key',
  node_name         VARCHAR(64)     NOT NULL COMMENT '节点名称',
  assignee          BIGINT(20)      DEFAULT NULL COMMENT '处理人ID',
  candidate_roles   VARCHAR(255)    DEFAULT NULL COMMENT '候选角色',
  status            VARCHAR(20)     DEFAULT 'TODO' COMMENT '状态 (TODO, DONE)',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  due_time          DATETIME        DEFAULT NULL COMMENT '截止时间',
  PRIMARY KEY (task_id),
  KEY idx_assignee (assignee),
  KEY idx_instance (instance_id),
  KEY idx_task_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流任务表';

-- ----------------------------
-- 3. 任务历史表 (Task History)
-- ----------------------------
DROP TABLE IF EXISTS wf_task_history;
CREATE TABLE wf_task_history (
  history_id        VARCHAR(64)     NOT NULL COMMENT '历史ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
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
-- ----------------------------
DROP TABLE IF EXISTS wf_process_definition;
CREATE TABLE wf_process_definition (
  definition_id     VARCHAR(64)     NOT NULL COMMENT '定义ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  process_name      VARCHAR(64)     NOT NULL COMMENT '流程名称',
  process_key       VARCHAR(64)     NOT NULL COMMENT '流程Key',
  version           INT             DEFAULT 1 COMMENT '版本号',
  form_id           VARCHAR(64)     DEFAULT NULL COMMENT '绑定的表单ID',
  model_json        LONGTEXT        COMMENT '流程模型JSON',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  PRIMARY KEY (definition_id),
  KEY idx_process_key (process_key),
  UNIQUE KEY uk_proc_def_key_ver_tenant (process_key, version, tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程定义表';

-- ----------------------------
-- 5. 表单定义表 (Form Definition)
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

-- ----------------------------
-- 6. 任务已读记录表
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
-- 7. 任务催办记录表
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

-- ----------------------------
-- 8. 系统通知表
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

-- =========================================================
-- 性能优化索引
-- =========================================================

CREATE INDEX idx_wf_task_assignee ON wf_task(assignee);
CREATE INDEX idx_wf_inst_start_user ON wf_process_instance(start_user_id);
CREATE INDEX idx_wf_task_instance_id ON wf_task(instance_id);

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

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES 
('wf_reimburse', '财务报销流程', 'biz_reimburse', 3, 'form_reimburse', '{"id": "root", "type": "START", "title": "提交报销", "next": {"id": "n1", "type": "APPROVAL", "title": "直属上级", "icon": "briefcase", "approverType": "DIRECT_LEADER", "next": {"id": "gw1", "type": "CONDITION", "title": "金额校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "财务主管", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount < 1000"}, {"id": "b2", "type": "APPROVAL", "title": "财务总监", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE", "condition": "amount >= 1000"}], "next": {"id": "end", "type": "END", "title": "打款"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES 
('wf_leave', '员工请假流程', 'biz_leave', 1, 'form_leave', '{"id": "root", "type": "START", "title": "提交请假", "next": {"id": "n1", "type": "APPROVAL", "title": "部门经理", "icon": "briefcase", "approverType": "DEPT_MANAGER", "next": {"id": "gw_leave", "type": "CONDITION", "title": "天数校验", "branches": [{"id": "b1", "type": "APPROVAL", "title": "HR备案", "icon": "file-box", "approverType": "ROLE", "approverValue": "HR", "condition": "days <= 3"}, {"id": "b2", "type": "APPROVAL", "title": "总经理审批", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "condition": "days > 3"}], "next": {"id": "end", "type": "END", "title": "归档"}}}}', sysdate());

INSERT INTO wf_process_definition (definition_id, process_name, process_key, version, form_id, model_json, create_time) VALUES 
('wf_contract', '合同审批流程', 'biz_contract', 5, 'form_contract', '{"id": "root", "type": "START", "title": "起草合同", "next": {"id": "n1", "type": "PARALLEL", "title": "会签", "branches": [{"id": "b1", "type": "APPROVAL", "title": "法务审核", "icon": "scale", "approverType": "ROLE", "approverValue": "ADMIN"}, {"id": "b2", "type": "APPROVAL", "title": "财务审核", "icon": "credit-card", "approverType": "ROLE", "approverValue": "FINANCE"}], "next": {"id": "n2", "type": "APPROVAL", "title": "总经理签发", "icon": "shield", "approverType": "ROLE", "approverValue": "ADMIN", "next": {"id": "end", "type": "END", "title": "盖章归档"}}}}', sysdate());

SET FOREIGN_KEY_CHECKS = 1;

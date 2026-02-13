-- =========================================================
-- CloudFlow Pro - 工作流发布增强模块数据库脚本
-- 模块：发布窗口、发布通知、回滚机制、发布审批流、影响分析
-- 版本：v1.0 (整合 P2 迁移内容)
-- 创建日期：2026-02-09
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- =========================================================
-- 一、发布记录与窗口管理
-- =========================================================

-- 1. 发布记录表（基础表，需先创建）
DROP TABLE IF EXISTS wf_deploy_record;
CREATE TABLE wf_deploy_record (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  process_def_id    VARCHAR(64) NOT NULL COMMENT '流程定义ID',
  process_key       VARCHAR(100) DEFAULT NULL COMMENT '流程Key',
  version           INT NOT NULL COMMENT '版本号',
  deploy_status     VARCHAR(20) DEFAULT 'PENDING' COMMENT '发布状态: PENDING-待发布, SUCCESS-成功, FAILED-失败',
  deploy_by         BIGINT COMMENT '发布人ID',
  deployer_name     VARCHAR(100) DEFAULT NULL COMMENT '发布人姓名',
  deploy_time       DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '发布时间',
  deploy_note       VARCHAR(500) DEFAULT NULL COMMENT '发布说明',
  change_log        TEXT COMMENT '变更日志',
  can_rollback      TINYINT(1) DEFAULT 1 COMMENT '是否可回滚: 0-否, 1-是',
  rollback_from_version INT COMMENT '回滚自哪个版本',
  rollback_reason   TEXT COMMENT '回滚原因',
  rollback_by       BIGINT COMMENT '回滚操作人ID',
  rollback_time     DATETIME COMMENT '回滚时间',
  approval_id       BIGINT COMMENT '关联的审批ID',
  deploy_window_id  BIGINT COMMENT '关联的发布窗口ID',
  impact_analysis   TEXT COMMENT '影响分析(JSON格式)',
  created_time      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_process_def_id (process_def_id),
  INDEX idx_deploy_status (deploy_status),
  INDEX idx_deploy_time (deploy_time),
  INDEX idx_approval_id (approval_id),
  INDEX idx_can_rollback (can_rollback),
  INDEX idx_deploy_record_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布记录表';

-- 2. 发布窗口配置表
DROP TABLE IF EXISTS wf_deploy_window;
CREATE TABLE wf_deploy_window (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  window_name       VARCHAR(100) NOT NULL COMMENT '窗口名称',
  window_type       VARCHAR(20) NOT NULL DEFAULT 'WEEKLY' COMMENT '窗口类型: DAILY-每日, WEEKLY-每周, MONTHLY-每月, CUSTOM-自定义',
  start_time        TIME COMMENT '开始时间',
  end_time          TIME COMMENT '结束时间',
  week_days         VARCHAR(50) COMMENT '星期几(1-7,逗号分隔)',
  month_days        VARCHAR(100) COMMENT '每月几号(1-31,逗号分隔)',
  custom_dates      TEXT COMMENT '自定义日期(JSON数组)',
  is_enabled        TINYINT(1) DEFAULT 1 COMMENT '是否启用: 0-禁用, 1-启用',
  description       VARCHAR(500) COMMENT '窗口描述',
  created_by        BIGINT COMMENT '创建人ID',
  created_time      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_by        BIGINT COMMENT '更新人ID',
  updated_time      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_enabled (is_enabled),
  INDEX idx_window_type (window_type),
  INDEX idx_deploy_window_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布窗口配置表';

-- =========================================================
-- 二、发布通知与审批
-- =========================================================

-- 3. 发布通知配置表
DROP TABLE IF EXISTS wf_deploy_notification;
CREATE TABLE wf_deploy_notification (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id             BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  deploy_id             BIGINT NOT NULL COMMENT '发布记录ID',
  notification_type     VARCHAR(20) NOT NULL COMMENT '通知类型: EMAIL-邮件, SMS-短信, WEBSOCKET-站内信, WECHAT-微信',
  recipient_type        VARCHAR(20) NOT NULL COMMENT '接收人类型: USER-指定用户, ROLE-角色, DEPT-部门, ALL-所有人',
  recipient_ids         TEXT COMMENT '接收人ID列表(JSON数组)',
  notification_title    VARCHAR(200) COMMENT '通知标题',
  notification_content  TEXT COMMENT '通知内容',
  send_status           VARCHAR(20) DEFAULT 'PENDING' COMMENT '发送状态: PENDING-待发送, SENDING-发送中, SUCCESS-成功, FAILED-失败',
  send_time             DATETIME COMMENT '发送时间',
  error_message         TEXT COMMENT '错误信息',
  created_time          DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_deploy_id (deploy_id),
  INDEX idx_send_status (send_status),
  INDEX idx_notification_type (notification_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布通知记录表';

-- 4. 发布审批流程表
DROP TABLE IF EXISTS wf_deploy_approval;
CREATE TABLE wf_deploy_approval (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT NOT NULL COMMENT '发布记录ID',
  process_def_id    VARCHAR(64) NOT NULL COMMENT '流程定义ID',
  approval_status   VARCHAR(20) DEFAULT 'PENDING' COMMENT '审批状态: PENDING-待审批, APPROVED-已通过, REJECTED-已驳回, CANCELLED-已取消',
  current_step      INT DEFAULT 1 COMMENT '当前审批步骤',
  total_steps       INT DEFAULT 1 COMMENT '总审批步骤数',
  approval_config   TEXT COMMENT '审批配置(JSON格式)',
  submitter_id      BIGINT NOT NULL COMMENT '提交人ID',
  submit_time       DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '提交时间',
  complete_time     DATETIME COMMENT '完成时间',
  created_time      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  updated_time      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  INDEX idx_deploy_id (deploy_id),
  INDEX idx_approval_status (approval_status),
  INDEX idx_submitter_id (submitter_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布审批表';

-- 5. 发布审批步骤表
DROP TABLE IF EXISTS wf_deploy_approval_step;
CREATE TABLE wf_deploy_approval_step (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id             BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  approval_id           BIGINT NOT NULL COMMENT '审批ID',
  step_no               INT NOT NULL COMMENT '步骤序号',
  step_name             VARCHAR(100) NOT NULL COMMENT '步骤名称',
  approver_type         VARCHAR(20) NOT NULL COMMENT '审批人类型: USER-指定用户, ROLE-角色, DEPT-部门主管',
  approver_ids          TEXT COMMENT '审批人ID列表(JSON数组)',
  approval_mode         VARCHAR(20) DEFAULT 'ANY' COMMENT '审批模式: ANY-任一人, ALL-所有人, SEQUENCE-依次审批',
  step_status           VARCHAR(20) DEFAULT 'PENDING' COMMENT '步骤状态: PENDING-待审批, APPROVED-已通过, REJECTED-已驳回',
  actual_approver_id    BIGINT COMMENT '实际审批人ID',
  approval_comment      TEXT COMMENT '审批意见',
  approval_time         DATETIME COMMENT '审批时间',
  created_time          DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_approval_id (approval_id),
  INDEX idx_step_status (step_status),
  INDEX idx_actual_approver_id (actual_approver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程发布审批步骤表';

-- =========================================================
-- 三、版本快照与回滚
-- =========================================================

-- 6. 流程版本快照表（用于回滚）
DROP TABLE IF EXISTS wf_process_version_snapshot;
CREATE TABLE wf_process_version_snapshot (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  process_def_id    VARCHAR(64) NOT NULL COMMENT '流程定义ID',
  version           INT NOT NULL COMMENT '版本号',
  deploy_id         BIGINT NOT NULL COMMENT '发布记录ID',
  snapshot_data     LONGTEXT NOT NULL COMMENT '快照数据(完整的流程定义JSON)',
  bpmn_xml          LONGTEXT COMMENT 'BPMN XML内容',
  form_config       TEXT COMMENT '表单配置',
  node_config       TEXT COMMENT '节点配置',
  created_by        BIGINT COMMENT '创建人ID',
  created_time      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  UNIQUE KEY uk_process_version (process_def_id, version),
  INDEX idx_deploy_id (deploy_id),
  INDEX idx_created_time (created_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='流程版本快照表';

-- 7. 发布回滚历史表
DROP TABLE IF EXISTS wf_deploy_rollback_history;
CREATE TABLE wf_deploy_rollback_history (
  id                    BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id             BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  original_deploy_id    BIGINT NOT NULL COMMENT '原发布记录ID',
  rollback_deploy_id    BIGINT NOT NULL COMMENT '回滚后的发布记录ID',
  from_version          INT NOT NULL COMMENT '从哪个版本回滚',
  to_version            INT NOT NULL COMMENT '回滚到哪个版本',
  rollback_reason       TEXT COMMENT '回滚原因',
  rollback_type         VARCHAR(20) DEFAULT 'MANUAL' COMMENT '回滚类型: MANUAL-手动, AUTO-自动',
  rollback_status       VARCHAR(20) DEFAULT 'SUCCESS' COMMENT '回滚状态: SUCCESS-成功, FAILED-失败, PARTIAL-部分成功',
  error_message         TEXT COMMENT '错误信息',
  rollback_by           BIGINT NOT NULL COMMENT '回滚操作人ID',
  rollback_time         DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '回滚时间',
  INDEX idx_original_deploy_id (original_deploy_id),
  INDEX idx_rollback_deploy_id (rollback_deploy_id),
  INDEX idx_rollback_by (rollback_by),
  INDEX idx_rollback_time (rollback_time)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布回滚历史表';

-- =========================================================
-- 四、影响分析
-- =========================================================

-- 8. 发布影响分析表
DROP TABLE IF EXISTS wf_deploy_impact;
CREATE TABLE wf_deploy_impact (
  id                BIGINT PRIMARY KEY AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20) DEFAULT 100000 COMMENT '租户ID',
  deploy_id         BIGINT NOT NULL COMMENT '发布记录ID',
  impact_type       VARCHAR(50) NOT NULL COMMENT '影响类型: RUNNING_INSTANCE-运行中实例, PENDING_TASK-待办任务, FORM_CHANGE-表单变更, NODE_CHANGE-节点变更',
  impact_level      VARCHAR(20) DEFAULT 'LOW' COMMENT '影响级别: LOW-低, MEDIUM-中, HIGH-高, CRITICAL-严重',
  impact_count      INT DEFAULT 0 COMMENT '影响数量',
  impact_detail     TEXT COMMENT '影响详情(JSON格式)',
  suggestion        TEXT COMMENT '处理建议',
  created_time      DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  INDEX idx_deploy_id (deploy_id),
  INDEX idx_impact_type (impact_type),
  INDEX idx_impact_level (impact_level)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='发布影响分析表';

-- =========================================================
-- 初始化数据
-- =========================================================

-- 插入默认发布窗口配置
INSERT INTO wf_deploy_window (window_name, window_type, start_time, end_time, week_days, is_enabled, description, created_by)
VALUES 
('工作日发布窗口', 'WEEKLY', '09:00:00', '18:00:00', '1,2,3,4,5', 1, '周一至周五的工作时间可以发布', 1),
('周末维护窗口', 'WEEKLY', '00:00:00', '23:59:59', '6,7', 0, '周末维护时间，默认禁用发布', 1);

SET FOREIGN_KEY_CHECKS = 1;

-- =========================================================
-- 脚本执行完成
-- =========================================================

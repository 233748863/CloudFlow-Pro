-- =========================================================
-- CloudFlow Pro - 办公协同模块数据库脚本
-- 模块：公告、通知、日程
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS sys_announcement;
CREATE TABLE sys_announcement (
  announcement_id   BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '公告ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(255)    NOT NULL COMMENT '标题',
  content           LONGTEXT        COMMENT '内容',
  type              CHAR(1)         DEFAULT '1' COMMENT '类型（1通知 2公告 3紧急）',
  scope_type        VARCHAR(20)     DEFAULT 'ALL' COMMENT '范围类型（ALL全部 DEPT部门 ROLE角色）',
  scope_value       VARCHAR(255)    DEFAULT NULL COMMENT '范围值',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0草稿 1发布 2撤回）',
  priority          CHAR(1)         DEFAULT 'M' COMMENT '优先级（L低 M中 H高）',
  is_top            INT(11)         DEFAULT 0 COMMENT '是否置顶',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT '发送人ID',
  publish_time      DATETIME        DEFAULT NULL COMMENT '发布时间',
  expire_time       DATETIME        DEFAULT NULL COMMENT '过期时间',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (announcement_id),
  KEY idx_announcement_tenant (tenant_id),
  KEY idx_announcement_status (status, is_top, priority)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统公告表';

DROP TABLE IF EXISTS sys_announcement_read;
CREATE TABLE sys_announcement_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  announcement_id   BIGINT(20)      NOT NULL COMMENT '公告ID',
  user_id           BIGINT(20)      NOT NULL COMMENT '用户ID',
  read_time         DATETIME        DEFAULT NULL COMMENT '阅读时间',
  PRIMARY KEY (id),
  UNIQUE KEY uk_announcement_user (announcement_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='公告已读记录表';

DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '通知ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  notice_title      VARCHAR(255)    NOT NULL COMMENT '标题',
  notice_type       CHAR(1)         DEFAULT '1' COMMENT '类型（1通知 2提醒）',
  notice_content    TEXT            COMMENT '内容',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT '发送人ID',
  recipient_id      BIGINT(20)      NOT NULL COMMENT '接收人ID',
  status            CHAR(1)         DEFAULT '0' COMMENT '状态（0未读 1已读）',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT '创建者',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT '更新者',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT '备注',
  PRIMARY KEY (notice_id),
  KEY idx_notice_recipient (recipient_id, status),
  KEY idx_notice_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='系统通知表';

DROP TABLE IF EXISTS sys_schedule_event;
CREATE TABLE sys_schedule_event (
  event_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '日程ID',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT '租户ID',
  title             VARCHAR(255)    NOT NULL COMMENT '标题',
  description       TEXT            COMMENT '描述',
  start_time        DATETIME        NOT NULL COMMENT '开始时间',
  end_time          DATETIME        NOT NULL COMMENT '结束时间',
  is_all_day        TINYINT(1)      DEFAULT 0 COMMENT '是否全天',
  type              VARCHAR(20)     DEFAULT 'PERSONAL' COMMENT '日程类型',
  creator_id        BIGINT(20)      NOT NULL COMMENT '创建人ID',
  attendees         VARCHAR(1000)   DEFAULT NULL COMMENT '参与人ID列表JSON',
  create_time       DATETIME        DEFAULT NULL COMMENT '创建时间',
  update_time       DATETIME        DEFAULT NULL COMMENT '更新时间',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT '删除标志',
  PRIMARY KEY (event_id),
  KEY idx_schedule_creator (creator_id),
  KEY idx_schedule_time (start_time, end_time),
  KEY idx_schedule_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='日程事件表';

SET FOREIGN_KEY_CHECKS = 1;

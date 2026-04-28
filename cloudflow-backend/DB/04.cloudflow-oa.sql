-- =========================================================
-- CloudFlow Pro - OA light schema
-- Modules: announcements, notices, schedules
-- =========================================================

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP TABLE IF EXISTS sys_announcement;
CREATE TABLE sys_announcement (
  announcement_id   BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'announcement id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant id',
  title             VARCHAR(255)    NOT NULL COMMENT 'title',
  content           LONGTEXT        COMMENT 'html content',
  type              CHAR(1)         DEFAULT '1' COMMENT '1 notice, 2 announcement, 3 urgent',
  scope_type        VARCHAR(20)     DEFAULT 'ALL' COMMENT 'ALL, DEPT, ROLE',
  scope_value       VARCHAR(255)    DEFAULT NULL COMMENT 'scope value',
  status            CHAR(1)         DEFAULT '0' COMMENT '0 draft, 1 published, 2 revoked',
  priority          CHAR(1)         DEFAULT 'M' COMMENT 'L, M, H',
  is_top            INT(11)         DEFAULT 0 COMMENT 'top flag',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT 'sender id',
  publish_time      DATETIME        DEFAULT NULL COMMENT 'publish time',
  expire_time       DATETIME        DEFAULT NULL COMMENT 'expire time',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT 'create by',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create time',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT 'update by',
  update_time       DATETIME        DEFAULT NULL COMMENT 'update time',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT 'delete flag',
  PRIMARY KEY (announcement_id),
  KEY idx_announcement_tenant (tenant_id),
  KEY idx_announcement_status (status, is_top, priority)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='system announcement';

DROP TABLE IF EXISTS sys_announcement_read;
CREATE TABLE sys_announcement_read (
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant id',
  announcement_id   BIGINT(20)      NOT NULL COMMENT 'announcement id',
  user_id           BIGINT(20)      NOT NULL COMMENT 'user id',
  read_time         DATETIME        DEFAULT NULL COMMENT 'read time',
  PRIMARY KEY (id),
  UNIQUE KEY uk_announcement_user (announcement_id, user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='announcement read record';

DROP TABLE IF EXISTS sys_notice;
CREATE TABLE sys_notice (
  notice_id         BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'notice id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant id',
  notice_title      VARCHAR(255)    NOT NULL COMMENT 'title',
  notice_type       CHAR(1)         DEFAULT '1' COMMENT '1 notification, 2 reminder',
  notice_content    TEXT            COMMENT 'content',
  sender_id         BIGINT(20)      DEFAULT NULL COMMENT 'sender id',
  recipient_id      BIGINT(20)      NOT NULL COMMENT 'recipient id',
  status            CHAR(1)         DEFAULT '0' COMMENT '0 unread, 1 read',
  create_by         VARCHAR(64)     DEFAULT '' COMMENT 'create by',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create time',
  update_by         VARCHAR(64)     DEFAULT '' COMMENT 'update by',
  update_time       DATETIME        DEFAULT NULL COMMENT 'update time',
  remark            VARCHAR(500)    DEFAULT NULL COMMENT 'remark',
  PRIMARY KEY (notice_id),
  KEY idx_notice_recipient (recipient_id, status),
  KEY idx_notice_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='system notice';

DROP TABLE IF EXISTS sys_schedule_event;
CREATE TABLE sys_schedule_event (
  event_id          BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT 'event id',
  tenant_id         BIGINT(20)      DEFAULT 100000 COMMENT 'tenant id',
  title             VARCHAR(255)    NOT NULL COMMENT 'title',
  description       TEXT            COMMENT 'description',
  start_time        DATETIME        NOT NULL COMMENT 'start time',
  end_time          DATETIME        NOT NULL COMMENT 'end time',
  is_all_day        TINYINT(1)      DEFAULT 0 COMMENT 'all day flag',
  type              VARCHAR(20)     DEFAULT 'PERSONAL' COMMENT 'MEETING, PERSONAL, WORK',
  creator_id        BIGINT(20)      NOT NULL COMMENT 'creator id',
  attendees         VARCHAR(1000)   DEFAULT NULL COMMENT 'attendee ids json',
  create_time       DATETIME        DEFAULT NULL COMMENT 'create time',
  update_time       DATETIME        DEFAULT NULL COMMENT 'update time',
  del_flag          CHAR(1)         DEFAULT '0' COMMENT 'delete flag',
  PRIMARY KEY (event_id),
  KEY idx_schedule_creator (creator_id),
  KEY idx_schedule_time (start_time, end_time),
  KEY idx_schedule_tenant (tenant_id)
) ENGINE=InnoDB AUTO_INCREMENT=100 DEFAULT CHARSET=utf8mb4 COMMENT='schedule event';

SET FOREIGN_KEY_CHECKS = 1;

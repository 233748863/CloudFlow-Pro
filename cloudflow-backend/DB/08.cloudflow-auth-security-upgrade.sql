-- =========================================================
-- CloudFlow Pro - 认证安全升级增量脚本
-- 日期：2026-05-07
-- 内容：
-- 1. 新增 sys_user.pwd_reset_required
-- 2. 把当前演示初始账号标记为首次登录需改密
-- =========================================================

USE cloud_flow_db;

ALTER TABLE sys_user
  ADD COLUMN IF NOT EXISTS pwd_reset_required CHAR(1) NOT NULL DEFAULT '0' COMMENT '是否首次登录强制改密（0否 1是）' AFTER del_flag;

UPDATE sys_user
SET pwd_reset_required = '1'
WHERE tenant_id = 100000
  AND user_id BETWEEN 1 AND 20;

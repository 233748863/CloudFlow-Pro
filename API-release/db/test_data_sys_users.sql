-- ============================================
-- UPMS 系统管理员测试数据
-- 生成时间: 2026-01-19 13:05:19
-- 数据量: 10 条
-- 所有账号统一密码: 123456
-- ============================================

-- 设置客户端字符集为 UTF-8,防止中文乱码
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================
-- sys_user 表数据（追加模式，不清理旧数据）
-- ============================================
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10001, 'testadmin', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000001', NULL, '测试管理员', '测试管理员', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10002, 'auditor1', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000002', NULL, '审核员1', '审核员1', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10003, 'auditor2', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000003', NULL, '审核员2', '审核员2', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10004, 'auditor3', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000004', NULL, '审核员3', '审核员3', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10005, 'operator1', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000005', NULL, '运营人员1', '运营人员1', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10006, 'operator2', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000006', NULL, '运营人员2', '运营人员2', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10007, 'operator3', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000007', NULL, '运营人员3', '运营人员3', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10008, 'finance1', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000008', NULL, '财务人员1', '财务人员1', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10009, 'finance2', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000009', NULL, '财务人员2', '财务人员2', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);
INSERT INTO sys_user (user_id, username, password, salt, phone, avatar, nickname, name, email, dept_id, create_by, update_by, create_time, update_time, lock_flag, del_flag, wx_openid, qq_openid, gitee_login, osc_id, tenant_id) VALUES
(10010, 'service1', '$2a$10$c/Ae0pRjJtMZg3BnvVpO.eIK6WYWVbKTzqgdy3afR7w.vd.xi3Mgy', NULL, '13800000010', NULL, '客服人员1', '客服人员1', NULL, 1, 'admin', 'admin', '2026-01-19 13:05:19', '2026-01-19 13:05:19', '0', '0', NULL, NULL, NULL, NULL, 1);

-- ============================================
-- sys_user_role 表数据（用户角色关联）
-- 所有测试账号都分配管理员角色（role_id=1）
-- ============================================
INSERT INTO sys_user_role (user_id, role_id) VALUES
(10001, 1),
(10002, 1),
(10003, 1),
(10004, 1),
(10005, 1),
(10006, 1),
(10007, 1),
(10008, 1),
(10009, 1),
(10010, 1);

-- ============================================
-- 数据生成完成
-- ============================================

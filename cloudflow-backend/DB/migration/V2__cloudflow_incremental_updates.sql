-- =========================================================
-- CloudFlow Pro - 增量迁移汇总脚本
-- 说明：当前仓库按“全量重建数据库后执行一次”方式维护，
--      后续迁移变更统一追加到本文件末尾。
-- =========================================================

-- 一、文件存储能力扩展
ALTER TABLE sys_file
    ADD COLUMN storage_type VARCHAR(20) NOT NULL DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS）' AFTER url;

UPDATE sys_file
SET storage_type = 'LOCAL'
WHERE storage_type IS NULL
   OR storage_type = '';

-- 二、系统管理菜单扩展：登录日志、在线用户
INSERT INTO sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, query_param, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_by, create_time, update_by, update_time, remark
)
SELECT 616, '登录日志', 6, 13, '/system/login-log', 'pages/system/LoginLogPage', NULL, 0, 0,
       'C', '0', '0', 'system:login-log:list', 'LogIn', 'admin', NOW(), '', NULL, '登录日志'
WHERE NOT EXISTS (
    SELECT 1 FROM sys_menu WHERE menu_id = 616 OR path = '/system/login-log'
);

INSERT INTO sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, query_param, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_by, create_time, update_by, update_time, remark
)
SELECT 617, '在线用户', 6, 14, '/system/online', 'pages/system/OnlineUserPage', NULL, 0, 0,
       'C', '0', '0', 'system:online:list', 'Monitor', 'admin', NOW(), '', NULL, '在线用户管理'
WHERE NOT EXISTS (
    SELECT 1 FROM sys_menu WHERE menu_id = 617 OR path = '/system/online'
);

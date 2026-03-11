INSERT INTO sys_menu (
    menu_id, menu_name, parent_id, order_num, path, component, query_param, is_frame, is_cache,
    menu_type, visible, status, perms, icon, create_by, create_time, update_by, update_time, remark
)
SELECT 614, '????', 6, 13, '/system/login-log', 'pages/system/LoginLogPage', NULL, 0, 0,
       'C', '0', '0', 'system:login-log:list', 'LogIn', 'admin', NOW(), '', NULL, '????'
WHERE NOT EXISTS (
    SELECT 1 FROM sys_menu WHERE menu_id = 614 OR path = '/system/login-log'
);

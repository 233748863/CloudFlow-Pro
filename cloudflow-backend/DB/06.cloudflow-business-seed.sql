-- =========================================================
-- CloudFlow Pro - light business seed
-- Scope: basic workspace, schedule, announcement, contacts,
--        employee archive, leave, overtime and leave quota.
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Clean tenant-scoped seed data.
DELETE FROM sys_role_menu WHERE tenant_id = 100000;
DELETE FROM sys_user_role WHERE tenant_id = 100000;
DELETE FROM sys_user_post WHERE tenant_id = 100000;
DELETE FROM sys_notice WHERE tenant_id = 100000;
DELETE FROM sys_announcement_read WHERE tenant_id = 100000;
DELETE FROM sys_announcement WHERE tenant_id = 100000;
DELETE FROM sys_schedule_event WHERE tenant_id = 100000;
DELETE FROM hr_emergency_contact WHERE tenant_id = 100000;
DELETE FROM hr_leave_quota WHERE tenant_id = 100000;
DELETE FROM hr_leave_application WHERE tenant_id = 100000;
DELETE FROM hr_overtime_application WHERE tenant_id = 100000;
DELETE FROM hr_leave_type WHERE tenant_id = 100000;
DELETE FROM hr_employee WHERE tenant_id = 100000;
DELETE FROM sys_dict_data WHERE tenant_id = 100000;
DELETE FROM sys_dict_type WHERE tenant_id = 100000;
DELETE FROM sys_config WHERE tenant_id = 100000;
DELETE FROM sys_user WHERE tenant_id = 100000 AND user_id IN (1, 2, 3);
DELETE FROM sys_post WHERE tenant_id = 100000 AND post_id IN (1, 2, 3);
DELETE FROM sys_dept WHERE tenant_id = 100000 AND dept_id IN (100, 101, 102);
DELETE FROM sys_role WHERE tenant_id = 100000 AND role_id IN (1, 2, 3);
DELETE FROM sys_tenant WHERE tenant_id = 100000;
DELETE FROM sys_menu;

-- Tenant and organization.
INSERT INTO sys_tenant (
  tenant_id, tenant_name, contact_name, contact_phone, contact_email, domain,
  status, expire_time, user_limit, storage_limit, storage_used, del_flag,
  create_by, create_time, update_by, update_time, remark
) VALUES (
  100000, '新元社区', '管理员', '15888888888',
  'admin@cloudflow.com', 'cloudflow.local', '0',
  DATE_ADD(CURDATE(), INTERVAL 10 YEAR), 100, 10240, 0, '0',
  'admin', NOW(), '', NULL, 'default tenant'
);

INSERT INTO sys_dept (
  dept_id, tenant_id, parent_id, ancestors, dept_name, order_num, leader,
  phone, email, status, del_flag, create_by, create_time, update_by, update_time
) VALUES
(100, 100000, 0, '0', '新元社区', 0, 'admin', '15888888888', 'admin@cloudflow.com', '0', '0', 'admin', NOW(), '', NULL),
(101, 100000, 100, '0,100', '人事部', 1, 'hr', '15888888889', 'hr@cloudflow.com', '0', '0', 'admin', NOW(), '', NULL),
(102, 100000, 100, '0,100', '业务部', 2, 'staff', '15888888890', 'staff@cloudflow.com', '0', '0', 'admin', NOW(), '', NULL);

INSERT INTO sys_post (
  post_id, tenant_id, post_code, post_name, post_sort, status,
  create_by, create_time, update_by, update_time, remark
) VALUES
(1, 100000, 'admin', '系统管理员', 1, '0', 'admin', NOW(), '', NULL, 'system maintenance'),
(2, 100000, 'hr', '人事专员', 2, '0', 'admin', NOW(), '', NULL, 'HR approval and employee archive'),
(3, 100000, 'employee', '员工', 3, '0', 'admin', NOW(), '', NULL, 'basic employee');

INSERT INTO sys_role (
  role_id, tenant_id, role_name, role_key, role_sort, data_scope, ds_type,
  ds_scope, status, del_flag, create_by, create_time, update_by, update_time, remark
) VALUES
(1, 100000, '管理员', 'admin', 1, '1', 0, NULL, '0', '0', 'admin', NOW(), '', NULL, 'system admin'),
(2, 100000, '人事', 'hr', 2, '1', 0, NULL, '0', '0', 'admin', NOW(), '', NULL, 'HR approval and archive maintenance'),
(3, 100000, '员工', 'employee', 3, '4', 4, NULL, '0', '0', 'admin', NOW(), '', NULL, 'self-service employee');

-- Password for all seed users: 123456
INSERT INTO sys_user (
  user_id, tenant_id, dept_id, user_name, nick_name, email, phonenumber, sex,
  password, status, del_flag, login_ip, login_date, create_by, create_time,
  update_by, update_time, remark, avatar
) VALUES
(1, 100000, 100, 'admin', '管理员', 'admin@cloudflow.com', '15888888888', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, 'system admin', ''),
(2, 100000, 101, 'hr', '人事', 'hr@cloudflow.com', '15888888889', '1', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, 'HR manager', ''),
(3, 100000, 102, 'staff', '员工', 'staff@cloudflow.com', '15888888890', '0', '$2a$10$4xVcDQmj7FaV3k2i1ihyP.2bknxo6Tv4bmRxB6lnilv0aAFOXnwUC', '0', '0', '', NULL, 'admin', NOW(), '', NULL, 'employee', '');

INSERT INTO sys_user_role (user_id, role_id, tenant_id) VALUES
(1, 1, 100000),
(2, 2, 100000),
(3, 3, 100000);

INSERT INTO sys_user_post (user_id, post_id, tenant_id) VALUES
(1, 1, 100000),
(2, 2, 100000),
(3, 3, 100000);

-- Menus. Employee gets quota view only; quota init/adjust are HR/admin button permissions.
INSERT INTO sys_menu (
  menu_id, menu_name, parent_id, order_num, path, component, query,
  is_frame, is_cache, menu_type, visible, status, perms, icon,
  create_by, create_time, update_by, update_time, remark
) VALUES
(1, '工作台', 0, 1, '/dashboard', NULL, NULL, 0, 0, 'M', '0', '0', NULL, 'LayoutDashboard', 'admin', NOW(), '', NULL, 'workspace'),
(100, '首页', 1, 1, '/dashboard', 'pages/Dashboard', NULL, 0, 0, 'C', '0', '0', 'dashboard:view', 'LayoutDashboard', 'admin', NOW(), '', NULL, 'dashboard'),
(101, '我的工作台', 1, 2, '/workplace', 'pages/Workplace', NULL, 0, 0, 'C', '0', '0', 'workplace:view', 'Briefcase', 'admin', NOW(), '', NULL, 'my workplace'),

(2, '办公协同', 0, 2, '/office', NULL, NULL, 0, 0, 'M', '0', '0', NULL, 'CalendarDays', 'admin', NOW(), '', NULL, 'office'),
(200, '日程', 2, 1, '/schedule', 'pages/SchedulePage', NULL, 0, 0, 'C', '0', '0', 'office:schedule:list', 'CalendarDays', 'admin', NOW(), '', NULL, 'schedule'),
(201, '公告', 2, 2, '/office/announcement', 'pages/AnnouncementPage', NULL, 0, 0, 'C', '0', '0', 'office:announcement:list', 'Megaphone', 'admin', NOW(), '', NULL, 'announcement'),
(202, '通讯录', 2, 3, '/office/contact', 'pages/ContactPage', NULL, 0, 0, 'C', '0', '0', 'office:contact:list', 'Contact', 'admin', NOW(), '', NULL, 'contacts'),

(7, '人事管理', 0, 3, '/hr', NULL, NULL, 0, 0, 'M', '0', '0', NULL, 'Users', 'admin', NOW(), '', NULL, 'HR light'),
(700, '人事工作台', 7, 1, '/hr/dashboard', 'pages/hr/HrDashboardPage', NULL, 0, 0, 'C', '0', '0', 'hr:dashboard:view', 'LayoutDashboard', 'admin', NOW(), '', NULL, 'HR dashboard'),
(701, '员工档案', 7, 2, '/hr/employees', 'pages/hr/HrEmployeePage', NULL, 0, 0, 'C', '0', '0', 'hr:employee:list', 'UserRound', 'admin', NOW(), '', NULL, 'employee archive'),
(702, '假期额度', 7, 3, '/hr/leave/quota', 'pages/hr/HrLeaveQuotaPage', NULL, 0, 0, 'C', '0', '0', 'hr:leave:quota:view', 'WalletCards', 'admin', NOW(), '', NULL, 'leave quota'),
(707, '人事审批', 7, 4, '/hr/approvals', 'pages/hr/HrApprovalPage', NULL, 0, 0, 'C', '0', '0', 'hr:approval:list', 'ClipboardCheck', 'admin', NOW(), '', NULL, 'HR approvals'),
(703, '加班登记', 7, 5, '/hr/overtime/applications', 'pages/OvertimeApplicationPage', NULL, 0, 0, 'C', '0', '0', 'hr:overtime:list', 'Clock', 'admin', NOW(), '', NULL, 'overtime registration'),
(704, '休假登记', 7, 6, '/hr/leave/application', 'pages/LeaveApplicationPage', NULL, 0, 0, 'C', '0', '0', 'hr:leave:application', 'CalendarCheck', 'admin', NOW(), '', NULL, 'leave registration'),
(705, '假期额度初始化', 702, 1, '#', '', NULL, 0, 0, 'F', '1', '0', 'hr:leave:quota:init', '#', 'admin', NOW(), '', NULL, 'HR quota initialization'),
(706, '假期额度调整', 702, 2, '#', '', NULL, 0, 0, 'F', '1', '0', 'hr:leave:quota:manage', '#', 'admin', NOW(), '', NULL, 'HR quota adjustment'),
(708, '人事审批通过', 707, 1, '#', '', NULL, 0, 0, 'F', '1', '0', 'hr:approval:approve', '#', 'admin', NOW(), '', NULL, 'HR approval approve'),
(709, '人事审批驳回', 707, 2, '#', '', NULL, 0, 0, 'F', '1', '0', 'hr:approval:reject', '#', 'admin', NOW(), '', NULL, 'HR approval reject'),

(6, '系统管理', 0, 4, '/system', NULL, NULL, 0, 0, 'M', '0', '0', NULL, 'Settings', 'admin', NOW(), '', NULL, 'basic system management'),
(600, '组织架构', 6, 1, '/users', 'pages/OrgStructurePage', NULL, 0, 0, 'C', '0', '0', 'system:dept:list', 'Network', 'admin', NOW(), '', NULL, 'organization'),
(601, '用户管理', 6, 2, '/system/users', 'pages/system/UserList', NULL, 0, 0, 'C', '0', '0', 'system:user:list', 'UserCog', 'admin', NOW(), '', NULL, 'users'),
(602, '角色管理', 6, 3, '/system/roles', 'pages/system/RoleList', NULL, 0, 0, 'C', '0', '0', 'system:role:list', 'ShieldCheck', 'admin', NOW(), '', NULL, 'roles'),
(603, '菜单管理', 6, 4, '/system/menus', 'pages/system/MenuList', NULL, 0, 0, 'C', '0', '0', 'system:menu:list', 'ListTree', 'admin', NOW(), '', NULL, 'menus'),
(605, '租户管理', 6, 5, '/system/tenant', 'pages/system/TenantList', NULL, 0, 0, 'C', '0', '0', 'system:tenant:list', 'Building2', 'admin', NOW(), '', NULL, 'tenants'),
(606, '岗位管理', 6, 6, '/system/post', 'pages/system/PostList', NULL, 0, 0, 'C', '0', '0', 'system:post:list', 'IdCard', 'admin', NOW(), '', NULL, 'posts'),
(607, '参数配置', 6, 7, '/system/config', 'pages/system/ConfigList', NULL, 0, 0, 'C', '0', '0', 'system:config:list', 'SlidersHorizontal', 'admin', NOW(), '', NULL, 'config'),
(608, '字典管理', 6, 8, '/system/dict', 'pages/admin/DictPage', NULL, 0, 0, 'C', '0', '0', 'system:dict:list', 'BookOpen', 'admin', NOW(), '', NULL, 'dict');

INSERT INTO sys_role_menu (role_id, menu_id, tenant_id)
SELECT 1, menu_id, 100000 FROM sys_menu;

INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES
(2, 1, 100000), (2, 100, 100000), (2, 101, 100000),
(2, 2, 100000), (2, 200, 100000), (2, 201, 100000), (2, 202, 100000),
(2, 7, 100000), (2, 700, 100000), (2, 701, 100000), (2, 702, 100000),
(2, 703, 100000), (2, 704, 100000), (2, 705, 100000), (2, 706, 100000),
(2, 707, 100000), (2, 708, 100000), (2, 709, 100000);

INSERT INTO sys_role_menu (role_id, menu_id, tenant_id) VALUES
(3, 1, 100000), (3, 100, 100000), (3, 101, 100000),
(3, 2, 100000), (3, 200, 100000), (3, 201, 100000), (3, 202, 100000),
(3, 7, 100000), (3, 702, 100000), (3, 703, 100000), (3, 704, 100000);

-- Dictionaries.
INSERT INTO sys_dict_type (
  dict_id, tenant_id, dict_name, dict_type, status, remark, create_by, create_time, update_by, update_time
) VALUES
(1001, 100000, '用户性别', 'sys_user_sex', '0', NULL, 'admin', NOW(), NULL, NULL),
(1002, 100000, '正常停用', 'sys_normal_disable', '0', NULL, 'admin', NOW(), NULL, NULL),
(1003, 100000, '是否', 'sys_yes_no', '0', NULL, 'admin', NOW(), NULL, NULL),
(1004, 100000, '通知类型', 'sys_notice_type', '0', NULL, 'admin', NOW(), NULL, NULL),
(1005, 100000, '员工类型', 'hr_employee_type', '0', NULL, 'admin', NOW(), NULL, NULL),
(1006, 100000, '员工状态', 'hr_employee_status', '0', NULL, 'admin', NOW(), NULL, NULL),
(1007, 100000, '申请状态', 'hr_application_status', '0', NULL, 'admin', NOW(), NULL, NULL),
(1008, 100000, '休假时段', 'hr_leave_period', '0', NULL, 'admin', NOW(), NULL, NULL),
(1009, 100000, '加班类型', 'hr_overtime_type', '0', NULL, 'admin', NOW(), NULL, NULL),
(1010, 100000, '补偿方式', 'hr_compensation_type', '0', NULL, 'admin', NOW(), NULL, NULL);

INSERT INTO sys_dict_data (
  dict_code, tenant_id, dict_sort, dict_label, dict_value, dict_type,
  css_class, list_class, is_default, status, remark, create_by, create_time, update_by, update_time
) VALUES
(10001, 100000, 1, '男', '0', 'sys_user_sex', NULL, 'primary', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10002, 100000, 2, '女', '1', 'sys_user_sex', NULL, 'success', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10003, 100000, 3, '未知', '2', 'sys_user_sex', NULL, 'info', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10004, 100000, 1, '正常', '0', 'sys_normal_disable', NULL, 'success', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10005, 100000, 2, '停用', '1', 'sys_normal_disable', NULL, 'danger', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10006, 100000, 1, '是', 'Y', 'sys_yes_no', NULL, 'success', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10007, 100000, 2, '否', 'N', 'sys_yes_no', NULL, 'danger', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10008, 100000, 1, '公告', '1', 'sys_notice_type', NULL, 'primary', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10009, 100000, 2, '提醒', '2', 'sys_notice_type', NULL, 'info', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10010, 100000, 1, '全职', 'FULL_TIME', 'hr_employee_type', NULL, 'primary', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10011, 100000, 2, '兼职', 'PART_TIME', 'hr_employee_type', NULL, 'info', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10012, 100000, 3, '实习', 'INTERN', 'hr_employee_type', NULL, 'warning', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10013, 100000, 1, '待入职', 'PENDING', 'hr_employee_status', NULL, 'info', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10014, 100000, 2, '试用期', 'PROBATION', 'hr_employee_status', NULL, 'warning', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10015, 100000, 3, '正式', 'REGULAR', 'hr_employee_status', NULL, 'success', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10016, 100000, 1, '草稿', 'DRAFT', 'hr_application_status', NULL, 'info', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10017, 100000, 2, '审批中', 'APPROVING', 'hr_application_status', NULL, 'warning', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10018, 100000, 3, '已通过', 'APPROVED', 'hr_application_status', NULL, 'success', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10019, 100000, 4, '已驳回', 'REJECTED', 'hr_application_status', NULL, 'danger', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10020, 100000, 5, '已撤销', 'CANCELLED', 'hr_application_status', NULL, 'info', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10021, 100000, 1, '上午', 'AM', 'hr_leave_period', NULL, 'primary', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10022, 100000, 2, '下午', 'PM', 'hr_leave_period', NULL, 'primary', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10023, 100000, 3, '全天', 'FULL_DAY', 'hr_leave_period', NULL, 'success', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10024, 100000, 1, '工作日', 'WORKDAY', 'hr_overtime_type', NULL, 'primary', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL),
(10025, 100000, 2, '周末', 'WEEKEND', 'hr_overtime_type', NULL, 'warning', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10026, 100000, 3, '节假日', 'HOLIDAY', 'hr_overtime_type', NULL, 'danger', 'N', '0', NULL, 'admin', NOW(), NULL, NULL),
(10027, 100000, 1, '调休', 'TIME_OFF', 'hr_compensation_type', NULL, 'success', 'Y', '0', NULL, 'admin', NOW(), NULL, NULL);

INSERT INTO sys_config (
  config_id, tenant_id, config_name, config_key, config_value, config_type,
  config_scope, create_by, create_time, update_by, update_time, remark
) VALUES
(1, 100000, '系统名称', 'sys.name', 'CloudFlow Pro 轻版', 'Y', '1', 'admin', NOW(), '', NULL, 'system name');

-- OA seed.
INSERT INTO sys_announcement (
  announcement_id, tenant_id, title, content, type, scope_type, scope_value,
  status, priority, is_top, sender_id, publish_time, expire_time,
  create_by, create_time, update_by, update_time, del_flag
) VALUES
(9601, 100000, '轻版功能说明', '当前组织仅保留工作台、日程、公告、通讯录、员工档案、休假登记、加班登记和假期额度。', '2', 'ALL', NULL, '1', 'M', 1, 1, NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY), 'admin', NOW(), '', NULL, '0');

INSERT INTO sys_notice (
  notice_id, tenant_id, notice_title, notice_type, notice_content,
  sender_id, recipient_id, status, create_by, create_time, update_by, update_time, remark
) VALUES
(9901, 100000, '人事轻审批已启用', '1', '休假和加班登记由人事或管理员审批。', 1, 2, '0', 'admin', NOW(), '', NULL, NULL),
(9902, 100000, '人事轻审批已启用', '1', '休假和加班登记由人事或管理员审批。', 1, 3, '0', 'admin', NOW(), '', NULL, NULL);

INSERT INTO sys_schedule_event (
  event_id, tenant_id, title, description, start_time, end_time,
  is_all_day, type, creator_id, attendees, create_time, update_time, del_flag
) VALUES
(9501, 100000, '轻版规则确认', '确认菜单范围和半天额度规则。', DATE_ADD(CURDATE(), INTERVAL 10 HOUR), DATE_ADD(CURDATE(), INTERVAL 11 HOUR), 0, 'WORK', 1, '[2,3]', NOW(), NULL, '0');

-- HR seed.
INSERT INTO hr_employee (
  id, tenant_id, employee_no, name, gender, birth_date, phone, email,
  dept_id, post_id, employee_type, employee_status, hire_date, regular_date,
  resign_date, user_id, create_time, update_time, create_by, update_by, deleted
) VALUES
(1001, 100000, 'LF0001', '管理员', 'MALE', '1988-01-01', '15888888888', 'admin@cloudflow.com', 100, 1, 'FULL_TIME', 'REGULAR', '2024-01-01', '2024-04-01', NULL, 1, NOW(), NOW(), 'admin', 'admin', 0),
(1002, 100000, 'LF0002', '人事', 'FEMALE', '1990-02-02', '15888888889', 'hr@cloudflow.com', 101, 2, 'FULL_TIME', 'REGULAR', '2024-02-01', '2024-05-01', NULL, 2, NOW(), NOW(), 'admin', 'admin', 0),
(1003, 100000, 'LF0003', '员工', 'MALE', '1995-03-03', '15888888890', 'staff@cloudflow.com', 102, 3, 'FULL_TIME', 'REGULAR', '2024-03-01', '2024-06-01', NULL, 3, NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO hr_leave_type (
  id, tenant_id, leave_code, leave_name, need_quota, is_paid, unit,
  quota_rule, expiry_rule, status, create_time, update_time, create_by, update_by, deleted
) VALUES
(1, 100000, 'ANNUAL', '年假', 1, 1, 'DAY', '{"baseQuota":5,"incrementPerYear":1,"maxQuota":15}', '{"type":"YEAR_END"}', 1, NOW(), NOW(), 'admin', 'admin', 0),
(2, 100000, 'COMPENSATORY', '调休假', 1, 1, 'DAY', '{"quota":0}', '{"type":"DAYS_AFTER_EARNED","days":365}', 1, NOW(), NOW(), 'admin', 'admin', 0),
(3, 100000, 'PERSONAL', '事假', 0, 0, 'DAY', NULL, NULL, 1, NOW(), NOW(), 'admin', 'admin', 0),
(4, 100000, 'SICK', '病假', 0, 1, 'DAY', NULL, NULL, 1, NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO hr_leave_quota (
  tenant_id, employee_id, leave_type_id, year, total_quota, used_quota,
  frozen_quota, available_quota, expiry_date, create_time, update_time,
  create_by, update_by, deleted
) VALUES
(100000, 1001, 1, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0),
(100000, 1002, 1, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0),
(100000, 1003, 1, YEAR(CURDATE()), 5.00, 0.00, 0.00, 5.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0),
(100000, 1001, 2, YEAR(CURDATE()), 0.00, 0.00, 0.00, 0.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0),
(100000, 1002, 2, YEAR(CURDATE()), 0.00, 0.00, 0.00, 0.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0),
(100000, 1003, 2, YEAR(CURDATE()), 0.00, 0.00, 0.00, 0.00, MAKEDATE(YEAR(CURDATE()), 1) + INTERVAL 1 YEAR - INTERVAL 1 DAY, NOW(), NOW(), 'admin', 'admin', 0);

INSERT INTO hr_emergency_contact (
  tenant_id, employee_id, contact_name, relationship, phone, address, priority,
  create_time, update_time, create_by, update_by, deleted
) VALUES
(100000, 1003, '员工紧急联系人', 'OTHER', '15888888891', '本地', 1, NOW(), NOW(), 'admin', 'admin', 0);

SET FOREIGN_KEY_CHECKS = 1;

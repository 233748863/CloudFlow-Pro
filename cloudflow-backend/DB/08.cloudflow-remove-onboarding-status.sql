-- =========================================================
-- CloudFlow Pro - 清理历史员工状态数据
-- 删除已废弃状态的员工记录及其人事关联数据。
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;

CREATE TEMPORARY TABLE tmp_removed_hr_employee_ids AS
SELECT id
FROM hr_employee
WHERE employee_status IN (CONCAT('PEND', 'ING'), CONCAT('PRO', 'BATION'));

DELETE FROM hr_emergency_contact
WHERE employee_id IN (SELECT id FROM tmp_removed_hr_employee_ids);

DELETE FROM hr_leave_quota
WHERE employee_id IN (SELECT id FROM tmp_removed_hr_employee_ids);

DELETE FROM hr_leave_application
WHERE employee_id IN (SELECT id FROM tmp_removed_hr_employee_ids);

DELETE FROM hr_overtime_application
WHERE employee_id IN (SELECT id FROM tmp_removed_hr_employee_ids);

DELETE FROM hr_employee
WHERE id IN (SELECT id FROM tmp_removed_hr_employee_ids);

DROP TEMPORARY TABLE tmp_removed_hr_employee_ids;

DELETE FROM sys_dict_data
WHERE dict_type = 'hr_employee_status'
  AND dict_value IN (CONCAT('PEND', 'ING'), CONCAT('PRO', 'BATION'));

UPDATE sys_config
SET config_value = 'CloudFlow Pro'
WHERE config_key = 'sys.name'
  AND config_value LIKE CONCAT('%', '轻', '版', '%');

UPDATE sys_announcement
SET title = REPLACE(title, CONCAT('轻', '版'), '系统'),
    content = REPLACE(content, CONCAT('轻', '版'), '系统')
WHERE title LIKE CONCAT('%', '轻', '版', '%')
   OR content LIKE CONCAT('%', '轻', '版', '%');

UPDATE sys_notice
SET notice_title = REPLACE(notice_title, CONCAT('轻', '审批'), '审批')
WHERE notice_title LIKE CONCAT('%', '轻', '审批', '%');

UPDATE sys_schedule_event
SET title = REPLACE(title, CONCAT('轻', '版'), ''),
    description = REPLACE(description, CONCAT('轻', '版'), '')
WHERE title LIKE CONCAT('%', '轻', '版', '%')
   OR description LIKE CONCAT('%', '轻', '版', '%');

UPDATE sys_post
SET remark = CASE post_id
  WHEN 1 THEN '系统维护'
  WHEN 2 THEN '人事审批与员工档案'
  WHEN 3 THEN '普通员工'
  ELSE remark
END
WHERE post_id IN (1, 2, 3)
  AND remark REGEXP '[A-Za-z]';

UPDATE sys_role
SET remark = CASE role_id
  WHEN 1 THEN '系统管理员'
  WHEN 2 THEN '人事审批与档案维护'
  WHEN 3 THEN '员工自助'
  ELSE remark
END
WHERE role_id IN (1, 2, 3)
  AND remark REGEXP '[A-Za-z]';

UPDATE sys_config
SET remark = '系统名称'
WHERE config_key = 'sys.name'
  AND remark REGEXP '[A-Za-z]';

UPDATE sys_menu
SET remark = CASE menu_id
  WHEN 1 THEN '工作台'
  WHEN 2 THEN '办公协同'
  WHEN 6 THEN '系统管理'
  WHEN 7 THEN '人事管理'
  WHEN 100 THEN '首页'
  WHEN 101 THEN '我的工作台'
  WHEN 200 THEN '日程'
  WHEN 201 THEN '公告'
  WHEN 202 THEN '通讯录'
  WHEN 600 THEN '组织架构'
  WHEN 601 THEN '用户管理'
  WHEN 602 THEN '角色管理'
  WHEN 603 THEN '菜单管理'
  WHEN 605 THEN '租户管理'
  WHEN 606 THEN '岗位管理'
  WHEN 607 THEN '参数配置'
  WHEN 608 THEN '字典管理'
  WHEN 700 THEN '人事工作台'
  WHEN 701 THEN '员工档案'
  WHEN 702 THEN '假期额度'
  WHEN 703 THEN '加班登记'
  WHEN 704 THEN '休假登记'
  WHEN 705 THEN '假期额度初始化'
  WHEN 706 THEN '假期额度调整'
  WHEN 707 THEN '人事审批'
  WHEN 708 THEN '人事审批通过'
  WHEN 709 THEN '人事审批驳回'
  ELSE remark
END
WHERE menu_id IN (
  1, 2, 6, 7, 100, 101, 200, 201, 202,
  600, 601, 602, 603, 605, 606, 607, 608,
  700, 701, 702, 703, 704, 705, 706, 707, 708, 709
)
  AND remark REGEXP '[A-Za-z]';

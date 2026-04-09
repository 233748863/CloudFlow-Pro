-- 调休额度分桶补丁
-- 1. 支持同一年内按不同过期日期拆分多条额度记录
-- 2. 为请假申请保存额度分配明细，保证冻结、扣减、撤销走同一批额度

ALTER TABLE hr_leave_quota
  DROP INDEX uk_employee_leave_year,
  ADD UNIQUE KEY uk_employee_leave_year_expiry (tenant_id, employee_id, leave_type_id, year, expiry_date);

ALTER TABLE hr_leave_application
  ADD COLUMN quota_allocation TEXT NULL COMMENT '额度分配明细(JSON)' AFTER process_instance_id;

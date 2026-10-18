-- H2内推入职自动生效接入A3统一任务平台；保持原每5分钟扫描周期。
-- 只创建缺失定义；重复执行保留管理员设置，不更改既有业务数据。
INSERT INTO sys_job_handler
    (service_name, handler_name, handler_desc, status, last_report_time, create_by, create_time)
SELECT 'hr', 'hrReferralEmployment', '员工内推入职生效扫描', 'OFFLINE', NULL, 'migration', NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_job_handler WHERE service_name='hr' AND handler_name='hrReferralEmployment');

INSERT INTO sys_job
    (tenant_id, job_name, job_group, service_name, handler_name, handler_param, trigger_type, cron_expression,
     status, concurrent_flag, misfire_strategy, timeout_seconds, lock_time_seconds, log_success_flag,
     alarm_on_fail_flag, create_by, create_time)
SELECT 100000, '员工内推入职生效扫描', 'HR', 'hr', 'hrReferralEmployment', '', 'CRON', '0 */5 * * * ?',
       'ENABLED', 0, 'IGNORE', 240, 240, 1, 1, 'migration', NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_job WHERE service_name='hr' AND handler_name='hrReferralEmployment');

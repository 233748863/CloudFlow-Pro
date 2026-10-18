-- G3 AC-25；2026-10-17用户确认完整归档校验后允许移出在线表，原文继续保留。
-- 对目标公共数据库执行；本文件不会删除既有数据或改写既有业务策略。
DROP TRIGGER IF EXISTS trg_sys_log_no_delete;
DELIMITER $$
CREATE TRIGGER trg_sys_log_no_delete
BEFORE DELETE ON sys_log FOR EACH ROW
BEGIN
    IF COALESCE(@cloudflow_observability_archive_allow_delete, 0) <> 1 THEN
        SIGNAL SQLSTATE '45000'
            SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log delete is forbidden';
    END IF;
END$$
DELIMITER ;

INSERT IGNORE INTO sys_audit_archive_policy
    (biz_module, retain_days, archive_table, status, create_by, create_time) VALUES
    ('__ACCESS_LOG__', 30, 'sys_log_archive', 'ACTIVE', 'migration', NOW()),
    ('__API_ERROR_LOG__', 180, 'sys_api_error_log_archive', 'ACTIVE', 'migration', NOW());

INSERT INTO sys_job_handler
    (service_name, handler_name, handler_desc, status, last_report_time, create_by, create_time)
SELECT 'auth', 'observabilityLogArchive', '归档访问与错误日志', 'OFFLINE', NULL, 'migration', NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_job_handler WHERE service_name='auth' AND handler_name='observabilityLogArchive');

INSERT INTO sys_job
    (tenant_id, job_name, job_group, service_name, handler_name, handler_param, trigger_type, cron_expression,
     status, concurrent_flag, misfire_strategy, timeout_seconds, lock_time_seconds, log_success_flag,
     alarm_on_fail_flag, create_by, create_time)
SELECT 100000, '访问与错误日志归档', 'AUTH', 'auth', 'observabilityLogArchive', '', 'CRON', '0 15 3 * * ?',
       'ENABLED', 0, 'IGNORE', 1800, 1800, 1, 1, 'migration', NOW()
WHERE NOT EXISTS (SELECT 1 FROM sys_job WHERE service_name='auth' AND handler_name='observabilityLogArchive');

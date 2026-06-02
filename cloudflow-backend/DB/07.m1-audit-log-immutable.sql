-- M1-5: 审计/操作日志不可删、不可改
-- 执行顺序：01.cloudflow-common.sql 建表后执行

DROP TRIGGER IF EXISTS trg_sys_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_log_no_update;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_delete;
DROP TRIGGER IF EXISTS trg_sys_audit_log_no_update;

DELIMITER $$

CREATE TRIGGER trg_sys_log_no_delete
BEFORE DELETE ON sys_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log delete is forbidden';
END$$

CREATE TRIGGER trg_sys_log_no_update
BEFORE UPDATE ON sys_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_log update is forbidden';
END$$

CREATE TRIGGER trg_sys_audit_log_no_delete
BEFORE DELETE ON sys_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_audit_log delete is forbidden';
END$$

CREATE TRIGGER trg_sys_audit_log_no_update
BEFORE UPDATE ON sys_audit_log
FOR EACH ROW
BEGIN
    SIGNAL SQLSTATE '45000'
        SET MESSAGE_TEXT = 'ERR.AUDIT_IMMUTABLE: sys_audit_log update is forbidden';
END$$

DELIMITER ;

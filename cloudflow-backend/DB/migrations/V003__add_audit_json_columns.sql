-- M0-5: sys_audit_log 表加 JSON diff 三列
-- 用途：@Audit(diff=true) 时记录完整 before_json / after_json / diff_json

ALTER TABLE `sys_audit_log`
    ADD COLUMN `before_json` TEXT NULL COMMENT '变更前完整 JSON（diff=true 时记录）' AFTER `after_val`,
    ADD COLUMN `after_json` TEXT NULL COMMENT '变更后完整 JSON（diff=true 时记录）' AFTER `before_json`,
    ADD COLUMN `diff_json` TEXT NULL COMMENT 'JSON diff（diff=true 时记录，zjsonpatch 格式）' AFTER `after_json`;

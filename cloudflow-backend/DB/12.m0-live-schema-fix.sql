-- M0-4 live schema fix
-- 补齐当前运行库仍缺失的乐观锁列。

ALTER TABLE biz_expense_claim
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER deleted;

ALTER TABLE wf_process_category
    ADD COLUMN version INT NOT NULL DEFAULT 0 COMMENT '乐观锁版本号' AFTER status;

ALTER TABLE wf_process_instance
    ADD COLUMN lock_version INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER title;

ALTER TABLE wf_task
    ADD COLUMN lock_version INT NOT NULL DEFAULT 1 COMMENT '乐观锁版本号' AFTER status;

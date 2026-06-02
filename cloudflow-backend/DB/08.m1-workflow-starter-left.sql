-- M1-3: workflow 标记离职发起人的运行中实例
ALTER TABLE wf_process_instance
    ADD COLUMN starter_left TINYINT(1) NOT NULL DEFAULT 0 COMMENT '发起人是否已离职(0否 1是)';

CREATE INDEX idx_wf_proc_starter_left ON wf_process_instance (start_user_id, status, starter_left);

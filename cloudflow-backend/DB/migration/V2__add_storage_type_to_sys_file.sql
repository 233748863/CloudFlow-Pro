ALTER TABLE sys_file
    ADD COLUMN storage_type VARCHAR(20) NOT NULL DEFAULT 'LOCAL' COMMENT '存储类型（LOCAL/OSS）' AFTER url;

UPDATE sys_file
SET storage_type = 'LOCAL'
WHERE storage_type IS NULL
   OR storage_type = '';

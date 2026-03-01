-- CloudFlow Pro - Alter Workflow Table for Advanced Features
-- Version: v1.0
-- Created: 2026-02-28

SET NAMES utf8mb4;

-- Add new columns to wf_process_definition table
ALTER TABLE wf_process_definition 
    ADD COLUMN template_id VARCHAR(64) DEFAULT NULL COMMENT 'Source template ID';

ALTER TABLE wf_process_definition 
    ADD COLUMN current_version VARCHAR(20) DEFAULT '1.0.0' COMMENT 'Current version number';

ALTER TABLE wf_process_definition 
    ADD COLUMN is_archived TINYINT(1) DEFAULT 0 COMMENT 'Is archived flag';

-- Add indexes
ALTER TABLE wf_process_definition 
    ADD INDEX idx_template (template_id);

ALTER TABLE wf_process_definition 
    ADD INDEX idx_archived (is_archived);

-- Add index for version queries
ALTER TABLE wf_process_definition 
    ADD INDEX idx_version (current_version);

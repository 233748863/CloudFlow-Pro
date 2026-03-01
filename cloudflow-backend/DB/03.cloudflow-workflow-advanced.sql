-- CloudFlow Pro - Workflow Advanced Features Database Script
-- Module: Template Library, Version Control, Import/Export, Batch Archive
-- Version: v1.0
-- Created: 2026-02-28

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

-- Template Library Module

-- 1. Workflow Template Table
DROP TABLE IF EXISTS workflow_template;
CREATE TABLE workflow_template (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    description TEXT,
    category_id VARCHAR(64),
    tags JSON,
    definition JSON NOT NULL,
    preview_image VARCHAR(500),
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    usage_count INT DEFAULT 0,
    is_system TINYINT(1) DEFAULT 0,
    status VARCHAR(20) DEFAULT 'active',
    tenant_id BIGINT(20) DEFAULT 100000,
    INDEX idx_category (category_id),
    INDEX idx_created_by (created_by),
    INDEX idx_status (status),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. Template Category Table
DROP TABLE IF EXISTS template_category;
CREATE TABLE template_category (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description VARCHAR(500),
    parent_id VARCHAR(64),
    order_num INT DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    tenant_id BIGINT(20) DEFAULT 100000,
    INDEX idx_parent (parent_id),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Version Control Module

-- 3. Workflow Version Table
DROP TABLE IF EXISTS workflow_version;
CREATE TABLE workflow_version (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL,
    version_number VARCHAR(20) NOT NULL,
    definition JSON NOT NULL,
    change_log TEXT,
    change_type VARCHAR(20) NOT NULL,
    created_by VARCHAR(64) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    is_rollback TINYINT(1) DEFAULT 0,
    rollback_from_version VARCHAR(20),
    checksum VARCHAR(64) NOT NULL,
    tenant_id BIGINT(20) DEFAULT 100000,
    INDEX idx_workflow (workflow_id),
    INDEX idx_version (workflow_id, version_number),
    INDEX idx_created_at (created_at),
    INDEX idx_tenant (tenant_id),
    UNIQUE KEY uk_workflow_version (workflow_id, version_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Archive Module

-- 4. Workflow Archive Table
DROP TABLE IF EXISTS workflow_archive;
CREATE TABLE workflow_archive (
    id VARCHAR(64) PRIMARY KEY,
    workflow_id VARCHAR(64) NOT NULL,
    workflow_name VARCHAR(200) NOT NULL,
    archived_by VARCHAR(64) NOT NULL,
    archived_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    archive_reason TEXT,
    can_restore TINYINT(1) DEFAULT 1,
    original_data JSON NOT NULL,
    tenant_id BIGINT(20) DEFAULT 100000,
    INDEX idx_workflow (workflow_id),
    INDEX idx_archived_by (archived_by),
    INDEX idx_archived_at (archived_at),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Audit Log Table
DROP TABLE IF EXISTS workflow_audit_log;
CREATE TABLE workflow_audit_log (
    id BIGINT(20) NOT NULL AUTO_INCREMENT,
    tenant_id BIGINT(20) DEFAULT 100000,
    operation_type VARCHAR(50) NOT NULL,
    operation_module VARCHAR(50) NOT NULL,
    target_id VARCHAR(64),
    target_name VARCHAR(200),
    operator_id VARCHAR(64) NOT NULL,
    operator_name VARCHAR(64),
    operation_detail TEXT,
    operation_reason TEXT,
    ip_address VARCHAR(50),
    user_agent VARCHAR(500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_operation_type (operation_type),
    INDEX idx_operator (operator_id),
    INDEX idx_target (target_id),
    INDEX idx_created_at (created_at),
    INDEX idx_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Initialize Template Categories
INSERT INTO template_category (id, name, description, order_num, tenant_id) VALUES
('cat-hr', 'HR Management', 'Human Resources related workflow templates', 1, 100000),
('cat-finance', 'Finance Management', 'Finance related workflow templates', 2, 100000),
('cat-procurement', 'Procurement Management', 'Procurement related workflow templates', 3, 100000),
('cat-contract', 'Contract Management', 'Contract approval related workflow templates', 4, 100000),
('cat-admin', 'Administration', 'Administrative workflow templates', 5, 100000);

SET FOREIGN_KEY_CHECKS = 1;

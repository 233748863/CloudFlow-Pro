-- =========================================================
-- CloudFlow Pro - 租户编码增量脚本
-- 为登录和注册增加稳定的租户编码。
-- =========================================================

USE cloud_flow_db;

SET NAMES utf8mb4;

SET @column_exists := (
  SELECT COUNT(*)
  FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sys_tenant'
    AND COLUMN_NAME = 'tenant_code'
);

SET @ddl := IF(
  @column_exists = 0,
  'ALTER TABLE sys_tenant ADD COLUMN tenant_code VARCHAR(50) NULL COMMENT ''租户编码'' AFTER tenant_id',
  'SELECT ''tenant_code 字段已存在'''
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE sys_tenant
SET tenant_code = 'xinyuan'
WHERE tenant_id = 100000
  AND (tenant_code IS NULL OR tenant_code = '');

UPDATE sys_tenant
SET tenant_code = CONCAT('tenant_', tenant_id)
WHERE tenant_code IS NULL OR tenant_code = '';

ALTER TABLE sys_tenant
  MODIFY tenant_code VARCHAR(50) NOT NULL COMMENT '租户编码';

SET @index_exists := (
  SELECT COUNT(*)
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'sys_tenant'
    AND INDEX_NAME = 'uk_tenant_code'
);

SET @ddl := IF(
  @index_exists = 0,
  'ALTER TABLE sys_tenant ADD UNIQUE KEY uk_tenant_code (tenant_code)',
  'SELECT ''uk_tenant_code 索引已存在'''
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

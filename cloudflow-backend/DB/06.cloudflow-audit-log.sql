-- 工作流审计日志表
-- 用于记录工作流高级功能的关键操作（模板管理、版本回滚、归档、删除等）
-- 注意：这与 sys_audit_log 表不同，sys_audit_log 用于记录数据变更的字段级差异
CREATE TABLE IF NOT EXISTS wf_audit_log (
    id VARCHAR(64) PRIMARY KEY COMMENT '审计日志ID',
    operation_type VARCHAR(50) NOT NULL COMMENT '操作类型',
    target_type VARCHAR(50) NOT NULL COMMENT '操作对象类型',
    target_id VARCHAR(64) NOT NULL COMMENT '操作对象ID',
    target_name VARCHAR(200) COMMENT '操作对象名称',
    operator_id VARCHAR(64) NOT NULL COMMENT '操作人ID',
    operator_name VARCHAR(100) COMMENT '操作人名称',
    operation_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
    operation_reason TEXT COMMENT '操作原因',
    operation_details TEXT COMMENT '操作详情',
    operation_result VARCHAR(20) NOT NULL DEFAULT 'SUCCESS' COMMENT '操作结果',
    error_message TEXT COMMENT '错误信息',
    ip_address VARCHAR(50) COMMENT 'IP地址',
    user_agent VARCHAR(500) COMMENT '用户代理',
    tenant_id BIGINT COMMENT '租户ID',
    INDEX idx_operation_type (operation_type),
    INDEX idx_target_type (target_type),
    INDEX idx_target_id (target_id),
    INDEX idx_operator_id (operator_id),
    INDEX idx_operation_time (operation_time),
    INDEX idx_tenant_id (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='工作流审计日志表';

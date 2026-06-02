-- M1-4: 字典隐式引用告警
-- 执行顺序：01.cloudflow-common.sql 建表后执行

CREATE TABLE IF NOT EXISTS sys_dict_orphan_alert (
    id BIGINT NOT NULL AUTO_INCREMENT COMMENT '主键',
    tenant_id BIGINT NOT NULL COMMENT '租户ID',
    dict_type VARCHAR(100) NOT NULL COMMENT '字典类型编码',
    reason VARCHAR(255) NOT NULL COMMENT '告警原因',
    binding_summary VARCHAR(2000) NOT NULL COMMENT '绑定摘要',
    binding_count INT NOT NULL DEFAULT 0 COMMENT '绑定数量',
    create_by VARCHAR(64) DEFAULT NULL COMMENT '创建人',
    create_time DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
    update_by VARCHAR(64) DEFAULT NULL COMMENT '更新人',
    update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
    PRIMARY KEY (id),
    UNIQUE KEY uk_sys_dict_orphan_alert_tenant_type (tenant_id, dict_type),
    KEY idx_sys_dict_orphan_alert_tenant (tenant_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='字典隐式引用告警表';

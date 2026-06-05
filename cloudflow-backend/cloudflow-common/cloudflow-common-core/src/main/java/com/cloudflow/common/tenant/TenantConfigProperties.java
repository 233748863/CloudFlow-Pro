package com.cloudflow.common.tenant;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * 多租户配置属性
 * 可在 application.yml 中通过 cloudflow.tenant.* 进行配置
 * 
 * 示例配置：
 * cloudflow:
 *   tenant:
 *     enabled: true
 *     column: tenant_id
 *     ignore-tables:
 *       - sys_tenant
 *       - sys_menu
 *       - sys_dict_type
 *       - sys_dict_data
 *       - sys_config
 * 
 * @author CloudFlow
 */
@Data
@Component
@ConfigurationProperties(prefix = "cloudflow.tenant")
public class TenantConfigProperties {

    /**
     * 是否启用多租户功能，默认 true
     * 设置为 false 时，TenantLineInnerInterceptor 不会注册，所有 SQL 不追加租户条件
     * 适用于单租户部署或测试环境
     */
    private boolean enabled = true;

    /**
     * 租户字段名，默认 tenant_id
     */
    private String column = "tenant_id";

    /**
     * 需要忽略租户过滤的表名列表（这些表不会自动追加 tenant_id 条件）
     * 默认包含：sys_tenant, sys_menu, sys_dict_type, sys_dict_data, sys_config
     */
    private List<String> ignoreTables = new ArrayList<>(List.of(
            "sys_tenant",
             "sys_menu",
             "sys_dict_type",
             "sys_dict_data",
             "sys_config",
             "sys_audit_archive_policy"
     ));

    /**
     * 默认租户ID（当上下文中没有租户ID时使用）
     * 与数据库初始化数据保持一致，默认 100000
     */
    private Long defaultTenantId = 100000L;
}

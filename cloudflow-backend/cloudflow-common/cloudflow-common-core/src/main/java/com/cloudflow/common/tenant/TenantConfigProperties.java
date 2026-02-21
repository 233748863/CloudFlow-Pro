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
            "sys_config"
    ));

    /**
     * 默认租户ID（当上下文中没有租户ID时使用）
     * 与数据库初始化数据保持一致，默认 100000
     */
    private Long defaultTenantId = 100000L;
}

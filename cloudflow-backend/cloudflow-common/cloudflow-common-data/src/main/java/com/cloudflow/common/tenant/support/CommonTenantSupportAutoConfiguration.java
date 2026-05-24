package com.cloudflow.common.tenant.support;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * 公共多租户支撑自动配置。
 * <p>
 * 注册 {@link SysTenantLiteMapper} 让显式声明 {@code @MapperScan} 的服务
 * （如 cloudflow-service-workflow）也能拿到平台级 sys_tenant 查询能力。
 * </p>
 *
 * @author CloudFlow
 */
@Configuration
@MapperScan("com.cloudflow.common.tenant.support")
public class CommonTenantSupportAutoConfiguration {
}

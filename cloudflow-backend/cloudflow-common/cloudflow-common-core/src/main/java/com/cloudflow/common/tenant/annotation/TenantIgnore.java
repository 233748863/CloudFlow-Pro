package com.cloudflow.common.tenant.annotation;

import java.lang.annotation.*;

/**
 * 租户忽略注解
 * 标注在 Mapper 方法或 Service 方法上，执行时自动跳过租户过滤
 * 
 * 参考 RuoYi-Cloud-Plus 的 @InterceptorIgnore，但更聚焦于租户场景
 * 
 * 使用示例：
 * <pre>
 * // 在 Mapper 方法上使用（跳过该 SQL 的租户过滤）
 * &#64;TenantIgnore
 * List&lt;SysTenant&gt; selectAllTenants();
 * 
 * // 在 Service 方法上使用（跳过该方法内所有 SQL 的租户过滤）
 * &#64;TenantIgnore
 * public List&lt;SysConfig&gt; loadAllGlobalConfigs() { ... }
 * </pre>
 * 
 * 注意：
 * - Mapper 级别通过 MyBatis-Plus 的 InterceptorIgnore 机制实现
 * - Service 级别通过 AOP 切面 + TenantContext.setTenantSkip() 实现
 * - 请谨慎使用，跳过租户过滤可能导致数据泄露
 * 
 * @author CloudFlow
 * @see com.cloudflow.common.tenant.TenantContext#setTenantSkip()
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface TenantIgnore {
}

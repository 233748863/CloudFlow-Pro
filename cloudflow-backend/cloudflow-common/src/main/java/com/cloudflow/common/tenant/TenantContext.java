package com.cloudflow.common.tenant;

/**
 * 租户上下文 - 使用ThreadLocal存储当前租户ID
 * 
 * @author CloudFlow
 */
public class TenantContext {
    
    private static final ThreadLocal<Long> TENANT_ID = new ThreadLocal<>();
    
    /**
     * 设置当前租户ID
     * 
     * @param tenantId 租户ID
     */
    public static void setTenantId(Long tenantId) {
        TENANT_ID.set(tenantId);
    }
    
    /**
     * 获取当前租户ID
     * 
     * @return 租户ID
     */
    public static Long getTenantId() {
        return TENANT_ID.get();
    }
    
    /**
     * 清除当前租户ID
     */
    public static void clear() {
        TENANT_ID.remove();
    }
}

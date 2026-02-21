package com.cloudflow.common.tenant;

import com.alibaba.ttl.TransmittableThreadLocal;

/**
 * 租户上下文 - 使用 TransmittableThreadLocal 存储当前租户ID
 * 支持线程池自动传递（配合 TTL Agent 或 TtlExecutors 包装）
 * 
 * @author CloudFlow
 */
public class TenantContext {

    /**
     * 当前租户ID（支持线程池自动传递）
     */
    private static final ThreadLocal<Long> TENANT_ID = new TransmittableThreadLocal<>();

    /**
     * 是否跳过租户过滤的标识（用于跨租户查询场景）
     */
    private static final ThreadLocal<Boolean> TENANT_SKIP_FLAG = new TransmittableThreadLocal<>();

    /**
     * 设置当前租户ID
     * 注意：尽量使用 {@link TenantBroker} 进行安全切换，避免嵌套调用导致上下文混乱
     * 
     * @param tenantId 租户ID
     * @see TenantBroker
     */
    public static void setTenantId(Long tenantId) {
        TENANT_ID.set(tenantId);
    }

    /**
     * 获取当前租户ID
     * 
     * @return 租户ID，未设置时返回 null
     */
    public static Long getTenantId() {
        return TENANT_ID.get();
    }

    /**
     * 设置跳过租户过滤标识
     * 设置后，当前线程的所有 SQL 查询将不追加 tenant_id 条件
     */
    public static void setTenantSkip() {
        TENANT_SKIP_FLAG.set(Boolean.TRUE);
    }

    /**
     * 获取是否跳过租户过滤
     * 
     * @return true 表示跳过租户过滤
     */
    public static Boolean getTenantSkip() {
        return TENANT_SKIP_FLAG.get() != null && TENANT_SKIP_FLAG.get();
    }

    /**
     * 仅清除跳过租户过滤标识，不影响租户ID
     * 用于 @TenantIgnore 切面恢复上下文
     */
    public static void clearTenantSkip() {
        TENANT_SKIP_FLAG.remove();
    }

    /**
     * 清除当前租户上下文（包括租户ID和跳过标识）
     * 必须在请求结束时调用，避免内存泄漏
     */
    public static void clear() {
        TENANT_ID.remove();
        TENANT_SKIP_FLAG.remove();
    }
}

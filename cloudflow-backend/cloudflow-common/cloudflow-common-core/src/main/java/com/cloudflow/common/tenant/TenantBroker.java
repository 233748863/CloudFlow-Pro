package com.cloudflow.common.tenant;

import lombok.experimental.UtilityClass;
import lombok.extern.slf4j.Slf4j;

import java.util.function.Consumer;
import java.util.function.Function;

/**
 * 租户安全切换工具
 * 参考 Poco 的 TenantBroker，支持在指定租户上下文中执行操作，执行完毕后自动恢复原租户
 * 
 * 使用示例：
 * // 无返回值
 * TenantBroker.runAs(targetTenantId, tenantId -> {
 *     // 在目标租户上下文中执行操作
 *     userService.list();
 * });
 * 
 * // 有返回值
 * List<User> users = TenantBroker.applyAs(targetTenantId, tenantId -> {
 *     return userService.list();
 * });
 * 
 * // 临时跳过租户过滤
 * TenantBroker.runWithoutTenant(() -> {
 *     // 查询所有租户的数据
 *     tenantService.list();
 * });
 * 
 * @author CloudFlow
 */
@Slf4j
@UtilityClass
public class TenantBroker {

    /**
     * 在指定租户上下文中执行操作（无返回值）
     * 执行完毕后自动恢复原租户ID
     * 
     * @param tenantId 目标租户ID
     * @param consumer 要执行的操作，参数为目标租户ID
     */
    public void runAs(Long tenantId, Consumer<Long> consumer) {
        Long originalTenantId = TenantContext.getTenantId();
        try {
            log.debug("租户切换: {} -> {}", originalTenantId, tenantId);
            TenantContext.setTenantId(tenantId);
            consumer.accept(tenantId);
        } finally {
            // 恢复原租户上下文
            if (originalTenantId != null) {
                TenantContext.setTenantId(originalTenantId);
            } else {
                TenantContext.clear();
            }
            log.debug("租户恢复: {}", originalTenantId);
        }
    }

    /**
     * 在指定租户上下文中执行操作（有返回值）
     * 执行完毕后自动恢复原租户ID
     * 
     * @param tenantId 目标租户ID
     * @param function 要执行的操作，参数为目标租户ID，返回操作结果
     * @param <T> 返回值类型
     * @return 操作结果
     */
    public <T> T applyAs(Long tenantId, Function<Long, T> function) {
        Long originalTenantId = TenantContext.getTenantId();
        try {
            log.debug("租户切换: {} -> {}", originalTenantId, tenantId);
            TenantContext.setTenantId(tenantId);
            return function.apply(tenantId);
        } finally {
            // 恢复原租户上下文
            if (originalTenantId != null) {
                TenantContext.setTenantId(originalTenantId);
            } else {
                TenantContext.clear();
            }
            log.debug("租户恢复: {}", originalTenantId);
        }
    }

    /**
     * 临时跳过租户过滤执行操作（无返回值）
     * 执行完毕后仅清除"跳过标识"，保留外层调用方设置的 tenantId，
     * 避免嵌套场景下把外层真实 tenantId 一并擦除（修复历史旁路 bug）。
     * 适用于需要查询所有租户数据的场景（如租户管理、数据迁移等）
     *
     * @param runnable 要执行的操作
     */
    public void runWithoutTenant(Runnable runnable) {
        try {
            TenantContext.setTenantSkip();
            log.debug("临时跳过租户过滤");
            runnable.run();
        } finally {
            TenantContext.clearTenantSkip();
            log.debug("恢复租户过滤");
        }
    }

    /**
     * 临时跳过租户过滤执行操作（有返回值）
     * 执行完毕后仅清除"跳过标识"，保留外层调用方设置的 tenantId。
     *
     * @param function 要执行的操作
     * @param <T> 返回值类型
     * @return 操作结果
     */
    public <T> T applyWithoutTenant(Function<Void, T> function) {
        try {
            TenantContext.setTenantSkip();
            log.debug("临时跳过租户过滤");
            return function.apply(null);
        } finally {
            TenantContext.clearTenantSkip();
            log.debug("恢复租户过滤");
        }
    }
}

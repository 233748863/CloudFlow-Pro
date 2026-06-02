package com.cloudflow.common.redis.core;

import com.cloudflow.common.redis.support.RuntimeContextBridge;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/**
 * 系统参数配置读取工具
 * <p>
 * 支持两种配置作用域：
 * <ul>
 *   <li>全局配置（GLOBAL）：所有租户共享，如安全策略、引擎参数、日志配置等</li>
 *   <li>租户配置（TENANT）：每个租户独立，如考勤时间、密码策略、业务参数等</li>
 * </ul>
 * <p>
 * Redis Key 格式：
 * <ul>
 *   <li>全局配置：sys:config:global:{configKey}（在 GLOBAL_PREFIXES 中，不加租户前缀）</li>
 *   <li>租户配置：sys:config:tenant:{configKey}（不在 GLOBAL_PREFIXES 中，由 RedisCache 自动加租户前缀）</li>
 * </ul>
 * <p>
 * 租户配置的读取策略：先查当前租户的配置，未命中则回退到全局默认值。
 * <p>
 * 使用示例：
 * <pre>
 *   // 读取全局配置（如验证码容错值，所有租户统一）
 *   int tolerance = configHelper.getGlobalInt("sys.captcha.tolerance", 8);
 *
 *   // 读取租户配置（如上班时间，每个租户可不同）
 *   String startTime = configHelper.getTenantValue("sys.attendance.workStartTime", "09:00");
 *
 *   // 智能读取：先查租户配置，未命中查全局配置，最后用默认值
 *   String value = configHelper.getConfigValue("sys.user.initPassword", "123456");
 * </pre>
 *
 * @author CloudFlow
 */
@Component
public class SysConfigHelper {

    private static final Logger log = LoggerFactory.getLogger(SysConfigHelper.class);

    /** 全局配置 Redis Key 前缀（在 RedisCache 的 GLOBAL_PREFIXES 中，不受租户隔离） */
    private static final String GLOBAL_PREFIX = "sys:config:global:";

    /** 租户配置 Redis Key 前缀（不在 GLOBAL_PREFIXES 中，由 RedisCache 自动加租户前缀） */
    private static final String TENANT_PREFIX = "sys:config:tenant:";

    @Autowired
    private RedisCache redisCache;

    // ==================== 智能读取（推荐使用） ====================

    /**
     * 智能获取配置值：先查租户配置，未命中查全局配置，最后用默认值
     *
     * @param configKey    参数键名
     * @param defaultValue 默认值
     * @return 配置值
     */
    public String getConfigValue(String configKey, String defaultValue) {
        // 1. 先尝试读取租户级配置
        String tenantValue = getTenantValue(configKey);
        if (tenantValue != null) {
            return tenantValue;
        }
        // 2. 回退到全局配置
        String globalValue = getGlobalValue(configKey);
        if (globalValue != null) {
            return globalValue;
        }
        // 3. 使用默认值
        return defaultValue;
    }

    /**
     * 智能获取配置值（无默认值）
     */
    public String getConfigValue(String configKey) {
        return getConfigValue(configKey, null);
    }

    /**
     * 智能获取整数配置
     */
    public int getConfigInt(String configKey, int defaultValue) {
        String value = getConfigValue(configKey);
        if (value != null) {
            try {
                return Integer.parseInt(value.trim());
            } catch (NumberFormatException e) {
                log.warn("配置项 {} 的值 '{}' 不是有效整数，使用默认值 {}", configKey, value, defaultValue);
            }
        }
        return defaultValue;
    }

    /**
     * 智能获取长整数配置
     */
    public long getConfigLong(String configKey, long defaultValue) {
        String value = getConfigValue(configKey);
        if (value != null) {
            try {
                return Long.parseLong(value.trim());
            } catch (NumberFormatException e) {
                log.warn("配置项 {} 的值 '{}' 不是有效长整数，使用默认值 {}", configKey, value, defaultValue);
            }
        }
        return defaultValue;
    }

    /**
     * 智能获取布尔配置
     */
    public boolean getConfigBoolean(String configKey, boolean defaultValue) {
        String value = getConfigValue(configKey);
        if (value != null) {
            return "true".equalsIgnoreCase(value.trim());
        }
        return defaultValue;
    }

    // ==================== 全局配置操作 ====================

    /**
     * 读取全局配置值
     *
     * @param configKey    参数键名
     * @param defaultValue 默认值
     * @return 配置值
     */
    public String getGlobalValue(String configKey, String defaultValue) {
        String value = getGlobalValue(configKey);
        return value != null ? value : defaultValue;
    }

    /**
     * 读取全局配置值（无默认值）
     */
    public String getGlobalValue(String configKey) {
        try {
            Object value = redisCache.getCacheObject(GLOBAL_PREFIX + configKey);
            if (value != null) {
                return value.toString();
            }
        } catch (Exception e) {
            log.warn("读取全局配置 {} 失败，降级使用默认值", configKey, e);
        }
        return null;
    }

    /**
     * 读取全局整数配置
     */
    public int getGlobalInt(String configKey, int defaultValue) {
        String value = getGlobalValue(configKey);
        if (value != null) {
            try {
                return Integer.parseInt(value.trim());
            } catch (NumberFormatException e) {
                log.warn("全局配置项 {} 的值 '{}' 不是有效整数", configKey, value);
            }
        }
        return defaultValue;
    }

    /**
     * 读取全局布尔配置
     */
    public boolean getGlobalBoolean(String configKey, boolean defaultValue) {
        String value = getGlobalValue(configKey);
        if (value != null) {
            return "true".equalsIgnoreCase(value.trim());
        }
        return defaultValue;
    }

    /**
     * 设置全局配置缓存
     */
    public void setGlobalCache(String configKey, String configValue) {
        redisCache.setCacheObject(GLOBAL_PREFIX + configKey, configValue);
    }

    /**
     * 删除全局配置缓存
     */
    public void removeGlobalCache(String configKey) {
        redisCache.deleteObject(GLOBAL_PREFIX + configKey);
    }

    // ==================== 租户配置操作 ====================

    /**
     * 读取当前租户的配置值
     *
     * @param configKey    参数键名
     * @param defaultValue 默认值
     * @return 配置值
     */
    public String getTenantValue(String configKey, String defaultValue) {
        String value = getTenantValue(configKey);
        return value != null ? value : defaultValue;
    }

    /**
     * 读取当前租户的配置值（无默认值）
     * <p>
     * 注意：TENANT_PREFIX 不在 GLOBAL_PREFIXES 中，
     * RedisCache.getTenantKey() 会自动加上 {tenantId}: 前缀
     */
    public String getTenantValue(String configKey) {
        // 如果没有租户上下文，直接返回 null（由调用方回退到全局配置）
        Long tenantId = RuntimeContextBridge.getTenantId();
        if (tenantId == null) {
            return null;
        }
        try {
            Object value = redisCache.getCacheObject(TENANT_PREFIX + configKey);
            if (value != null) {
                return value.toString();
            }
        } catch (Exception e) {
            log.warn("读取租户 {} 配置 {} 失败", tenantId, configKey, e);
        }
        return null;
    }

    /**
     * 读取当前租户的整数配置
     */
    public int getTenantInt(String configKey, int defaultValue) {
        String value = getTenantValue(configKey);
        if (value != null) {
            try {
                return Integer.parseInt(value.trim());
            } catch (NumberFormatException e) {
                log.warn("租户配置项 {} 的值 '{}' 不是有效整数", configKey, value);
            }
        }
        return defaultValue;
    }

    /**
     * 读取当前租户的布尔配置
     */
    public boolean getTenantBoolean(String configKey, boolean defaultValue) {
        String value = getTenantValue(configKey);
        if (value != null) {
            return "true".equalsIgnoreCase(value.trim());
        }
        return defaultValue;
    }

    /**
     * 设置当前租户的配置缓存
     */
    public void setTenantCache(String configKey, String configValue) {
        redisCache.setCacheObject(TENANT_PREFIX + configKey, configValue);
    }

    /**
     * 设置指定租户的配置缓存（用于启动预热，此时可能没有租户上下文）
     *
     * @param tenantId    租户ID
     * @param configKey   参数键名
     * @param configValue 参数值
     */
    public void setTenantCache(Long tenantId, String configKey, String configValue) {
        // 直接拼接完整 Key，绕过 RedisCache 的租户前缀逻辑
        String fullKey = tenantId + ":" + TENANT_PREFIX + configKey;
        redisCache.redisTemplate.opsForValue().set(fullKey, configValue);
    }

    /**
     * 删除当前租户的配置缓存
     */
    public void removeTenantCache(String configKey) {
        redisCache.deleteObject(TENANT_PREFIX + configKey);
    }

    /**
     * 删除指定租户的配置缓存
     */
    public void removeTenantCache(Long tenantId, String configKey) {
        String fullKey = tenantId + ":" + TENANT_PREFIX + configKey;
        redisCache.redisTemplate.delete(fullKey);
    }

    // ==================== 兼容旧接口（逐步废弃） ====================

    /**
     * 设置配置缓存（根据 scope 自动选择前缀）
     *
     * @param configKey   参数键名
     * @param configValue 参数值
     * @param scope       作用域：0=全局，1=租户
     */
    public void setConfigCache(String configKey, String configValue, String scope) {
        if ("0".equals(scope)) {
            setGlobalCache(configKey, configValue);
        } else {
            setTenantCache(configKey, configValue);
        }
    }

    /**
     * 删除配置缓存（根据 scope 自动选择前缀）
     */
    public void removeConfigCache(String configKey, String scope) {
        if ("0".equals(scope)) {
            removeGlobalCache(configKey);
        } else {
            removeTenantCache(configKey);
        }
    }
}

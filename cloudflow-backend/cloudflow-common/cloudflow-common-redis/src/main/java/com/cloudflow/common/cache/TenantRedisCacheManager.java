package com.cloudflow.common.cache;

import cn.hutool.core.util.StrUtil;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.tenant.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.convert.DurationStyle;
import org.springframework.cache.Cache;
import org.springframework.data.redis.cache.RedisCache;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.lang.Nullable;

import java.time.Duration;
import java.time.temporal.ChronoUnit;
import java.util.Map;

/**
 * 租户感知的 Redis 缓存管理器
 * 参考 Poco 的 RedisAutoCacheManager，提供两个核心能力：
 * 
 * 1. 自动租户隔离：缓存 key 自动追加 tenantId:: 前缀
 *    - user_details → 1::user_details（租户1的用户缓存）
 *    - GLOBALLY::tenant_details → GLOBALLY::tenant_details（全局缓存，不加前缀）
 * 
 * 2. 动态 TTL：通过 cacheName#ttl 语法设置过期时间
 *    - @Cacheable("user_details#3600s") → TTL 3600秒
 *    - @Cacheable("menu_details#30m") → TTL 30分钟
 *    - @Cacheable("role_details#12h") → TTL 12小时
 * 
 * @author CloudFlow
 */
@Slf4j
public class TenantRedisCacheManager extends RedisCacheManager {

    /**
     * TTL 分隔符：cacheName#ttl
     */
    private static final String SPLIT_FLAG = "#";

    /**
     * 分割后至少需要2段
     */
    private static final int CACHE_LENGTH = 2;

    public TenantRedisCacheManager(RedisCacheWriter cacheWriter,
                                   RedisCacheConfiguration defaultCacheConfiguration,
                                   boolean allowInFlightCacheCreation,
                                   Map<String, RedisCacheConfiguration> initialCacheConfigurations) {
        super(cacheWriter, defaultCacheConfiguration, allowInFlightCacheCreation, initialCacheConfigurations);
    }

    /**
     * 创建 RedisCache 时解析动态 TTL
     * 支持 cacheName#ttl 语法，例如：user_details#3600s、menu_details#12h
     */
    @Override
    protected RedisCache createRedisCache(String name, @Nullable RedisCacheConfiguration cacheConfig) {
        if (StrUtil.isBlank(name) || !name.contains(SPLIT_FLAG)) {
            return super.createRedisCache(name, cacheConfig);
        }

        String[] cacheArray = name.split(SPLIT_FLAG);
        if (cacheArray.length < CACHE_LENGTH) {
            return super.createRedisCache(name, cacheConfig);
        }

        // 解析 TTL 并应用到缓存配置
        if (cacheConfig != null) {
            try {
                Duration duration = DurationStyle.detectAndParse(cacheArray[1], ChronoUnit.SECONDS);
                cacheConfig = cacheConfig.entryTtl(duration);
                log.debug("缓存 {} 设置动态 TTL: {}", cacheArray[0], duration);
            } catch (Exception e) {
                log.warn("解析缓存 TTL 失败: {}，使用默认 TTL", name, e);
            }
        }
        // 使用不含 TTL 部分的名称创建缓存
        return super.createRedisCache(cacheArray[0], cacheConfig);
    }

    /**
     * 获取缓存时自动追加租户ID前缀
     * - 全局缓存（以 GLOBALLY 开头）不追加前缀
     * - 其他缓存自动追加 tenantId:: 前缀实现租户隔离
     */
    @Override
    public Cache getCache(String name) {
        // 全局缓存不加租户前缀
        if (name.startsWith(CacheConstants.GLOBALLY)) {
            return super.getCache(name);
        }

        // 获取当前租户ID
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null) {
            // 未设置租户ID时，不加前缀（兼容未登录场景）
            return super.getCache(name);
        }

        // 自动追加租户前缀：tenantId::cacheName
        String tenantCacheName = tenantId + StrUtil.COLON + name;
        return super.getCache(tenantCacheName);
    }
}

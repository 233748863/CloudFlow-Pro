package com.cloudflow.auth.config;

import com.cloudflow.common.cache.TenantRedisCacheManager;
import com.cloudflow.common.core.constant.CacheConstants;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Spring Cache + Redis 配置
 * 使用 TenantRedisCacheManager 实现：
 * - 自动租户隔离：缓存 key 自动追加 tenantId:: 前缀
 * - 动态 TTL：支持 cacheName#ttl 语法（如 user_details#12h）
 * - 全局缓存：以 GLOBALLY 开头的缓存不加租户前缀
 * 
 * @author CloudFlow
 */
@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // JSON 序列化器（带类型信息，支持反序列化回原始类型）
        ObjectMapper om = new ObjectMapper();
        om.registerModule(new JavaTimeModule());
        om.setVisibility(PropertyAccessor.ALL, JsonAutoDetect.Visibility.ANY);
        om.activateDefaultTyping(LaissezFaireSubTypeValidator.instance,
                ObjectMapper.DefaultTyping.NON_FINAL, JsonTypeInfo.As.PROPERTY);
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer(om);

        // 默认缓存配置：TTL 2小时
        RedisCacheConfiguration defaultConfig = RedisCacheConfiguration.defaultCacheConfig()
                .entryTtl(Duration.ofHours(2))
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer))
                .disableCachingNullValues();

        // 各缓存空间的个性化 TTL（也可以通过 cacheName#ttl 动态设置）
        Map<String, RedisCacheConfiguration> cacheConfigurations = new HashMap<>();
        // 用户信息缓存 12小时
        cacheConfigurations.put(CacheConstants.USER_DETAILS,
                defaultConfig.entryTtl(Duration.ofHours(12)));
        // 菜单缓存 12小时
        cacheConfigurations.put(CacheConstants.MENU_DETAILS,
                defaultConfig.entryTtl(Duration.ofHours(12)));
        // 用户菜单树缓存 12小时
        cacheConfigurations.put(CacheConstants.USER_MENUS,
                defaultConfig.entryTtl(Duration.ofHours(12)));
        // 角色缓存 12小时
        cacheConfigurations.put(CacheConstants.ROLE_DETAILS,
                defaultConfig.entryTtl(Duration.ofHours(12)));

        // 使用 TenantRedisCacheManager 替代标准 RedisCacheManager
        // 自动实现：租户隔离 + 动态 TTL
        return new TenantRedisCacheManager(
                RedisCacheWriter.nonLockingRedisCacheWriter(connectionFactory),
                defaultConfig,
                true,
                cacheConfigurations
        );
    }
}

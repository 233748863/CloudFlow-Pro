package com.cloudflow.auth.config;

import com.cloudflow.common.core.constant.CacheConstants;
import com.fasterxml.jackson.annotation.JsonAutoDetect;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.annotation.PropertyAccessor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializationContext;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.HashMap;
import java.util.Map;

/**
 * Spring Cache + Redis 配置
 * 参考 API-release (Poco) 的缓存架构：
 * - user_details: 按 username 缓存用户信息（含角色+权限），TTL 12小时
 * - menu_details: 按 roleId 缓存菜单列表，TTL 12小时
 * - user_menus:   按 userId 缓存菜单树，TTL 12小时
 */
@Configuration
@EnableCaching
public class RedisCacheConfig {

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // JSON 序列化器（带类型信息，支持反序列化回原始类型）
        ObjectMapper om = new ObjectMapper();
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

        // 各缓存空间的个性化 TTL
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

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withInitialCacheConfigurations(cacheConfigurations)
                .build();
    }
}

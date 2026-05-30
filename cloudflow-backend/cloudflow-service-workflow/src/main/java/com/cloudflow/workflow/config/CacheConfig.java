package com.cloudflow.workflow.config;

import com.cloudflow.common.redis.core.SysConfigHelper;
import com.fasterxml.jackson.annotation.JsonTypeInfo;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.jsontype.impl.LaissezFaireSubTypeValidator;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.beans.factory.annotation.Autowired;
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

/**
 * 缓存配置
 *
 * <p>P1-7: 实现缓存机制
 * 缓存流程定义和表单定义，减少数据库查询。
 *
 * <p><b>GOV-CONFIG-CLEANUP (A5)：</b>
 * {@link com.cloudflow.workflow.service.impl.WorkflowCacheServiceImpl} 实际使用的 cacheName 为
 * {@link #WF_DEFINITION_CACHE} / {@link #WF_FORM_CACHE} / {@link #WF_USER_CACHE}，
 * 之前注册的 processDefinition / formDefinition / versionComparison 与之不一致，
 * 导致 @Cacheable 注解的 TTL 配置完全失效，全部走默认 30 分钟。
 * 本次为这 3 个真实使用的 cacheName 注入 sys_config 中的 TTL 配置。
 * 运行时改 sys.workflow.cache.*.ttl 需重启服务才能生效（Spring Cache 注解的固有限制）。
 *
 * @author CloudFlow
 */
@Configuration
@EnableCaching
public class CacheConfig {

    /**
     * 旧的缓存名称常量（保留供其他调用方使用）。
     */
    public static final String PROCESS_DEFINITION_CACHE = "processDefinition";
    public static final String FORM_DEFINITION_CACHE = "formDefinition";
    public static final String VERSION_COMPARISON_CACHE = "versionComparison";

    /**
     * WorkflowCacheServiceImpl 实际使用的 cacheName，需与该类内部常量保持一致。
     */
    public static final String WF_DEFINITION_CACHE = "workflow:definition";
    public static final String WF_FORM_CACHE = "workflow:form";
    public static final String WF_USER_CACHE = "workflow:user";

    /** 兜底默认 TTL（秒），实际从 sys_config 读取 */
    private static final long DEFAULT_DEFINITION_TTL_SECONDS = 3600;
    private static final long DEFAULT_FORM_TTL_SECONDS = 3600;
    private static final long DEFAULT_USER_TTL_SECONDS = 1800;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    @Bean
    public CacheManager cacheManager(RedisConnectionFactory connectionFactory) {
        // 配置 ObjectMapper 支持 Java 8 日期时间类型
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.activateDefaultTyping(
            LaissezFaireSubTypeValidator.instance,
            ObjectMapper.DefaultTyping.NON_FINAL,
            JsonTypeInfo.As.PROPERTY
        );
        GenericJackson2JsonRedisSerializer jsonSerializer = new GenericJackson2JsonRedisSerializer(objectMapper);

        // 默认缓存配置：30分钟过期
        RedisCacheConfiguration defaultConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofMinutes(30));

        // 旧三档（保留兼容，1 小时）
        RedisCacheConfiguration processDefConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofHours(1));
        RedisCacheConfiguration formDefConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofHours(1));
        RedisCacheConfiguration versionComparisonConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofHours(1));

        // GOV-CONFIG-CLEANUP (A5)：从 sys_config 读取 TTL，注入 WorkflowCacheServiceImpl 实际使用的 cacheName
        long defTtl = sysConfigHelper.getConfigLong("sys.workflow.cache.definition.ttl", DEFAULT_DEFINITION_TTL_SECONDS);
        long formTtl = sysConfigHelper.getConfigLong("sys.workflow.cache.form.ttl", DEFAULT_FORM_TTL_SECONDS);
        long userTtl = sysConfigHelper.getConfigLong("sys.workflow.cache.user.ttl", DEFAULT_USER_TTL_SECONDS);
        RedisCacheConfiguration wfDefinitionConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofSeconds(defTtl));
        RedisCacheConfiguration wfFormConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofSeconds(formTtl));
        RedisCacheConfiguration wfUserConfig = baseConfig(jsonSerializer).entryTtl(Duration.ofSeconds(userTtl));

        return RedisCacheManager.builder(connectionFactory)
                .cacheDefaults(defaultConfig)
                .withCacheConfiguration(PROCESS_DEFINITION_CACHE, processDefConfig)
                .withCacheConfiguration(FORM_DEFINITION_CACHE, formDefConfig)
                .withCacheConfiguration(VERSION_COMPARISON_CACHE, versionComparisonConfig)
                .withCacheConfiguration(WF_DEFINITION_CACHE, wfDefinitionConfig)
                .withCacheConfiguration(WF_FORM_CACHE, wfFormConfig)
                .withCacheConfiguration(WF_USER_CACHE, wfUserConfig)
                .build();
    }

    private RedisCacheConfiguration baseConfig(GenericJackson2JsonRedisSerializer jsonSerializer) {
        return RedisCacheConfiguration.defaultCacheConfig()
                .serializeKeysWith(RedisSerializationContext.SerializationPair.fromSerializer(new StringRedisSerializer()))
                .serializeValuesWith(RedisSerializationContext.SerializationPair.fromSerializer(jsonSerializer))
                .disableCachingNullValues();
    }
}

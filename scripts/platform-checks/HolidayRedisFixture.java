package com.cloudflow.common.holiday.service;

import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.redis.core.RedisCache;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.RedisCallback;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

import java.time.Duration;
import java.util.List;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;

final class HolidayRedisFixture implements AutoCloseable {
    private final String namespace = "cloudflow:a4-check:" + UUID.randomUUID().toString().replace("-", "") + ":";
    private final LettuceConnectionFactory connections;
    private final RedisTemplate<String, Object> cleanup;

    HolidayRedisFixture() {
        String host = System.getenv("REDIS_HOST");
        String password = System.getenv("REDIS_PASSWORD");
        if (host == null || password == null || password.isBlank()) throw new IllegalStateException("Protected Redis environment is required");
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration(host, Integer.parseInt(System.getenv().getOrDefault("REDIS_PORT", "6379")));
        configuration.setPassword(password);
        configuration.setDatabase(Integer.parseInt(System.getenv().getOrDefault("HOLIDAY_CHECK_REDIS_DATABASE", "0")));
        connections = new LettuceConnectionFactory(configuration, LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofSeconds(2)).shutdownTimeout(Duration.ofMillis(100)).build());
        connections.afterPropertiesSet();
        connections.start();
        cleanup = template();
        if (!"PONG".equals(cleanup.execute((RedisCallback<String>) connection -> connection.ping()))) throw new IllegalStateException("Redis is not ready");
        Properties settings = cleanup.execute((RedisCallback<Properties>) connection -> connection.serverCommands().getConfig("maxmemory-policy"));
        System.out.println("HOLIDAY_REDIS: real=true; owned_namespace=" + namespace + "; maxmemory_policy=" + settings.getProperty("maxmemory-policy"));
    }

    FaultCache cache() {
        RedisTemplate<String, Object> base = template();
        FaultTemplate fault = new FaultTemplate();
        fault.setConnectionFactory(connections);
        fault.setKeySerializer(base.getKeySerializer());
        fault.setValueSerializer(base.getValueSerializer());
        fault.setHashKeySerializer(base.getHashKeySerializer());
        fault.setHashValueSerializer(base.getHashValueSerializer());
        fault.afterPropertiesSet();
        return new FaultCache(fault);
    }

    private RedisTemplate<String, Object> template() {
        RedisTemplate<String, Object> template = new RedisConfig().redisTemplate(connections);
        template.setKeySerializer(new RedisSerializer<String>() {
            @Override public byte[] serialize(String value) { return value == null ? null : StringRedisSerializer.UTF_8.serialize(namespace + value); }
            @Override public String deserialize(byte[] bytes) {
                String value = StringRedisSerializer.UTF_8.deserialize(bytes);
                if (value == null) return null;
                if (!value.startsWith(namespace)) throw new IllegalArgumentException("Redis key escaped the owned namespace");
                return value.substring(namespace.length());
            }
        });
        template.afterPropertiesSet();
        return template;
    }

    @Override
    public void close() {
        try {
            Set<String> keys = cleanup.keys("*");
            long removed = keys == null || keys.isEmpty() ? 0 : cleanup.delete(keys);
            Set<String> remaining = cleanup.keys("*");
            if (remaining != null && !remaining.isEmpty()) throw new AssertionError("Owned Redis keys remain after cleanup");
            System.out.println("HOLIDAY_REDIS_CLEANUP: deleted=" + removed + "; remaining=0; production_keys_modified=0");
        } finally {
            connections.destroy();
        }
    }

    static final class FaultCache extends RedisCache {
        final FaultTemplate fault;
        long lastGetNanos;

        private FaultCache(FaultTemplate fault) {
            this.fault = fault;
            redisTemplate = fault;
        }

        @Override
        public <Value> Value getCacheObject(String key) {
            long started = System.nanoTime();
            try { return super.getCacheObject(key); }
            finally { lastGetNanos = System.nanoTime() - started; }
        }
    }

    static final class FaultTemplate extends RedisTemplate<String, Object> {
        volatile boolean failBegin;
        volatile boolean failEnd;
        volatile boolean failRead;
        volatile boolean loseBeginReply;
        volatile long lastReadNanos;

        @Override
        public <Type> Type execute(RedisScript<Type> script, RedisSerializer<?> argumentSerializer,
                                   RedisSerializer<Type> resultSerializer, List<String> keys, Object... arguments) {
            String operation = String.valueOf(arguments[0]);
            if ("BEGIN".equals(operation) && failBegin || "END".equals(operation) && failEnd || "READ".equals(operation) && failRead) {
                throw new IllegalStateException("Injected Redis connection failure at " + operation);
            }
            long started = System.nanoTime();
            Type result = super.execute(script, argumentSerializer, resultSerializer, keys, arguments);
            if ("READ".equals(operation)) lastReadNanos = System.nanoTime() - started;
            if ("BEGIN".equals(operation) && loseBeginReply) throw new IllegalStateException("Injected lost Redis reply");
            return result;
        }
    }
}

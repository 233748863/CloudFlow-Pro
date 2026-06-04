package com.cloudflow.common.event.core;

import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

/**
 * 业务事件消费幂等存储。
 */
public class BusinessEventIdempotentStore {

    private static final String KEY_PREFIX = "cloudflow:event:idem:";

    private final StringRedisTemplate stringRedisTemplate;

    public BusinessEventIdempotentStore(StringRedisTemplate stringRedisTemplate) {
        this.stringRedisTemplate = stringRedisTemplate;
    }

    public boolean acquire(String eventId, Duration ttl) {
        return acquire("global", eventId, ttl);
    }

    public boolean acquire(String scope, String eventId, Duration ttl) {
        String namespacedScope = (scope == null || scope.isBlank()) ? "global" : scope.trim();
        Boolean result = stringRedisTemplate.opsForValue()
                .setIfAbsent(KEY_PREFIX + namespacedScope + ":" + eventId, "1", ttl);
        return Boolean.TRUE.equals(result);
    }
}

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
        Boolean result = stringRedisTemplate.opsForValue().setIfAbsent(KEY_PREFIX + eventId, "1", ttl);
        return Boolean.TRUE.equals(result);
    }
}

package com.cloudflow.common.workflow.callback.service;

import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;

import java.time.Duration;

@RequiredArgsConstructor
public class CallbackIdempotentStore {

    private static final String KEY_PREFIX = "wf:callback:idem:";

    private final StringRedisTemplate stringRedisTemplate;

    public boolean acquire(String processInstanceId, Duration ttl) {
        Boolean result = stringRedisTemplate.opsForValue()
                .setIfAbsent(KEY_PREFIX + processInstanceId, "1", ttl);
        return Boolean.TRUE.equals(result);
    }

    public void release(String processInstanceId) {
        stringRedisTemplate.delete(KEY_PREFIX + processInstanceId);
    }
}

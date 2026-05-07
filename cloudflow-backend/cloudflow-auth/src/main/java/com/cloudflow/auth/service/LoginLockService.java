package com.cloudflow.auth.service;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class LoginLockService {

    private static final String LOCK_KEY = "LOGIN:LOCK:";
    private static final String FAIL_COUNT_KEY = "LOGIN:FAIL:";
    private static final int MAX_ATTEMPTS = 5;
    private static final int LOCK_MINUTES = 15;

    @Autowired
    private StringRedisTemplate redisTemplate;

    private String buildKey(String prefix, String username, Long tenantId) {
        return prefix + tenantId + ":" + username;
    }

    public boolean isLocked(String username, Long tenantId) {
        String key = buildKey(LOCK_KEY, username, tenantId);
        return Boolean.TRUE.equals(redisTemplate.hasKey(key));
    }

    public void recordFailure(String username, Long tenantId) {
        String countKey = buildKey(FAIL_COUNT_KEY, username, tenantId);
        Long count = redisTemplate.opsForValue().increment(countKey);
        redisTemplate.expire(countKey, LOCK_MINUTES, TimeUnit.MINUTES);

        if (count != null && count >= MAX_ATTEMPTS) {
            String lockKey = buildKey(LOCK_KEY, username, tenantId);
            redisTemplate.opsForValue().set(lockKey, String.valueOf(count), LOCK_MINUTES, TimeUnit.MINUTES);
            redisTemplate.delete(countKey);
        }
    }

    public void clearFailures(String username, Long tenantId) {
        redisTemplate.delete(buildKey(FAIL_COUNT_KEY, username, tenantId));
    }

    public int getRemainingAttempts(String username, Long tenantId) {
        String countKey = buildKey(FAIL_COUNT_KEY, username, tenantId);
        String countStr = redisTemplate.opsForValue().get(countKey);
        int count = countStr == null ? 0 : Integer.parseInt(countStr);
        return Math.max(0, MAX_ATTEMPTS - count);
    }
}

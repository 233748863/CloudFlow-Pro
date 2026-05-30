package com.cloudflow.auth.service;

import com.cloudflow.common.redis.core.SysConfigHelper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;

import java.util.concurrent.TimeUnit;

@Service
public class LoginLockService {

    private static final String LOCK_KEY = "LOGIN:LOCK:";
    private static final String FAIL_COUNT_KEY = "LOGIN:FAIL:";

    /** 兜底默认值：登录失败最大次数 */
    private static final int DEFAULT_MAX_ATTEMPTS = 5;
    /** 兜底默认值：账号锁定分钟数 */
    private static final int DEFAULT_LOCK_MINUTES = 15;

    @Autowired
    private StringRedisTemplate redisTemplate;

    @Autowired
    private SysConfigHelper sysConfigHelper;

    private int maxAttempts() {
        return sysConfigHelper.getConfigInt("sys.user.login.maxRetry", DEFAULT_MAX_ATTEMPTS);
    }

    private int lockMinutes() {
        return sysConfigHelper.getConfigInt("sys.user.login.lockTime", DEFAULT_LOCK_MINUTES);
    }

    private String buildKey(String prefix, String username, Long tenantId) {
        return prefix + tenantId + ":" + username;
    }

    public boolean isLocked(String username, Long tenantId) {
        String key = buildKey(LOCK_KEY, username, tenantId);
        return Boolean.TRUE.equals(redisTemplate.hasKey(key));
    }

    public void recordFailure(String username, Long tenantId) {
        String countKey = buildKey(FAIL_COUNT_KEY, username, tenantId);
        int lockMinutes = lockMinutes();
        Long count = redisTemplate.opsForValue().increment(countKey);
        redisTemplate.expire(countKey, lockMinutes, TimeUnit.MINUTES);

        if (count != null && count >= maxAttempts()) {
            String lockKey = buildKey(LOCK_KEY, username, tenantId);
            redisTemplate.opsForValue().set(lockKey, String.valueOf(count), lockMinutes, TimeUnit.MINUTES);
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
        return Math.max(0, maxAttempts() - count);
    }
}

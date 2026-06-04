package com.cloudflow.common.redis.core;

import org.springframework.stereotype.Component;

import java.lang.reflect.Method;
import java.util.concurrent.TimeUnit;

@Component
public class UserDataScopeStore {

    private static final String KEY_PREFIX = "user:datascope:";
    private static final long TTL_MINUTES = 5L;

    private final RedisCache redisCache;

    public UserDataScopeStore(RedisCache redisCache) {
        this.redisCache = redisCache;
    }

    public void save(Object snapshot) {
        Long userId = readLong(snapshot, "getUserId");
        Long tenantId = readLong(snapshot, "getTenantId");
        if (snapshot == null || userId == null || tenantId == null) {
            return;
        }
        redisCache.setCacheObject(buildKey(tenantId, userId), snapshot, TTL_MINUTES, TimeUnit.MINUTES);
    }

    @SuppressWarnings("unchecked")
    public <T> T get(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            return null;
        }
        return (T) redisCache.getCacheObject(buildKey(tenantId, userId));
    }

    public void delete(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            return;
        }
        redisCache.deleteObject(buildKey(tenantId, userId));
    }

    private String buildKey(Long tenantId, Long userId) {
        return KEY_PREFIX + tenantId + ":" + userId;
    }

    private Long readLong(Object target, String methodName) {
        if (target == null) {
            return null;
        }
        try {
            Method method = target.getClass().getMethod(methodName);
            Object value = method.invoke(target);
            if (value instanceof Number number) {
                return number.longValue();
            }
            return value == null ? null : Long.valueOf(String.valueOf(value));
        } catch (Exception ex) {
            return null;
        }
    }
}

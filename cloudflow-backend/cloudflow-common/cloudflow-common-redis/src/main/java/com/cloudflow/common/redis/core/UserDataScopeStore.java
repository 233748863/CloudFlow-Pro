package com.cloudflow.common.redis.core;

import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import org.springframework.stereotype.Component;

import java.util.concurrent.TimeUnit;

@Component
public class UserDataScopeStore {

    private static final String KEY_PREFIX = "user:datascope:";
    private static final long TTL_MINUTES = 5L;

    private final RedisCache redisCache;

    public UserDataScopeStore(RedisCache redisCache) {
        this.redisCache = redisCache;
    }

    public void save(UserDataScopeSnapshot snapshot) {
        if (snapshot == null || snapshot.getUserId() == null || snapshot.getTenantId() == null) {
            return;
        }
        redisCache.setCacheObject(buildKey(snapshot.getTenantId(), snapshot.getUserId()), snapshot, TTL_MINUTES, TimeUnit.MINUTES);
    }

    public UserDataScopeSnapshot get(Long tenantId, Long userId) {
        if (tenantId == null || userId == null) {
            return null;
        }
        return redisCache.getCacheObject(buildKey(tenantId, userId));
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
}

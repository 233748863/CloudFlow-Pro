package com.cloudflow.auth.oauth2;

import com.cloudflow.common.security.oauth2.OAuthDigests;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class OAuthRateLimits {
    private static final RedisScript<Long> LIMIT = RedisScript.of("local count = redis.call('INCR', KEYS[1]); "
            + "if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return count", Long.class);
    private final StringRedisTemplate redis;

    public void ip(String group, String address) { check(group + ":ip:" + OAuthDigests.hash(address), 60); }

    public void client(String group, String clientKey, String address) {
        check(group + ":client:" + OAuthDigests.hash(clientKey + "\n" + address), "revoke".equals(group) ? 20 : 10);
    }

    public void authorize(Long tenantId, Long userId) { check("authorize:" + tenantId + ":" + userId, 10); }

    public void resource(String tokenHash) { check("resource:" + tokenHash, 60); }

    private void check(String key, int maximum) {
        Long count;
        try { count = redis.execute(LIMIT, List.of("cloudflow:oauth2:rate:" + key)); }
        catch (RuntimeException unavailable) { throw new OAuthFailure("temporarily_unavailable", "第三方授权限流服务暂不可用", 503); }
        if (count == null) throw new OAuthFailure("temporarily_unavailable", "第三方授权限流服务暂不可用", 503);
        if (count > maximum) throw new OAuthFailure("slow_down", "请求过于频繁，请一分钟后重试", 429);
    }
}


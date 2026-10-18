package com.cloudflow.common.security.portal;

import com.cloudflow.common.core.exception.ServiceException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalRateLimits {
    private static final RedisScript<Long> LIMIT = RedisScript.of("local count = redis.call('INCR', KEYS[1]); "
            + "if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end; return count", Long.class);
    private final StringRedisTemplate redis;

    public void publicIp(String group, String clientIp) {
        check("ip:" + group + ":" + digest(clientIp), "status".equals(group) ? 60 : 10);
    }

    public void account(String tenantCode, String account) {
        check("account:" + digest(tenantCode + "\n" + account), 5);
    }

    public void user(PortalIdentity identity) {
        check("user:" + identity.tenantId() + ":" + identity.portalUserId(), 60);
    }

    public void file(PortalIdentity identity) {
        check("file:" + identity.tenantId() + ":" + identity.portalUserId(), 20);
    }

    private void check(String scope, int maximum) {
        Long count;
        try {
            count = redis.execute(LIMIT, List.of("cloudflow:portal:rate:" + scope));
        } catch (RuntimeException unavailable) {
            throw new ServiceException("客户门户验证暂不可用，请稍后重试", 503);
        }
        if (count == null) throw new ServiceException("客户门户验证暂不可用，请稍后重试", 503);
        if (count > maximum) throw new ServiceException("请求过于频繁，请稍后再试", 429);
    }

    private static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(String.valueOf(value).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException impossible) {
            throw new IllegalStateException(impossible);
        }
    }
}

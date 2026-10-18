package com.cloudflow.crm.service.email;

import com.cloudflow.common.message.security.MessagePayloadCodec;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class CrmEmailTrackingLimiter {
    private static final DefaultRedisScript<Long> SCRIPT = new DefaultRedisScript<>("""
            local ipCount = redis.call('INCR', KEYS[1])
            if ipCount == 1 then redis.call('EXPIRE', KEYS[1], 120) end
            local tokenCount = redis.call('INCR', KEYS[2])
            if tokenCount == 1 then redis.call('EXPIRE', KEYS[2], 120) end
            if ipCount > 120 or tokenCount > 20 then return 0 end
            return 1
            """, Long.class);
    private final StringRedisTemplate redis;

    public enum Verdict { ALLOWED, LIMITED, UNAVAILABLE }

    public Verdict check(String ip, String token) {
        String normalized = ip != null && ip.matches("[0-9a-fA-F:.]{1,45}") ? ip : "unknown";
        String identity = token != null && token.length() <= 128 ? token : "invalid";
        long minute = System.currentTimeMillis() / 60000;
        String prefix = "crm:mail:{tracking}:";
        try {
            Long result = redis.execute(SCRIPT, List.of(prefix + "ip:" + MessagePayloadCodec.hash(normalized) + ":" + minute,
                    prefix + "token:" + MessagePayloadCodec.hash(identity) + ":" + minute));
            return Long.valueOf(1).equals(result) ? Verdict.ALLOWED : Verdict.LIMITED;
        } catch (RuntimeException unavailable) { return Verdict.UNAVAILABLE; }
    }
}

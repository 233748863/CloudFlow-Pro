package com.cloudflow.auth.im;

import com.cloudflow.common.security.im.ImLoginTransport;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImCallbackLimits {
    private static final DefaultRedisScript<Long> LIMIT = new DefaultRedisScript<>(
            "local count=redis.call('incr',KEYS[1]); if count==1 or redis.call('ttl',KEYS[1])<0 then redis.call('expire',KEYS[1],60) end; return count", Long.class);
    private final StringRedisTemplate redis;

    public void require(String address) {
        ImLoginTransport.numeric(address);
        Long count;
        try { count = redis.execute(LIMIT, List.of(key(address))); }
        catch (RuntimeException failure) { throw ImFailure.callbackUnavailable(); }
        if (count == null || count <= 0) throw ImFailure.callbackUnavailable();
        if (count > 120) throw ImFailure.callbackRate();
    }

    static String key(String address) { return "cloudflow:im:callback-limit:" + ImCardCallback.hash(address); }
}

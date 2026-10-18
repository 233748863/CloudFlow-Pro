package com.cloudflow.auth.im;

import com.fasterxml.jackson.annotation.JsonIgnore;
import java.time.Duration;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;
import java.util.concurrent.TimeUnit;
import java.util.function.Supplier;
import lombok.RequiredArgsConstructor;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImAccessTokens {
    private static final DefaultRedisScript<Long> DISCARD = new DefaultRedisScript<>(
            "if redis.call('get',KEYS[1]) == ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", Long.class);
    private final StringRedisTemplate redis;
    private final RedissonClient redisson;
    private final ImSecretCipher cipher;

    public String resolve(WeComCredentials credentials, Supplier<Grant> refresh) {
        cipher.requireKey();
        String cacheKey = credentials.cacheKey();
        try {
            String cached = cached(credentials, cacheKey);
            if (cached != null) return cached;
            RLock lock = redisson.getLock(cacheKey + ":lock");
            if (!lock.tryLock(5, 30, TimeUnit.SECONDS)) throw ImFailure.remote();
            try {
                cached = cached(credentials, cacheKey);
                if (cached != null) return cached;
                long started = System.nanoTime();
                Grant grant = refresh.get();
                long elapsed = TimeUnit.NANOSECONDS.toSeconds(System.nanoTime() - started) + 1;
                long lifetime = grant.expiresIn() - 120L - elapsed;
                if (lifetime <= 0 || !lock.isHeldByCurrentThread()) throw ImFailure.remote();
                String encrypted = cipher.encrypt(credentials.tenantId(), "WECOM", ImSecretCipher.Field.ACCESS_TOKEN, grant.token());
                redis.opsForValue().set(cacheKey, encrypted, Duration.ofSeconds(lifetime));
                return grant.token();
            } finally {
                if (lock.isHeldByCurrentThread()) lock.unlock();
            }
        } catch (ImFailure failure) {
            throw failure;
        } catch (InterruptedException failure) {
            Thread.currentThread().interrupt();
            throw ImFailure.remote();
        } catch (RuntimeException failure) {
            throw ImFailure.remote();
        }
    }

    public void discard(WeComCredentials credentials, String rejectedToken) {
        try {
            String cacheKey = credentials.cacheKey();
            String encrypted = redis.opsForValue().get(cacheKey);
            if (encrypted == null) return;
            String cachedToken = cipher.decrypt(credentials.tenantId(), "WECOM", ImSecretCipher.Field.ACCESS_TOKEN, encrypted);
            if (rejectedToken != null && MessageDigest.isEqual(cachedToken.getBytes(StandardCharsets.UTF_8),
                    rejectedToken.getBytes(StandardCharsets.UTF_8))) redis.execute(DISCARD, List.of(cacheKey), encrypted);
        } catch (RuntimeException failure) {
            throw ImFailure.remote();
        }
    }

    private String cached(WeComCredentials credentials, String cacheKey) {
        String encrypted = redis.opsForValue().get(cacheKey);
        return encrypted == null ? null : cipher.decrypt(credentials.tenantId(), "WECOM", ImSecretCipher.Field.ACCESS_TOKEN, encrypted);
    }

    public record Grant(@JsonIgnore String token, int expiresIn) {
        public Grant {
            if (token == null || !token.matches("[A-Za-z0-9_-]{1,1024}") || expiresIn <= 120) throw ImFailure.remote();
        }

        @Override
        public String toString() { return "ImAccessTokens.Grant[expiresIn=" + expiresIn + "]"; }
    }
}

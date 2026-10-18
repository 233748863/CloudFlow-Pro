package com.cloudflow.auth.platform;

import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.util.HexFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PlatformAuthenticationStore {
    public static final long VALIDITY_SECONDS = 300;
    private final StringRedisTemplate redis;
    private final ObjectMapper json;

    public PlatformAuthenticationProof read(String token) {
        try {
            String value = redis.opsForValue().get(key(token));
            return value == null ? null : json.readValue(value, PlatformAuthenticationProof.class);
        } catch (JsonProcessingException failure) {
            throw unavailable();
        } catch (org.springframework.dao.DataAccessException failure) {
            throw unavailable();
        }
    }

    public void write(String token, PlatformAuthenticationProof proof) {
        try {
            redis.opsForValue().set(key(token), json.writeValueAsString(proof), Duration.ofSeconds(VALIDITY_SECONDS));
        } catch (JsonProcessingException failure) {
            throw unavailable();
        } catch (org.springframework.dao.DataAccessException failure) {
            throw unavailable();
        }
    }

    public void clear(String token) {
        try {
            redis.delete(key(token));
        } catch (org.springframework.dao.DataAccessException failure) {
            throw unavailable();
        }
    }

    static String key(String token) {
        if (token == null || token.isBlank()) throw new ServiceException("内部登录状态无效", 401);
        return "auth:platform:recent:internal:" + digest(token);
    }

    static String digest(String value) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                    .digest(value.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException failure) {
            throw new IllegalStateException("平台身份核验摘要算法不可用");
        }
    }

    private static ServiceException unavailable() {
        return new ServiceException("平台身份核验暂时不可用，请稍后重试", 503);
    }
}

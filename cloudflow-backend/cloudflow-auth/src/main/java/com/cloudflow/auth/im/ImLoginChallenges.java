package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class ImLoginChallenges {
    public static final int TTL_SECONDS = 300;
    private static final String PREFIX = "cloudflow:im:login:";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DefaultRedisScript<Long> CONSUME = new DefaultRedisScript<>(
            "if redis.call('pttl', KEYS[1]) > 0 and redis.call('get', KEYS[1]) == ARGV[1] "
                    + "then return redis.call('del', KEYS[1]) else return 0 end", Long.class);
    private final StringRedisTemplate redis;
    private final ImSecretCipher cipher;
    private final ImLoginRedirects redirects;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public ImLoginChallenges(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json) {
        this(redis, cipher, redirects, json, Clock.systemUTC());
    }

    ImLoginChallenges(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.cipher = cipher;
        this.redirects = redirects;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.clock = clock;
    }

    public String issue(Context context, String browser) {
        if (context == null) throw ImFailure.configuration();
        requireToken(browser);
        redirects.verify(context);
        String token = randomToken();
        long issuedAt = clock.millis();
        Stored stored = new Stored(context, digest(token), digest(browser), issuedAt, issuedAt + TTL_SECONDS * 1000L);
        String encrypted;
        try {
            encrypted = context.tenantId() + ":" + cipher.encrypt(context.tenantId(), "WECOM",
                    ImSecretCipher.Field.LOGIN_CHALLENGE, json.writeValueAsString(stored));
        } catch (JsonProcessingException failure) { throw ImFailure.loginUnavailable(); }
        try {
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(token), encrypted, Duration.ofSeconds(TTL_SECONDS)))) {
                throw ImFailure.loginUnavailable();
            }
        } catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        return token;
    }

    public Context consume(String token, String browser, Purpose purpose) {
        if (purpose == null) throw ImFailure.loginChallenge();
        return consume(token, browser, Set.of(purpose));
    }

    public Context consumeLogin(String token, String browser) {
        return consume(token, browser, Set.of(Purpose.SCAN_LOGIN, Purpose.EMBEDDED_LOGIN));
    }

    private Context consume(String token, String browser, Set<Purpose> purposes) {
        requireToken(token);
        requireToken(browser);
        String key = key(token);
        String raw;
        try { raw = redis.opsForValue().get(key); }
        catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        Stored stored = decode(raw);
        long now = clock.millis();
        if (stored.context() == null || !purposes.contains(stored.context().purpose())
                || !equal(digest(token), stored.tokenDigest()) || !equal(digest(browser), stored.browserDigest())
                || stored.issuedAt() > now || stored.expiresAt() <= now || stored.issuedAt() <= 0
                || stored.expiresAt() - stored.issuedAt() != TTL_SECONDS * 1000L) throw ImFailure.loginChallenge();
        redirects.verify(stored.context());
        Long consumed;
        try { consumed = redis.execute(CONSUME, List.of(key), raw); }
        catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        if (!Long.valueOf(1L).equals(consumed)) throw ImFailure.loginChallenge();
        return stored.context();
    }

    private Stored decode(String raw) {
        if (raw == null || raw.length() > 12021) throw ImFailure.loginChallenge();
        int separator = raw.indexOf(':');
        if (separator < 1 || separator > 19) throw ImFailure.loginChallenge();
        try {
            long tenantId = Long.parseLong(raw.substring(0, separator));
            Stored stored = json.readValue(cipher.decrypt(tenantId, "WECOM", ImSecretCipher.Field.LOGIN_CHALLENGE,
                    raw.substring(separator + 1)), Stored.class);
            if (stored == null || stored.context() == null || stored.context().tenantId() != tenantId) throw ImFailure.loginChallenge();
            return stored;
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.loginChallenge(); }
    }

    static String randomToken() {
        byte[] bytes = new byte[32];
        RANDOM.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    static void requireToken(String token) {
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")
                || !Base64.getUrlEncoder().withoutPadding().encodeToString(Base64.getUrlDecoder().decode(token)).equals(token)) {
            throw ImFailure.loginChallenge();
        }
    }

    static String key(String token) {
        requireToken(token);
        return PREFIX + digest(token);
    }

    static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException failure) { throw ImFailure.loginUnavailable(); }
    }

    static boolean equal(String expected, String actual) {
        return actual != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.UTF_8), actual.getBytes(StandardCharsets.UTF_8));
    }

    public enum Purpose { SCAN_LOGIN, EMBEDDED_LOGIN, BIND }

    public record Context(long tenantId, long configId, int configVersion, String corpId, long agentId,
            String callbackUrl, String redirectPath, Purpose purpose, String legalReleaseCode, Long ownerUserId,
            Integer ownerVersion, String ownerSessionDigest, String ownerCredentialStamp, String ownerProofNonce) {
        public Context(long tenantId, long configId, int configVersion, String corpId, long agentId,
                String callbackUrl, String redirectPath, Purpose purpose, String legalReleaseCode, Long ownerUserId,
                Integer ownerVersion, String ownerSessionDigest) {
            this(tenantId, configId, configVersion, corpId, agentId, callbackUrl, redirectPath, purpose,
                    legalReleaseCode, ownerUserId, ownerVersion, ownerSessionDigest, null, null);
        }

        public Context {
            if (tenantId <= 0 || configId <= 0 || configVersion < 0 || configVersion == Integer.MAX_VALUE
                    || corpId == null || !corpId.matches("[A-Za-z0-9_-]{1,100}") || agentId <= 0 || purpose == null
                    || callbackUrl == null || callbackUrl.length() > 1024 || redirectPath == null || redirectPath.length() > 256
                    || (legalReleaseCode != null && !legalReleaseCode.matches("[A-Za-z0-9_.-]{1,128}"))) throw ImFailure.configuration();
            if (purpose == Purpose.BIND) {
                if (ownerUserId == null || ownerUserId <= 0 || ownerVersion == null || ownerVersion < 0 || ownerVersion == Integer.MAX_VALUE
                        || ownerSessionDigest == null || !ownerSessionDigest.matches("[a-f0-9]{64}")
                        || ownerCredentialStamp == null || !ownerCredentialStamp.matches("[a-f0-9]{64}")
                        || ownerProofNonce == null) throw ImFailure.configuration();
                requireToken(ownerProofNonce);
            } else if (ownerUserId != null || ownerVersion != null || ownerSessionDigest != null
                    || ownerCredentialStamp != null || ownerProofNonce != null) throw ImFailure.configuration();
        }

        public void verifyConfiguration(WeComCredentials credentials) {
            if (credentials == null || credentials.tenantId() != tenantId || credentials.configId() != configId
                    || credentials.version() != configVersion || !credentials.corpId().equals(corpId)
                    || credentials.agentId() != agentId) throw ImFailure.loginChallenge();
        }

        @Override
        public String toString() { return "ImLoginChallenges.Context[purpose=" + purpose + "]"; }
    }

    private record Stored(Context context, String tokenDigest, String browserDigest, long issuedAt, long expiresAt) {
        @Override
        public String toString() { return "ImLoginChallenges.Stored[redacted]"; }
    }
}

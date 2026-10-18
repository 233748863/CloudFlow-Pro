package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class ImLoginMfaChallenges {
    public static final int TTL_SECONDS = 300;
    private static final String PREFIX = "cloudflow:im:login-mfa:";
    private static final DefaultRedisScript<Long> CONSUME = new DefaultRedisScript<>(
            "if redis.call('pttl', KEYS[1]) > 0 and redis.call('get', KEYS[1]) == ARGV[1] "
                    + "then return redis.call('del', KEYS[1]) else return 0 end", Long.class);
    private final StringRedisTemplate redis;
    private final ImSecretCipher cipher;
    private final ImLoginRedirects redirects;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public ImLoginMfaChallenges(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json) {
        this(redis, cipher, redirects, json, Clock.systemUTC());
    }

    ImLoginMfaChallenges(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.cipher = cipher;
        this.redirects = redirects;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.clock = clock;
    }

    public String issue(Proof proof, String browser) {
        if (proof == null || proof.startedAt() > clock.millis()) throw ImFailure.loginChallenge();
        ImLoginChallenges.requireToken(browser);
        redirects.verify(proof.context().callbackUrl(), proof.context().redirectPath());
        String token = ImLoginChallenges.randomToken();
        long issuedAt = clock.millis();
        Stored stored = new Stored(proof, ImLoginChallenges.digest(token), ImLoginChallenges.digest(browser),
                issuedAt, issuedAt + TTL_SECONDS * 1000L);
        String encrypted;
        try {
            encrypted = proof.account().tenantId() + ":" + cipher.encrypt(proof.account().tenantId(), "WECOM",
                    ImSecretCipher.Field.LOGIN_MFA, json.writeValueAsString(stored));
        } catch (JsonProcessingException failure) { throw ImFailure.loginUnavailable(); }
        try {
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(token), encrypted, Duration.ofSeconds(TTL_SECONDS)))) {
                throw ImFailure.loginUnavailable();
            }
        } catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        return token;
    }

    public Proof consume(String token, String browser) {
        ImLoginChallenges.requireToken(token);
        ImLoginChallenges.requireToken(browser);
        String raw;
        try { raw = redis.opsForValue().get(key(token)); }
        catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        Stored stored = decode(raw);
        long now = clock.millis();
        if (!ImLoginChallenges.equal(ImLoginChallenges.digest(token), stored.tokenDigest())
                || !ImLoginChallenges.equal(ImLoginChallenges.digest(browser), stored.browserDigest())
                || stored.issuedAt() > now || stored.expiresAt() <= now || stored.issuedAt() <= 0
                || stored.proof().startedAt() > stored.issuedAt()
                || stored.expiresAt() - stored.issuedAt() != TTL_SECONDS * 1000L) throw ImFailure.loginChallenge();
        redirects.verify(stored.proof().context().callbackUrl(), stored.proof().context().redirectPath());
        Long consumed;
        try { consumed = redis.execute(CONSUME, List.of(key(token)), raw); }
        catch (RuntimeException failure) { throw ImFailure.loginUnavailable(); }
        if (!Long.valueOf(1L).equals(consumed)) throw ImFailure.loginChallenge();
        return stored.proof();
    }

    private Stored decode(String raw) {
        if (raw == null || raw.length() > 12021) throw ImFailure.loginChallenge();
        int separator = raw.indexOf(':');
        if (separator < 1 || separator > 19) throw ImFailure.loginChallenge();
        try {
            long tenantId = Long.parseLong(raw.substring(0, separator));
            Stored stored = json.readValue(cipher.decrypt(tenantId, "WECOM", ImSecretCipher.Field.LOGIN_MFA,
                    raw.substring(separator + 1)), Stored.class);
            if (stored == null || stored.proof() == null || stored.proof().account().tenantId() != tenantId) throw ImFailure.loginChallenge();
            return stored;
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.loginChallenge(); }
    }

    static String key(String token) {
        ImLoginChallenges.requireToken(token);
        return PREFIX + ImLoginChallenges.digest(token);
    }

    public record Proof(ImLoginChallenges.Context context, ImLoginAccounts.Account account, long startedAt) {
        public Proof {
            if (context == null || account == null || startedAt <= 0 || context.purpose() == ImLoginChallenges.Purpose.BIND
                    || context.tenantId() != account.tenantId() || context.configId() != account.configId()
                    || context.configVersion() != account.configVersion() || !context.corpId().equals(account.corpId())
                    || context.agentId() != account.agentId()) throw ImFailure.loginChallenge();
        }

        @Override public String toString() { return "ImLoginMfaChallenges.Proof[redacted]"; }
    }

    private record Stored(Proof proof, String tokenDigest, String browserDigest, long issuedAt, long expiresAt) {
        @Override public String toString() { return "ImLoginMfaChallenges.Stored[redacted]"; }
    }
}

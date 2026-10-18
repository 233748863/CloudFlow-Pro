package com.cloudflow.auth.im;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.util.List;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.DefaultRedisScript;
import org.springframework.stereotype.Component;

@Component
public class ImBindingMembers {
    private static final DefaultRedisScript<Long> CONSUME = new DefaultRedisScript<>(
            "if redis.call('pttl',KEYS[1])>0 and redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", Long.class);
    private final StringRedisTemplate redis;
    private final ImSecretCipher cipher;
    private final ImLoginRedirects redirects;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public ImBindingMembers(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json) {
        this(redis, cipher, redirects, json, Clock.systemUTC());
    }

    ImBindingMembers(StringRedisTemplate redis, ImSecretCipher cipher, ImLoginRedirects redirects, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.cipher = cipher;
        this.redirects = redirects;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.clock = clock;
    }

    public String issue(ImLoginChallenges.Context context, ImIdentityProvider.Member member, String browser, long expiresAt) {
        Proof proof = new Proof(context, member);
        redirects.verify(context);
        ImLoginChallenges.requireToken(browser);
        long now = clock.millis();
        if (expiresAt <= now || expiresAt - now > ImBindingProofs.TTL_SECONDS * 1000L) throw ImFailure.bindingVerification();
        String token = ImLoginChallenges.randomToken();
        Stored stored = new Stored(proof, ImLoginChallenges.digest(token), ImLoginChallenges.digest(browser), now, expiresAt);
        try {
            String encrypted = context.tenantId() + ":" + cipher.encrypt(context.tenantId(), "WECOM", ImSecretCipher.Field.BINDING_MEMBER, json.writeValueAsString(stored));
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(token), encrypted, Duration.ofMillis(expiresAt - now)))) {
                throw ImFailure.bindingVerificationUnavailable();
            }
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
        return token;
    }

    public Ticket read(String token, String browser) {
        ImLoginChallenges.requireToken(token);
        ImLoginChallenges.requireToken(browser);
        String raw;
        try { raw = redis.opsForValue().get(key(token)); }
        catch (RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
        Stored stored = decode(raw);
        long now = clock.millis();
        if (!ImLoginChallenges.equal(ImLoginChallenges.digest(token), stored.tokenDigest())
                || !ImLoginChallenges.equal(ImLoginChallenges.digest(browser), stored.browserDigest())
                || stored.issuedAt() <= 0 || stored.issuedAt() > now || stored.expiresAt() <= now
                || stored.expiresAt() <= stored.issuedAt() || stored.expiresAt() - stored.issuedAt() > ImBindingProofs.TTL_SECONDS * 1000L) {
            throw ImFailure.bindingVerification();
        }
        redirects.verify(stored.proof().context());
        return new Ticket(stored.proof(), key(token), raw, stored.expiresAt());
    }

    public void consume(Ticket ticket) {
        if (ticket == null || ticket.expiresAt() <= clock.millis()) throw ImFailure.bindingVerification();
        Long consumed;
        try { consumed = redis.execute(CONSUME, List.of(ticket.key()), ticket.raw()); }
        catch (RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
        if (!Long.valueOf(1).equals(consumed)) throw ImFailure.bindingVerification();
    }

    private Stored decode(String raw) {
        if (raw == null || raw.length() > 12021) throw ImFailure.bindingVerification();
        int separator = raw.indexOf(':');
        if (separator < 1 || separator > 19) throw ImFailure.bindingVerification();
        try {
            long tenantId = Long.parseLong(raw.substring(0, separator));
            Stored stored = json.readValue(cipher.decrypt(tenantId, "WECOM", ImSecretCipher.Field.BINDING_MEMBER, raw.substring(separator + 1)), Stored.class);
            if (stored == null || stored.proof() == null || stored.proof().context().tenantId() != tenantId) throw ImFailure.bindingVerification();
            return stored;
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.bindingVerification(); }
    }

    static String key(String token) {
        ImLoginChallenges.requireToken(token);
        return "cloudflow:im:binding-member:" + ImLoginChallenges.digest(token);
    }

    public record Proof(ImLoginChallenges.Context context, ImIdentityProvider.Member member) {
        public Proof {
            if (context == null || context.purpose() != ImLoginChallenges.Purpose.BIND || member == null
                    || context.tenantId() != member.tenantId() || context.configId() != member.configId()
                    || context.configVersion() != member.configVersion() || !Objects.equals(context.corpId(), member.corpId())
                    || member.externalUserId() == null || !member.externalUserId().matches("[A-Za-z0-9_.@=-]{1,128}")) {
                throw ImFailure.bindingVerification();
            }
        }
        @Override public String toString() { return "ImBindingMembers.Proof[redacted]"; }
    }

    public record Ticket(Proof proof, String key, String raw, long expiresAt) {
        @Override public String toString() { return "ImBindingMembers.Ticket[redacted]"; }
    }

    private record Stored(Proof proof, String tokenDigest, String browserDigest, long issuedAt, long expiresAt) {
        @Override public String toString() { return "ImBindingMembers.Stored[redacted]"; }
    }
}

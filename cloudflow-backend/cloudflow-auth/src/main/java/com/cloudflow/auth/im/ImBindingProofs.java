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
public class ImBindingProofs {
    public static final int TTL_SECONDS = 300;
    private static final DefaultRedisScript<Long> CONSUME = new DefaultRedisScript<>(
            "if redis.call('pttl',KEYS[1])>0 and redis.call('get',KEYS[1])==ARGV[1] then return redis.call('del',KEYS[1]) else return 0 end", Long.class);
    private final StringRedisTemplate redis;
    private final ImSecretCipher cipher;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public ImBindingProofs(StringRedisTemplate redis, ImSecretCipher cipher, ObjectMapper json) {
        this(redis, cipher, json, Clock.systemUTC());
    }

    ImBindingProofs(StringRedisTemplate redis, ImSecretCipher cipher, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.cipher = cipher;
        this.json = json.copy().enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION)
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
        this.clock = clock;
    }

    public Ticket issue(Identity identity) {
        require(identity);
        long issuedAt = clock.millis();
        Proof proof = new Proof(identity, ImLoginChallenges.randomToken(), issuedAt, issuedAt + TTL_SECONDS * 1000L);
        try {
            String stored = cipher.encrypt(identity.tenantId(), "WECOM", ImSecretCipher.Field.BINDING_PROOF, json.writeValueAsString(proof));
            redis.opsForValue().set(key(identity), stored, Duration.ofSeconds(TTL_SECONDS));
            return new Ticket(proof, stored);
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
    }

    public Ticket read(Identity identity) {
        require(identity);
        String stored;
        try { stored = redis.opsForValue().get(key(identity)); }
        catch (RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
        if (stored == null) throw ImFailure.bindingVerification();
        try {
            Proof proof = json.readValue(cipher.decrypt(identity.tenantId(), "WECOM", ImSecretCipher.Field.BINDING_PROOF, stored), Proof.class);
            verify(identity, proof);
            return new Ticket(proof, stored);
        } catch (JsonProcessingException | RuntimeException failure) { throw ImFailure.bindingVerification(); }
    }

    public void consume(Identity identity, Ticket ticket) {
        require(identity);
        if (ticket == null) throw ImFailure.bindingVerification();
        verify(identity, ticket.proof());
        Long consumed;
        try { consumed = redis.execute(CONSUME, List.of(key(identity)), ticket.stored()); }
        catch (RuntimeException failure) { throw ImFailure.bindingVerificationUnavailable(); }
        if (!Long.valueOf(1).equals(consumed)) throw ImFailure.bindingVerification();
    }

    private void verify(Identity identity, Proof proof) {
        long now = clock.millis();
        if (proof == null || !identity.equals(proof.identity()) || proof.issuedAt() <= 0 || proof.issuedAt() > now
                || proof.expiresAt() <= now || proof.expiresAt() - proof.issuedAt() != TTL_SECONDS * 1000L) {
            throw ImFailure.bindingVerification();
        }
        ImLoginChallenges.requireToken(proof.nonce());
    }

    static String key(Identity identity) {
        require(identity);
        return "cloudflow:im:binding-proof:" + identity.tenantId() + ":" + identity.userId() + ":" + identity.sessionDigest();
    }

    private static void require(Identity identity) {
        if (identity == null) throw ImFailure.bindingVerification();
    }

    public record Identity(long tenantId, long userId, int userVersion, String sessionDigest, String credentialStamp, ImBindingAction action) {
        public Identity {
            if (tenantId <= 0 || userId <= 0 || userVersion < 0 || userVersion == Integer.MAX_VALUE || action == null
                    || sessionDigest == null || !sessionDigest.matches("[a-f0-9]{64}")
                    || credentialStamp == null || !credentialStamp.matches("[a-f0-9]{64}")) throw ImFailure.bindingVerification();
        }
        @Override public String toString() { return "ImBindingProofs.Identity[redacted]"; }
    }

    public record Proof(Identity identity, String nonce, long issuedAt, long expiresAt) {
        @Override public String toString() { return "ImBindingProofs.Proof[redacted]"; }
    }

    public record Ticket(Proof proof, String stored) {
        @Override public String toString() { return "ImBindingProofs.Ticket[redacted]"; }
    }
}

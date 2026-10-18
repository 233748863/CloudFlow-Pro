package com.cloudflow.auth.portal;

import com.cloudflow.common.core.domain.PortalFinanceFile;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.portal.PortalIdentity;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.util.Base64;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalFinanceFileTokens {
    private static final String AUDIENCE = "PORTAL_FINANCE_FILE";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final RedisScript<Long> CONSUME = RedisScript.of("if redis.call('GET', KEYS[1]) == ARGV[1] then "
            + "return redis.call('DEL', KEYS[1]) end; return 0", Long.class);
    private final StringRedisTemplate redis;
    private final ObjectMapper json;

    public record Ticket(String audience, String sessionDigest, PortalIdentity identity, String kind,
            Long recordId, Long fileId, Integer publicationVersion) { }

    public PortalFileTickets.Access issue(PortalIdentity identity, String token, PortalFinanceFile file) {
        if (identity == null || token == null || token.isBlank() || file == null || file.attachment() == null) throw invalid();
        Ticket ticket = new Ticket(AUDIENCE, digest(token), identity, file.kind(), file.recordId(),
                file.attachment().getFileId(), file.publicationVersion());
        validate(ticket);
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        String raw = "ff_" + Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        try {
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(raw), json.writeValueAsString(ticket),
                    Duration.ofSeconds(PortalFileTickets.LIFETIME_SECONDS)))) throw unavailable();
        } catch (java.io.IOException | org.springframework.dao.DataAccessException failure) { throw unavailable(); }
        return new PortalFileTickets.Access(raw, PortalFileTickets.LIFETIME_SECONDS);
    }

    public Ticket consume(String raw, PortalIdentity identity, String token) {
        if (identity == null || token == null || token.isBlank() || raw == null || !raw.matches("ff_[A-Za-z0-9_-]{43}")) throw invalid();
        try {
            String stored = redis.opsForValue().get(key(raw));
            if (stored == null || stored.length() > 2048) throw invalid();
            Ticket ticket = json.readValue(stored, Ticket.class);
            validate(ticket);
            if (!Objects.equals(identity, ticket.identity()) || !Objects.equals(digest(token), ticket.sessionDigest())) throw invalid();
            if (!Long.valueOf(1).equals(redis.execute(CONSUME, List.of(key(raw)), stored))) throw invalid();
            return ticket;
        } catch (java.io.IOException failure) { throw invalid(); }
        catch (org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    private static void validate(Ticket ticket) {
        if (ticket == null || !AUDIENCE.equals(ticket.audience()) || ticket.kind() == null
                || !Set.of("RECEIVABLE", "INVOICE").contains(ticket.kind()) || ticket.recordId() == null || ticket.recordId() <= 0
                || ticket.fileId() == null || ticket.fileId() <= 0 || ticket.publicationVersion() == null || ticket.publicationVersion() < 0) throw invalid();
    }
    private static String key(String raw) { return "cloudflow:portal:finance-file:" + digest(raw); }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }
    private static ServiceException invalid() { return new ServiceException("票据访问凭据已失效，请重新核对", 404); }
    private static ServiceException unavailable() { return new ServiceException("票据访问验证暂不可用，请稍后重试", 503); }
}

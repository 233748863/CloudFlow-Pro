package com.cloudflow.auth.portal;

import com.cloudflow.common.core.domain.PortalKnowledgeFile;
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
import lombok.RequiredArgsConstructor;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.script.RedisScript;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class PortalFileTickets {
    public static final int LIFETIME_SECONDS = 60;
    private static final String AUDIENCE = "PORTAL_KNOWLEDGE_DOWNLOAD";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final RedisScript<Long> CONSUME = RedisScript.of("if redis.call('GET', KEYS[1]) == ARGV[1] then "
            + "return redis.call('DEL', KEYS[1]) end; return 0", Long.class);
    private final StringRedisTemplate redis;
    private final ObjectMapper json;

    public record Access(String downloadTicket, int expiresIn) { }
    public record Ticket(String audience, String sessionDigest, PortalIdentity identity, Long documentId,
            Long versionId, Long fileId, Integer publicationVersion) { }

    public Access issue(PortalIdentity identity, String token, PortalKnowledgeFile file) {
        byte[] entropy = new byte[32];
        RANDOM.nextBytes(entropy);
        String raw = "kf_" + Base64.getUrlEncoder().withoutPadding().encodeToString(entropy);
        Ticket ticket = new Ticket(AUDIENCE, digest(token), identity, file.documentId(), file.versionId(),
                file.attachment().getFileId(), file.publicationVersion());
        try {
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(raw), json.writeValueAsString(ticket),
                    Duration.ofSeconds(LIFETIME_SECONDS)))) throw unavailable();
        } catch (java.io.IOException | org.springframework.dao.DataAccessException failure) { throw unavailable(); }
        return new Access(raw, LIFETIME_SECONDS);
    }

    public Ticket consume(String raw, PortalIdentity identity, String token) {
        if (raw == null || !raw.matches("kf_[A-Za-z0-9_-]{43}")) throw invalid();
        try {
            String stored = redis.opsForValue().get(key(raw));
            if (stored == null || stored.length() > 2048) throw invalid();
            Ticket ticket = json.readValue(stored, Ticket.class);
            if (!AUDIENCE.equals(ticket.audience()) || !Objects.equals(identity, ticket.identity())
                    || !Objects.equals(digest(token), ticket.sessionDigest()) || ticket.documentId() == null
                    || ticket.versionId() == null || ticket.fileId() == null || ticket.publicationVersion() == null) throw invalid();
            if (!Long.valueOf(1).equals(redis.execute(CONSUME, List.of(key(raw)), stored))) throw invalid();
            return ticket;
        } catch (java.io.IOException invalid) { throw invalid(); }
        catch (org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    private static String key(String raw) { return "cloudflow:portal:file-ticket:" + digest(raw); }

    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException impossible) { throw new IllegalStateException(impossible); }
    }

    private static ServiceException invalid() { return new ServiceException("下载凭据已失效，请重新点击下载", 404); }
    private static ServiceException unavailable() { return new ServiceException("附件下载验证暂不可用，请稍后重试", 503); }
}

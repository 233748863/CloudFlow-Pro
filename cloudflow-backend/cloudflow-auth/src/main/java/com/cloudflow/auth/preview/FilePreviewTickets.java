package com.cloudflow.auth.preview;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.util.Base64;
import java.util.Objects;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class FilePreviewTickets {
    public static final int LIFETIME_SECONDS = 60;
    private static final String AUDIENCE = "CLOUDFLOW_FILE_PREVIEW_V1";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public FilePreviewTickets(StringRedisTemplate redis, ObjectMapper json) { this(redis, json, Clock.systemUTC()); }

    FilePreviewTickets(StringRedisTemplate redis, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.json = json;
        this.clock = clock;
    }

    public record Ticket(String audience, String loginType, Long userId, Long tenantId, String sessionDigest,
            Long fileId, FilePreviewRequest request, String fileStamp, String contentDigest, String mediaType,
            String fileName, int size, long issuedAt, long expiresAt) { }
    public record Access(String streamUrl, long expiresAt) { }

    public Access issue(FilePreviewRequest request, FilePreviewResolver.Resolved resolved, byte[] bytes, String mediaType) {
        FilePreviewAccess.requireContext();
        byte[] nonce = new byte[32];
        RANDOM.nextBytes(nonce);
        String identifier = Base64.getUrlEncoder().withoutPadding().encodeToString(nonce);
        long issuedAt = clock.millis();
        Ticket ticket = new Ticket(AUDIENCE, StpUtil.getLoginType(), UserContext.getUserId(), UserContext.getTenantId(),
                FilePreviewContent.digest(UserContext.getAuthToken()), resolved.file().getFileId(), request.validated(),
                resolved.stamp(), FilePreviewContent.digest(bytes), mediaType, resolved.file().getFileName(), bytes.length,
                issuedAt, issuedAt + LIFETIME_SECONDS * 1000L);
        try {
            String stored = json.writeValueAsString(ticket);
            String signature = sign(identifier, stored, UserContext.getAuthToken());
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(identifier), stored, Duration.ofSeconds(LIFETIME_SECONDS)))) throw unavailable();
            return new Access("/api/auth/system/file/preview-content?previewToken=" + identifier + "&signature=" + signature, ticket.expiresAt());
        } catch (java.io.IOException | org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    public Ticket verify(String identifier, String signature) {
        FilePreviewAccess.requireContext();
        if (identifier == null || !identifier.matches("[A-Za-z0-9_-]{43}") || signature == null || !signature.matches("[A-Za-z0-9_-]{43}")) throw invalid();
        try {
            String stored = redis.opsForValue().get(key(identifier));
            if (stored == null || stored.length() > 16384
                    || !MessageDigest.isEqual(sign(identifier, stored, UserContext.getAuthToken()).getBytes(StandardCharsets.US_ASCII), signature.getBytes(StandardCharsets.US_ASCII))) throw invalid();
            Ticket ticket = json.readValue(stored, Ticket.class);
            long now = clock.millis();
            if (ticket == null || !AUDIENCE.equals(ticket.audience()) || !StpUtil.getLoginType().equals(ticket.loginType())
                    || !Objects.equals(UserContext.getUserId(), ticket.userId()) || !Objects.equals(UserContext.getTenantId(), ticket.tenantId())
                    || !Objects.equals(FilePreviewContent.digest(UserContext.getAuthToken()), ticket.sessionDigest())
                    || ticket.issuedAt() > now || ticket.expiresAt() <= now || ticket.expiresAt() - ticket.issuedAt() != LIFETIME_SECONDS * 1000L
                    || ticket.fileId() == null || ticket.request() == null || ticket.fileStamp() == null || ticket.contentDigest() == null
                    || ticket.size() <= 0 || ticket.size() > FilePreviewContent.MAX_BYTES) throw invalid();
            ticket.request().validated();
            return ticket;
        } catch (java.io.IOException failure) { throw invalid(); }
        catch (org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    private static String sign(String identifier, String stored, String token) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            byte[] key = MessageDigest.getInstance("SHA-256").digest((AUDIENCE + "\0" + token).getBytes(StandardCharsets.UTF_8));
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(mac.doFinal((identifier + "\n" + stored).getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException failure) { throw unavailable(); }
    }

    private static String key(String identifier) { return "auth:file-preview:v1:" + FilePreviewContent.digest(identifier); }
    private static ServiceException invalid() { return new ServiceException("预览凭据已失效，请重新打开附件", 410); }
    private static ServiceException unavailable() { return new ServiceException("附件预览凭据服务暂不可用", 503); }
}

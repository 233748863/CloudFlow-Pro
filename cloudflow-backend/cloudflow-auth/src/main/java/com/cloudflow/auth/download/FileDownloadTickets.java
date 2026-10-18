package com.cloudflow.auth.download;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.cloudflow.common.security.file.FilePreviewAccess;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Clock;
import java.time.Duration;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.Objects;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

@Component
public class FileDownloadTickets {
    private static final String AUDIENCE = "CLOUDFLOW_FILE_DOWNLOAD_V1";
    private static final SecureRandom RANDOM = new SecureRandom();
    private final StringRedisTemplate redis;
    private final ObjectMapper json;
    private final Clock clock;

    @Autowired
    public FileDownloadTickets(StringRedisTemplate redis, ObjectMapper json) { this(redis, json, Clock.systemUTC()); }

    FileDownloadTickets(StringRedisTemplate redis, ObjectMapper json, Clock clock) {
        this.redis = redis;
        this.json = json;
        this.clock = clock;
    }

    public record Ticket(String audience, String loginType, Long userId, Long tenantId, String sessionDigest,
            FilePreviewRequest request, String fileStamp, long issuedAt, long expiresAt) { }
    public record Access(String url, long expiresAt) { }

    public Access issue(FilePreviewRequest request, String fileStamp, int seconds) {
        FilePreviewAccess.requireSession();
        if (seconds < 1 || seconds > 3600 || fileStamp == null || fileStamp.isBlank()) throw unavailable();
        byte[] nonce = new byte[32];
        RANDOM.nextBytes(nonce);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(nonce);
        long now = clock.millis();
        Ticket ticket = new Ticket(AUDIENCE, StpUtil.getLoginType(), UserContext.getUserId(), UserContext.getTenantId(),
                FilePreviewContent.digest(UserContext.getAuthToken()), request.validated(), fileStamp, now, now + seconds * 1000L);
        try {
            if (!Boolean.TRUE.equals(redis.opsForValue().setIfAbsent(key(token), json.writeValueAsString(ticket), Duration.ofSeconds(seconds)))) throw unavailable();
            return new Access("/api/auth/system/file/download?token=" + token, ticket.expiresAt());
        } catch (java.io.IOException | org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    public Ticket verify(String token) {
        FilePreviewAccess.requireSession();
        if (token == null || !token.matches("[A-Za-z0-9_-]{43}")) throw invalid();
        try {
            String stored = redis.opsForValue().get(key(token));
            if (stored == null || stored.length() > 16384) throw invalid();
            Ticket ticket = json.readValue(stored, Ticket.class);
            long now = clock.millis();
            if (ticket == null || !AUDIENCE.equals(ticket.audience()) || !StpUtil.getLoginType().equals(ticket.loginType())
                    || !Objects.equals(UserContext.getUserId(), ticket.userId()) || !Objects.equals(UserContext.getTenantId(), ticket.tenantId())
                    || !Objects.equals(FilePreviewContent.digest(UserContext.getAuthToken()), ticket.sessionDigest())
                    || ticket.issuedAt() > now || ticket.expiresAt() <= now || ticket.expiresAt() <= ticket.issuedAt()
                    || ticket.expiresAt() - ticket.issuedAt() > 3600_000L || ticket.request() == null
                    || ticket.request().fileId() == null || ticket.fileStamp() == null || ticket.fileStamp().isBlank()) throw invalid();
            ticket.request().validated();
            return ticket;
        } catch (java.io.IOException failure) { throw invalid(); }
        catch (org.springframework.dao.DataAccessException failure) { throw unavailable(); }
    }

    private static String key(String token) { return "auth:file-download:v1:" + FilePreviewContent.digest(token); }
    private static ServiceException invalid() { return new ServiceException("下载凭据已失效，请重新申请", 410); }
    private static ServiceException unavailable() { return new ServiceException("文件下载凭据服务暂不可用", 503); }
}

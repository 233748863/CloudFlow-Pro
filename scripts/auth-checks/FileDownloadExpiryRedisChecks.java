package com.cloudflow.auth.checks;

import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.download.FileDownloadTickets;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.file.FilePreviewContent;
import com.cloudflow.common.core.file.FilePreviewRequest;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.UUID;
import java.util.concurrent.TimeUnit;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;

/** Deployed ticket component + real Redis; identity is controlled only in this separate JVM. */
public final class FileDownloadExpiryRedisChecks {
    private static int assertions;

    private FileDownloadExpiryRedisChecks() { }

    public static void main(String[] arguments) throws Exception {
        ObjectMapper json = new ObjectMapper();
        JsonNode input = json.readTree(new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8)).readLine());
        RedisStandaloneConfiguration configuration = new RedisStandaloneConfiguration(input.required("host").asText(), input.required("port").asInt());
        configuration.setDatabase(input.required("database").asInt());
        configuration.setPassword(RedisPassword.of(input.required("password").asText()));
        LettuceClientConfiguration clientConfiguration = LettuceClientConfiguration.builder()
                .commandTimeout(Duration.ofSeconds(5)).shutdownTimeout(Duration.ofSeconds(1)).build();
        LettuceConnectionFactory factory = new LettuceConnectionFactory(configuration, clientConfiguration);
        StpLogic previous = StpUtil.getStpLogic();
        String session = UUID.randomUUID().toString();
        try {
            factory.afterPropertiesSet();
            factory.start();
            StringRedisTemplate redis = new StringRedisTemplate(factory);
            StpUtil.setStpLogic(new StpLogic("file-download-expiry-check") {
                @Override public Object getLoginIdByToken(String token) { return session.equals(token) ? 7L : null; }
            });
            UserContext.setUserId(7L);
            UserContext.setTenantId(3L);
            UserContext.setUserName("standalone-expiry-check");
            UserContext.setAuthToken(session);

            // The public constructor uses the real system clock; no application configuration is changed.
            FileDownloadTickets tickets = new FileDownloadTickets(redis, json);
            FilePreviewRequest request = new FilePreviewRequest("PUBLIC", null, 41L, null, null, null, null, null, null, null, null);
            long issuedBefore = System.currentTimeMillis();
            FileDownloadTickets.Access access = tickets.issue(request, "standalone-expiry-sample", 2);
            long issuedAfter = System.currentTimeMillis();
            check(access.url().startsWith("/api/auth/system/file/download?token="), "normal download path");
            String token = access.url().substring(access.url().lastIndexOf('=') + 1);
            check(token.matches("[A-Za-z0-9_-]{43}"), "random ticket format");
            String key = "auth:file-download:v1:" + FilePreviewContent.digest(token);
            check(access.expiresAt() >= issuedBefore + 2000 && access.expiresAt() <= issuedAfter + 2000, "real-clock expiry timestamp");
            Long remaining = redis.getExpire(key, TimeUnit.MILLISECONDS);
            check(remaining != null && remaining > 0 && remaining <= 2000, "real Redis TTL");
            FileDownloadTickets.Ticket ticket = tickets.verify(token);
            check(Long.valueOf(41L).equals(ticket.request().fileId()), "ticket usable before expiry");
            check(ticket.expiresAt() == access.expiresAt(), "stored expiry matches returned expiry");

            // Redis starts its TTL on SET; first-use serialization can finish after issuedAt.
            // Wait from the completed issue operation so both expiry boundaries have passed.
            long waitMillis = Math.max(0, issuedAfter + 2000 - System.currentTimeMillis()) + 150;
            check(waitMillis <= 2150, "bounded natural wait");
            long waitStarted = System.nanoTime();
            Thread.sleep(waitMillis);
            long waitedMillis = TimeUnit.NANOSECONDS.toMillis(System.nanoTime() - waitStarted);
            check(System.currentTimeMillis() >= access.expiresAt(), "natural expiry reached");
            Long expiredRemaining = redis.getExpire(key, TimeUnit.MILLISECONDS);
            check(Long.valueOf(-2L).equals(expiredRemaining), "Redis removes expired ticket naturally, remaining=" + expiredRemaining);
            try {
                tickets.verify(token);
                throw new AssertionError("expired ticket was accepted");
            } catch (ServiceException failure) {
                check(Integer.valueOf(410).equals(failure.getCode()), "same ticket rejected after expiry");
            }
            System.out.println("FILE_DOWNLOAD_EXPIRY_REDIS: assertions=" + assertions
                    + "; ttlMillis=2000; naturalWaitMillis=" + waitedMillis
                    + "; redisDatabase=" + configuration.getDatabase()
                    + "; identity_controlled=true; real_clock=true; http=false; explicit_deletes=0");
        } finally {
            UserContext.clear();
            StpUtil.setStpLogic(previous);
            factory.destroy();
        }
    }

    private static void check(boolean valid, String label) {
        if (!valid) throw new AssertionError(label);
        assertions++;
    }
}

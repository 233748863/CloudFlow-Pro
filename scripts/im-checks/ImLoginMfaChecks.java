package com.cloudflow.auth.im;

import cn.hutool.core.codec.Base32;
import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.TotpSecretCipher;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.core.exception.ServiceException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImLoginMfaChecks {
    private static final String INVALID = "IM_LOGIN_CHALLENGE_INVALID";
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final ImProperties properties;
    private final ImLoginAccounts accounts;
    private final ImLoginChallenges.Context context;
    private final ImLoginAccounts.Account account;
    private final List<String> owned = new ArrayList<>();
    private final AtomicInteger assertions = new AtomicInteger();
    private final AtomicInteger failures = new AtomicInteger();
    private final AtomicInteger logs = new AtomicInteger();
    private final String browser = ImLoginChallenges.randomToken();
    private final byte[] secret = ImLoginChallenges.randomToken().substring(0, 20).getBytes(java.nio.charset.StandardCharsets.US_ASCII);
    private StringRedisTemplate redis;
    private ImLoginMfaChallenges challenges;
    private ImLoginMfa mfa;

    ImLoginMfaChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, ImProperties properties,
            ImLoginAccounts accounts, ImLoginChallenges.Context context, ImLoginAccounts.Account account) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.properties = properties;
        this.accounts = accounts;
        this.context = context;
        this.account = account;
    }

    void run() {
        Config configuration = new Config();
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new AssertionError("Owned Redis required");
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionPoolSize(8).setConnectionMinimumIdleSize(1);
        RedissonClient client = Redisson.create(configuration);
        RedissonClient secondClient = Redisson.create(configuration);
        ExecutorService pool = Executors.newFixedThreadPool(12);
        try {
            redis = template(client);
            ImSecretCipher cipher = new ImSecretCipher(properties);
            ImLoginRedirects redirects = new ImLoginRedirects(properties);
            challenges = new ImLoginMfaChallenges(redis, cipher, redirects, new ObjectMapper());
            ImLoginMfaChallenges second = new ImLoginMfaChallenges(template(secondClient), cipher, redirects, new ObjectMapper());
            TotpProperties totpProperties = new TotpProperties();
            totpProperties.setEnabled(true);
            totpProperties.setEncryptionKey(ImLoginChallenges.randomToken());
            TotpSecretCipher totpCipher = new TotpSecretCipher(totpProperties);
            TotpService totp = new TotpService(sessions.getMapper(SysUserTotpMapper.class), totpCipher, totpProperties, redis, new ObjectMapper(), null);
            mfa = service(challenges, totp);
            check(!mfa.required(account), "unenrolled mapped account does not require MFA");
            rejected(() -> mfa.issue(proof(), browser), INVALID);
            jdbc.update("INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled,enabled_at) VALUES(?,?,?,1,NOW())",
                    account.tenantId(), account.userId(), totpCipher.encrypt(Base32.encode(secret)));
            check(mfa.required(account), "enrolled local user always requires MFA");
            storage(cipher, redirects, second);
            String incorrect = issue();
            rejected(() -> mfa.verify(incorrect, browser, "invalid", null), "IM_LOGIN_MFA_INVALID");
            equal(1, failures.get(), "wrong code increments account lock counter");
            equal(1, logs.get(), "wrong code invokes safe login audit");
            rejected(() -> mfa.verify(incorrect, browser, code(), null), INVALID);
            unused("incorrect code never consumes a TOTP step");
            String valid = issue();
            String validCode = code();
            equal(account, mfa.verify(valid, browser, validCode, null).account(), "real TOTP accepts mapped external identity");
            check(jdbc.queryForObject("SELECT last_used_step FROM sys_user_totp WHERE tenant_id=? AND user_id=?", Long.class,
                    account.tenantId(), account.userId()) != null, "real MySQL TOTP step consumed");
            rejected(() -> mfa.verify(issue(), browser, validCode, null), "IM_LOGIN_MFA_INVALID");
            resetStep();
            race(pool, service(second, totp));
            resetStep();
            passwordClaim(pool, totp, totpCipher, totpProperties, template(secondClient));
            resetStep();
            configurationChanges(totpProperties, totp);
            String disabled = issue();
            jdbc.update("UPDATE sys_user_totp SET enabled=0 WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
            rejected(() -> mfa.verify(disabled, browser, code(), null), "IM_LOGIN_MFA_INVALID");
            unused("disabled TOTP cannot be silently accepted");
            jdbc.update("UPDATE sys_user_totp SET enabled=1 WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
            TotpService changing = new TotpService(sessions.getMapper(SysUserTotpMapper.class), totpCipher, totpProperties, redis, new ObjectMapper(), null) {
                @Override public boolean verifyLoginCode(Long userId, Long tenantId, String value) {
                    boolean accepted = super.verifyLoginCode(userId, tenantId, value);
                    jdbc.update("UPDATE sys_im_user_mapping SET version=version+1 WHERE mapping_id=?", account.mappingId());
                    return accepted;
                }
            };
            ImLoginMfa raced = service(challenges, changing);
            String changed = issue();
            rejected(() -> raced.verify(changed, browser, code(), null), "IM_LOGIN_ACCOUNT_UNAVAILABLE");
            jdbc.update("UPDATE sys_im_user_mapping SET version=? WHERE mapping_id=?", account.mappingVersion(), account.mappingId());
            check(!proof().toString().contains(account.externalUserId()), "MFA proof string hides identity");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=? AND user_id=?", Integer.class,
                    account.tenantId(), account.userId()), "MFA never grants roles");
        } catch (Exception failure) {
            throw new AssertionError("IM MFA checks failed", failure);
        } finally {
            pool.shutdownNow();
            try {
                if (!pool.awaitTermination(20, TimeUnit.SECONDS)) throw new AssertionError("MFA workers still running");
                if (redis != null) {
                    if (!owned.isEmpty()) redis.delete(owned);
                    for (String key : owned) check(!Boolean.TRUE.equals(redis.hasKey(key)), "owned MFA key removed");
                    System.out.println("G4_IM_LOGIN_MFA_CLEANUP: owned_keys=" + owned.size() + "; remaining=0; shared_flush=false");
                }
                jdbc.update("DELETE FROM sys_user_totp WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
            } catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
            finally { secondClient.shutdown(); client.shutdown(); }
        }
        System.out.println("G4_IM_LOGIN_MFA_DATABASE: assertions=" + assertions.get()
                + "; failed=0; real_mysql=true; real_redis=true; clients=2; real_totp=true; vendor_identity=fixture; blacklist_lock_audit=controlled; tokens_issued=0; production_modified=false");
    }

    private void storage(ImSecretCipher cipher, ImLoginRedirects redirects, ImLoginMfaChallenges second) throws Exception {
        String token = issue();
        String key = ImLoginMfaChallenges.key(token);
        check(!key.contains(token), "MFA bearer token absent from Redis key");
        Long ttl = redis.getExpire(key, TimeUnit.SECONDS);
        check(ttl != null && ttl > 290 && ttl <= 300, "MFA expires in five minutes");
        String raw = redis.opsForValue().get(key);
        check(raw != null && !raw.contains(account.externalUserId()) && !raw.contains(browser) && !raw.contains(token)
                && !raw.contains(context.callbackUrl()), "MFA identity and browser stored encrypted");
        String encrypted = raw.substring(raw.indexOf(':') + 1);
        rejected(() -> cipher.decrypt(account.tenantId(), "WECOM", ImSecretCipher.Field.LOGIN_CHALLENGE, encrypted), "IM_SECRET_UNAVAILABLE");
        for (String bad : List.of("", "abc", "A".repeat(42) + "B", "A".repeat(44))) rejected(() -> second.consume(bad, browser), INVALID);
        rejected(() -> second.consume(token, ImLoginChallenges.randomToken()), INVALID);
        equal(account, second.consume(token, browser).account(), "correct browser remains usable after wrong browser");
        rejected(() -> challenges.consume(token, browser), INVALID);
        String other = issue();
        redis.opsForValue().set(key, redis.opsForValue().get(ImLoginMfaChallenges.key(other)), Duration.ofSeconds(300));
        rejected(() -> second.consume(token, browser), INVALID);
        for (String bad : List.of("broken", "0:" + encrypted, (account.tenantId() + 1) + ":" + encrypted, "x".repeat(13000))) {
            redis.opsForValue().set(key, bad, Duration.ofSeconds(300));
            rejected(() -> second.consume(token, browser), INVALID);
        }
        ObjectMapper json = new ObjectMapper();
        String plain = cipher.decrypt(account.tenantId(), "WECOM", ImSecretCipher.Field.LOGIN_MFA, encrypted);
        ObjectNode stored = (ObjectNode) json.readTree(plain);
        for (String malformed : List.of(plain + "{}", plain.replaceFirst("\\{", "{\"proof\":null,"),
                json.writeValueAsString(stored.deepCopy().put("unexpected", true)),
                json.writeValueAsString(stored.deepCopy().putNull("proof")),
                json.writeValueAsString(stored.deepCopy().put("expiresAt", 0)))) {
            redis.opsForValue().set(key, account.tenantId() + ":" + cipher.encrypt(account.tenantId(), "WECOM", ImSecretCipher.Field.LOGIN_MFA, malformed), Duration.ofSeconds(300));
            rejected(() -> second.consume(token, browser), INVALID);
        }
        String expired = issue();
        redis.expire(ImLoginMfaChallenges.key(expired), Duration.ofMillis(20));
        Thread.sleep(80);
        rejected(() -> second.consume(expired, browser), INVALID);
        String persisted = issue();
        redis.persist(ImLoginMfaChallenges.key(persisted));
        rejected(() -> second.consume(persisted, browser), INVALID);
        String lost = issue();
        redis.delete(ImLoginMfaChallenges.key(lost));
        rejected(() -> second.consume(lost, browser), INVALID);
        String future = issue();
        ImLoginMfaChallenges ahead = new ImLoginMfaChallenges(redis, cipher, redirects, json, Clock.fixed(Instant.now().plusSeconds(301), ZoneOffset.UTC));
        rejected(() -> ahead.consume(future, browser), INVALID);
        ImLoginChallenges state = new ImLoginChallenges(redis, cipher, redirects, json);
        String authorization = state.issue(context, browser);
        owned.add(ImLoginChallenges.key(authorization));
        rejected(() -> second.consume(authorization, browser), INVALID);
        String mfaToken = issue();
        rejected(() -> state.consume(mfaToken, browser, context.purpose()), INVALID);
        ImLoginChallenges.Context binding = new ImLoginChallenges.Context(context.tenantId(), context.configId(), context.configVersion(),
                context.corpId(), context.agentId(), context.callbackUrl(), context.redirectPath(), ImLoginChallenges.Purpose.BIND, null,
                account.userId(), account.userVersion(), ImLoginChallenges.digest(browser), ImLoginChallenges.digest("mfa-binding-purpose"), ImLoginChallenges.randomToken());
        rejected(() -> new ImLoginMfaChallenges.Proof(binding, account, System.currentTimeMillis()), INVALID);
        rejected(() -> new ImLoginMfaChallenges.Proof(context, account, 0), INVALID);
        rejected(() -> new ImLoginMfaChallenges.Proof(null, account, System.currentTimeMillis()), INVALID);
        rejected(() -> new ImLoginMfaChallenges.Proof(context, null, System.currentTimeMillis()), INVALID);
        unused("storage-only checks do not consume TOTP");
    }

    private void configurationChanges(TotpProperties totpProperties, TotpService totp) {
        String packageRemoved = issue();
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { rejected(() -> mfa.verify(packageRemoved, browser, code(), null), "IM_LOGIN_PACKAGE_UNAVAILABLE"); }
        finally { jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2,1788]' WHERE tenant_id=?", account.tenantId()); }
        rejected(() -> mfa.verify(packageRemoved, browser, code(), null), INVALID);
        unused("removing package function invalidates pending MFA before TOTP consumption");
        for (String column : List.of("version", "login_enabled", "status")) {
            String token = issue();
            if ("version".equals(column)) jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", account.configId());
            if ("login_enabled".equals(column)) jdbc.update("UPDATE sys_im_config SET login_enabled=0 WHERE config_id=?", account.configId());
            if ("status".equals(column)) jdbc.update("UPDATE sys_im_config SET status='DISABLED' WHERE config_id=?", account.configId());
            try { rejected(() -> mfa.verify(token, browser, code(), null), "IM_LOGIN_ACCOUNT_UNAVAILABLE"); }
            finally { jdbc.update("UPDATE sys_im_config SET version=?,login_enabled=1,status='ENABLED' WHERE config_id=?", account.configVersion(), account.configId()); }
            unused("changed configuration rejects before TOTP consumption");
        }
        String mapping = issue();
        jdbc.update("UPDATE sys_im_user_mapping SET version=version+1 WHERE mapping_id=?", account.mappingId());
        try { rejected(() -> mfa.verify(mapping, browser, code(), null), "IM_LOGIN_ACCOUNT_UNAVAILABLE"); }
        finally { jdbc.update("UPDATE sys_im_user_mapping SET version=? WHERE mapping_id=?", account.mappingVersion(), account.mappingId()); }
        String user = issue();
        jdbc.update("UPDATE sys_user SET version=version+1 WHERE user_id=?", account.userId());
        try { rejected(() -> mfa.verify(user, browser, code(), null), "IM_LOGIN_ACCOUNT_UNAVAILABLE"); }
        finally { jdbc.update("UPDATE sys_user SET version=? WHERE user_id=?", account.userVersion(), account.userId()); }
        unused("changed mapping or local user rejects before TOTP consumption");
        String disabled = issue();
        totpProperties.setEnabled(false);
        try {
            check(mfa.required(account), "disabling deployment does not bypass enrolled MFA");
            check(!totp.isEnabled(account.userId(), account.tenantId()), "legacy password feature flag behavior unchanged");
            serviceRejected(() -> mfa.verify(disabled, browser, code(), null));
        } finally { totpProperties.setEnabled(true); }
        rejected(() -> mfa.verify(disabled, browser, code(), null), INVALID);
        String missingKey = issue();
        String originalKey = totpProperties.getEncryptionKey();
        totpProperties.setEncryptionKey("");
        try { serviceRejected(() -> mfa.verify(missingKey, browser, code(), null)); }
        finally { totpProperties.setEncryptionKey(originalKey); }
        unused("unavailable TOTP safely rejects");
    }

    private void race(ExecutorService pool, ImLoginMfa second) throws Exception {
        String token = issue();
        String value = code();
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> pending = new ArrayList<>();
        for (int index = 0; index < 24; index++) {
            ImLoginMfa selected = index % 2 == 0 ? mfa : second;
            pending.add(pool.submit(() -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("MFA race start timeout");
                try { selected.verify(token, browser, value, null); return true; }
                catch (ImFailure failure) { equal(INVALID, failure.getReasonCode(), "losing MFA proof rejected"); return false; }
            }));
        }
        start.countDown();
        int winners = 0;
        for (Future<Boolean> result : pending) if (result.get(20, TimeUnit.SECONDS)) winners++;
        equal(1, winners, "one verified identity across two Redis clients and real TOTP");
        System.out.println("G4_IM_LOGIN_MFA_RACE: clients=2; callers=24; verified=" + winners + "; tokens_issued=0");
    }

    private ImLoginMfa service(ImLoginMfaChallenges store, TotpService totp) {
        LoginLockService locks = new LoginLockService() {
            @Override public void recordFailure(String username, Long tenantId) {
                equal(account.tenantId(), tenantId, "MFA failure belongs to mapped tenant");
                equal("im-login-member", username, "MFA failure belongs to mapped account");
                failures.incrementAndGet();
            }
        };
        ILoginLogService audit = (ILoginLogService) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ILoginLogService.class},
                (proxy, method, arguments) -> {
                    equal("recordLoginFailure", method.getName(), "MFA does not record premature login success");
                    equal("企业微信登录动态验证码错误", arguments[3], "MFA audit excludes credentials");
                    logs.incrementAndGet();
                    return null;
                });
        return new ImLoginMfa(accounts, store, totp, locks, audit);
    }

    private void passwordClaim(ExecutorService pool, TotpService issuer, TotpSecretCipher cipher, TotpProperties settings, StringRedisTemplate secondRedis) throws Exception {
        String token = issuer.issueLoginChallenge(accounts.recheck(account), null, System.currentTimeMillis());
        String key = "auth:totp:challenge:" + token;
        owned.add(key);
        CountDownLatch readers = new CountDownLatch(12);
        List<TotpService> clients = new ArrayList<>();
        for (StringRedisTemplate selected : List.of(redis, secondRedis)) {
            clients.add(new TotpService(sessions.getMapper(SysUserTotpMapper.class), cipher, settings, selected, new ObjectMapper(), null) {
                @Override public PendingLoginChallenge requireLoginChallenge(String value) {
                    PendingLoginChallenge challenge = super.requireLoginChallenge(value);
                    readers.countDown();
                    try { if (!readers.await(10, TimeUnit.SECONDS)) throw new AssertionError("Password challenge barrier timed out"); }
                    catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new AssertionError(failure); }
                    return challenge;
                }
            });
        }
        String value = code();
        AtomicInteger verified = new AtomicInteger();
        List<Future<Boolean>> pending = new ArrayList<>();
        for (int index = 0; index < 24; index++) {
            TotpService selected = clients.get(index % 2);
            pending.add(pool.submit(() -> {
                try {
                    TotpService.PendingLoginChallenge claimed = selected.claimLoginChallenge(token);
                    equal(account.userId(), claimed.payload().userId(), "password challenge belongs to expected account");
                    check(selected.verifyLoginCode(account.userId(), account.tenantId(), value), "exclusive password proof owner verifies real TOTP");
                    verified.incrementAndGet();
                    return true;
                } catch (ServiceException failure) { equal(400, failure.getCode(), "losing password challenge rejected before checking code"); return false; }
            }));
        }
        int winners = 0;
        for (Future<Boolean> result : pending) if (result.get(20, TimeUnit.SECONDS)) winners++;
        equal(1, winners, "one password proof owner across two actual Redis clients");
        equal(1, verified.get(), "losing requests cannot discard winner's proof or consume its TOTP");
        check(!Boolean.TRUE.equals(redis.hasKey(key)), "claimed password proof consumed once");
        System.out.println("G4_PASSWORD_TOTP_CLAIM_RACE: clients=2; callers=24; simultaneous_readers=12; claimed=" + winners + "; verified=" + verified.get() + "; real_mysql=true; real_redis=true");
    }

    private ImLoginMfaChallenges.Proof proof() { return new ImLoginMfaChallenges.Proof(context, account, System.currentTimeMillis()); }
    private String issue() { String token = mfa.issue(proof(), browser); owned.add(ImLoginMfaChallenges.key(token)); return token; }
    private void resetStep() { jdbc.update("UPDATE sys_user_totp SET last_used_step=NULL WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId()); }
    private void unused(String message) { equal(null, jdbc.queryForObject("SELECT last_used_step FROM sys_user_totp WHERE tenant_id=? AND user_id=?", Long.class, account.tenantId(), account.userId()), message); }
    private String code() {
        try {
            long step = Instant.now().getEpochSecond() / 30 + 1;
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(Long.BYTES).putLong(step).array());
            int offset = hash[hash.length - 1] & 15;
            int number = ByteBuffer.wrap(hash, offset, 4).getInt() & Integer.MAX_VALUE;
            return String.format(Locale.ROOT, "%06d", number % 1000000);
        } catch (Exception failure) { throw new AssertionError(failure); }
    }
    private static StringRedisTemplate template(RedissonClient client) {
        StringRedisTemplate template = new StringRedisTemplate(new RedissonConnectionFactory(client));
        template.afterPropertiesSet();
        return template;
    }
    private void serviceRejected(Runnable operation) {
        try { operation.run(); throw new AssertionError("Unavailable TOTP accepted"); }
        catch (ServiceException expected) { check(true, "unavailable TOTP rejected"); }
    }
    private void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe rejection reason"); }
    }
    private void check(boolean accepted, String message) { assertions.incrementAndGet(); if (!accepted) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

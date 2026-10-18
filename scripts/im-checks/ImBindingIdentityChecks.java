package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.core.codec.Base32;
import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.TotpSecretCipher;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Proxy;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImBindingIdentityChecks {
    private static final String REQUIRED = "IM_BINDING_VERIFICATION_REQUIRED";
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImActors actors;
    private final ImProperties properties;
    private final BiFunction<Long, Long, String> login;
    private final Consumer<String> currentToken;
    private final long tenantId = 8100000000L + new java.security.SecureRandom().nextInt(100000000);
    private final long userId = tenantId + 100000000;
    private final long roleId = userId + 100000000;
    private final String password = ImLoginChallenges.randomToken();
    private final byte[] secret = ImLoginChallenges.randomToken().substring(0, 20).getBytes(StandardCharsets.US_ASCII);
    private final AtomicInteger assertions = new AtomicInteger();
    private final AtomicInteger failures = new AtomicInteger();
    private final AtomicBoolean banned = new AtomicBoolean();
    private final AtomicBoolean locked = new AtomicBoolean();
    private final AtomicBoolean auditFails = new AtomicBoolean();
    private final List<String> ownedKeys = new ArrayList<>();
    private final List<String> ownedTokens = new ArrayList<>();
    private final String address = "198.18." + (tenantId % 200) + "." + (userId % 200 + 1);
    private StringRedisTemplate redis;
    private ImBindingProofs proofs;
    private ImBindingIdentity service;
    private String token;
    private String encodedPassword;
    private TotpProperties totpProperties;
    private TotpSecretCipher totpCipher;

    ImBindingIdentityChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions, ImActors actors,
            ImProperties properties, BiFunction<Long, Long, String> login, Consumer<String> currentToken) {
        this.jdbc = jdbc;
        this.database = database;
        this.sessions = sessions;
        this.actors = actors;
        this.properties = properties;
        this.login = login;
        this.currentToken = currentToken;
    }

    void run() throws Exception { run(false); }

    void run(boolean includeBindingFlow) throws Exception {
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String redisPassword = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || redisPassword == null || redisPassword.isBlank()) throw new AssertionError("Owned Redis required");
        Config configuration = new Config();
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(redisPassword)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(8);
        RedissonClient first = Redisson.create(configuration);
        RedissonClient second = Redisson.create(configuration);
        try {
            redis = template(first);
            proofs = new ImBindingProofs(redis, new ImSecretCipher(properties), new ObjectMapper());
            PasswordService passwords = new PasswordService(sessions.getMapper(SysUserMapper.class), sessions.getMapper(SysAuditLogMapper.class), new TenantConfigProperties());
            encodedPassword = passwords.encodePassword(password);
            fixtures();
            token = newSession();
            ImBindingProofs.Identity identity = rawIdentity(ImBindingAction.BIND);
            ownedKeys.add(ImBindingProofs.key(identity));
            ownedKeys.add("cloudflow:im:login-limit:ip:" + ImLoginChallenges.digest(address));
            ownedKeys.add("cloudflow:im:login-limit:account:" + tenantId + ":" + userId);
            totpProperties = new TotpProperties();
            totpProperties.setEnabled(true);
            totpProperties.setEncryptionKey(ImLoginChallenges.randomToken());
            totpCipher = new TotpSecretCipher(totpProperties);
            TotpService totp = new TotpService(sessions.getMapper(SysUserTotpMapper.class), totpCipher, totpProperties, redis, new ObjectMapper(), null);
            service = service(passwords, totp);
            access();
            credentials(passwords, totp);
            storage(template(second));
            rate();
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=?", Integer.class, tenantId), "identity stage never writes binding");
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=?", Integer.class, tenantId), "no roles added by verification");
            equal(encodedPassword, jdbc.queryForObject("SELECT password FROM sys_user WHERE user_id=?", String.class, userId), "password unchanged by verification");
            String logs = jdbc.queryForObject("SELECT COALESCE(GROUP_CONCAT(CONCAT_WS('|',audit_name,audit_field,before_val,after_val)), '') FROM sys_audit_log WHERE tenant_id=?", String.class, tenantId);
            check(!logs.contains(password) && !logs.contains(encodedPassword) && !logs.contains(token), "audit hides credentials and session");
            check(!new ObjectMapper().writeValueAsString(new ImBindingIdentity.Credentials(password, "123456")).contains(password), "credential JSON is write-only");
            check(!new ImBindingIdentity.Credentials(password, "123456").toString().contains(password), "credential diagnostic redacted");
            if (includeBindingFlow) {
                new ImBindingFlowDatabaseChecks(jdbc, database, sessions, actors, properties, login, currentToken,
                        service, proofs, redis, tenantId, userId, roleId, token, password).run();
            }
        } finally {
            for (String issued : ownedTokens) StpUtil.logoutByTokenValue(issued);
            if (redis != null && !ownedKeys.isEmpty()) {
                redis.delete(ownedKeys);
                for (String key : ownedKeys) check(!Boolean.TRUE.equals(redis.hasKey(key)), "owned binding key removed");
            }
            second.shutdown();
            first.shutdown();
        }
        System.out.println("G4_IM_BINDING_IDENTITY: assertions=" + assertions.get() + "; failed=0; real_mysql=true; real_mybatis=true; real_redis=true; real_password=true; real_totp=true; session_store=memory; blacklist_and_lock=fixture; request=fixture; vendor_service=false; identity_phase_binding_writes=0; production_modified=false");
        System.out.println("G4_IM_BINDING_IDENTITY_CLEANUP: owned_keys=" + ownedKeys.size() + "; remaining=0; shared_flush=false; scratch_schema_cleanup=outer_runner");
    }

    private void fixtures() {
        equal(3, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1788 AND 1790 AND status='0'", Integer.class), "real formal self binding menus available");
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,deleted) VALUES(?,?,'本人绑定隔离验证','0',0)", tenantId, "im-proof-" + tenantId);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required,version) VALUES(?,?,?,'本人验证',?,'0',0,'0',0)", userId, tenantId, "im-proof-" + userId, encodedPassword);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES(?,?,'普通员工','employee',1,'0',0)", roleId, tenantId);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", userId, roleId, tenantId);
        for (long menuId : List.of(1788L, 1789L, 1790L)) jdbc.update("INSERT INTO sys_role_menu(role_id,tenant_id,menu_id) VALUES(?,?,?)", roleId, tenantId, menuId);
    }

    private void access() {
        equal(userId, actors.self(ImBindingAction.BIND.permission()).userId(), "non-admin can use own approved permission");
        rejected(() -> actors.management(ImBindingAction.BIND.permission()), "IM_PERMISSION_DENIED");
        rejected(() -> actors.self("system:im:config:manage"), "IM_PERMISSION_DENIED");
        rejected(() -> actors.self(null), "IM_PERMISSION_DENIED");
        check(!service.status(ImBindingAction.BIND).verified(), "unverified session starts without proof");
        rejected(() -> service.requireRecent(ImBindingAction.BIND), REQUIRED);
        jdbc.update("UPDATE sys_role SET status='1' WHERE role_id=?", roleId);
        rejected(() -> service.status(ImBindingAction.BIND), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_role SET status='0' WHERE role_id=?", roleId);
        jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[2,1788]' WHERE tenant_id=?", tenantId, tenantId);
        rejected(() -> service.status(ImBindingAction.BIND), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2,1788,1789]' WHERE tenant_id=?", tenantId);
        check(!service.status(ImBindingAction.BIND).verified(), "selected own action passes package intersection");
        rejected(() -> service.status(ImBindingAction.UNBIND), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId);
    }

    private void credentials(PasswordService passwords, TotpService totp) {
        resetLimits();
        rejected(() -> authenticate("incorrect", null), REQUIRED);
        equal(1, failures.get(), "wrong password records failed attempt");
        rejected(() -> service.requireRecent(ImBindingAction.BIND), REQUIRED);
        check(authenticate(password, null).verified(), "actual BCrypt verifies local password");
        ImBindingIdentity.Verification firstVerified = service.requireRecent(ImBindingAction.BIND);
        rejected(() -> service.requireRecent(ImBindingAction.UNBIND), REQUIRED);
        String alternate = newSession();
        ownedKeys.add("cloudflow:im:binding-proof:" + tenantId + ":" + userId + ":" + ImLoginChallenges.digest(alternate));
        rejected(() -> service.requireRecent(ImBindingAction.BIND), REQUIRED);
        currentToken.accept(token);
        service.consume(firstVerified);
        rejected(() -> service.consume(firstVerified), REQUIRED);
        resetLimits();
        jdbc.update("INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled,enabled_at) VALUES(?,?,?,1,NOW())", tenantId, userId, totpCipher.encrypt(Base32.encode(secret)));
        check(service.status(ImBindingAction.BIND).totpRequired(), "enrolled account advertises dynamic code");
        jdbc.update("UPDATE sys_user_totp SET enabled=2 WHERE tenant_id=? AND user_id=?", tenantId, userId);
        rejected(() -> service.status(ImBindingAction.BIND), "IM_BINDING_VERIFICATION_UNAVAILABLE");
        jdbc.update("UPDATE sys_user_totp SET enabled=1 WHERE tenant_id=? AND user_id=?", tenantId, userId);
        rejected(() -> authenticate(password, null), REQUIRED);
        String acceptedCode = code();
        check(authenticate(password, acceptedCode).verified(), "actual TOTP verification succeeds");
        ImBindingIdentity.Verification enrolled = service.requireRecent(ImBindingAction.BIND);
        rejected(() -> authenticate(password, acceptedCode), REQUIRED);
        String originalCiphertext = jdbc.queryForObject("SELECT secret_ciphertext FROM sys_user_totp WHERE tenant_id=? AND user_id=?", String.class, tenantId, userId);
        jdbc.update("UPDATE sys_user_totp SET secret_ciphertext=? WHERE tenant_id=? AND user_id=?", totpCipher.encrypt(Base32.encode(new byte[20])), tenantId, userId);
        rejected(() -> service.consume(enrolled), REQUIRED);
        jdbc.update("UPDATE sys_user_totp SET secret_ciphertext=? WHERE tenant_id=? AND user_id=?", originalCiphertext, tenantId, userId);
        jdbc.update("UPDATE sys_user_totp SET enabled=0 WHERE tenant_id=? AND user_id=?", tenantId, userId);
        rejected(() -> service.consume(enrolled), REQUIRED);
        jdbc.update("UPDATE sys_user_totp SET enabled=1,last_used_step=NULL WHERE tenant_id=? AND user_id=?", tenantId, userId);
        totpProperties.setEnabled(false);
        try { authenticate(password, code()); throw new AssertionError("disabled dynamic code deployment must deny enrolled account"); }
        catch (com.cloudflow.common.core.exception.ServiceException failure) { check(true, "disabled deployment does not bypass TOTP enrollment"); }
        totpProperties.setEnabled(true);
        jdbc.update("DELETE FROM sys_user_totp WHERE tenant_id=? AND user_id=?", tenantId, userId);
        resetLimits();
        auditFails.set(true);
        redis.delete(ownedKeys.get(0));
        rejected(() -> authenticate(password, null), "IM_AUDIT_UNAVAILABLE");
        rejected(() -> service.requireRecent(ImBindingAction.BIND), REQUIRED);
        auditFails.set(false);
        check(authenticate(password, null).verified(), "verification recovers after safe audit failure");
        ImBindingIdentity.Verification current = service.requireRecent(ImBindingAction.BIND);
        jdbc.update("UPDATE sys_tenant SET expire_time=NOW()-INTERVAL 1 SECOND WHERE tenant_id=?", tenantId);
        rejected(() -> service.consume(current), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=?", tenantId);
        jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=1789");
        rejected(() -> service.consume(current), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=1789");
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", userId);
        rejected(() -> service.consume(current), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET status='0',deleted=1 WHERE user_id=?", userId);
        rejected(() -> service.consume(current), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET deleted=0 WHERE user_id=?", userId);
        jdbc.update("UPDATE sys_user SET password=? WHERE user_id=?", passwords.encodePassword("replacement"), userId);
        rejected(() -> service.consume(current), REQUIRED);
        jdbc.update("UPDATE sys_user SET password=?,version=version+1 WHERE user_id=?", encodedPassword, userId);
        rejected(() -> service.consume(current), REQUIRED);
        jdbc.update("UPDATE sys_user SET version=0 WHERE user_id=?", userId);
        banned.set(true);
        rejected(() -> service.requireRecent(ImBindingAction.BIND), "IM_AUTHENTICATION_REQUIRED");
        banned.set(false);
        locked.set(true);
        rejected(() -> service.requireRecent(ImBindingAction.BIND), "IM_AUTHENTICATION_REQUIRED");
        locked.set(false);
        jdbc.update("UPDATE sys_user SET pwd_reset_required='1' WHERE user_id=?", userId);
        rejected(() -> service.requireRecent(ImBindingAction.BIND), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET pwd_reset_required='0' WHERE user_id=?", userId);
        PasswordService racing = new PasswordService(null, null, null) {
            @Override public PasswordMatchResult matchesPassword(String incoming, String stored) {
                PasswordMatchResult result = passwords.matchesPassword(incoming, stored);
                jdbc.update("UPDATE sys_user SET version=version+1 WHERE user_id=?", userId);
                return result;
            }
        };
        resetLimits();
        redis.delete(ownedKeys.get(0));
        rejected(() -> service(racing, totp).authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request()), REQUIRED);
        rejected(() -> service.requireRecent(ImBindingAction.BIND), REQUIRED);
        jdbc.update("UPDATE sys_user SET version=0 WHERE user_id=?", userId);
        check(authenticate(password, null).verified(), "same session can verify after state recovery");
        StpUtil.logoutByTokenValue(token);
        rejected(() -> service.requireRecent(ImBindingAction.BIND), "IM_AUTHENTICATION_REQUIRED");
        token = newSession();
        ownedKeys.add("cloudflow:im:binding-proof:" + tenantId + ":" + userId + ":" + ImLoginChallenges.digest(token));
    }

    private void storage(StringRedisTemplate alternate) throws Exception {
        ImBindingProofs.Identity identity = rawIdentity(ImBindingAction.BIND);
        String key = ImBindingProofs.key(identity);
        ownedKeys.add(key);
        ImBindingProofs.Ticket ticket = proofs.issue(identity);
        String stored = redis.opsForValue().get(key);
        check(stored != null && stored.startsWith("im1:") && !stored.contains(identity.credentialStamp()) && !key.contains(token), "proof encrypted and session token absent from key");
        check(redis.getExpire(key, TimeUnit.SECONDS) > 0 && redis.getExpire(key, TimeUnit.SECONDS) <= 300, "proof Redis lifetime bounded at 300 seconds");
        ImBindingProofs second = new ImBindingProofs(alternate, new ImSecretCipher(properties), new ObjectMapper());
        equal(ticket, second.read(identity), "second Redis client reads valid proof");
        rejected(() -> second.read(rawIdentity(ImBindingAction.UNBIND)), REQUIRED);
        ImBindingProofs late = new ImBindingProofs(redis, new ImSecretCipher(properties), new ObjectMapper(), Clock.fixed(Instant.ofEpochMilli(ticket.proof().expiresAt()), ZoneOffset.UTC));
        rejected(() -> late.read(identity), REQUIRED);
        ImBindingProofs early = new ImBindingProofs(redis, new ImSecretCipher(properties), new ObjectMapper(), Clock.fixed(Instant.ofEpochMilli(ticket.proof().issuedAt() - 1), ZoneOffset.UTC));
        rejected(() -> early.read(identity), REQUIRED);
        ImBindingProofs.Ticket replacement = proofs.issue(identity);
        rejected(() -> proofs.consume(identity, ticket), REQUIRED);
        equal(replacement, proofs.read(identity), "stale consumer cannot remove newer verification");
        redis.persist(key);
        rejected(() -> proofs.consume(identity, replacement), REQUIRED);
        proofs.issue(identity);
        redis.opsForValue().set(key, "invalid");
        rejected(() -> proofs.read(identity), REQUIRED);
        ExecutorService pool = Executors.newFixedThreadPool(12);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        ImBindingProofs.Ticket concurrent = proofs.issue(identity);
        try {
            for (int index = 0; index < 24; index++) {
                ImBindingProofs chosen = index % 2 == 0 ? proofs : second;
                results.add(pool.submit(() -> {
                    if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("binding start timeout");
                    try { chosen.consume(identity, concurrent); return true; }
                    catch (ImFailure failure) { equal(REQUIRED, failure.getReasonCode(), "concurrent loser denied"); return false; }
                }));
            }
            start.countDown();
            int winners = 0;
            for (Future<Boolean> result : results) if (result.get(15, TimeUnit.SECONDS)) winners++;
            equal(1, winners, "single-use proof across two Redis clients");
            System.out.println("G4_IM_BINDING_PROOF_RACE: clients=2; callers=24; consumed=" + winners + "; real_redis=true");
        } finally {
            pool.shutdownNow();
            check(pool.awaitTermination(20, TimeUnit.SECONDS), "binding proof workers stopped");
        }
        rejected(() -> proofs.read(identity), REQUIRED);
    }

    private void rate() {
        resetLimits();
        for (int attempt = 0; attempt < 5; attempt++) rejected(() -> authenticate("incorrect", null), REQUIRED);
        rejected(() -> authenticate(password, null), "IM_LOGIN_RATE_LIMITED");
        resetLimits();
    }

    private ImBindingIdentity service(PasswordService passwords, TotpService totp) {
        ISysUserBlacklistService blacklist = (ISysUserBlacklistService) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ISysUserBlacklistService.class},
                (proxy, method, arguments) -> { if (method.getName().equals("isBanned")) return banned.get(); throw new UnsupportedOperationException(); });
        LoginLockService locks = new LoginLockService() {
            @Override public boolean isLocked(String userName, Long tenant) { return locked.get(); }
            @Override public void recordFailure(String userName, Long tenant) { failures.incrementAndGet(); }
        };
        SysAuditLogMapper real = sessions.getMapper(SysAuditLogMapper.class);
        SysAuditLogMapper audits = (SysAuditLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SysAuditLogMapper.class},
                (proxy, method, arguments) -> {
                    if (auditFails.get()) throw new IllegalStateException("controlled-binding-audit-failure");
                    try { return method.invoke(real, arguments); }
                    catch (java.lang.reflect.InvocationTargetException failure) { throw failure.getCause(); }
                });
        return new ImBindingIdentity(actors, database, sessions.getMapper(SysUserTotpMapper.class), passwords, totp, blacklist, locks,
                new ImLoginRequests(properties, sessions.getMapper(ImMapper.class), redis), proofs, audits);
    }

    private ImBindingProofs.Identity rawIdentity(ImBindingAction action) {
        return new ImBindingProofs.Identity(tenantId, userId, 0, ImLoginChallenges.digest(token), ImLoginChallenges.digest("independent-test-stamp"), action);
    }

    private ImBindingIdentity.State authenticate(String incoming, String code) { return service.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(incoming, code), request()); }
    private HttpServletRequest request() { return ImLoginFlowDatabaseChecks.request(address, true, Map.of("Origin", List.of("https://cloudflow.example")), List.of()); }
    private String newSession() { String issued = login.apply(userId, tenantId); ownedTokens.add(issued); return issued; }
    private void resetLimits() { redis.delete(List.of("cloudflow:im:login-limit:ip:" + ImLoginChallenges.digest(address), "cloudflow:im:login-limit:account:" + tenantId + ":" + userId)); }
    private String code() {
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(Instant.now().getEpochSecond() / 30).array());
            int offset = hash[hash.length - 1] & 15;
            int binary = (hash[offset] & 127) << 24 | (hash[offset + 1] & 255) << 16 | (hash[offset + 2] & 255) << 8 | hash[offset + 3] & 255;
            return String.format(java.util.Locale.ROOT, "%06d", binary % 1000000);
        } catch (Exception failure) { throw new AssertionError(failure); }
    }
    private static StringRedisTemplate template(RedissonClient client) { StringRedisTemplate result = new StringRedisTemplate(new RedissonConnectionFactory(client)); result.afterPropertiesSet(); return result; }
    private void rejected(Runnable operation, String reason) { try { operation.run(); throw new AssertionError("Expected " + reason); } catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe binding failure"); } }
    private void check(boolean success, String message) { assertions.incrementAndGet(); if (!success) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

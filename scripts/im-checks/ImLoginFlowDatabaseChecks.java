package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoForRedisTemplate;
import cn.dev33.satoken.json.SaJsonTemplate;
import cn.dev33.satoken.json.SaJsonTemplateForJackson;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.hutool.core.codec.Base32;
import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysUserLoginHistoryMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.ForcePasswordChangeService;
import com.cloudflow.auth.service.ILegalAgreementService;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.IpLocationResolver;
import com.cloudflow.auth.service.LoginCompletionService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.LoginRiskNoticeService;
import com.cloudflow.auth.service.TotpSecretCipher;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.auth.service.UserDataScopeService;
import com.cloudflow.auth.service.UserLoginHistoryService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.session.LoginSessionPolicyService;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class ImLoginFlowDatabaseChecks {
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final ImDatabase database;
    private final ImProperties properties;
    private final ImLoginAccounts accounts;
    private final ImLoginAccounts.Account account;
    private final AtomicInteger assertions = new AtomicInteger();
    private final AtomicInteger providerCalls = new AtomicInteger();
    private final AtomicBoolean failAudit = new AtomicBoolean();
    private final AtomicBoolean failConsent = new AtomicBoolean();
    private final AtomicBoolean failCommit = new AtomicBoolean();
    private final AtomicReference<Runnable> providerHook = new AtomicReference<>(() -> { });
    private final String namespace = "g4-im-flow-" + UUID.randomUUID() + ":";
    private final List<String> issued = new ArrayList<>();
    private final byte[] secret = ImLoginChallenges.randomToken().substring(0, 20).getBytes(StandardCharsets.US_ASCII);
    private StringRedisTemplate redis;
    private ImLoginFlow flow;
    private TokenService tokens;
    private TotpProperties totpProperties;
    private TotpSecretCipher totpCipher;
    private int addressSequence;

    ImLoginFlowDatabaseChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, ImDatabase database, ImProperties properties,
            ImLoginAccounts accounts, ImLoginAccounts.Account account) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.database = database;
        this.properties = properties;
        this.accounts = accounts;
        this.account = account;
    }

    void run() {
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        SaJsonTemplate previousJson = SaManager.getSaJsonTemplate();
        StpLogic previousLogic = StpUtil.getStpLogic();
        Config configuration = new Config();
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new AssertionError("Owned Redis required");
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password)
                .setConnectionPoolSize(8).setConnectionMinimumIdleSize(1);
        RedissonClient client = Redisson.create(configuration);
        StringRedisTemplate raw = new StringRedisTemplate(new RedissonConnectionFactory(client));
        try {
            equal(Set.of(), raw.keys(namespace + "*"), "unique Redis namespace is empty");
            initialize(client);
            new ImLoginRequestChecks(jdbc, sessions.getMapper(com.cloudflow.auth.mapper.ImMapper.class), properties, redis, account).run();
            success();
            invalidation();
            failures();
            new ImLoginLockDatabaseChecks(jdbc, accounts, account).run();
            mfa();
            ImLoginHttpChecks.run(flow, properties, account, jdbc, tokens, this::resetLimit, totpCipher.encrypt(Base32.encode(secret)), this::code);
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE user_id=?", Integer.class, account.userId()), "login grants no roles");
            check(!new ImLoginFlow.Result(false, "private-challenge", "private-token", "/dashboard", true).toString().contains("private"), "result string hides secrets");
            System.out.println("G4_IM_LOGIN_FLOW_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_mybatis=true; real_redis=true; real_sa_token=true; real_totp=true; provider=fixture; request_response=controlled; log_legal_scope=controlled; production_modified=false");
        } finally {
            SaManager.setSaTokenDao(previousDao);
            SaManager.setSaJsonTemplate(previousJson);
            SaManager.setConfig(previousConfig);
            StpUtil.setStpLogic(previousLogic);
            try {
                jdbc.update("DELETE FROM sys_user_totp WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
                jdbc.update("DELETE FROM sys_user_login_history WHERE tenant_id=? AND user_id=?", account.tenantId(), account.userId());
            } finally {
                try {
                    Set<String> owned = raw.keys(namespace + "*");
                    if (owned != null && !owned.isEmpty()) raw.delete(owned);
                    equal(Set.of(), raw.keys(namespace + "*"), "owned Redis namespace cleaned");
                    System.out.println("G4_IM_LOGIN_FLOW_CLEANUP: owned_redis_remaining=0; shared_flush=false; immutable_audit_preserved_until_scratch_drop=true; production_modified=false");
                } finally { client.shutdown(); }
            }
        }
    }

    private void initialize(RedissonClient client) {
        RedissonConnectionFactory factory = new RedissonConnectionFactory(client);
        RedisSerializer<String> keys = new RedisSerializer<>() {
            @Override public byte[] serialize(String value) { return value == null ? null : (namespace + value).getBytes(StandardCharsets.UTF_8); }
            @Override public String deserialize(byte[] bytes) {
                if (bytes == null) return null;
                String value = new String(bytes, StandardCharsets.UTF_8);
                if (!value.startsWith(namespace)) throw new AssertionError("Foreign key rejected");
                return value.substring(namespace.length());
            }
        };
        redis = new StringRedisTemplate(factory);
        redis.setKeySerializer(keys);
        SaTokenDaoForRedisTemplate dao = new SaTokenDaoForRedisTemplate();
        dao.init(factory);
        dao.stringRedisTemplate.setKeySerializer(keys);
        SaManager.setSaTokenDao(dao);
        SaManager.setSaJsonTemplate(new SaJsonTemplateForJackson());
        SaManager.setConfig(new SaTokenConfig().setIsPrint(false).setIsLog(false).setDataRefreshPeriod(-1));
        StpUtil.setStpLogic(new StpLogic("login"));
        tokens = new TokenService(new LoginSessionPolicyService(sessions.getMapper(LoginSessionMapper.class),
                new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())))) {
            @Override public String createDetachedToken(Map<String, Object> user) {
                String value = super.createDetachedToken(user);
                issued.add(value);
                check(TransactionSynchronizationManager.isActualTransactionActive(), "token created inside final transaction");
                check(tokens.getCurrentTokenValue() == null, "detached issuance does not publish request token");
                if (failCommit.get()) TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                    @Override public void beforeCommit(boolean readOnly) { throw new IllegalStateException("controlled-commit-failure"); }
                });
                return value;
            }
        };
        ILegalAgreementService legal = proxy(ILegalAgreementService.class, (method, arguments) -> {
            if ("recordConsent".equals(method)) {
                if (failConsent.get()) throw new IllegalStateException("controlled-consent-failure");
            } else equal("assertCurrentReleaseAccepted", method, "only expected legal operations");
            return null;
        });
        ILoginLogService logs = proxy(ILoginLogService.class, (method, arguments) -> {
            check(Set.of("recordLoginSuccess", "recordLoginFailure").contains(method), "only expected login log operations");
            return null;
        });
        LoginLockService locks = new LoginLockService() {
            @Override public void clearFailures(String username, Long tenantId) { equal(account.tenantId(), tenantId, "clear failures belongs to mapped tenant"); }
            @Override public void recordFailure(String username, Long tenantId) { equal(account.tenantId(), tenantId, "failure belongs to mapped tenant"); }
        };
        ISysUserService users = proxy(ISysUserService.class, (method, arguments) -> {
            equal("findUserInfo", method, "common completion loads local identity");
            return new UserInfo(accounts.recheck(account), Set.of(), Set.of());
        });
        SysUserMapper userMapper = sessions.getMapper(SysUserMapper.class);
        UserDataScopeService scopes = new UserDataScopeService(null, null, null, null, null) {
            @Override public UserDataScopeSnapshot refresh(Long userId) {
                UserDataScopeSnapshot scope = new UserDataScopeSnapshot();
                scope.setUserId(userId); scope.setDsType(4); scope.setDsDeptIds(List.of()); return scope;
            }
        };
        LoginCompletionService completion = new LoginCompletionService(users, logs, userMapper,
                new UserLoginHistoryService(sessions.getMapper(SysUserLoginHistoryMapper.class), new IpLocationResolver()),
                new LoginRiskNoticeService(null), locks, null, new ForcePasswordChangeService(userMapper), scopes, tokens, legal);
        ImSecretCipher cipher = new ImSecretCipher(properties);
        ImLoginRedirects redirects = new ImLoginRedirects(properties);
        ImLoginChallenges challenges = new ImLoginChallenges(redis, cipher, redirects, new ObjectMapper());
        ImLoginMfaChallenges mfaChallenges = new ImLoginMfaChallenges(redis, cipher, redirects, new ObjectMapper());
        totpProperties = new TotpProperties(); totpProperties.setEnabled(true); totpProperties.setEncryptionKey(ImLoginChallenges.randomToken());
        totpCipher = new TotpSecretCipher(totpProperties);
        TotpService totp = new TotpService(sessions.getMapper(SysUserTotpMapper.class), totpCipher, totpProperties, redis, new ObjectMapper(), null);
        ImIdentityProvider identity = new ImIdentityProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public Member identify(WeComCredentials credentials, String code) {
                providerCalls.incrementAndGet();
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "provider exchange outside transaction");
                providerHook.getAndSet(() -> { }).run();
                return new Member(credentials.tenantId(), credentials.configId(), credentials.version(), credentials.corpId(), account.externalUserId());
            }
        };
        SysAuditLogMapper real = sessions.getMapper(SysAuditLogMapper.class);
        SysAuditLogMapper audits = (SysAuditLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SysAuditLogMapper.class}, (proxy, method, arguments) -> {
            if (failAudit.get()) throw new IllegalStateException("controlled-audit-failure");
            try { return method.invoke(real, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        });
        flow = new ImLoginFlow(accounts, new ImLoginAuthorization(challenges, redirects), challenges, mfaChallenges,
                new ImLoginMfa(accounts, mfaChallenges, totp, locks, logs), redirects,
                new ImLoginRequests(properties, sessions.getMapper(com.cloudflow.auth.mapper.ImMapper.class), redis), identity, database, legal, completion, tokens, audits);
    }

    private void success() {
        Attempt first = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        ImLoginFlow.Result signed = complete(first);
        check(!signed.requiresTotp() && signed.challenge() == null && signed.forcePasswordChange(), "unenrolled login preserves forced password change");
        Map<String, Object> user = tokens.getLoginUserByToken(signed.token());
        check(user != null && String.valueOf(account.userId()).equals(String.valueOf(user.get("userId"))), "real Sa token resolves mapped user");
        check(first.cookies.stream().anyMatch(cookie -> cookie.getName().equals("Authorization") && cookie.getValue().equals(signed.token()) && cookie.isHttpOnly() && cookie.getSecure()), "committed login publishes secure auth cookie");
        equal(1L, count("sys_audit_log"), "one committed login audit");
        String detail = jdbc.queryForObject("SELECT after_val FROM sys_audit_log WHERE tenant_id=?", String.class, account.tenantId());
        check(detail != null && !detail.contains(account.externalUserId()) && !detail.contains(signed.token())
                && !detail.contains(first.state), "immutable login audit excludes external identifier and credentials");
        int calls = providerCalls.get();
        rejected(() -> complete(first), "IM_LOGIN_CHALLENGE_INVALID");
        equal(calls, providerCalls.get(), "replayed state never calls provider");
        resetLimit();
        ImLoginFlow.Result second = complete(begin(ImLoginChallenges.Purpose.EMBEDDED_LOGIN));
        check(tokens.getLoginUserByToken(signed.token()) == null && tokens.getLoginUserByToken(second.token()) != null, "new login replaces old session");
        equal(2L, count("sys_user_login_history"), "real common login history persisted");
        tokens.deleteToken(second.token());
    }

    private void invalidation() {
        resetLimit();
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { rejected(() -> begin(ImLoginChallenges.Purpose.SCAN_LOGIN), "IM_LOGIN_PACKAGE_UNAVAILABLE"); }
        finally { restorePackage(); }
        Attempt revoked = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        int calls = providerCalls.get();
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { rejected(() -> complete(revoked), "IM_LOGIN_PACKAGE_UNAVAILABLE"); }
        finally { restorePackage(); }
        equal(calls, providerCalls.get(), "package rejection precedes provider call");
        rejected(() -> complete(revoked), "IM_LOGIN_CHALLENGE_INVALID");
        Attempt duringProvider = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        providerHook.set(() -> jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId()));
        try { rejected(() -> complete(duringProvider), "IM_LOGIN_PACKAGE_UNAVAILABLE"); }
        finally { restorePackage(); }
        check(duringProvider.cookies.isEmpty(), "provider-time package removal publishes no cookie");
        for (Change change : List.of(new Change("UPDATE sys_im_config SET status=? WHERE tenant_id=?", "DISABLED", "ENABLED"),
                new Change("UPDATE sys_im_user_mapping SET status=? WHERE tenant_id=?", "DISABLED", "ACTIVE"),
                new Change("UPDATE sys_user SET status=? WHERE tenant_id=?", "1", "0"))) {
            Attempt changed = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
            jdbc.update(change.sql(), change.disabled(), account.tenantId());
            try { rejected(() -> complete(changed), "IM_LOGIN_ACCOUNT_UNAVAILABLE"); }
            finally { jdbc.update(change.sql(), change.enabled(), account.tenantId()); }
            check(changed.cookies.isEmpty(), "changed identity publishes no cookie");
        }
    }

    private void failures() {
        for (AtomicBoolean failure : List.of(failAudit, failConsent, failCommit)) {
            resetLimit();
            long beforeAudit = count("sys_audit_log");
            long beforeHistory = count("sys_user_login_history");
            int beforeTokens = issued.size();
            Attempt attempt = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
            failure.set(true);
            try { rejected(() -> complete(attempt), null); }
            finally { failure.set(false); }
            equal(beforeTokens + (failure == failAudit ? 0 : 1), issued.size(), "injected failure occurs at intended issuance stage");
            check(attempt.cookies.isEmpty(), "failed transaction publishes no cookie");
            equal(beforeAudit, count("sys_audit_log"), "failed transaction rolls back audit");
            equal(beforeHistory, count("sys_user_login_history"), "failed transaction rolls back login history");
            for (String token : issued) check(tokens.getLoginUserByToken(token) == null, "failed candidate token revoked");
        }
    }

    private void mfa() {
        jdbc.update("INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled,enabled_at) VALUES(?,?,?,1,NOW())",
                account.tenantId(), account.userId(), totpCipher.encrypt(Base32.encode(secret)));
        resetLimit();
        Attempt attempt = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        long before = count("sys_audit_log");
        ImLoginFlow.Result pending = complete(attempt);
        check(pending.requiresTotp() && pending.token() == null, "enrolled user receives challenge only");
        equal(before, count("sys_audit_log"), "pending MFA records no success");
        check(attempt.cookies.stream().noneMatch(cookie -> cookie.getName().equals("Authorization")), "pending MFA publishes no auth cookie");
        attempt.cookies.clear();
        String submittedCode = code();
        ImLoginFlow.Result signed = flow.verify(pending.challenge(), submittedCode, attempt.request, attempt.response);
        check(!signed.requiresTotp() && tokens.getLoginUserByToken(signed.token()) != null, "real TOTP completes login");
        rejected(() -> flow.verify(pending.challenge(), code(), attempt.request, attempt.response), "IM_LOGIN_CHALLENGE_INVALID");
        tokens.deleteToken(signed.token());
        resetLimit();
        Attempt replay = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        ImLoginFlow.Result next = complete(replay);
        replay.cookies.clear();
        rejected(() -> flow.verify(next.challenge(), submittedCode, replay.request, replay.response), "IM_LOGIN_MFA_INVALID");
        check(replay.cookies.isEmpty(), "TOTP replay publishes no auth cookie");
        jdbc.update("UPDATE sys_user_totp SET last_used_step=NULL WHERE tenant_id=?", account.tenantId());
        resetLimit();
        Attempt removed = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        ImLoginFlow.Result waiting = complete(removed);
        removed.cookies.clear();
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2]' WHERE tenant_id=?", account.tenantId());
        try { rejected(() -> flow.verify(waiting.challenge(), code(), removed.request, removed.response), "IM_LOGIN_PACKAGE_UNAVAILABLE"); }
        finally { restorePackage(); }
        check(removed.cookies.isEmpty(), "MFA-time package removal publishes no cookie");
        equal(null, jdbc.queryForObject("SELECT last_used_step FROM sys_user_totp WHERE tenant_id=?", Long.class, account.tenantId()), "package removal does not consume TOTP");
        rejected(() -> flow.verify(waiting.challenge(), code(), removed.request, removed.response), "IM_LOGIN_CHALLENGE_INVALID");
        resetLimit();
        Attempt unavailable = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        ImLoginFlow.Result unavailableProof = complete(unavailable);
        unavailable.cookies.clear();
        totpProperties.setEnabled(false);
        try { rejected(() -> flow.verify(unavailableProof.challenge(), code(), unavailable.request, unavailable.response), null); }
        finally { totpProperties.setEnabled(true); }
        check(unavailable.cookies.isEmpty(), "disabled TOTP deployment never bypasses enrollment");
        resetLimit();
        Attempt rollback = begin(ImLoginChallenges.Purpose.SCAN_LOGIN);
        ImLoginFlow.Result rollbackProof = complete(rollback);
        rollback.cookies.clear();
        int beforeTokens = issued.size();
        long beforeAudit = count("sys_audit_log");
        failCommit.set(true);
        try { rejected(() -> flow.verify(rollbackProof.challenge(), code(), rollback.request, rollback.response), null); }
        finally { failCommit.set(false); }
        equal(beforeTokens + 1, issued.size(), "MFA commit failure follows actual token issuance");
        equal(beforeAudit, count("sys_audit_log"), "MFA failed commit rolls back audit");
        equal(null, jdbc.queryForObject("SELECT last_used_step FROM sys_user_totp WHERE tenant_id=?", Long.class, account.tenantId()), "failed commit rolls back TOTP consumption");
        check(rollback.cookies.isEmpty() && tokens.getLoginUserByToken(issued.get(issued.size() - 1)) == null, "MFA failed commit revokes token without cookie");
        rejected(() -> flow.verify(rollbackProof.challenge(), code(), rollback.request, rollback.response), "IM_LOGIN_CHALLENGE_INVALID");
    }

    private Attempt begin(ImLoginChallenges.Purpose purpose) {
        List<Cookie> cookies = new ArrayList<>();
        HttpServletResponse response = response(cookies);
        String address = "192.0.2." + (++addressSequence);
        HttpServletRequest request = request(address, true, Map.of(), List.of());
        ImLoginAuthorization.Grant grant = flow.begin("im-login-tenant", purpose, "/dashboard", null, request, response);
        equal(300, grant.expiresIn(), "grant lifetime");
        String state = null;
        for (String part : URI.create(grant.authorizationUrl()).getRawQuery().split("&")) {
            if (part.startsWith("state=")) state = URLDecoder.decode(part.substring(6), StandardCharsets.UTF_8);
        }
        check(state != null, "SDK authorization contains state");
        HttpServletRequest callback = request(address, true, Map.of(), List.copyOf(cookies));
        cookies.clear();
        return new Attempt(state, callback, response, cookies);
    }

    private ImLoginFlow.Result complete(Attempt attempt) { return flow.callback(attempt.state, "controlled-provider-code", attempt.request, attempt.response); }
    private void resetLimit() { redis.delete("cloudflow:im:login-limit:account:" + account.tenantId() + ":" + account.userId()); }
    private void restorePackage() { jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2,1788]' WHERE tenant_id=?", account.tenantId()); }
    private long count(String table) {
        String sql = switch (table) {
            case "sys_audit_log" -> "SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=?";
            case "sys_user_login_history" -> "SELECT COUNT(*) FROM sys_user_login_history WHERE tenant_id=?";
            default -> throw new AssertionError("Unexpected table");
        };
        return jdbc.queryForObject(sql, Long.class, account.tenantId());
    }
    private String code() {
        try {
            Mac mac = Mac.getInstance("HmacSHA1"); mac.init(new SecretKeySpec(secret, "HmacSHA1"));
            byte[] hash = mac.doFinal(ByteBuffer.allocate(8).putLong(Instant.now().getEpochSecond() / 30 + 1).array());
            return String.format(Locale.ROOT, "%06d", (ByteBuffer.wrap(hash, hash[hash.length - 1] & 15, 4).getInt() & Integer.MAX_VALUE) % 1000000);
        } catch (Exception failure) { throw new AssertionError(failure); }
    }
    static HttpServletRequest request(String address, boolean secure, Map<String, List<String>> headers, List<Cookie> cookies) {
        return proxy(HttpServletRequest.class, (method, arguments) -> switch (method) {
            case "getRemoteAddr" -> address;
            case "isSecure" -> secure;
            case "getCookies" -> cookies.toArray(Cookie[]::new);
            case "getHeader", "getHeaders" -> {
                List<String> values = headers.entrySet().stream().filter(entry -> entry.getKey().equalsIgnoreCase((String) arguments[0]))
                        .map(Map.Entry::getValue).findFirst().orElse(List.of());
                yield method.equals("getHeader") ? values.isEmpty() ? null : values.get(0) : Collections.enumeration(values);
            }
            case "getHeaderNames" -> Collections.enumeration(headers.keySet());
            case "getParameter" -> null;
            default -> throw new AssertionError("Unexpected request operation " + method);
        });
    }
    private HttpServletResponse response(List<Cookie> cookies) {
        return proxy(HttpServletResponse.class, (method, arguments) -> {
            equal("addCookie", method, "only expected response operation");
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "cookie published only outside transaction");
            cookies.add((Cookie) arguments[0]); return null;
        });
    }
    private static <Type> Type proxy(Class<Type> type, java.util.function.BiFunction<String, Object[], Object> call) {
        return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, arguments) -> call.apply(method.getName(), arguments)));
    }
    private void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected rejection"); }
        catch (RuntimeException failure) {
            if (reason != null) check(failure instanceof ImFailure rejected && reason.equals(rejected.getReasonCode()), "expected safe rejection " + reason + ", actual=" + failure.getClass().getSimpleName());
            else check(true, "injected failure rejected");
        }
    }
    private void check(boolean success, String message) { assertions.incrementAndGet(); if (!success) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
    private record Attempt(String state, HttpServletRequest request, HttpServletResponse response, List<Cookie> cookies) { }
    private record Change(String sql, String disabled, String enabled) { }
}

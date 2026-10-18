package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.net.URLDecoder;
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
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.BiFunction;
import java.util.function.Consumer;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class ImBindingFlowDatabaseChecks {
    private static final String REQUIRED = "IM_BINDING_VERIFICATION_REQUIRED";
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImActors actors;
    private final ImProperties properties;
    private final BiFunction<Long, Long, String> login;
    private final Consumer<String> currentToken;
    private final ImBindingIdentity identities;
    private final ImBindingProofs proofs;
    private final StringRedisTemplate redis;
    private final long tenantId;
    private final long userId;
    private final long roleId;
    private final String token;
    private final String password;
    private final List<String> owned = new ArrayList<>();
    private final List<String> ownedTokens = new ArrayList<>();
    private final AtomicInteger assertions = new AtomicInteger();
    private final AtomicInteger providerCalls = new AtomicInteger();
    private final AtomicBoolean auditFails = new AtomicBoolean();
    private final AtomicReference<String> externalAccount = new AtomicReference<>("Bind.Member");
    private final AtomicReference<Runnable> providerHook = new AtomicReference<>(() -> { });
    private final String address;
    private ImBindingAccounts accounts;
    private ImBindingFlow flow;
    private ImBindingMembers members;
    private ImLoginChallenges challenges;
    private ImLoginRedirects redirects;
    private long configId;

    ImBindingFlowDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions, ImActors actors, ImProperties properties,
            BiFunction<Long, Long, String> login, Consumer<String> currentToken, ImBindingIdentity identities, ImBindingProofs proofs,
            StringRedisTemplate redis, long tenantId, long userId, long roleId, String token, String password) {
        this.jdbc = jdbc; this.database = database; this.sessions = sessions; this.actors = actors; this.properties = properties;
        this.login = login; this.currentToken = currentToken; this.identities = identities; this.proofs = proofs; this.redis = redis;
        this.tenantId = tenantId; this.userId = userId; this.roleId = roleId; this.token = token; this.password = password;
        this.address = "198.19." + (tenantId % 200) + "." + (userId % 200 + 1);
    }

    void run() throws Exception {
        try (ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            ImSecretCipher cipher = new ImSecretCipher(properties);
            redirects = new ImLoginRedirects(properties);
            ImConfigRules rules = new ImConfigRules(properties, cipher, validators.getValidator(), new ObjectMapper());
            TenantPermissionPolicyService permissions = new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class),
                    new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
            SysAuditLogMapper real = sessions.getMapper(SysAuditLogMapper.class);
            SysAuditLogMapper audits = (SysAuditLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SysAuditLogMapper.class},
                    (proxy, method, values) -> {
                        check(TransactionSynchronizationManager.isActualTransactionActive(), "binding audit shares mapping transaction");
                        if (auditFails.get()) throw new IllegalStateException("controlled-binding-write-audit-failure");
                        try { return method.invoke(real, values); }
                        catch (java.lang.reflect.InvocationTargetException failure) { throw failure.getCause(); }
                    });
            accounts = new ImBindingAccounts(actors, database, rules, redirects, permissions, audits);
            challenges = new ImLoginChallenges(redis, cipher, redirects, new ObjectMapper());
            members = new ImBindingMembers(redis, cipher, redirects, new ObjectMapper());
            ImIdentityProvider provider = new ImIdentityProvider() {
                @Override public String providerType() { return "WECOM"; }
                @Override public Member identify(WeComCredentials credentials, String code) {
                    check(!TransactionSynchronizationManager.isActualTransactionActive(), "remote identity exchange occurs outside SQL transaction");
                    providerCalls.incrementAndGet();
                    if (!"controlled-bind-code".equals(code)) throw ImFailure.remote();
                    providerHook.getAndSet(() -> { }).run();
                    return new Member(credentials.tenantId(), credentials.configId(), credentials.version(), credentials.corpId(), externalAccount.get());
                }
            };
            flow = new ImBindingFlow(identities, proofs, accounts, new ImLoginRequests(properties, sessions.getMapper(ImMapper.class), redis),
                    redirects, new ImLoginAuthorization(challenges, redirects), challenges, members, provider);
            owned.add("cloudflow:im:login-limit:ip:" + ImLoginChallenges.digest(address));
            owned.add("cloudflow:im:login-limit:account:" + tenantId + ":" + userId);
            fixtures(cipher);
            currentToken.accept(token);
            equal(null, accounts.mine(), "own binding initially absent");
            resetLimits();
            rejected(() -> flow.begin(request(List.of()), response(new ArrayList<>())), REQUIRED);
            happyPath();
            ownership();
            failures();
            storage(cipher);
            selfUnbind();
            management(permissions, audits);
            competingAccounts();
            String alternate = login.apply(userId, tenantId);
            ownedTokens.add(alternate);
            redis.delete("cloudflow:im:binding-proof:" + tenantId + ":" + userId + ":" + ImLoginChallenges.digest(token));
            new ImBindingHttpChecks(properties, jdbc, owned::add, this::resetLimits, tenantId, userId, token, alternate, password, address)
                    .run(accounts, identities, flow, new ImLoginRequests(properties, sessions.getMapper(ImMapper.class), redis), database, permissions, currentToken,
                            new ImBindingManagement(actors, database, identities, new ImLoginRequests(properties, sessions.getMapper(ImMapper.class), redis), permissions, audits));
            concurrent();
            equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=? AND user_id=?", Integer.class, tenantId, userId), "binding grants no new roles");
            equal(0, jdbc.queryForObject("SELECT version FROM sys_user WHERE user_id=?", Integer.class, userId), "binding preserves local account version");
            equal("0", jdbc.queryForObject("SELECT status FROM sys_user WHERE user_id=?", String.class, userId), "binding preserves account status");
            String audit = jdbc.queryForObject("SELECT COALESCE(GROUP_CONCAT(CONCAT_WS('|',audit_name,audit_field,before_val,after_val)), '') FROM sys_audit_log WHERE tenant_id=?", String.class, tenantId);
            check(!audit.contains("Bind.Member") && !audit.contains(token) && !audit.contains(password), "binding audits contain no external identity or credentials");
        } finally {
            for (String issued : ownedTokens) StpUtil.logoutByTokenValue(issued);
            currentToken.accept(token);
            redis.delete(owned);
            for (String key : owned) check(!Boolean.TRUE.equals(redis.hasKey(key)), "owned binding-flow key removed");
        }
        System.out.println("G4_IM_BINDING_FLOW_DATABASE: assertions=" + assertions.get() + "; failed=0; real_mysql=true; real_mybatis=true; real_redis=true; actual_binding_writes=true; actual_audit=true; provider_calls=" + providerCalls.get() + "; provider=fixture; session_store=memory; request_response=fixture; public_http=false; production_modified=false");
        System.out.println("G4_IM_BINDING_FLOW_CLEANUP: owned_keys=" + owned.size() + "; remaining=0; shared_flush=false; scratch_schema_cleanup=outer_runner");
    }

    private void fixtures(ImSecretCipher cipher) {
        jdbc.update("INSERT INTO sys_im_config(tenant_id,im_type,corp_id,agent_id,app_secret_encrypted,sync_enabled,login_enabled,message_enabled,todo_enabled,status,deleted,version) VALUES(?,'WECOM','bindingCorp','19',?,0,0,1,0,'ENABLED',0,0)",
                tenantId, cipher.encrypt(tenantId, "WECOM", ImSecretCipher.Field.APP_SECRET, "binding-provider-private-secret"));
        configId = jdbc.queryForObject("SELECT config_id FROM sys_im_config WHERE tenant_id=? AND im_type='WECOM'", Long.class, tenantId);
    }

    private void happyPath() {
        jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[2,1788,1789]' WHERE tenant_id=?", tenantId, tenantId);
        Attempt attempt = prepare();
        String memberToken = exchange(attempt);
        equal(0, count(), "provider callback alone never writes a binding");
        equal("Bind.Member", flow.pending(memberToken, request(attempt.cookies())).externalAccount(), "only same local session can inspect pending external account");
        ImBindingAccounts.Summary result = flow.bind(memberToken, request(attempt.cookies()));
        equal("SCAN_BIND", result.bindType(), "binding source is server-controlled");
        equal("ACTIVE", result.status(), "new verified binding becomes active");
        equal(1, count(), "one mapping inserted");
        equal(result, accounts.mine(), "own summary reads actual stored mapping");
        equal(userId, jdbc.queryForObject("SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=?", Long.class, tenantId), "local owner never comes from external identity");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_SELF_BIND'", Integer.class, tenantId), "one durable binding audit");
        check(!Boolean.TRUE.equals(redis.hasKey(ImBindingMembers.key(memberToken))), "external proof consumed after successful bind");
        rejected(() -> flow.bind(memberToken, request(attempt.cookies())), REQUIRED);
        equal(0, jdbc.queryForObject("SELECT login_enabled FROM sys_im_config WHERE tenant_id=?", Integer.class, tenantId), "binding never turns on disabled IM login");
        Attempt duplicate = prepare();
        String duplicateToken = exchange(duplicate);
        rejected(() -> flow.bind(duplicateToken, request(duplicate.cookies())), "IM_BINDING_CONFLICT");
        equal(result, accounts.mine(), "duplicate binding preserves original time and source");
        jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE tenant_id=?", tenantId);
        resetLimits();
        rejected(() -> flow.bind(duplicateToken, request(duplicate.cookies())), "IM_BINDING_CONFLICT");
        equal("DISABLED", accounts.mine().status(), "disabled binding cannot be self-reactivated");
        clearMappings();
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId);
    }

    private void ownership() {
        Attempt attempt = prepare();
        rejected(() -> flow.callback(attempt.state(), "controlled-bind-code", request(List.of())), "IM_LOGIN_CHALLENGE_INVALID");
        String memberToken = exchange(attempt);
        List<Cookie> otherBrowser = List.of(new Cookie("__Host-CloudFlowIM", ImLoginChallenges.randomToken()));
        rejected(() -> flow.pending(memberToken, request(otherBrowser)), REQUIRED);
        String alternate = login.apply(userId, tenantId);
        ownedTokens.add(alternate);
        owned.add("cloudflow:im:binding-proof:" + tenantId + ":" + userId + ":" + ImLoginChallenges.digest(alternate));
        resetLimits();
        identities.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
        rejected(() -> flow.pending(memberToken, request(attempt.cookies())), REQUIRED);
        currentToken.accept(token);
        resetLimits();
        identities.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
        rejected(() -> flow.pending(memberToken, request(attempt.cookies())), REQUIRED);
        equal(0, count(), "new verification cannot authorize older external state");
        Attempt current = prepare();
        int calls = providerCalls.get();
        jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[2,1788]' WHERE tenant_id=?", tenantId, tenantId);
        rejected(() -> flow.callback(current.state(), "controlled-bind-code", request(current.cookies())), "IM_PERMISSION_DENIED");
        equal(calls, providerCalls.get(), "revoked package blocks before provider request");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId);
        Attempt loginPurpose = prepare();
        rejected(() -> challenges.consumeLogin(loginPurpose.state(), cookieValue(loginPurpose)), "IM_LOGIN_CHALLENGE_INVALID");
        check(exchange(loginPurpose) != null, "wrong purpose does not consume valid binding state");
    }

    private void failures() {
        Attempt changed = prepare();
        jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId);
        rejected(() -> flow.callback(changed.state(), "controlled-bind-code", request(changed.cookies())), "IM_LOGIN_CHALLENGE_INVALID");
        jdbc.update("UPDATE sys_im_config SET version=0 WHERE config_id=?", configId);
        Attempt remoteFailed = prepare();
        rejected(() -> flow.callback(remoteFailed.state(), "invalid", request(remoteFailed.cookies())), "IM_PROVIDER_REJECTED");
        rejected(() -> flow.callback(remoteFailed.state(), "controlled-bind-code", request(remoteFailed.cookies())), "IM_LOGIN_CHALLENGE_INVALID");
        Attempt changedDuringProvider = prepare();
        providerHook.set(() -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId));
        rejected(() -> flow.callback(changedDuringProvider.state(), "controlled-bind-code", request(changedDuringProvider.cookies())), "IM_LOGIN_CHALLENGE_INVALID");
        jdbc.update("UPDATE sys_im_config SET version=0 WHERE config_id=?", configId);
        Attempt rotated = prepare();
        providerHook.set(() -> proofs.issue(identities.requireRecent(ImBindingAction.BIND).identity()));
        rejected(() -> flow.callback(rotated.state(), "controlled-bind-code", request(rotated.cookies())), REQUIRED);
        Attempt auditFailed = prepare();
        String auditToken = exchange(auditFailed);
        auditFails.set(true);
        rejected(() -> flow.bind(auditToken, request(auditFailed.cookies())), "IM_AUDIT_UNAVAILABLE");
        auditFails.set(false);
        equal(0, count(), "failed audit rolls back real binding insert");
        check(!Boolean.TRUE.equals(redis.hasKey(ImBindingMembers.key(auditToken))), "rolled-back write cannot replay consumed external proof");
        rejected(() -> identities.requireRecent(ImBindingAction.BIND), REQUIRED);
        Attempt revoked = prepare();
        String revokedToken = exchange(revoked);
        jdbc.update("UPDATE sys_role SET status='1' WHERE role_id=?", roleId);
        rejected(() -> flow.bind(revokedToken, request(revoked.cookies())), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_role SET status='0' WHERE role_id=?", roleId);
        Attempt expiredOwner = prepare();
        String expiredOwnerToken = exchange(expiredOwner);
        jdbc.update("UPDATE sys_user SET version=version+1 WHERE user_id=?", userId);
        rejected(() -> flow.bind(expiredOwnerToken, request(expiredOwner.cookies())), REQUIRED);
        jdbc.update("UPDATE sys_user SET version=0 WHERE user_id=?", userId);
        jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES(?,?,?,'WECOM','bind.member','AUTO_SYNC',NOW(),'ACTIVE',0)", tenantId, configId, userId + 1);
        Attempt conflicting = prepare();
        String conflictingToken = exchange(conflicting);
        rejected(() -> flow.bind(conflictingToken, request(conflicting.cookies())), "IM_BINDING_CONFLICT");
        equal(userId + 1, jdbc.queryForObject("SELECT user_id FROM sys_im_user_mapping WHERE tenant_id=?", Long.class, tenantId), "collation-conflicting identity is never transferred");
        equal("AUTO_SYNC", jdbc.queryForObject("SELECT bind_type FROM sys_im_user_mapping WHERE tenant_id=?", String.class, tenantId), "conflict preserves organization ownership");
        clearMappings();
    }

    private void storage(ImSecretCipher cipher) {
        Attempt attempt = prepare();
        String memberToken = exchange(attempt);
        String key = ImBindingMembers.key(memberToken);
        String raw = redis.opsForValue().get(key);
        check(raw != null && !raw.contains("Bind.Member") && !raw.contains(token) && !raw.contains(password), "pending external proof has no plaintext identity or credentials");
        ImBindingMembers.Ticket ticket = members.read(memberToken, cookieValue(attempt));
        equal(identities.requireRecent(ImBindingAction.BIND).ticket().proof().expiresAt(), ticket.expiresAt(), "external callback cannot extend local identity verification lifetime");
        rejected(() -> cipher.decrypt(tenantId, "WECOM", ImSecretCipher.Field.LOGIN_CHALLENGE, raw.substring(raw.indexOf(':') + 1)), "IM_SECRET_UNAVAILABLE");
        ImBindingMembers expired = new ImBindingMembers(redis, cipher, redirects, new ObjectMapper(), Clock.fixed(Instant.ofEpochMilli(ticket.expiresAt()), ZoneOffset.UTC));
        rejected(() -> expired.read(memberToken, cookieValue(attempt)), REQUIRED);
        redis.opsForValue().set(key, "invalid");
        rejected(() -> members.read(memberToken, cookieValue(attempt)), REQUIRED);
        redis.opsForValue().set(key, raw, java.time.Duration.ofSeconds(300));
        rejected(() -> members.read(ImLoginChallenges.randomToken(), cookieValue(attempt)), REQUIRED);
        redis.persist(key);
        rejected(() -> members.consume(ticket), REQUIRED);
        redis.delete(key);
        rejected(() -> members.read(memberToken, cookieValue(attempt)), REQUIRED);
    }

    private void selfUnbind() throws Exception {
        clearMappings();
        Attempt attempt = prepare();
        ImBindingAccounts.Summary original = flow.bind(exchange(attempt), request(attempt.cookies()));
        ImBindingAccounts.Selection selection = new ImBindingAccounts.Selection(original.mappingId(), original.version());
        String beforeUser = jdbc.queryForObject("SELECT CAST(JSON_OBJECT('name',user_name,'password',password,'version',version,'status',status,'dept',dept_id) AS CHAR) FROM sys_user WHERE user_id=?", String.class, userId);
        resetLimits();
        rejected(() -> flow.unbind(selection, request(List.of())), REQUIRED);
        identities.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
        rejected(() -> flow.unbind(selection, request(List.of())), REQUIRED);
        verifyUnbind();
        check(accounts.overview().canUnbind(), "owner can remove verified non-synchronized binding");
        rejected(() -> flow.unbind(new ImBindingAccounts.Selection(original.mappingId() + 1, original.version()), request(List.of())), "IM_BINDING_CHANGED");
        rejected(() -> flow.unbind(new ImBindingAccounts.Selection(original.mappingId(), original.version() + 1), request(List.of())), "IM_BINDING_CHANGED");
        for (String status : List.of("ACTIVE", "DISABLED", "OUT_OF_SCOPE")) {
            jdbc.update("UPDATE sys_im_user_mapping SET bind_type='AUTO_SYNC',status=? WHERE mapping_id=?", status, original.mappingId());
            check(!accounts.overview().canUnbind(), "synchronized mapping cannot be removed by owner in any status");
            resetLimits();
            rejected(() -> flow.unbind(selection, request(List.of())), "IM_BINDING_ADMIN_REQUIRED");
            equal(1, count(), "managed mapping preserved after rejected removal");
        }
        jdbc.update("UPDATE sys_im_user_mapping SET bind_type='SCAN_BIND',status='ACTIVE' WHERE mapping_id=?", original.mappingId());
        jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[2,1788,1789]' WHERE tenant_id=?", tenantId, tenantId);
        try { resetLimits(); rejected(() -> flow.unbind(selection, request(List.of())), "IM_PERMISSION_DENIED"); }
        finally { jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId); }
        verifyUnbind();
        auditFails.set(true);
        try { rejected(() -> flow.unbind(selection, request(List.of())), "IM_AUDIT_UNAVAILABLE"); }
        finally { auditFails.set(false); }
        equal(original, accounts.mine(), "audit failure rolls back deleted mapping and version");
        rejected(() -> flow.unbind(selection, request(List.of())), REQUIRED);
        verifyUnbind();
        jdbc.update("UPDATE sys_im_config SET status='DISABLED' WHERE config_id=?", configId);
        try { flow.unbind(selection, request(List.of())); }
        finally { jdbc.update("UPDATE sys_im_config SET status='ENABLED' WHERE config_id=?", configId); }
        equal(null, accounts.mine(), "disabled external configuration still allows verified local unbinding");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_SELF_UNBIND'", Integer.class, tenantId), "failed audit leaves no success record and successful unbinding is audited once");
        equal(beforeUser, jdbc.queryForObject("SELECT CAST(JSON_OBJECT('name',user_name,'password',password,'version',version,'status',status,'dept',dept_id) AS CHAR) FROM sys_user WHERE user_id=?", String.class, userId), "unbinding preserves local account credentials version state and department");
        equal(userId, Long.parseLong(StpUtil.getStpLogic().getLoginIdByToken(token).toString()), "local account login remains valid after unbinding");
        Attempt replacement = prepare();
        ImBindingAccounts.Summary rebound = flow.bind(exchange(replacement), request(replacement.cookies()));
        check(rebound.mappingId() != original.mappingId(), "new binding receives distinct identity");
        verifyUnbind();
        rejected(() -> flow.unbind(selection, request(List.of())), "IM_BINDING_CHANGED");
        jdbc.update("UPDATE sys_im_user_mapping SET bind_type='MANUAL_BIND' WHERE mapping_id=?", rebound.mappingId());
        ImBindingAccounts.Selection current = new ImBindingAccounts.Selection(rebound.mappingId(), rebound.version());
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        resetLimits();
        try {
            for (int index = 0; index < 2; index++) results.add(pool.submit(() -> {
                currentToken.accept(token);
                try {
                    if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("unbind start timeout");
                    flow.unbind(current, request(List.of())); return true;
                } catch (ImFailure failure) {
                    check(List.of(REQUIRED, "IM_BINDING_CHANGED").contains(failure.getReasonCode()), "concurrent unbind loser fails safely"); return false;
                } finally { currentToken.accept(null); }
            }));
            start.countDown();
            int successes = 0;
            for (Future<Boolean> result : results) if (result.get(30, TimeUnit.SECONDS)) successes++;
            equal(1, successes, "exactly one concurrent owner unbind commits");
            equal(0, count(), "manual binding removed by verified owner");
            equal(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_SELF_UNBIND'", Integer.class, tenantId), "concurrent unbind adds one audit");
        } finally {
            pool.shutdownNow(); check(pool.awaitTermination(20, TimeUnit.SECONDS), "unbind workers stopped"); currentToken.accept(token);
        }
    }

    private void management(TenantPermissionPolicyService permissions, SysAuditLogMapper audits) throws Exception {
        ImBindingManagement management = new ImBindingManagement(actors, database, identities,
                new ImLoginRequests(properties, sessions.getMapper(ImMapper.class), redis), permissions, audits);
        Attempt bindingAttempt = prepare();
        ImBindingAccounts.Summary bound = flow.bind(exchange(bindingAttempt), request(bindingAttempt.cookies()));
        jdbc.update("UPDATE sys_im_user_mapping SET bind_type='AUTO_SYNC',last_sync_time=NOW() WHERE tenant_id=?", tenantId);
        ImBindingAccounts.Selection selection = new ImBindingAccounts.Selection(bound.mappingId(), bound.version());
        String originalUser = jdbc.queryForObject("SELECT CONCAT_WS('|',user_name,nick_name,password,status,version,deleted) FROM sys_user WHERE tenant_id=? AND user_id=?", String.class, tenantId, userId);
        try {
            rejected(() -> management.list(1, 20), "IM_PERMISSION_DENIED");
            for (long menuId : List.of(1786L, 1787L)) jdbc.update("INSERT INTO sys_role_menu(role_id,tenant_id,menu_id) VALUES(?,?,?)", roleId, tenantId, menuId);
            rejected(() -> management.list(1, 20), "IM_PERMISSION_DENIED");
            resetLimits();
            rejected(() -> identities.authenticate(ImBindingAction.ADMIN_UNBIND, new ImBindingIdentity.Credentials(password, null), request(List.of())), "IM_PERMISSION_DENIED");
            jdbc.update("UPDATE sys_role SET role_key='admin' WHERE role_id=?", roleId);
            equal(1L, management.list(1, 20).getTotal(), "administrator reads own tenant bindings only");
            rejected(() -> management.list(0, 20), "IM_BINDING_REQUEST_INVALID");
            resetLimits();
            identities.authenticate(ImBindingAction.UNBIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
            resetLimits();
            rejected(() -> management.manage(ImBindingAction.ADMIN_UNBIND, selection, request(List.of())), REQUIRED);
            verifyManagement(ImBindingAction.ADMIN_UNBIND);
            rejected(() -> management.manage(ImBindingAction.ADMIN_UNBIND, new ImBindingAccounts.Selection(selection.mappingId(), 8), request(List.of())), "IM_BINDING_CHANGED");
            resetLimits();
            management.manage(ImBindingAction.ADMIN_UNBIND, selection, request(List.of()));
            equal("DISABLED", accounts.mine().status(), "admin unbind persists stopped marker");
            equal("AUTO_SYNC", accounts.mine().bindType(), "stopped marker retains original sync ownership");
            equal(1, accounts.mine().version(), "unbind advances binding version");
            equal(originalUser, jdbc.queryForObject("SELECT CONCAT_WS('|',user_name,nick_name,password,status,version,deleted) FROM sys_user WHERE tenant_id=? AND user_id=?", String.class, tenantId, userId), "admin unbind preserves local user row");
            check(!management.list(1, 20).getRows().get(0).canUnbind() && management.list(1, 20).getRows().get(0).canResume(), "only explicit resumption offered after stop");
            verifyUnbind();
            rejected(() -> flow.unbind(new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of())), "IM_BINDING_ADMIN_REQUIRED");
            Attempt blocked = prepare();
            String proof = exchange(blocked);
            rejected(() -> flow.bind(proof, request(blocked.cookies())), "IM_BINDING_CONFLICT");
            verifyManagement(ImBindingAction.ADMIN_RESUME);
            auditFails.set(true);
            rejected(() -> management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of())), "IM_AUDIT_UNAVAILABLE");
            auditFails.set(false);
            equal("DISABLED", accounts.mine().status(), "audit failure rolls back resumption");
            resetLimits();
            rejected(() -> management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of())), REQUIRED);
            verifyManagement(ImBindingAction.ADMIN_RESUME);
            jdbc.update("UPDATE sys_role SET role_key='employee' WHERE role_id=?", roleId);
            rejected(() -> management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of())), "IM_PERMISSION_DENIED");
            jdbc.update("UPDATE sys_role SET role_key='admin' WHERE role_id=?", roleId);
            verifyManagement(ImBindingAction.ADMIN_RESUME);
            jdbc.update("UPDATE sys_tenant SET package_id=?,package_version=0,effective_menu_ids='[6,1786]' WHERE tenant_id=?", tenantId, tenantId);
            rejected(() -> management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of())), "IM_PERMISSION_DENIED");
            jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId);
            verifyManagement(ImBindingAction.ADMIN_RESUME);
            management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(selection.mappingId(), 1), request(List.of()));
            equal("ACTIVE", accounts.mine().status(), "administrator restores original binding");
            equal(2, accounts.mine().version(), "resumption advances version again");
            equal(selection.mappingId(), accounts.mine().mappingId(), "resumption preserves binding identity");
            equal(originalUser, jdbc.queryForObject("SELECT CONCAT_WS('|',user_name,nick_name,password,status,version,deleted) FROM sys_user WHERE tenant_id=? AND user_id=?", String.class, tenantId, userId), "resumption preserves local user row");
            equal(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name IN ('IM_ADMIN_UNBIND','IM_ADMIN_RESUME')", Integer.class, tenantId), "only two committed transitions audited");
            clearMappings();
            long targetId = userId + 73;
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required,version) SELECT ?,tenant_id,CONCAT('managed-peer-',user_id),'被管理员工',password,'1',0,'0',0 FROM sys_user WHERE tenant_id=? AND user_id=?", targetId, tenantId, userId);
            try {
                jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES(?,?,?,'WECOM','Managed.Peer','AUTO_SYNC',NOW(),'ACTIVE',0)", tenantId, configId, targetId);
                long mappingId = jdbc.queryForObject("SELECT mapping_id FROM sys_im_user_mapping WHERE tenant_id=? AND user_id=?", Long.class, tenantId, targetId);
                verifyManagement(ImBindingAction.ADMIN_UNBIND);
                management.manage(ImBindingAction.ADMIN_UNBIND, new ImBindingAccounts.Selection(mappingId, 0), request(List.of()));
                equal("DISABLED", management.list(1, 20).getRows().get(0).status(), "administrator stops a different employee");
                verifyManagement(ImBindingAction.ADMIN_RESUME);
                management.manage(ImBindingAction.ADMIN_RESUME, new ImBindingAccounts.Selection(mappingId, 1), request(List.of()));
                equal("1", jdbc.queryForObject("SELECT status FROM sys_user WHERE user_id=?", String.class, targetId), "resumption never enables previously disabled employee");
                equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE tenant_id=? AND user_id=?", Integer.class, tenantId, targetId), "management never grants employee roles");
                verifyManagement(ImBindingAction.ADMIN_UNBIND);
                ExecutorService workers = Executors.newFixedThreadPool(2);
                CountDownLatch start = new CountDownLatch(1);
                try {
                    List<Future<Boolean>> attempts = new ArrayList<>();
                    for (int index = 0; index < 2; index++) attempts.add(workers.submit(() -> {
                        currentToken.accept(token);
                        try {
                            if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("management race start timeout");
                            management.manage(ImBindingAction.ADMIN_UNBIND, new ImBindingAccounts.Selection(mappingId, 2), request(List.of()));
                            return true;
                        } catch (ImFailure failure) {
                            check(List.of(REQUIRED, "IM_BINDING_CHANGED").contains(failure.getReasonCode()), "management race loser rejected safely"); return false;
                        } finally { currentToken.accept(null); }
                    }));
                    start.countDown();
                    int committed = 0;
                    for (Future<Boolean> attempt : attempts) if (attempt.get(30, TimeUnit.SECONDS)) committed++;
                    equal(1, committed, "two competing administrator requests commit only once");
                } finally { workers.shutdownNow(); check(workers.awaitTermination(20, TimeUnit.SECONDS), "management workers stopped"); currentToken.accept(token); }
                equal(3, management.list(1, 20).getRows().get(0).version(), "competing stop advances version once");
            } finally {
                clearMappings(); jdbc.update("DELETE FROM sys_user WHERE tenant_id=? AND user_id=?", tenantId, targetId);
            }
        } finally {
            auditFails.set(false);
            jdbc.update("UPDATE sys_role SET role_key='employee' WHERE role_id=?", roleId);
            jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=? AND role_id=? AND menu_id IN (1786,1787)", tenantId, roleId);
            jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenantId);
            clearMappings();
        }
    }

    private void verifyManagement(ImBindingAction action) {
        resetLimits();
        identities.authenticate(action, new ImBindingIdentity.Credentials(password, null), request(List.of()));
        owned.add(ImBindingProofs.key(identities.requireRecent(action).identity()));
        resetLimits();
    }

    private void verifyUnbind() {
        resetLimits();
        identities.authenticate(ImBindingAction.UNBIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
    }

    private void concurrent() throws Exception {
        Attempt attempt = prepare();
        String memberToken = exchange(attempt);
        resetLimits();
        ExecutorService pool = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        List<Future<Boolean>> results = new ArrayList<>();
        try {
            for (int index = 0; index < 2; index++) results.add(pool.submit(() -> {
                currentToken.accept(token);
                if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("binding submission start timeout");
                try { flow.bind(memberToken, request(attempt.cookies())); return true; }
                catch (ImFailure failure) {
                    check(List.of(REQUIRED, "IM_BINDING_CONFLICT").contains(failure.getReasonCode()), "concurrent loser fails safely");
                    return false;
                } finally { currentToken.accept(null); }
            }));
            start.countDown();
            int successes = 0;
            for (Future<Boolean> result : results) if (result.get(30, TimeUnit.SECONDS)) successes++;
            equal(1, successes, "only one real concurrent transaction inserts binding");
            equal(1, count(), "concurrent submission creates one mapping");
            System.out.println("G4_IM_BINDING_WRITE_RACE: callers=2; committed=" + successes + "; mappings=1; real_mysql=true; real_redis=true");
        } finally {
            pool.shutdownNow();
            check(pool.awaitTermination(20, TimeUnit.SECONDS), "binding submit workers stopped");
        }
    }

    private void competingAccounts() throws Exception {
        long peerId = userId + 10;
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required,version) SELECT ?,tenant_id,?,'并发绑定验证',password,status,deleted,pwd_reset_required,version FROM sys_user WHERE user_id=?",
                peerId, "binding-peer-" + peerId, userId);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", peerId, roleId, tenantId);
        String peerToken = login.apply(peerId, tenantId);
        ownedTokens.add(peerToken);
        owned.add("cloudflow:im:binding-proof:" + tenantId + ":" + peerId + ":" + ImLoginChallenges.digest(peerToken));
        owned.add("cloudflow:im:login-limit:account:" + tenantId + ":" + peerId);
        for (boolean sameExternal : List.of(false, true)) {
            externalAccount.set("Bind.Member");
            Attempt first = prepare();
            String firstMember = exchange(first);
            currentToken.accept(peerToken);
            redis.delete("cloudflow:im:login-limit:account:" + tenantId + ":" + peerId);
            resetLimits();
            identities.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
            ArrayList<Cookie> cookies = new ArrayList<>();
            ImLoginAuthorization.Grant grant = flow.begin(request(List.of()), response(cookies));
            String state = query(URI.create(grant.authorizationUrl()), "state");
            owned.add(ImLoginChallenges.key(state));
            Attempt peer = new Attempt(state, List.copyOf(cookies));
            externalAccount.set(sameExternal ? "Bind.Member" : "Bind.Peer");
            String peerMember = exchange(peer);
            ExecutorService pool = Executors.newFixedThreadPool(2);
            CountDownLatch ready = new CountDownLatch(2);
            CountDownLatch start = new CountDownLatch(1);
            List<Future<Boolean>> results = new ArrayList<>();
            try {
                for (int index = 0; index < 2; index++) {
                    boolean peerCall = index == 1;
                    results.add(pool.submit(() -> {
                        currentToken.accept(peerCall ? peerToken : token);
                        ready.countDown();
                        try {
                            if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("different account start timeout");
                            flow.bind(peerCall ? peerMember : firstMember, request(peerCall ? peer.cookies() : first.cookies()));
                            return true;
                        } catch (ImFailure failure) {
                            check(sameExternal && "IM_BINDING_CONFLICT".equals(failure.getReasonCode()), "only conflicting identity is rejected");
                            return false;
                        } finally { currentToken.accept(null); }
                    }));
                }
                check(ready.await(5, TimeUnit.SECONDS), "both distinct account callers ready");
                start.countDown();
                int successes = 0;
                for (Future<Boolean> result : results) if (result.get(30, TimeUnit.SECONDS)) successes++;
                equal(sameExternal ? 1 : 2, successes, "distinct account transactions commit without lock upgrade deadlock");
                equal(successes, count(), "unique external identity enforced under real competition");
                System.out.println("G4_IM_BINDING_ACCOUNT_RACE: callers=2; same_external=" + sameExternal + "; committed=" + successes + "; mappings=" + count() + "; real_mysql=true; real_redis=true");
            } finally {
                pool.shutdownNow();
                check(pool.awaitTermination(20, TimeUnit.SECONDS), "different account workers stopped");
                currentToken.accept(token);
                externalAccount.set("Bind.Member");
                clearMappings();
            }
        }
    }

    private Attempt prepare() {
        currentToken.accept(token);
        resetLimits();
        identities.authenticate(ImBindingAction.BIND, new ImBindingIdentity.Credentials(password, null), request(List.of()));
        ArrayList<Cookie> cookies = new ArrayList<>();
        ImLoginAuthorization.Grant grant = flow.begin(request(List.of()), response(cookies));
        URI url = URI.create(grant.authorizationUrl());
        equal("open.work.weixin.qq.com", url.getHost(), "binding uses official SDK authorization host");
        String state = query(url, "state");
        equal(redirects.bindingCallbackUrl(), query(url, "redirect_uri"), "binding callback is fixed and separate from login");
        check(cookies.size() == 1 && cookies.get(0).getSecure() && cookies.get(0).isHttpOnly(), "binding authorization creates secure browser proof only");
        owned.add(ImLoginChallenges.key(state));
        return new Attempt(state, List.copyOf(cookies));
    }

    private String exchange(Attempt attempt) {
        String memberToken = flow.callback(attempt.state(), "controlled-bind-code", request(attempt.cookies()));
        owned.add(ImBindingMembers.key(memberToken));
        return memberToken;
    }

    private String query(URI uri, String name) {
        for (String pair : uri.getRawQuery().split("&")) {
            String[] parts = pair.split("=", 2);
            if (parts.length == 2 && name.equals(URLDecoder.decode(parts[0], StandardCharsets.UTF_8))) return URLDecoder.decode(parts[1], StandardCharsets.UTF_8);
        }
        throw new AssertionError("Missing authorization query field");
    }
    private HttpServletRequest request(List<Cookie> cookies) { return ImLoginFlowDatabaseChecks.request(address, true, Map.of("Origin", List.of("https://cloudflow.example")), cookies); }
    private HttpServletResponse response(List<Cookie> cookies) { return (HttpServletResponse) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{HttpServletResponse.class}, (proxy, method, values) -> { if (method.getName().equals("addCookie")) { cookies.add((Cookie) values[0]); return null; } throw new AssertionError("Authorization may only issue browser proof cookie"); }); }
    private String cookieValue(Attempt attempt) { return attempt.cookies().get(0).getValue(); }
    private void resetLimits() { redis.delete(List.of("cloudflow:im:login-limit:ip:" + ImLoginChallenges.digest(address), "cloudflow:im:login-limit:account:" + tenantId + ":" + userId)); }
    private void clearMappings() { jdbc.update("DELETE FROM sys_im_user_mapping WHERE tenant_id=?", tenantId); }
    private int count() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_user_mapping WHERE tenant_id=?", Integer.class, tenantId); }
    private void rejected(Runnable operation, String reason) { try { operation.run(); throw new AssertionError("Expected " + reason); } catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe binding-flow failure"); } }
    private void check(boolean success, String message) { assertions.incrementAndGet(); if (!success) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
    private record Attempt(String state, List<Cookie> cookies) { @Override public String toString() { return "BindingAttempt[redacted]"; } }
}

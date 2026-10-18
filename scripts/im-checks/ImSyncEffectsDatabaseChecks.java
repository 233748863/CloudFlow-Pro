package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoForRedisTemplate;
import cn.dev33.satoken.json.SaJsonTemplate;
import cn.dev33.satoken.json.SaJsonTemplateForJackson;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.auth.mapper.OAuthMapper;
import com.cloudflow.auth.oauth2.OAuthActors;
import com.cloudflow.auth.oauth2.OAuthDatabase;
import com.cloudflow.auth.oauth2.OAuthProperties;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.cache.TenantRedisCacheManager;
import com.cloudflow.common.config.RedisConfig;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.permission.LoginSessionPolicy;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.oauth2.OAuthFailure;
import com.cloudflow.common.security.oauth2.OAuthIdentity;
import com.cloudflow.common.security.oauth2.OAuthTokens;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import com.cloudflow.common.tenant.session.LoginSessionPolicyService;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Function;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.Redisson;
import org.redisson.api.RedissonClient;
import org.redisson.config.Config;
import org.redisson.spring.data.connection.RedissonConnectionFactory;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheWriter;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.serializer.RedisSerializer;
import org.springframework.data.redis.serializer.SerializationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

final class ImSyncEffectsDatabaseChecks {
    private static final long TENANT = 100000;
    private static final long OTHER = 990100;
    private static final long OTHER_USER = 998500;
    private static final long MALFORMED_USER = 998000;
    private static int assertions;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImOrganizationMapper writes;
    private final ImOrgSnapshotCodec codec;
    private final SysAuditLogMapper audits;
    private final AtomicBoolean failAudit;
    private final AtomicReference<String> failWrite;
    private final AtomicInteger failDeletion = new AtomicInteger(-1);
    private final AtomicBoolean failBulkDeletion = new AtomicBoolean();
    private final String namespace = "im-effects:" + UUID.randomUUID() + ":";
    private OAuthTokens oauthTokens;
    private RedisCache redis;
    private TenantRedisCacheManager caches;
    private StringRedisTemplate raw;
    private StringRedisTemplate scopedStrings;
    private ImSecurityEffects effects;
    private ImSyncEffectsExecutor recovery;
    private OAuthActors actors;
    private OAuthMapper oauth;
    private long target;
    private final Map<Long, String> internalTokens = new HashMap<>();
    private final List<String> targetHashes = new ArrayList<>();
    private String otherHash;

    ImSyncEffectsDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions,
            ImOrganizationMapper writes, ImOrgSnapshotCodec codec, SysAuditLogMapper audits,
            AtomicBoolean failAudit, AtomicReference<String> failWrite) {
        this.jdbc = jdbc;
        this.database = database;
        this.sessions = sessions;
        this.writes = writes;
        this.codec = codec;
        this.audits = audits;
        this.failAudit = failAudit;
        this.failWrite = failWrite;
    }

    @FunctionalInterface
    interface RunnerChecks { void run(ImSyncEffectsExecutor recovery) throws Exception; }

    @FunctionalInterface
    interface ExecutionChecks { void run(Runtime runtime) throws Exception; }

    record Runtime(ImSyncEffectsExecutor recovery, StringRedisTemplate strings, RedisCache redis, RedissonClient locks) { }

    void withRuntime(ExecutionChecks checks) throws Exception { run(null, null, null, checks); }

    void run(Callable<ImSyncRunRow> commit, Function<ImSyncRunRow, ImSyncApplication> apply, RunnerChecks runnerChecks) throws Exception {
        run(commit, apply, runnerChecks, null);
    }

    private void run(Callable<ImSyncRunRow> commit, Function<ImSyncRunRow, ImSyncApplication> apply,
            RunnerChecks runnerChecks, ExecutionChecks executionChecks) throws Exception {
        int port = Integer.parseInt(System.getenv("IM_CHECK_REDIS_PORT"));
        String password = System.getenv("IM_CHECK_REDIS_PASSWORD");
        if (port <= 1024 || port >= 65536 || password == null || password.isBlank()) throw new IllegalStateException("Owned Redis required");
        Config configuration = new Config().setThreads(2).setNettyThreads(2);
        configuration.useSingleServer().setAddress("redis://127.0.0.1:" + port).setPassword(password).setRetryAttempts(0)
                .setConnectionMinimumIdleSize(1).setConnectionPoolSize(4).setSubscriptionConnectionMinimumIdleSize(1).setSubscriptionConnectionPoolSize(2);
        RedissonClient client = Redisson.create(configuration);
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        SaJsonTemplate previousJson = SaManager.getSaJsonTemplate();
        SaTokenConfig previousConfig = SaManager.getConfig();
        StpLogic previousLogic = StpUtil.getStpLogic();
        Long previousUserTenant = UserContext.getTenantId();
        Long previousTenant = TenantContext.getTenantId();
        boolean previousSkip = TenantContext.getTenantSkip();
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            initialize(client, context);
            if (executionChecks != null) {
                RedissonClient locks = (RedissonClient) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{RedissonClient.class},
                        (proxy, method, arguments) -> {
                            if (method.getName().equals("getLock") && arguments.length == 1) return client.getLock(namespace + arguments[0]);
                            throw new UnsupportedOperationException("Only owned named locks are exposed");
                        });
                executionChecks.run(new Runtime(recovery, scopedStrings, redis, locks));
                return;
            }
            for (Long identifier : jdbc.queryForList("SELECT sync_run_id FROM sys_im_sync_run WHERE tenant_id=100000 AND mode='APPLY' AND status='RUNNING' ORDER BY sync_run_id", Long.class)) {
                ImSyncApplication pending = recovery.recover(TENANT, identifier);
                while (!pending.finished()) {
                    if (pending.effectsPending()) pending = recovery.recover(TENANT, identifier);
                    else pending = apply.apply(database.read(TENANT, mapper -> mapper.syncRun(TENANT, identifier)));
                }
            }
            runnerChecks.run(recovery);
            fixtures();
            equal(target, actors.load(oauth, TENANT, target).user().getUserId(), "real injected OAuth actor accepts eligible user before pending work");
            ImSyncRunRow run = commit.call();
            ImSyncApplication initial = state(run);
            check(initial.pendingUsers().size() >= 101, "real department update schedules at least 101 users");
            check(initial.pendingUsers().contains(target) && initial.pendingUsers().contains(MALFORMED_USER), "normal and malformed login owners included");
            expectOAuthDenied(() -> actors.load(oauth, TENANT, target));
            String digest = cursor(run);
            int auditCount = auditCount(run);
            failDeletion.set(3);
            try { rejected(() -> recoverDeferred(run), "IM_ORG_SECURITY_RECOVERY_PENDING"); }
            finally { failDeletion.set(-1); }
            equal(digest, cursor(run), "Redis deletion failure cannot advance checkpoint");
            equal(auditCount, auditCount(run), "Redis deletion failure cannot persist recovery audit");
            equal(200, activeAccess(TENANT, target), "Redis failure rolls back OAuth SQL revocation");
            check(targetHashes.stream().anyMatch(hash -> !projectionExists(hash)), "Redis failure occurs after at least one real projection deletion");
            failBulkDeletion.set(true);
            try { rejected(() -> recoverDeferred(run), "IM_ORG_SECURITY_RECOVERY_PENDING"); }
            finally { failBulkDeletion.set(false); }
            equal(digest, cursor(run), "bulk deletion failure retains entire encrypted pending batch");
            equal(auditCount, auditCount(run), "bulk deletion failure records no false success");
            equal(200, activeAccess(TENANT, target), "bulk deletion failure rolls back OAuth revocations");
            unchangedOtherTenant();
            failWrite.set("checkpoint");
            try { rejected(() -> recoverDeferred(run), "IM_ORG_APPLY_SAVE_FAILED"); }
            finally { failWrite.set(null); }
            equal(digest, cursor(run), "checkpoint failure retains complete pending list");
            equal(200, activeAccess(TENANT, target), "checkpoint failure rolls back all database revocations");
            failAudit.set(true);
            try { rejected(() -> recoverDeferred(run), "IM_ORG_SECURITY_RECOVERY_PENDING"); }
            finally { failAudit.set(false); }
            equal(digest, cursor(run), "audit failure rolls back encrypted checkpoint");
            equal(auditCount, auditCount(run), "audit failure records no false completion");
            equal(200, activeAccess(TENANT, target), "audit failure rolls back OAuth revocations");
            expectOAuthDenied(() -> actors.load(oauth, TENANT, target));
            unchangedOtherTenant();
            jdbc.update("UPDATE sys_im_config SET status='DISABLED',deleted=1,version=version+1 WHERE tenant_id=? AND config_id=?", TENANT, run.getConfigId());
            jdbc.update("DELETE FROM sys_user_role WHERE tenant_id=? AND user_id=? AND role_id=1", TENANT, run.getRequestedBy());
            jdbc.update("UPDATE sys_dept SET dept_name='提交后的独立修改' WHERE tenant_id=? AND dept_id=997000", TENANT);
            TenantContext.setTenantId(OTHER);
            TenantContext.setTenantSkip();
            ImSyncApplication partial = recoverDeferred(run);
            equal(OTHER, TenantContext.getTenantId(), "recovery restores caller tenant");
            check(TenantContext.getTenantSkip(), "recovery restores caller skip flag");
            equal(initial.pendingUsers().size() - 100, partial.pendingUsers().size(), "one successful recovery advances exactly hundred users");
            check(partial.pendingDepartments() && partial.effectsPending(), "partial cleanup retains login fence and department flag");
            check(!partial.finished(), "no completion before remaining users cleaned");
            equal(0, activeAccess(TENANT, target), "real OAuth access records revoked");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_refresh_token WHERE tenant_id=? AND user_id=? AND status!='REVOKED'", Integer.class, TENANT, target), "refresh records revoked");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_code WHERE tenant_id=? AND user_id=? AND status!='DENIED'", Integer.class, TENANT, target), "issued and pending authorization codes denied");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_approve WHERE tenant_id=? AND user_id=? AND revoked_time IS NULL", Integer.class, TENANT, target), "consent revoked");
            for (String hash : targetHashes) check(!projectionExists(hash), "all 201 projections removed including previously revoked token and second page");
            check(!internalExists(target), "real internal login removed");
            concurrentRecovery(run, partial.pendingUsers().size());
            ImSyncApplication completed = state(run);
            check(!completed.effectsPending(), "concurrent retries finish all pending security work");
            equal(completed, recovery.recover(TENANT, run.getSyncRunId()), "completed recovery is idempotent");
            check(!internalExists(MALFORMED_USER), "known local user with malformed claims physically logged out");
            scoped(TENANT);
            check(redis.getCacheObject("user:datascope:" + TENANT + ":" + target) == null, "data scope removed from real Redis");
            check(caches.getCache(CacheConstants.USER_MENUS).get(target) == null, "menu cache removed");
            check(caches.getCache(CacheConstants.USER_DETAILS).get("stale-renamed-username") == null, "final invalidation removes old username cache entries");
            check(redis.getCacheObject("cache:null:userinfo:" + TENANT + ":" + username(target)) == null, "negative username cache removed");
            String epochKey = namespace + TENANT + ":holiday:epoch:v2:assignments";
            check(!"before-sync".equals(raw.opsForHash().get(epochKey, "revision")), "real holiday assignment epoch changes");
            equal(1L, raw.opsForHash().size(epochKey), "holiday transaction completion clears pending marker");
            unchangedOtherTenant();
            try { apply.apply(run); throw new AssertionError("revoked manager must not continue organization writes"); }
            catch (ImFailure expected) { equal("IM_PERMISSION_DENIED", expected.getReasonCode(), "security recovery does not bypass organization write permission"); }
            rejected(() -> effects.user(TENANT, target), "IM_ORG_LOCAL_INVALID");
            ImSyncEffectsExecutor foreign = new ImSyncEffectsExecutor(database, sessions.getMapper(ImOrganizationMapper.class), codec, effects, audits);
            rejected(() -> foreign.recover(OTHER, run.getSyncRunId()), "IM_ORG_RUN_NOT_FOUND");
            System.out.println("G4_IM_SYNC_EFFECTS_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_redis=true; real_satoken_dao=true; oauth_projections=201; security_batch_size=100; concurrent_recovery=true; injected_delete_failure=true; checkpoint_rollback=true; audit_rollback=true; current_config_independent=true; complete_sync=false");
        } finally {
            failDeletion.set(-1);
            failBulkDeletion.set(false);
            SaManager.setSaTokenDao(previousDao);
            SaManager.setSaJsonTemplate(previousJson);
            SaManager.setConfig(previousConfig);
            StpUtil.setStpLogic(previousLogic);
            TenantContext.clear();
            TenantContext.setTenantId(previousTenant);
            if (previousSkip) TenantContext.setTenantSkip();
            UserContext.setTenantId(previousUserTenant);
            try {
                if (raw != null) {
                    Set<String> owned = raw.keys(namespace + "*");
                    if (owned != null && !owned.isEmpty()) raw.delete(owned);
                    equal(Set.of(), raw.keys(namespace + "*"), "only unique Redis test namespace cleaned");
                    System.out.println("G4_IM_SYNC_EFFECTS_CLEANUP: owned_redis_remaining=0; shared_flush=false; runtime_credentials_untouched=true");
                }
            } finally { client.shutdown(); }
        }
    }

    private void initialize(RedissonClient client, AnnotationConfigApplicationContext context) throws Exception {
        RedissonConnectionFactory factory = new RedissonConnectionFactory(client);
        factory.afterPropertiesSet();
        raw = new StringRedisTemplate(factory);
        equal(Set.of(), raw.keys(namespace + "*"), "random Redis namespace initially empty");
        RedisSerializer<String> keys = new RedisSerializer<>() {
            @Override public byte[] serialize(String value) { return value == null ? null : (namespace + value).getBytes(StandardCharsets.UTF_8); }
            @Override public String deserialize(byte[] bytes) {
                if (bytes == null) return null;
                String value = new String(bytes, StandardCharsets.UTF_8);
                if (!value.startsWith(namespace)) throw new SerializationException("Foreign Redis key rejected");
                return value.substring(namespace.length());
            }
        };
        RedisTemplate<String, Object> template = new RedisConfig().redisTemplate(factory);
        scopedStrings = new StringRedisTemplate(factory);
        scopedStrings.setKeySerializer(keys);
        template.setKeySerializer(keys);
        redis = new RedisCache() {
            @Override public long deleteObjects(java.util.Collection<String> keys) {
                long removed = super.deleteObjects(keys);
                if (failBulkDeletion.get()) throw new IllegalStateException("controlled-bulk-delete-failure");
                return removed;
            }
        };
        redis.redisTemplate = template;
        SaTokenDaoForRedisTemplate realDao = new SaTokenDaoForRedisTemplate();
        realDao.init(factory);
        realDao.stringRedisTemplate.setKeySerializer(keys);
        SaTokenDao checkedDao = (SaTokenDao) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SaTokenDao.class}, (proxy, method, arguments) -> {
            if (method.getName().equals("delete") && failDeletion.get() > 0 && failDeletion.decrementAndGet() == 0) throw new IllegalStateException("controlled-redis-delete-failure");
            try { return method.invoke(realDao, arguments); }
            catch (InvocationTargetException failure) { throw failure.getCause(); }
        });
        SaManager.setSaTokenDao(checkedDao);
        SaManager.setSaJsonTemplate(new SaJsonTemplateForJackson());
        SaManager.setConfig(new SaTokenConfig().setIsPrint(false).setIsLog(false).setDataRefreshPeriod(-1));
        StpUtil.setStpLogic(new StpLogic("login"));
        oauthTokens = new OAuthTokens();
        caches = new TenantRedisCacheManager(RedisCacheWriter.nonLockingRedisCacheWriter(factory),
                RedisCacheConfiguration.defaultCacheConfig().computePrefixWith(name -> namespace + name + "::").entryTtl(Duration.ofMinutes(30)), true, Map.of());
        caches.afterPropertiesSet();
        oauth = sessions.getMapper(OAuthMapper.class);
        effects = new ImSecurityEffects(oauth, oauthTokens, new UserDataScopeStore(redis), redis, caches, new HolidayCalendarServiceImpl(null, null, null, redis)) {
            @Override void users(long tenantId, List<Long> userIds) {
                try { super.users(tenantId, userIds); }
                catch (RuntimeException failure) { diagnostic("users", failure); throw failure; }
            }
            @Override void finish(long tenantId) {
                try { super.finish(tenantId); }
                catch (RuntimeException failure) { diagnostic("finish", failure); throw failure; }
            }
        };
        recovery = new ImSyncEffectsExecutor(database, writes, codec, effects, audits);
        DataSourceTransactionManager manager = new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()));
        LoginSessionPolicy policy = new LoginSessionPolicyService(sessions.getMapper(LoginSessionMapper.class), manager);
        CurrentPermissionService permissions = new CurrentPermissionService(new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), manager));
        context.registerBean(LoginSessionPolicy.class, () -> policy);
        context.registerBean(OAuthActors.class, () -> new OAuthActors(new OAuthDatabase(oauth, manager), new OAuthProperties(), new TokenService(policy), permissions));
        context.refresh();
        actors = context.getBean(OAuthActors.class);
    }

    private void fixtures() {
        target = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=? AND role_id=1", Long.class, TENANT);
        for (long identifier = MALFORMED_USER; identifier < MALFORMED_USER + 101; identifier++) {
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,version,pwd_reset_required) VALUES (?,100000,997000,?,'恢复专项成员','0',0,0,'0')", identifier, "effects-" + identifier);
        }
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,version,pwd_reset_required) VALUES (?,?,NULL,'effects-other','其他租户','0',0,0,'0')", OTHER_USER, OTHER);
        jdbc.update("UPDATE sys_user SET pwd_reset_required='0' WHERE user_id=? AND tenant_id=?", target, TENANT);
        for (int index = 0; index < 201; index++) targetHashes.add(access(TENANT, target, index == 0));
        otherHash = access(OTHER, OTHER_USER, false);
        for (long tenant : List.of(TENANT, OTHER)) {
            long userId = tenant == TENANT ? target : OTHER_USER;
            jdbc.update("INSERT INTO sys_oauth2_refresh_token(tenant_id,client_id,user_id,token_hash,family_id,scopes,client_version,issued_time,expires_time) VALUES (?,999001,?,SHA2(UUID(),256),'effects-family','[]',0,NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR))", tenant, userId);
            for (String status : List.of("PENDING", "ISSUED")) jdbc.update("INSERT INTO sys_oauth2_code(tenant_id,client_id,user_id,request_hash,session_binding_hash,code_hash,redirect_uri,requested_scopes,code_challenge,client_version,status,expires_time) VALUES (?,999001,?,SHA2(UUID(),256),SHA2(UUID(),256),SHA2(UUID(),256),'https://example.test/callback','[]','test-challenge',0,?,DATE_ADD(NOW(),INTERVAL 1 HOUR))", tenant, userId, status);
            jdbc.update("INSERT INTO sys_oauth2_approve(tenant_id,client_id,user_id,scopes,client_version,approved_time,expires_time) VALUES (?,999001,?,'[]',0,NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR))", tenant, userId);
            scoped(tenant);
            equal(tenant + ":" + CacheConstants.USER_DETAILS, caches.getCache(CacheConstants.USER_DETAILS).getName(), "fixture user cache uses intended tenant");
            equal(tenant + ":" + CacheConstants.USER_MENUS, caches.getCache(CacheConstants.USER_MENUS).getName(), "fixture menu cache uses intended tenant");
            redis.setCacheObject("user:datascope:" + tenant + ":" + userId, "cached-scope");
            redis.setCacheObject("cache:null:userinfo:" + tenant + ":" + username(userId), "cached-negative");
            caches.getCache(CacheConstants.USER_MENUS).put(userId, "cached-menu");
            caches.getCache(CacheConstants.USER_DETAILS).put("stale-renamed-username", "cached-user");
            raw.opsForHash().put(namespace + tenant + ":holiday:epoch:v2:assignments", "revision", "before-sync");
            internalTokens.put(userId, login(tenant, userId, false));
        }
        internalTokens.put(MALFORMED_USER, login(TENANT, MALFORMED_USER, true));
        scoped(TENANT);
    }

    private String access(long tenant, long userId, boolean revoked) {
        String hash = UUID.randomUUID().toString().replace("-", "") + UUID.randomUUID().toString().replace("-", "");
        jdbc.update("INSERT INTO sys_oauth2_access_token(tenant_id,client_id,user_id,token_hash,grant_type,scopes,client_version,issued_time,expires_time,revoked_time) VALUES (?,999001,?,?,'authorization_code','[]',0,NOW(),DATE_ADD(NOW(),INTERVAL 1 HOUR),IF(?,NOW(),NULL))", tenant, userId, hash, revoked);
        Long accessId = jdbc.queryForObject("SELECT access_token_id FROM sys_oauth2_access_token WHERE token_hash=?", Long.class, hash);
        oauthTokens.project(new OAuthIdentity(accessId, tenant, 999001L, userId, hash, "authorization_code", List.of(), null, 4, List.of(), Set.of(), System.currentTimeMillis() + 3600000));
        check(projectionExists(hash), "projection written using actual Redis Sa-Token DAO");
        return hash;
    }

    private String login(long tenant, long userId, boolean malformed) {
        String token = StpUtil.getStpLogic().createLoginSession(userId, new SaLoginParameter().setIsConcurrent(true).setIsShare(false));
        StpUtil.getSessionByLoginId(userId, false).set(TokenService.LOGIN_USER_SESSION_KEY, malformed ? Map.of("invalid", "claims")
                : Map.of("tenantId", tenant, "ownerTenantId", tenant, "userId", userId, "userVersion", 0));
        return token;
    }

    private void concurrentRecovery(ImSyncRunRow run, int remaining) throws Exception {
        int before = auditCount(run);
        ImSyncApplication initial = state(run);
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            List<Future<ImSyncApplication>> results = new ArrayList<>();
            for (int index = 0; index < 2; index++) results.add(workers.submit(() -> {
                start.await();
                ImSyncApplication result;
                do { result = recovery.recover(TENANT, run.getSyncRunId()); } while (!result.finished());
                return result;
            }));
            start.countDown();
            equal(results.get(0).get(180, TimeUnit.SECONDS), results.get(1).get(180, TimeUnit.SECONDS), "concurrent recovery observes identical final checkpoint");
            equal((remaining + 99) / 100, auditCount(run) - before, "one audit per committed batch without concurrent duplicate progress");
            ImSyncApplication completed = state(run);
            equal("PARTIAL", completed.status(), "deleted configuration closes obsolete work without false success");
            equal(initial.outcomes(), completed.outcomes().subList(0, initial.next()), "configuration closure preserves committed outcomes");
            check(completed.outcomes().subList(initial.next(), completed.next()).stream().allMatch(outcome ->
                    outcome.action() == ImSyncPreview.Action.CONFLICT && outcome.reasons().contains(ImSyncPreview.Reason.CONFIGURATION_CHANGED)),
                    "unexecuted outcomes record configuration change without organization writes");
            equal((initial.total() - initial.next() + 99) / 100, jdbc.queryForObject(
                    "SELECT COUNT(*) FROM sys_audit_log WHERE audit_name='IM_SYNC_SUPERSEDED' AND audit_field=?", Integer.class,
                    "im_sync:" + run.getSyncRunId()), "one superseded audit per committed closure batch");
        } finally { workers.shutdownNow(); check(workers.awaitTermination(10, TimeUnit.SECONDS), "recovery workers stop before cleanup"); }
    }

    private void unchangedOtherTenant() {
        scoped(OTHER);
        equal(1, activeAccess(OTHER, OTHER_USER), "other tenant access row remains active");
        check(projectionExists(otherHash) && internalExists(OTHER_USER), "other tenant OAuth projection and login remain active");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_refresh_token WHERE tenant_id=? AND user_id=? AND status='ACTIVE'", Integer.class, OTHER, OTHER_USER), "other refresh unchanged");
        equal(2, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_code WHERE tenant_id=? AND user_id=? AND status IN ('PENDING','ISSUED')", Integer.class, OTHER, OTHER_USER), "other authorization codes unchanged");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_approve WHERE tenant_id=? AND user_id=? AND revoked_time IS NULL", Integer.class, OTHER, OTHER_USER), "other consent unchanged");
        equal("cached-scope", redis.getCacheObject("user:datascope:" + OTHER + ":" + OTHER_USER), "other data scope unchanged");
        equal("cached-menu", caches.getCache(CacheConstants.USER_MENUS).get(OTHER_USER, String.class), "other menus unchanged");
        equal("cached-user", caches.getCache(CacheConstants.USER_DETAILS).get("stale-renamed-username", String.class), "other user cache unchanged");
        equal("before-sync", raw.opsForHash().get(namespace + OTHER + ":holiday:epoch:v2:assignments", "revision"), "other holiday epoch unchanged");
        scoped(TENANT);
    }

    private ImSyncApplication state(ImSyncRunRow run) {
        return database.read(TENANT, mapper -> {
            ImSyncRunRow stored = mapper.syncRun(TENANT, run.getSyncRunId());
            return codec.decodeCommittedApplication(TENANT, stored.getConfigId(), stored.getConfigVersion(), stored.getSnapshotHash(),
                    new ImOrgSnapshotCodec.Sealed(stored.getProgressCursor(), stored.getSnapshotEncrypted()));
        });
    }
    private String cursor(ImSyncRunRow run) { return jdbc.queryForObject("SELECT progress_cursor FROM sys_im_sync_run WHERE sync_run_id=?", String.class, run.getSyncRunId()); }
    private int auditCount(ImSyncRunRow run) { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_name='IM_SYNC_SECURITY_RECOVERY' AND audit_field=?", Integer.class, "im_sync:" + run.getSyncRunId()); }
    private int activeAccess(long tenant, long userId) { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_oauth2_access_token WHERE tenant_id=? AND user_id=? AND revoked_time IS NULL", Integer.class, tenant, userId); }
    private boolean projectionExists(String hash) { return oauthTokens.logic().getLoginIdByToken("oauth2_projection_" + hash) != null; }
    private boolean internalExists(long userId) { return StpUtil.getStpLogic().getLoginIdByToken(internalTokens.get(userId)) != null; }
    private String username(long userId) { return jdbc.queryForObject("SELECT user_name FROM sys_user WHERE user_id=?", String.class, userId); }
    private static void scoped(long tenant) { TenantContext.setTenantId(tenant); UserContext.setTenantId(tenant); TenantContext.clearTenantSkip(); }
    private static void expectOAuthDenied(Runnable operation) {
        try { operation.run(); throw new AssertionError("OAuth must reject while safety cleanup pending"); }
        catch (OAuthFailure expected) { check(expected.getCause() == null, "injected real policy rejects OAuth access without private cause"); }
    }
    private ImSyncApplication recoverDeferred(ImSyncRunRow run) {
        for (int attempt = 1; attempt <= 4; attempt++) {
            String previous = cursor(run);
            int previousAudits = auditCount(run);
            try { return recovery.recover(TENANT, run.getSyncRunId()); }
            catch (ImSyncBudget.Exhausted exhausted) {
                equal(previous, cursor(run), "budget exhaustion retains encrypted pending progress");
                equal(previousAudits, auditCount(run), "budget exhaustion commits no recovery audit");
                System.out.println("G4_IM_EFFECTS_BUDGET_DEFERRED: attempt=" + attempt + "; checkpoint_unchanged=true; audit_unchanged=true; resume_next_attempt=true");
            }
        }
        throw new AssertionError("security recovery made no progress across four transaction budgets");
    }

    private static void diagnostic(String stage, RuntimeException failure) {
        Throwable root = failure;
        while (root.getCause() != null) root = root.getCause();
        System.out.println("G4_IM_EFFECTS_FAILURE_DIAGNOSTIC: stage=" + stage + "; type=" + failure.getClass().getName()
                + "; root=" + root.getClass().getName() + "; frame=" + (root.getStackTrace().length == 0 ? "none" : root.getStackTrace()[0]));
    }
    private static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe recovery reason"); }
    }
    private static synchronized void check(boolean result, String message) { assertions++; if (!result) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

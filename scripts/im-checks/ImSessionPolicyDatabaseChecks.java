package com.cloudflow.auth.im;

import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.common.core.context.UserDataScopeSnapshot;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.permission.LoginSessionPolicy;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.UserDataScopeStore;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.session.LoginSessionPolicyService;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

final class ImSessionPolicyDatabaseChecks {
    private static final long TENANT = 100000;
    private static final long OTHER = 990100;
    private static final long USER = 997700;
    private static int assertions;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final LoginSessionPolicy policy;
    private final SysUserMapper users;
    private final TokenService tokens;
    private long runId;

    ImSessionPolicyDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions) {
        this.jdbc = jdbc;
        this.database = database;
        policy = new LoginSessionPolicyService(sessions.getMapper(LoginSessionMapper.class), new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource())));
        users = sessions.getMapper(SysUserMapper.class);
        tokens = new TokenService(policy);
    }

    void run() throws Exception {
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted,version,password) VALUES (?,100000,100,'im-session-fixture','会话核验','0',0,7,'session-fixture-hash')", USER);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,5,100000)", USER);
        try {
            identity();
            tokenValidation();
            pendingEffects();
            loginRace();
            scopeRevisions();
        } finally {
            for (String token : StpUtil.getTokenValueListByLoginId(USER)) StpUtil.logoutByTokenValue(token);
            if (runId != 0) jdbc.update("DELETE FROM sys_im_sync_run WHERE sync_run_id=? AND requested_by=?", runId, USER);
            jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND tenant_id=100000", USER);
            jdbc.update("DELETE FROM sys_user WHERE user_id=? AND user_name='im-session-fixture' AND tenant_id=100000", USER);
            TenantContext.clear();
        }
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user WHERE user_id=?", Integer.class, USER), "policy fixture user removed");
        System.out.println("G4_IM_SESSION_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_mybatis=true; real_satoken=true; revision_guard=true; pending_effects_guard=true; late_login_rejected=true; scope_cache_fixture=true; redis=false; complete_sync=false");
    }

    private void identity() {
        check(policy.accepts(TENANT, TENANT, USER, 7), "current employee session accepted");
        check(!policy.accepts(TENANT, TENANT, USER, 6), "stale revision rejected");
        check(!policy.accepts(OTHER, OTHER, USER, 7), "owner cannot be forged");
        check(!policy.accepts(TENANT, OTHER, USER, 7), "employee cannot acquire switched tenant session");
        for (long invalid : List.of(0L, -1L, Long.MAX_VALUE)) check(!policy.accepts(invalid, TENANT, USER, 7), "invalid or absent owner rejected");
        TenantContext.setTenantId(OTHER);
        TenantContext.setTenantSkip();
        try {
            check(policy.accepts(TENANT, TENANT, USER, 7), "verified identity query does not inherit caller tenant");
            equal(OTHER, TenantContext.getTenantId(), "caller tenant restored");
            check(TenantContext.getTenantSkip(), "caller skip flag restored");
        } finally { TenantContext.clear(); }
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,1,100000)", USER);
        check(policy.accepts(TENANT, OTHER, USER, 7), "current home administrator can use authorized target session");
        jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND role_id=1 AND tenant_id=100000", USER);
        check(!policy.accepts(TENANT, OTHER, USER, 7), "administrator removal invalidates existing switched session");
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", USER);
        check(!policy.accepts(TENANT, TENANT, USER, 7), "disabled user rejected without waiting for Redis cleanup");
        jdbc.update("UPDATE sys_user SET status='0',deleted=1 WHERE user_id=?", USER);
        check(!policy.accepts(TENANT, TENANT, USER, 7), "deleted user rejected");
        jdbc.update("UPDATE sys_user SET deleted=0 WHERE user_id=?", USER);
        jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=100000");
        try { check(!policy.accepts(TENANT, TENANT, USER, 7), "tenant disable enforced from database"); }
        finally { jdbc.update("UPDATE sys_tenant SET status='0' WHERE tenant_id=100000"); }
    }

    private void tokenValidation() {
        String token = session(7);
        check(tokens.verifyToken(token) != null && tokens.getLoginUserByToken(token) != null, "valid stamped session loads through actual TokenService");
        Map<String, Object> stored = claims(7);
        for (String field : List.of("ownerTenantId", "tenantId", "userId", "userVersion")) {
            Map<String, Object> missing = new HashMap<>(stored);
            missing.remove(field);
            StpUtil.getSessionByLoginId(USER).set(TokenService.LOGIN_USER_SESSION_KEY, missing);
            equal(null, tokens.getLoginUserByToken(token), "legacy or incomplete identity cannot bypass stamp: " + field);
        }
        for (Object invalid : List.of(-1, 1.5, "07", "2147483648", "9223372036854775808", true)) {
            Map<String, Object> malformed = new HashMap<>(stored);
            malformed.put("userVersion", invalid);
            StpUtil.getSessionByLoginId(USER).set(TokenService.LOGIN_USER_SESSION_KEY, malformed);
            equal(null, tokens.verifyToken(token), "malformed revision rejected");
            issuanceRejected(malformed);
        }
        StpUtil.getSessionByLoginId(USER).set(TokenService.LOGIN_USER_SESSION_KEY, stored);
        jdbc.update("UPDATE sys_user SET version=8 WHERE user_id=?", USER);
        equal(null, tokens.verifyToken(token), "old session blocked immediately on database commit");
        equal(null, tokens.getLoginUserByLoginId(USER), "permission and role provider cannot load stale session");
        equal(-2L, tokens.renewToken(token), "stale session cannot renew");
        issuanceRejected(stored);
        jdbc.update("UPDATE sys_user SET version=7 WHERE user_id=?", USER);
    }

    private void pendingEffects() {
        long configId = jdbc.queryForObject("SELECT config_id FROM sys_im_config WHERE tenant_id=100000 AND deleted=0", Long.class);
        jdbc.update("INSERT INTO sys_im_sync_run(tenant_id,config_id,config_version,mode,snapshot_hash,result_summary,status,requested_by) VALUES (100000,?,0,'APPLY',REPEAT('a',64),JSON_OBJECT('effectsPending',TRUE),'RUNNING',?)", configId, USER);
        runId = jdbc.queryForObject("SELECT sync_run_id FROM sys_im_sync_run WHERE requested_by=?", Long.class, USER);
        check(!policy.accepts(TENANT, TENANT, USER, 7), "committed pending cleanup blocks fresh and existing sessions");
        issuanceRejected(claims(7));
        for (String value : List.of("{}", "null", "{\"effectsPending\":null}", "{\"effectsPending\":0}", "{\"effectsPending\":\"false\"}", "{\"effectsPending\":true}")) {
            jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", value, runId);
            check(!policy.accepts(TENANT, TENANT, USER, 7), "missing malformed or pending marker stays closed");
        }
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", "{\"effectsPending\":false}", runId);
        check(policy.accepts(TENANT, TENANT, USER, 7), "verified no-pending marker allows next-batch ready sessions");
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=JSON_OBJECT('effectsPending',TRUE),tenant_id=990100 WHERE sync_run_id=?", runId);
        check(policy.accepts(TENANT, TENANT, USER, 7), "other tenant pending cleanup does not block this tenant");
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,1,100000)", USER);
        check(!policy.accepts(TENANT, OTHER, USER, 7), "target tenant fence also applies to switched administrator");
        jdbc.update("DELETE FROM sys_user_role WHERE user_id=? AND role_id=1 AND tenant_id=100000", USER);
        jdbc.update("UPDATE sys_im_sync_run SET tenant_id=100000,status='COMPLETED' WHERE sync_run_id=?", runId);
        check(policy.accepts(TENANT, TENANT, USER, 7), "terminal cleanup no longer blocks sessions");
    }

    private void loginRace() throws Exception {
        ExecutorService changes = Executors.newSingleThreadExecutor();
        try {
            database.write(TENANT, ignored -> {
                equal(7, jdbc.queryForObject("SELECT version FROM sys_user WHERE user_id=?", Integer.class, USER), "outer transaction sees original account version");
                try {
                    changes.submit(() -> jdbc.update("UPDATE sys_user SET version=8,nick_name='同步后的姓名',dept_id=101 WHERE user_id=?", USER)).get(10, TimeUnit.SECONDS);
                } catch (Exception failure) { throw new IllegalStateException(failure); }
                check(!policy.accepts(TENANT, TENANT, USER, 7), "guard escapes caller repeatable-read snapshot");
                check(policy.accepts(TENANT, TENANT, USER, 8), "guard reads committed account revision");
                return null;
            });
        } finally { changes.shutdownNow(); }
        database.write(TENANT, ignored -> {
            equal(0, users.recordLogin(USER, TENANT, 7, "127.0.0.80", LocalDateTime.now()), "late pre-sync login cannot update metadata");
            equal(1, users.recordLogin(USER, TENANT, 8, "127.0.0.81", LocalDateTime.now()), "fresh login writes only allowed metadata");
            return null;
        });
        equal("同步后的姓名", jdbc.queryForObject("SELECT nick_name FROM sys_user WHERE user_id=?", String.class, USER), "login never writes back stale nickname");
        equal(101L, jdbc.queryForObject("SELECT dept_id FROM sys_user WHERE user_id=?", Long.class, USER), "login never writes back stale department");
        equal(8, jdbc.queryForObject("SELECT version FROM sys_user WHERE user_id=?", Integer.class, USER), "metadata-only login does not invalidate preview revision");
        equal("session-fixture-hash", jdbc.queryForObject("SELECT password FROM sys_user WHERE user_id=?", String.class, USER), "metadata-only login preserves password");
        check(tokens.verifyToken(session(8)) != null, "fresh login state works after synchronized changes");
        TokenService unavailable = new TokenService((owner, tenant, user, revision) -> { throw new IllegalStateException("controlled-session-policy-unavailable"); });
        equal(null, unavailable.getLoginUserByLoginId(USER), "policy unavailability fails closed");
    }

    private void scopeRevisions() throws Exception {
        UserDataScopeSnapshot cached = new UserDataScopeSnapshot();
        cached.setTenantId(TENANT); cached.setUserId(USER); cached.setDsType(0); cached.setDsDeptIds(List.of(900L));
        RedisCache controlled = new RedisCache() {
            @Override @SuppressWarnings("unchecked") public <Value> Value getCacheObject(String key) { return (Value) cached; }
        };
        UserContextInterceptor interceptor = new UserContextInterceptor();
        Field storage = UserContextInterceptor.class.getDeclaredField("userDataScopeStore");
        storage.setAccessible(true); storage.set(interceptor, new UserDataScopeStore(controlled));
        Method refresh = UserContextInterceptor.class.getDeclaredMethod("refreshDynamicDataScope", Map.class);
        refresh.setAccessible(true);
        Map<String, Object> session = claims(8);
        session.put("dsType", 4); session.put("dsDeptIds", List.of());
        refresh.invoke(interceptor, session);
        equal(4, session.get("dsType"), "legacy cached scope without revision ignored");
        cached.setUserVersion(7);
        refresh.invoke(interceptor, session);
        equal(4, session.get("dsType"), "old broad scope cannot replace synchronized restricted session");
        cached.setUserVersion(8);
        cached.setTenantId(OTHER);
        refresh.invoke(interceptor, session);
        equal(4, session.get("dsType"), "same-revision other tenant scope ignored");
        equal(TENANT, session.get("tenantId"), "cache cannot replace verified tenant identity");
        cached.setTenantId(TENANT);
        cached.setUserId(USER + 1);
        refresh.invoke(interceptor, session);
        equal(4, session.get("dsType"), "same-revision other user scope ignored");
        cached.setUserId(USER);
        refresh.invoke(interceptor, session);
        equal(0, session.get("dsType"), "same-revision dynamic scope still applies");
    }

    private String session(int revision) {
        String token = StpUtil.getStpLogic().createLoginSession(USER, new SaLoginParameter().setTimeout(300).setIsConcurrent(true).setIsShare(false));
        StpUtil.getSessionByLoginId(USER).set(TokenService.LOGIN_USER_SESSION_KEY, claims(revision));
        return token;
    }
    private static Map<String, Object> claims(int revision) { return new HashMap<>(Map.of("userId", USER, "ownerTenantId", TENANT, "tenantId", TENANT, "userVersion", revision)); }
    private void issuanceRejected(Map<String, Object> claims) { try { tokens.createToken(claims); throw new AssertionError("Invalid session issuance accepted"); } catch (ServiceException rejected) { check(rejected.getMessage().contains("重新登录"), "invalid issuance rejected before creating Sa-Token state"); } }
    private static void check(boolean success, String message) { assertions++; if (!success) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

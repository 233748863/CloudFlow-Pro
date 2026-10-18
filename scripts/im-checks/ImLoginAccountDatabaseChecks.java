package com.cloudflow.auth.im;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import java.lang.reflect.Proxy;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

final class ImLoginAccountDatabaseChecks {
    private static final long TENANT = 990200;
    private static final long USER = 990201;
    private static final long CONFIG = 990204;
    private static final String REJECTED = "IM_LOGIN_ACCOUNT_UNAVAILABLE";
    private final JdbcTemplate jdbc;
    private final ImMapper mapper;
    private final ImDatabase database;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private final SqlSessionTemplate sessions;
    private final AtomicInteger assertions = new AtomicInteger();

    ImLoginAccountDatabaseChecks(JdbcTemplate jdbc, ImMapper mapper, ImDatabase database, ImConfigRules rules, ImProperties properties, SqlSessionTemplate sessions) {
        this.jdbc = jdbc;
        this.mapper = mapper;
        this.database = database;
        this.rules = rules;
        this.properties = properties;
        this.sessions = sessions;
    }

    void run() {
        boolean previousEnabled = properties.isEnabled();
        List<String> previousPaths = properties.getLoginRedirectPaths();
        AtomicBoolean banned = new AtomicBoolean();
        AtomicBoolean locked = new AtomicBoolean();
        ISysUserBlacklistService blacklist = (ISysUserBlacklistService) Proxy.newProxyInstance(getClass().getClassLoader(),
                new Class<?>[]{ISysUserBlacklistService.class}, (proxy, method, arguments) -> {
                    if (!"isBanned".equals(method.getName())) throw new AssertionError("Unexpected blacklist operation");
                    equal(USER, arguments[0], "only mapped local user checked for blacklisting");
                    return banned.get();
                });
        LoginLockService locks = new LoginLockService() {
            @Override public boolean isLocked(String username, Long tenantId) {
                equal("im-login-member", username, "lock checks mapped username");
                equal(TENANT, tenantId, "lock checks mapped tenant");
                return locked.get();
            }
        };
        ImLoginRedirects redirects = new ImLoginRedirects(properties);
        ImLoginAccounts accounts = new ImLoginAccounts(mapper, database, rules, redirects, blacklist, locks,
                new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class),
                        new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()))));
        properties.setEnabled(true);
        properties.setLoginRedirectPaths(List.of("/dashboard"));
        try {
            jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,deleted) VALUES(990200,'im-login-tenant','IM登录验证租户','0',0)");
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required) VALUES(990201,990200,'im-login-member','IM登录验证用户','unusable-fixture-hash','0',0,'1')");
            ImConfigRow row = new ImConfigRow();
            row.setTenantId(TENANT);
            row.setConfigId(CONFIG);
            row.setImType("WECOM");
            row.setVersion(0);
            row.setDeleted(0);
            ImConfigRequest request = ImConfigChecks.createRequest();
            request.setStatus("ENABLED");
            request.setLoginEnabled(true);
            request.setCallbackUrl(rules.expectedCallbackUrl(CONFIG));
            rules.assign(row, request);
            row.setCreateBy("im-login-check");
            row.setUpdateBy("im-login-check");
            row.setCreateTime(LocalDateTime.now());
            row.setUpdateTime(row.getCreateTime());
            database.write(TENANT, scoped -> { equal(1, scoped.insertConfig(row), "encrypted login configuration inserted"); return null; });
            long configId = row.getConfigId();
            jdbc.update("UPDATE sys_im_config SET callback_url=? WHERE tenant_id=? AND config_id=?", rules.expectedCallbackUrl(configId), TENANT, configId);
            jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status) VALUES(?,?,?,'WECOM','Exact.Member','AUTO_SYNC',NOW(),'ACTIVE')", TENANT, configId, USER);
            WeComCredentials credentials = accounts.configuration("im-login-tenant");
            equal(TENANT, credentials.tenantId(), "public tenant code resolves server tenant");
            equal(configId, credentials.configId(), "public tenant code resolves server configuration");
            ImLoginChallenges.Context context = new ImLoginChallenges.Context(TENANT, configId, credentials.version(), credentials.corpId(),
                    credentials.agentId(), redirects.callbackUrl(), "/dashboard", ImLoginChallenges.Purpose.SCAN_LOGIN, null, null, null, null);
            ImIdentityProvider.Member member = new ImIdentityProvider.Member(TENANT, configId, credentials.version(), credentials.corpId(), "Exact.Member");
            Long originalTenant = TenantContext.getTenantId();
            ImLoginAccounts.Account account = accounts.identify(context, member);
            equal(originalTenant, TenantContext.getTenantId(), "identity lookup restores incoming tenant context");
            equal(USER, account.userId(), "exact unique mapping selects local account");
            SysUser user = accounts.recheck(account);
            equal("1", user.getPwdResetRequired(), "forced password change preserved for common login policy");
            equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_user_role WHERE user_id=?", Integer.class, USER), "identity verification grants no role");
            check(!account.toString().contains("Exact.Member"), "proof string output hides external identifier");
            packages(accounts, context, member, account);
            for (String wrong : List.of("missing", "IM-LOGIN-TENANT", "im-login-tenant ", "' OR 1=1 --")) rejected(() -> accounts.configuration(wrong), REJECTED);
            for (String wrong : List.of("exact.member", "Exact.Member ", "unknown", "' OR 1=1 --")) {
                rejected(() -> accounts.identify(context, new ImIdentityProvider.Member(TENANT, configId, 0, credentials.corpId(), wrong)), REJECTED);
            }
            for (ImIdentityProvider.Member wrong : List.of(new ImIdentityProvider.Member(TENANT + 1, configId, 0, credentials.corpId(), "Exact.Member"),
                    new ImIdentityProvider.Member(TENANT, configId + 1, 0, credentials.corpId(), "Exact.Member"),
                    new ImIdentityProvider.Member(TENANT, configId, 1, credentials.corpId(), "Exact.Member"),
                    new ImIdentityProvider.Member(TENANT, configId, 0, "wrongCorp", "Exact.Member"))) rejected(() -> accounts.identify(context, wrong), REJECTED);
            jdbc.update("UPDATE sys_im_user_mapping SET status='OUT_OF_SCOPE' WHERE tenant_id=?", TENANT);
            equal(USER, accounts.recheck(account).getUserId(), "scope exit preserves account and login binding");
            jdbc.update("UPDATE sys_im_user_mapping SET version=version+1 WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(account), REJECTED);
            ImLoginAccounts.Account current = accounts.identify(context, member);
            jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(current), REJECTED);
            jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE' WHERE tenant_id=?", TENANT);
            jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", USER);
            rejected(() -> accounts.recheck(current), REJECTED);
            jdbc.update("UPDATE sys_user SET status='0',deleted=1 WHERE user_id=?", USER);
            rejected(() -> accounts.recheck(current), REJECTED);
            jdbc.update("UPDATE sys_user SET deleted=0,version=version+1 WHERE user_id=?", USER);
            rejected(() -> accounts.recheck(current), REJECTED);
            ImLoginAccounts.Account revised = accounts.identify(context, member);
            banned.set(true);
            rejected(() -> accounts.recheck(revised), REJECTED);
            banned.set(false);
            locked.set(true);
            rejected(() -> accounts.recheck(revised), REJECTED);
            locked.set(false);
            jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(revised), REJECTED);
            jdbc.update("UPDATE sys_tenant SET status='0',expire_time=NOW()-INTERVAL 1 SECOND WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(revised), REJECTED);
            jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=?", TENANT);
            jdbc.update("UPDATE sys_im_config SET login_enabled=0 WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(revised), REJECTED);
            jdbc.update("UPDATE sys_im_config SET login_enabled=1,status='DISABLED' WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(revised), REJECTED);
            jdbc.update("UPDATE sys_im_config SET status='ENABLED',version=version+1 WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(revised), REJECTED);
            rejected(() -> accounts.identify(context, member), "IM_LOGIN_CHALLENGE_INVALID");
            properties.setEnabled(false);
            rejected(() -> accounts.configuration("im-login-tenant"), "IM_DISABLED");
        } finally {
            properties.setEnabled(previousEnabled);
            properties.setLoginRedirectPaths(previousPaths);
            jdbc.update("DELETE FROM sys_im_user_mapping WHERE tenant_id=?", TENANT);
            jdbc.update("DELETE FROM sys_im_config WHERE tenant_id=?", TENANT);
            jdbc.update("DELETE FROM sys_user WHERE tenant_id=?", TENANT);
            jdbc.update("DELETE FROM sys_tenant WHERE tenant_id=?", TENANT);
        }
        System.out.println("G4_IM_LOGIN_ACCOUNT_DATABASE: assertions=" + assertions
                + "; failed=0; real_mysql=true; real_mybatis=true; identity_provider=fixture; blacklist_lock=controlled; identity_lookup_issues_tokens=false; includes_nested_flow_identity_assertions=true; production_modified=false");
    }

    private void packages(ImLoginAccounts accounts, ImLoginChallenges.Context context, ImIdentityProvider.Member member, ImLoginAccounts.Account account) {
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_id=1788 AND perms='system:im:binding:mine' AND status='0'", Integer.class), "actual formal binding menu controls login package");
        try {
            jdbc.update("UPDATE sys_tenant SET package_id=990200,package_version=0,effective_menu_ids='[2]' WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.configuration("im-login-tenant"), "IM_LOGIN_PACKAGE_UNAVAILABLE");
            rejected(() -> accounts.identify(context, member), "IM_LOGIN_PACKAGE_UNAVAILABLE");
            rejected(() -> accounts.recheck(account), "IM_LOGIN_PACKAGE_UNAVAILABLE");
            jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6,1780,1781,1782,1785]' WHERE tenant_id=?", TENANT);
            rejected(() -> accounts.recheck(account), "IM_LOGIN_PACKAGE_UNAVAILABLE");
            jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[2,1788]' WHERE tenant_id=?", TENANT);
            equal(account, accounts.identify(context, member), "selected self-binding permits login identity without configuration-management permission");
            equal(USER, accounts.recheck(account).getUserId(), "selected self-binding permits enrolled MFA account");
            jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=1788");
            rejected(() -> accounts.recheck(account), "IM_LOGIN_PACKAGE_UNAVAILABLE");
            jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=1788");
            new ImLoginMfaChecks(jdbc, sessions, properties, accounts, context, account).run();
            new ImLoginFlowDatabaseChecks(jdbc, sessions, database, properties, accounts, account).run();
        } finally {
            jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", TENANT);
            jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=1788 AND perms='system:im:binding:mine'");
        }
        equal(USER, accounts.recheck(account).getUserId(), "existing unrestricted-tenant policy preserved");
    }

    private void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("Expected " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe rejection reason"); }
    }
    private void check(boolean success, String message) { assertions.incrementAndGet(); if (!success) throw new AssertionError(message); }
    private void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

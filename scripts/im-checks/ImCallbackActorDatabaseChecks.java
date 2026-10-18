package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.auth.service.ISysUserBlacklistService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import java.lang.reflect.Proxy;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;

final class ImCallbackActorDatabaseChecks {
    private static final long USER = 992804L;
    private static final long ROLE = 992805L;
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImConfigRules rules;
    private final ImCallbackInbox inbox;
    private final WeComCredentials credentials;
    private final AtomicBoolean banned = new AtomicBoolean();
    private final AtomicBoolean locked = new AtomicBoolean();
    private int assertions;

    ImCallbackActorDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions, ImConfigRules rules,
            ImCallbackInbox inbox, WeComCredentials credentials) {
        this.jdbc = jdbc; this.database = database; this.sessions = sessions; this.rules = rules; this.inbox = inbox; this.credentials = credentials;
    }

    void run(ImCardCallback event) {
        long tenant = credentials.tenantId();
        long config = credentials.configId();
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted,pwd_reset_required,version) VALUES (?,?,'callback-owned-member','回调验证员工','0',0,'0',0)", USER, tenant);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (?,?,'回调审批角色','callback-owned',1,'0',0)", ROLE, tenant);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,?,?)", USER, ROLE, tenant);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) SELECT ?,menu_id,? FROM sys_menu WHERE perms='workflow:task:complete' AND status='0'", ROLE, tenant);
        jdbc.update("INSERT INTO sys_im_user_mapping(tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES (?,?,?,'WECOM','callback-member-private','AUTO_SYNC',NOW(),'ACTIVE',0)", tenant, config, USER);
        jdbc.update("UPDATE sys_im_todo_mapping SET receiver_user_id=? WHERE config_id=? AND tenant_id=?", USER, config, tenant);
        ISysUserBlacklistService blacklist = (ISysUserBlacklistService) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{ISysUserBlacklistService.class},
                (proxy, method, arguments) -> {
                    if (!"isBanned".equals(method.getName()) || !Long.valueOf(USER).equals(arguments[0])) throw new AssertionError("Only persisted callback actor may be checked");
                    return banned.get();
                });
        LoginLockService locks = new LoginLockService() {
            @Override public boolean isLocked(String username, Long tenantId) {
                if (!"callback-owned-member".equals(username) || !Long.valueOf(tenant).equals(tenantId)) throw new AssertionError("Only persisted callback actor lock may be checked");
                return locked.get();
            }
        };
        ImCallbackAccounts accounts = new ImCallbackAccounts(database, sessions.getMapper(ImCallbackMapper.class), rules,
                new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()))), blacklist, locks);
        ImCallbackInbox.Receipt receipt = inbox.receive(credentials, event, "127.0.0.1");
        ImCallbackRow claim = inbox.claim(tenant, receipt.callbackId());
        ImTaskCallbacks.Actor actor = accounts.require(claim);
        check(actor.userId() == USER && actor.tenantId() == tenant && actor.configId() == config && "APPROVE".equals(actor.action()), "persisted sender and local approval role identify actor");
        check(actor.equals(accounts.verify(actor.request())), "internal verification accepts only persisted event reference");
        claim.setImUserId("forged-member"); claim.setActionType("REJECT"); claim.setTaskMappingId(1L); claim.setConfigId(1L);
        check(actor.equals(accounts.require(claim)), "mutable claim cannot replace persisted sender action mapping or configuration");
        TenantContext.setTenantSkip();
        try { check(actor.equals(accounts.require(claim)) && TenantContext.getTenantSkip(), "tenant skip cannot change current actor and is restored"); }
        finally { TenantContext.clearTenantSkip(); }
        long mapping = actor.todoMappingId();
        jdbc.update("UPDATE sys_im_todo_mapping SET im_user_id='different-member' WHERE mapping_id=?", mapping);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "different card receiver rejected"); }
        finally { jdbc.update("UPDATE sys_im_todo_mapping SET im_user_id='callback-member-private' WHERE mapping_id=?", mapping); }
        jdbc.update("UPDATE sys_im_todo_mapping SET status='CANCELLED' WHERE mapping_id=?", mapping);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_STALE", "cancelled card rejected"); }
        finally { jdbc.update("UPDATE sys_im_todo_mapping SET status='SENT' WHERE mapping_id=?", mapping); }
        jdbc.update("UPDATE sys_im_todo_mapping SET status='PENDING' WHERE mapping_id=?", mapping);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_UNAVAILABLE", "callback waits for in-flight delivery state"); }
        finally { jdbc.update("UPDATE sys_im_todo_mapping SET status='SENT' WHERE mapping_id=?", mapping); }
        jdbc.update("UPDATE sys_im_todo_mapping SET status='UNKNOWN' WHERE mapping_id=?", mapping);
        try { check(accounts.require(claim).userId() == USER, "signed callback can identify recipient after unknown send outcome"); }
        finally { jdbc.update("UPDATE sys_im_todo_mapping SET status='SENT' WHERE mapping_id=?", mapping); }
        jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE tenant_id=? AND config_id=?", tenant, config);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "stopped organization binding rejects action"); }
        finally { jdbc.update("UPDATE sys_im_user_mapping SET status='OUT_OF_SCOPE' WHERE tenant_id=? AND config_id=?", tenant, config); }
        check(accounts.require(claim).userId() == USER, "out of sync scope retains valid binding");
        jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE' WHERE tenant_id=? AND config_id=?", tenant, config);
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", USER);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "disabled local account rejected"); }
        finally { jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=?", USER); }
        jdbc.update("UPDATE sys_user SET pwd_reset_required='1' WHERE user_id=?", USER);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "required password change cannot be bypassed"); }
        finally { jdbc.update("UPDATE sys_user SET pwd_reset_required='0' WHERE user_id=?", USER); }
        banned.set(true);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "blacklisted user rejected"); } finally { banned.set(false); }
        locked.set(true);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "locked user rejected"); } finally { locked.set(false); }
        jdbc.update("UPDATE sys_role SET status='1' WHERE role_id=?", ROLE);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "revoked current approval role rejected"); }
        finally { jdbc.update("UPDATE sys_role SET status='0' WHERE role_id=?", ROLE); }
        jdbc.update("UPDATE sys_tenant SET package_id=992806,package_version=0,effective_menu_ids='[]' WHERE tenant_id=?", tenant);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "package removing approval permission rejected"); }
        finally { jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=?", tenant); }
        jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE config_id=?", config);
        try { rejected(() -> accounts.require(claim), "IM_CALLBACK_ACTOR_UNAVAILABLE", "disabled todo configuration rejected"); }
        finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE config_id=?", config); }
        jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE callback_id=?", receipt.callbackId());
        rejected(() -> accounts.require(claim), "IM_CALLBACK_STALE", "expired processing lease rejected");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=?", Integer.class, tenant) == 0, "identity verification alone executes no workflow action");
        System.out.println("G4_IM_CALLBACK_ACTOR_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; real_role_permission=true; real_package_permission=true; blacklist_lock=controlled; workflow_action=false; vendor_service=false");
        todoProjection(new ImTodoAccounts(database, sessions.getMapper(ImCallbackMapper.class), rules,
                new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), new DataSourceTransactionManager(Objects.requireNonNull(jdbc.getDataSource()))), blacklist, locks), mapping);
    }

    private void todoProjection(ImTodoAccounts accounts, long mapping) {
        int before = assertions;
        long tenant = credentials.tenantId();
        ImTaskTodos.Request request = new ImTaskTodos.Request(tenant, mapping);
        rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "todo projection requires current reading permissions");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) SELECT ?,menu_id,? FROM sys_menu WHERE perms IN ('workflow:task:todo','workflow:process:view') AND status='0'", ROLE, tenant);
        ImTaskTodos.Actor actor = accounts.verify(request);
        check(actor.userId() == USER && actor.request().equals(request), "todo recipient comes from persisted mapping");
        check(actor.permissions().containsAll(java.util.Set.of("workflow:task:todo", "workflow:process:view", "workflow:task:complete")), "todo permissions retain real role grants");
        rejected(() -> accounts.verify(new ImTaskTodos.Request(tenant + 1, mapping)), "IM_CALLBACK_STALE", "mapping cannot cross tenants");
        for (String state : java.util.List.of("PENDING", "SENT", "UNKNOWN")) {
            jdbc.update("UPDATE sys_im_todo_mapping SET status=? WHERE mapping_id=?", state, mapping);
            check(accounts.verify(request).userId() == USER, "valid delivery states permit current projection");
        }
        jdbc.update("UPDATE sys_im_todo_mapping SET status='CANCELLED' WHERE mapping_id=?", mapping);
        rejected(() -> accounts.verify(request), "IM_CALLBACK_STALE", "cancelled mapping cannot read form values");
        jdbc.update("UPDATE sys_im_todo_mapping SET status='SENT' WHERE mapping_id=?", mapping);
        jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE tenant_id=? AND user_id=?", tenant, USER);
        rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "disabled binding cannot read form values");
        jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE' WHERE tenant_id=? AND user_id=?", tenant, USER);
        banned.set(true);
        try { rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "blacklisted recipient cannot receive summary"); }
        finally { banned.set(false); }
        locked.set(true);
        try { rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "locked account cannot receive summary"); }
        finally { locked.set(false); }
        jdbc.update("UPDATE sys_user SET pwd_reset_required='1' WHERE user_id=?", USER);
        try { rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "password reset requirement blocks summary"); }
        finally { jdbc.update("UPDATE sys_user SET pwd_reset_required='0' WHERE user_id=?", USER); }
        jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE config_id=?", credentials.configId());
        try { rejected(() -> accounts.verify(request), "IM_CALLBACK_ACTOR_UNAVAILABLE", "disabled todo configuration blocks projection"); }
        finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE config_id=?", credentials.configId()); }
        jdbc.update("UPDATE sys_im_todo_mapping SET version=version+1 WHERE mapping_id=?", mapping);
        check(!actor.equals(accounts.verify(request)), "mapping changes invalidate previous identity snapshot");
        System.out.println("G4_IM_TODO_ACTOR_DATABASE: assertions=" + (assertions - before) + "; failed=0; real_mysql=true; roles_and_packages=true; blacklist_lock=controlled; external_sends=0");
        new ImTodoDeliveryDatabaseChecks(jdbc, database, sessions, rules, accounts, credentials, USER).run();
    }

    private void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
    private void rejected(Runnable operation, String code, String message) {
        boolean denied = false;
        try { operation.run(); } catch (ImFailure failure) { denied = code.equals(failure.getReasonCode()); }
        check(denied, message);
    }
}

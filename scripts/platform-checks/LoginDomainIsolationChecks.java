package com.cloudflow.common.security.service;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.common.security.core.TokenService;
import java.lang.reflect.Field;
import java.util.List;
import java.util.Map;

public class LoginDomainIsolationChecks {
    private static final Long SHARED_USER_ID = 100L;
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaManager.setConfig(new SaTokenConfig().setDataRefreshPeriod(-1).setIsPrint(false));
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        StpInterface previousPermissions = SaManager.getStpInterface();
        StpLogic previousLogic = StpUtil.getStpLogic();
        SaTokenDaoDefaultImpl ownedDao = new SaTokenDaoDefaultImpl();
        try {
            SaManager.setSaTokenDao(ownedDao);
            StpUtil.setStpLogic(new StpLogic("login"));
            LoginDomainIsolationChecks.ObservedTokenService tokens = new ObservedTokenService();
            CloudFlowStpInterface permissions = new CloudFlowStpInterface();
            Field tokenField = CloudFlowStpInterface.class.getDeclaredField("tokenService");
            tokenField.setAccessible(true);
            tokenField.set(permissions, tokens);
            Field policyField = CloudFlowStpInterface.class.getDeclaredField("currentPermissions");
            policyField.setAccessible(true);
            policyField.set(permissions, new CurrentPermissionService(tenantId ->
                    new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, java.util.Set.of(), java.util.Set.of())));
            SaManager.setStpInterface(permissions);
            String internalToken = StpUtil.getStpLogic().createLoginSession(SHARED_USER_ID,
                    new SaLoginParameter().setTimeout(3600).setIsShare(false));
            StpUtil.getSessionByLoginId(SHARED_USER_ID).set(TokenService.LOGIN_USER_SESSION_KEY,
                    Map.of("userId", SHARED_USER_ID, "tenantId", 100000L, "username", "internal-domain-check",
                            "permissions", List.of("system:user:edit", "crm:email:send"), "roles", List.of("ADMIN", " Sales_Rep ")));

            check(permissions.getPermissionList(SHARED_USER_ID, "login")
                    .stream().collect(java.util.stream.Collectors.toSet()).equals(java.util.Set.of("system:user:edit", "crm:email:send")), "internal permissions remain unchanged");
            check(permissions.getRoleList(SHARED_USER_ID, "login").equals(List.of("admin", "sales_rep")),
                    "internal role normalization remains unchanged");
            check(StpUtil.hasPermission(SHARED_USER_ID, "system:user:edit"), "real internal permission lookup succeeds");
            check(StpUtil.hasRole(SHARED_USER_ID, "admin"), "real internal role lookup succeeds");
            check(tokens.verifyToken(internalToken) != null, "real internal token remains valid");

            for (String loginType : new String[]{"portal", "oauth2"}) {
                StpLogic external = new StpLogic(loginType).setConfig(new SaTokenConfig()
                        .setTokenName(loginType + "-token").setTimeout(28800).setActiveTimeout(1800)
                        .setIsReadCookie(false).setIsReadBody(false).setIsReadHeader(true));
                String externalToken = external.createLoginSession(SHARED_USER_ID,
                        new SaLoginParameter().setTimeout(28800).setIsShare(false));
                external.getSessionByLoginId(SHARED_USER_ID).set(TokenService.LOGIN_USER_SESSION_KEY,
                        Map.of("permissions", List.of("*:*:*", "crm:portal:ticket:list"), "roles", List.of("admin")));
                check(!external.splicingKeySession(SHARED_USER_ID).equals(StpUtil.getStpLogic().splicingKeySession(SHARED_USER_ID)),
                        loginType + " session key is distinct for identical numeric IDs");
                check(tokens.verifyToken(externalToken) == null, loginType + " token cannot enter internal token service");
                check(external.getLoginIdByToken(internalToken) == null, "internal token cannot enter " + loginType);
                int lookupsBefore = tokens.lookups;
                check(permissions.getPermissionList(SHARED_USER_ID, loginType).isEmpty(),
                        loginType + " cannot inherit internal permissions for the same numeric ID");
                check(permissions.getRoleList(SHARED_USER_ID, loginType).isEmpty(),
                        loginType + " cannot inherit internal roles for the same numeric ID");
                check(!external.hasPermission(SHARED_USER_ID, "system:user:edit"),
                        loginType + " real Sa-Token permission query denies internal writes");
                check(!external.hasPermission(SHARED_USER_ID, "crm:portal:ticket:list"),
                        loginType + " unimplemented permissions are not taken from arbitrary session fields");
                check(!external.hasRole(SHARED_USER_ID, "admin"), loginType + " real Sa-Token role query denies internal admin");
                check(tokens.lookups == lookupsBefore, loginType + " denial never reads internal account sessions");
            }

            for (String loginType : new String[]{null, "", " ", "LOGIN", "login ", " portal", "PORTAL", "unknown"}) {
                int lookupsBefore = tokens.lookups;
                check(permissions.getPermissionList(SHARED_USER_ID, loginType).isEmpty(), "unknown login domain has no permissions");
                check(permissions.getRoleList(SHARED_USER_ID, loginType).isEmpty(), "unknown login domain has no roles");
                check(tokens.lookups == lookupsBefore, "unknown login domain never queries internal sessions");
            }
            check(permissions.getPermissionList(null, "login").isEmpty(), "null internal ID has no permissions");
            check(permissions.getRoleList(999999L, "login").isEmpty(), "absent internal session has no roles");
            check(tokens.verifyToken(internalToken) != null, "external denials do not revoke the internal session");
            check(StpUtil.hasPermission(SHARED_USER_ID, "crm:email:send"), "existing internal CRM permissions survive all boundary checks");
            System.out.println("LOGIN_DOMAIN_ISOLATION_CHECKS: assertions=" + checks
                    + "; failed=0; real_sa_token=true; same_numeric_id=true; cache=in_process; mysql=false; redis=false; http=false; external_domains_enabled=false; production_modified=false");
        } finally {
            StpUtil.setStpLogic(previousLogic);
            SaManager.setStpInterface(previousPermissions);
            SaManager.setSaTokenDao(previousDao);
            ownedDao.destroy();
            if (previousDao instanceof SaTokenDaoDefaultImpl previousInProcessDao) {
                previousInProcessDao.destroy();
            }
            SaManager.setConfig(previousConfig);
        }
    }

    private static void check(boolean condition, String label) {
        if (!condition) {
            throw new AssertionError(label);
        }
        checks++;
    }

    private static class ObservedTokenService extends TokenService {
        private int lookups;

        @Override
        public Map<String, Object> getLoginUserByLoginId(Object loginId) {
            lookups++;
            return super.getLoginUserByLoginId(loginId);
        }
    }
}

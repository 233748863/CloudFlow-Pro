package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.domain.vo.DynamicMapVO;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ForcePasswordChangeService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class AuthInfoTenantIdentityChecks {
    private static final Long ACCOUNT_ID = 987654L;
    private static final Long ACCOUNT_TENANT = 100000L;
    private static final Long TARGET_TENANT = 100001L;
    private static final Long OUTER_CONTEXT_TENANT = 220002L;
    private static final String USERNAME = "offline-info-identity";
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        successfulIdentity(TARGET_TENANT, false);
        successfulIdentity(TARGET_TENANT, true);
        successfulIdentity(ACCOUNT_TENANT, false);

        Fixture ordinary = new Fixture(ACCOUNT_TENANT);
        ordinary.tokenUser.put("roles", Set.of("EMPLOYEE"));
        ordinary.userInfo.setRoles(Set.of("employee"));
        ordinary.tokenUser.remove("deptId");
        SysUser ordinaryUser = responseUser(invoke(ordinary));
        check(Objects.equals(ordinaryUser.getDeptId(), ordinary.account.getDeptId()), "same-tenant legacy token retains its own department");

        Fixture renamed = new Fixture(ACCOUNT_TENANT);
        renamed.tokenUser.put("username", "previous-account-name");
        check(USERNAME.equals(responseUser(invoke(renamed)).getUserName()), "renamed account is resolved by immutable login user ID");

        Fixture tokenNotAdmin = new Fixture(TARGET_TENANT);
        tokenNotAdmin.tokenUser.put("roles", Set.of("EMPLOYEE"));
        rejected(tokenNotAdmin, 403, "non-admin session cannot adopt another tenant");

        Fixture currentRoleRevoked = new Fixture(TARGET_TENANT);
        currentRoleRevoked.userInfo.setRoles(Set.of("employee"));
        rejected(currentRoleRevoked, 403, "revoked administrator role cannot retain a switched identity");

        Fixture disabled = new Fixture(TARGET_TENANT);
        disabled.account.setStatus("1");
        rejected(disabled, 401, "disabled source account is rejected");
        check(disabled.lookups.isEmpty(), "disabled account does not read cached permissions");

        Fixture deleted = new Fixture(TARGET_TENANT);
        deleted.account.setDeleted(1);
        rejected(deleted, 401, "deleted source account is rejected");

        Fixture missing = new Fixture(TARGET_TENANT);
        missing.account = null;
        rejected(missing, 401, "missing source account is rejected");

        Fixture noAccountTenant = new Fixture(TARGET_TENANT);
        noAccountTenant.account.setTenantId(null);
        rejected(noAccountTenant, 401, "source account without a tenant is rejected");

        Fixture noTokenTenant = new Fixture(TARGET_TENANT);
        noTokenTenant.tokenUser.remove("tenantId");
        rejected(noTokenTenant, 401, "session without a tenant is rejected");

        Fixture noUserId = new Fixture(TARGET_TENANT);
        noUserId.tokenUser.remove("userId");
        rejected(noUserId, 401, "session without an immutable account ID is rejected");

        Fixture cacheMiss = new Fixture(TARGET_TENANT);
        cacheMiss.userInfo = null;
        rejected(cacheMiss, 401, "missing source identity cache result is rejected");

        Fixture emptyCacheUser = new Fixture(TARGET_TENANT);
        emptyCacheUser.userInfo.setSysUser(null);
        rejected(emptyCacheUser, 401, "cached identity without an account is rejected");

        Fixture mismatchedCacheId = new Fixture(TARGET_TENANT);
        mismatchedCacheId.userInfo.getSysUser().setUserId(ACCOUNT_ID + 1);
        rejected(mismatchedCacheId, 401, "cached same-name account with a different ID is rejected");

        Fixture mismatchedCacheTenant = new Fixture(TARGET_TENANT);
        mismatchedCacheTenant.userInfo.getSysUser().setTenantId(TARGET_TENANT);
        rejected(mismatchedCacheTenant, 401, "cached identity from another tenant is rejected");

        Fixture expired = new Fixture(TARGET_TENANT);
        expired.expired = true;
        rejected(expired, 401, "expired login session is rejected");
        check(expired.selectedIds.isEmpty(), "expired session does not read an account");

        for (boolean mapperFailure : new boolean[]{false, true}) {
            Fixture failure = new Fixture(TARGET_TENANT);
            failure.queryFailure = new IllegalStateException("offline identity lookup failure");
            failure.mapperFailure = mapperFailure;
            Throwable actual = null;
            try {
                invoke(failure);
            } catch (IllegalStateException exception) {
                actual = exception;
            }
            check(actual == failure.queryFailure, "identity lookup exception propagates unchanged: mapper=" + mapperFailure);
        }
        Fixture restricted = new Fixture(TARGET_TENANT);
        restricted.tokenUser.put("permissions", Set.of("*:*:*"));
        restricted.entitlement = new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(1L, 0, 1,
                Set.of(900L), Set.of("system:auth:info"));
        check(Set.of("system:auth:info").equals(invoke(restricted).getData().values().get("permissions")), "info returns concrete package intersection for admin");
        check(Set.of("*:*:*").equals(restricted.tokenUser.get("permissions")), "info never overwrites the original session grants");
        System.out.println("AUTH_INFO_TENANT_IDENTITY: checks=" + checks + "; failed=0; real_controller=true; service_doubles=true; mysql=false; http=false");
    }

    private static void successfulIdentity(Long targetTenant, boolean sameNameTargetExists) throws Exception {
        Fixture fixture = new Fixture(targetTenant);
        fixture.sameNameTargetExists = sameNameTargetExists;
        R<DynamicMapVO> result = invoke(fixture);
        SysUser returned = responseUser(result);
        check(Objects.equals(returned.getUserId(), ACCOUNT_ID), "identity remains the original login account");
        check(Objects.equals(returned.getTenantId(), targetTenant), "identity reports the selected business tenant");
        check(USERNAME.equals(returned.getUserName()) && "live-source-profile".equals(returned.getNickName()), "profile is loaded from the live original account");
        check("fixture-selected-tenant".equals(returned.getTenantName()), "selected tenant name is retained");
        check(returned.getDeptId() == null, "explicitly cleared switched department stays empty");
        check(Boolean.TRUE.equals(result.getData().values().get("forcePasswordChange")), "password-change requirement uses the live account");
        check(fixture.selectedIds.equals(List.of(ACCOUNT_ID)), "only the authenticated immutable account ID is read");
        check(fixture.lookups.size() == 1, "one tenant-qualified source identity lookup is performed");
        Lookup lookup = fixture.lookups.get(0);
        check(USERNAME.equals(lookup.username()) && ACCOUNT_TENANT.equals(lookup.tenantId()), "same-name target account is never substituted");
        check(ACCOUNT_TENANT.equals(lookup.userTenant()) && ACCOUNT_TENANT.equals(lookup.contextTenant()), "source account cache namespace matches its tenant eviction namespace");
        check(!lookup.tenantSkip(), "permission lookup retains the source tenant database filter");
        Object permissions = result.getData().values().get("permissions");
        check(permissions instanceof Collection<?> values && values.size() == 1 && values.contains("system:auth:info"),
                "identity refresh adds no permissions");
    }

    private static SysUser responseUser(R<DynamicMapVO> response) {
        check(response.getCode() == 200 && response.getData() != null, "identity response succeeds");
        return (SysUser) response.getData().values().get("user");
    }

    private static void rejected(Fixture fixture, int expectedCode, String description) throws Exception {
        ServiceException actual = null;
        try {
            invoke(fixture);
        } catch (ServiceException exception) {
            actual = exception;
        }
        check(actual != null && Objects.equals(actual.getCode(), expectedCode), description);
    }

    private static R<DynamicMapVO> invoke(Fixture fixture) throws Exception {
        UserContext.clear();
        TenantContext.clear();
        UserContext.setUserId(ACCOUNT_ID);
        UserContext.setUserName(USERNAME);
        UserContext.setTenantId(fixture.targetTenant);
        UserContext.setDeptId(321L);
        UserContext.setRoles(Set.of("outer-context-role"));
        TenantContext.setTenantId(OUTER_CONTEXT_TENANT);
        try {
            SysUserMapper mapper = offlineProxy(SysUserMapper.class, (proxy, method, values) -> {
                if (!"selectById".equals(method.getName())) throw new AssertionError("Unexpected mapper call: " + method.getName());
                check(TenantContext.getTenantSkip(), "immutable account lookup bypasses only its tenant predicate");
                fixture.selectedIds.add((Long) values[0]);
                if (fixture.mapperFailure && fixture.queryFailure != null) throw fixture.queryFailure;
                return Objects.equals(values[0], ACCOUNT_ID) ? fixture.account : fixture.shadow;
            });
            ISysUserService users = offlineProxy(ISysUserService.class, (proxy, method, values) -> {
                if (!"findUserInfo".equals(method.getName()) || method.getParameterCount() != 2) {
                    throw new AssertionError("Unexpected user service call: " + method.getName());
                }
                fixture.lookups.add(new Lookup((String) values[0], (Long) values[1], UserContext.getTenantId(),
                        TenantContext.getTenantId(), TenantContext.getTenantSkip()));
                if (!fixture.mapperFailure && fixture.queryFailure != null) throw fixture.queryFailure;
                if (ACCOUNT_TENANT.equals(values[1]) && USERNAME.equals(values[0])) return fixture.userInfo;
                return fixture.sameNameTargetExists ? new UserInfo(fixture.shadow, Set.of("employee"), Set.of("shadow:read")) : null;
            });
            TokenService tokens = new TokenService() {
                @Override
                public Map<String, Object> verifyToken(String token) {
                    check("offline-identity-token".equals(token), "controller validates the presented login token");
                    return fixture.expired ? null : fixture.tokenUser;
                }
            };
            HttpServletRequest request = offlineProxy(HttpServletRequest.class, (proxy, method, values) -> {
                if ("getHeader".equals(method.getName()) && "Authorization".equals(values[0])) return "Bearer offline-identity-token";
                throw new AssertionError("Unexpected request call: " + method.getName());
            });
            AuthController controller = new AuthController();
            inject(controller, "tokenService", tokens);
            inject(controller, "sysUserMapper", mapper);
            inject(controller, "sysUserService", users);
            inject(controller, "forcePasswordChangeService", new ForcePasswordChangeService(mapper));
            inject(controller, "currentPermissions", new com.cloudflow.common.security.service.CurrentPermissionService(tenantId -> {
                check(Objects.equals(tenantId, fixture.targetTenant), "info uses selected tenant package rather than source account tenant");
                return fixture.entitlement;
            }));
            return controller.info(request, null);
        } finally {
            try {
                check(Objects.equals(UserContext.getTenantId(), fixture.targetTenant), "identity lookup restores the incoming user tenant");
                check(Objects.equals(TenantContext.getTenantId(), OUTER_CONTEXT_TENANT), "identity lookup restores the independent database tenant");
                check(!TenantContext.getTenantSkip(), "identity lookup restores tenant filtering");
                check(Objects.equals(UserContext.getUserId(), ACCOUNT_ID) && USERNAME.equals(UserContext.getUserName())
                        && Objects.equals(UserContext.getDeptId(), 321L) && Set.of("outer-context-role").equals(UserContext.getRoles()),
                        "identity lookup preserves unrelated context fields");
            } finally {
                UserContext.clear();
                TenantContext.clear();
            }
        }
    }

    private static void inject(AuthController controller, String fieldName, Object value) throws Exception {
        Field field = AuthController.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(controller, value);
    }

    private static <Service> Service offlineProxy(Class<Service> serviceType, InvocationHandler handler) {
        return serviceType.cast(Proxy.newProxyInstance(serviceType.getClassLoader(), new Class<?>[]{serviceType}, handler));
    }

    private static void check(boolean condition, String description) {
        if (!condition) throw new AssertionError(description);
        checks++;
    }

    private static SysUser account(Long userId, Long tenantId) {
        SysUser account = new SysUser();
        account.setUserId(userId);
        account.setTenantId(tenantId);
        account.setUserName(USERNAME);
        account.setNickName("live-source-profile");
        account.setStatus("0");
        account.setDeleted(0);
        account.setDeptId(123L);
        account.setAvatar("offline-avatar");
        account.setPwdResetRequired("1");
        return account;
    }

    private static final class Fixture {
        private final Long targetTenant;
        private final Map<String, Object> tokenUser = new HashMap<>();
        private final List<Long> selectedIds = new ArrayList<>();
        private final List<Lookup> lookups = new ArrayList<>();
        private final SysUser shadow = account(ACCOUNT_ID + 1, TARGET_TENANT);
        private SysUser account = account(ACCOUNT_ID, ACCOUNT_TENANT);
        private UserInfo userInfo = new UserInfo(account(ACCOUNT_ID, ACCOUNT_TENANT), Set.of("admin"), Set.of("fixture:read"));
        private boolean sameNameTargetExists;
        private boolean expired;
        private boolean mapperFailure;
        private IllegalStateException queryFailure;
        private com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement entitlement =
                new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, Set.of(), Set.of());

        private Fixture(Long targetTenant) {
            this.targetTenant = targetTenant;
            userInfo.getSysUser().setNickName("stale-cached-profile");
            userInfo.getSysUser().setPwdResetRequired("0");
            tokenUser.put("userId", ACCOUNT_ID);
            tokenUser.put("username", USERNAME);
            tokenUser.put("tenantId", targetTenant);
            tokenUser.put("tenantName", "fixture-selected-tenant");
            tokenUser.put("deptId", null);
            tokenUser.put("roles", Set.of("ADMIN"));
            tokenUser.put("permissions", Set.of("system:auth:info"));
        }
    }

    private record Lookup(String username, Long tenantId, Long userTenant, Long contextTenant, boolean tenantSkip) { }
}

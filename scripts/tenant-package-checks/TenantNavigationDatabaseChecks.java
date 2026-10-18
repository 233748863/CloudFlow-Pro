package com.cloudflow.auth.tenantpackage;

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.cloudflow.auth.controller.AuthController;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.SwitchTenantDTO;
import com.cloudflow.auth.domain.dto.UserInfo;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.impl.SysTenantServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

final class TenantNavigationDatabaseChecks {
    private static final long SOURCE = 781001;
    private static final long TARGET = 781002;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final AuthController controller = new AuthController();
    private final Map<String, Object> token = new HashMap<>();
    private Set<String> currentRoles = Set.of("ADMIN");
    private boolean expired;
    private Map<String, Object> createdToken;
    private int deletedTokens;
    private int assertions;
    private long userId;
    private final HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(),
            new Class<?>[] {HttpServletRequest.class}, (proxy, method, arguments) -> {
                if ("getHeader".equals(method.getName()) && "Authorization".equals(arguments[0])) return "Bearer tenant-navigation-check";
                throw new AssertionError("Unexpected request " + method.getName());
            });

    TenantNavigationDatabaseChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions) { this.jdbc = jdbc; this.sessions = sessions; }

    void verify() throws Exception {
        Long previousTenant = TenantContext.getTenantId();
        try {
            TenantContext.setTenantId(SOURCE); UserContext.setTenantId(SOURCE);
            prepare();
            directory();
            switchIdentity();
            System.out.println("TENANT_NAVIGATION_DATABASE_CHECKS: assertions=" + assertions
                    + "; failed=0; real_mysql=true; production_controller=true; tenant_plugin=true; real_pagination=true; token_and_role_doubles=true; http=false");
        } finally { TenantContext.clear(); UserContext.clear(); if (previousTenant != null) TenantContext.setTenantId(previousTenant); }
    }

    private void prepare() throws Exception {
        for (int index = 0; index < 6; index++) {
            jdbc.update("INSERT INTO sys_tenant (tenant_id, tenant_code, tenant_name, status, deleted, expire_time) VALUES (?, ?, ?, ?, ?, IF(? = 5, '2020-01-01 00:00:00', NULL))",
                    SOURCE + index, "SWITCH_CHECK_" + index, "SWITCH_CHECK_" + index, index == 3 ? "1" : "0", index == 4 ? 1 : 0, index);
        }
        SysUserMapper users = sessions.getMapper(SysUserMapper.class);
        SysUser account = new SysUser(); account.setTenantId(SOURCE); account.setUserName("switch-check");
        account.setNickName("Switch check"); account.setPassword("not-used-for-login");
        account.setStatus("0"); account.setDeleted(0); users.insert(account); userId = account.getUserId();
        token.put("userId", userId); token.put("tenantId", SOURCE); token.put("roles", Set.of("ADMIN")); token.put("permissions", Set.of("system:tenant:switch"));
        SysTenantServiceImpl tenants = new SysTenantServiceImpl();
        field(tenants, "baseMapper", sessions.getMapper(SysTenantMapper.class));
        field(tenants, "sysUserMapper", users); field(tenants, "sysFileMapper", sessions.getMapper(SysFileMapper.class));
        field(controller, "sysTenantService", tenants); field(controller, "sysUserMapper", users);
        field(controller, "sysTenantMapper", sessions.getMapper(SysTenantMapper.class));
        field(controller, "sysUserService", (ISysUserService) Proxy.newProxyInstance(ISysUserService.class.getClassLoader(), new Class<?>[] {ISysUserService.class},
                (proxy, method, arguments) -> {
                    if (!"findUserInfo".equals(method.getName()) || arguments.length != 2) throw new AssertionError("Unexpected source identity lookup");
                    equal(SOURCE, arguments[1], "roles use original account tenant");
                    equal(SOURCE, TenantContext.getTenantId(), "role lookup keeps source tenant predicate");
                    return new UserInfo(users.selectById(userId), currentRoles, Set.of("system:tenant:switch"));
                }));
        field(controller, "tokenService", new TokenService() {
            @Override public Map<String, Object> verifyToken(String value) {
                equal("tenant-navigation-check", value, "presented token validated"); return expired ? null : token;
            }
            @Override public String createToken(Map<String, Object> values) { createdToken = new HashMap<>(values); return "new-navigation-token"; }
            @Override public void deleteToken(String value) { equal("tenant-navigation-check", value, "only original token deleted"); deletedTokens++; }
        });
    }

    private void directory() throws Exception {
        AuthController.SwitchTenantPage first = controller.tenantSwitchOptions(1, 2, "SWITCH_CHECK", request).getData();
        equal(3L, first.total(), "disabled, deleted and expired tenants excluded");
        equal(2, first.records().size(), "server pagination size");
        equal(SOURCE, first.records().get(0).tenantId(), "deterministic tenant order");
        AuthController.SwitchTenantPage next = controller.tenantSwitchOptions(2, 2, "SWITCH_CHECK", request).getData();
        equal(1, next.records().size(), "remaining tenant is available on second page");
        equal(SOURCE + 2, next.records().get(0).tenantId(), "page does not repeat earlier rows");
        equal(1L, controller.tenantSwitchOptions(1, 20, "SWITCH_CHECK_1", request).getData().total(), "keyword filters actual database rows");
        equal(0L, controller.tenantSwitchOptions(1, 20, "' OR 1=1 --", request).getData().total(), "keyword cannot become SQL");
        Map<?, ?> serialized = new ObjectMapper().convertValue(first, Map.class);
        equal(Set.of("records", "total", "current", "size"), serialized.keySet(), "page returns only fixed contract");
        Map<?, ?> option = (Map<?, ?>) ((List<?>) serialized.get("records")).get(0);
        equal(Set.of("tenantId", "tenantCode", "tenantName"), option.keySet(), "switch directory hides contacts, quotas, overrides and configuration");
        equal("system:tenant:switch", AuthController.class.getMethod("tenantSwitchOptions", long.class, long.class, String.class, HttpServletRequest.class)
                .getAnnotation(SaCheckPermission.class).value()[0], "directory uses existing optional 903 permission");
        for (long size : List.of(0L, 51L)) rejects(400, () -> controller.tenantSwitchOptions(1, size, "", request));
        for (long page : List.of(0L, 1000001L)) rejects(400, () -> controller.tenantSwitchOptions(page, 20, "", request));
        rejects(400, () -> controller.tenantSwitchOptions(1, 20, "x".repeat(51), request));
        for (String role : List.of("EMPLOYEE", "HR_ADMIN", "SUPER_ADMIN")) {
            token.put("roles", Set.of(role)); rejects(403, () -> controller.tenantSwitchOptions(1, 20, "", request));
        }
        token.put("roles", Set.of("ADMIN")); currentRoles = Set.of("EMPLOYEE");
        rejects(403, () -> controller.tenantSwitchOptions(1, 20, "", request));
        currentRoles = Set.of("ADMIN");
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", userId);
        rejects(401, () -> controller.tenantSwitchOptions(1, 20, "", request));
        jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=?", userId);
        expired = true; rejects(401, () -> controller.tenantSwitchOptions(1, 20, "", request)); expired = false;
        equal(0, deletedTokens, "directory lookup never replaces the session");
    }

    private void switchIdentity() {
        SwitchTenantDTO selection = new SwitchTenantDTO(); selection.setTenantId(TARGET);
        currentRoles = Set.of("EMPLOYEE"); rejects(403, () -> controller.switchTenant(selection, request, null)); currentRoles = Set.of("ADMIN");
        selection.setTenantId(SOURCE + 3); rejects(400, () -> controller.switchTenant(selection, request, null));
        selection.setTenantId(SOURCE + 4); rejects(400, () -> controller.switchTenant(selection, request, null));
        selection.setTenantId(SOURCE + 5); rejects(400, () -> controller.switchTenant(selection, request, null));
        selection.setTenantId(TARGET);
        equal(200, controller.switchTenant(selection, request, null).getCode(), "eligible admin can switch to active tenant");
        equal(1, deletedTokens, "successful switch replaces the old token once");
        equal(TARGET, createdToken.get("tenantId"), "new session uses selected tenant");
        equal(userId, createdToken.get("userId"), "original account identity remains immutable");
        equal(Set.of("system:tenant:switch"), createdToken.get("permissions"), "switch does not mint platform management or other permissions");
        equal(SOURCE, token.get("tenantId"), "source token map is not mutated");
        equal(SOURCE, UserContext.getTenantId(), "controller restores source request context");
        token.put("tenantId", TARGET); TenantContext.setTenantId(TARGET); UserContext.setTenantId(TARGET);
        equal(3L, controller.tenantSwitchOptions(1, 20, "SWITCH_CHECK", request).getData().total(), "switched session still checks roles in original account tenant");
        equal(TARGET, TenantContext.getTenantId(), "directory restores switched tenant context");
        equal(TARGET, UserContext.getTenantId(), "directory restores switched user context");
    }

    private static void field(Object target, String name, Object value) throws Exception {
        Class<?> type = target.getClass();
        while (type != null) {
            try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; }
            catch (NoSuchFieldException missing) { type = type.getSuperclass(); }
        }
        throw new NoSuchFieldException(name);
    }
    private void rejects(int code, Runnable action) {
        try { action.run(); }
        catch (ServiceException failure) { equal(code, failure.getCode(), "expected safe rejection"); return; }
        throw new AssertionError("Expected rejection " + code);
    }
    private void equal(Object expected, Object actual, String description) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(description + ": expected=" + expected + ", actual=" + actual);
        assertions++;
    }
}

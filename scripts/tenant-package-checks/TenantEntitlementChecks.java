package com.cloudflow.auth.tenantpackage;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.mapper.SysMenuMapper;
import com.cloudflow.auth.mapper.SysRoleMapper;
import com.cloudflow.auth.mapper.SysRoleMenuMapper;
import com.cloudflow.auth.service.impl.SysMenuServiceImpl;
import com.cloudflow.auth.service.impl.SysRoleServiceImpl;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.interceptor.UserContextInterceptor;
import com.cloudflow.common.security.service.CloudFlowStpInterface;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import jakarta.servlet.http.HttpServletRequest;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.atomic.AtomicInteger;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

public final class TenantEntitlementChecks {
    private static final long TENANT = 950000L;
    private static final long LEGACY = 950001L;
    private static final long ADMIN = 950010L;
    private static final long EMPLOYEE = 950005L;
    private static int checks;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final PlatformTransactionManager transactions;
    private final TenantPackageRules rules;
    private final TenantPackageCodec codec;
    private final TenantPermissionPolicyService policy;
    private final AtomicInteger reads = new AtomicInteger();
    private final CurrentPermissionService current;
    private final TokenService tokens = new TokenService();
    private final Set<String> employeePermissions = new TreeSet<>();
    private final Set<Long> employeeMenuIds = new TreeSet<>();

    public TenantEntitlementChecks(JdbcTemplate jdbc, SqlSessionTemplate sessions, PlatformTransactionManager transactions,
            TenantPackageRules rules, TenantPackageCodec codec) {
        this.jdbc = jdbc;
        this.sessions = sessions;
        this.transactions = transactions;
        this.rules = rules;
        this.codec = codec;
        policy = new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), transactions);
        current = new CurrentPermissionService(tenantId -> { reads.incrementAndGet(); return policy.current(tenantId); });
    }

    public void verify(long packageId, Path root) throws Exception {
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,package_id,package_version,effective_menu_ids,version) VALUES (?,'ENTITLEMENT','套餐权限验证',?,0,'[]',0),(?,'LEGACY','原授权验证',NULL,NULL,NULL,0)", TENANT, packageId, LEGACY);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (5,?,'员工','employee',5,'0',0),(95,?,'角色授权验证','entitlement-check',95,'0',0)", TENANT, TENANT);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,5,?)", EMPLOYEE, TENANT);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name) VALUES (?,?,'entitlement-employee','套餐员工')", EMPLOYEE, TENANT);
        for (String value : Files.readAllLines(root.resolve("cloudflow-backend/cloudflow-auth/target/tenant-package-checks/employee.txt"))) {
            if (value.isBlank()) continue;
            long menuId = Long.parseLong(value);
            employeeMenuIds.add(menuId);
            jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (5,?,?)", menuId, TENANT);
            String grants = jdbc.queryForObject("SELECT perms FROM sys_menu WHERE menu_id=?", String.class, menuId);
            if (grants != null) for (String grant : grants.split(",")) if (!grant.isBlank()) employeePermissions.add(grant.trim());
        }
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        StpInterface previousPermissions = SaManager.getStpInterface();
        StpLogic previousLogic = StpUtil.getStpLogic();
        SaManager.setConfig(new SaTokenConfig().setIsPrint(false).setDataRefreshPeriod(-1));
        SaTokenDaoDefaultImpl ownedDao = new SaTokenDaoDefaultImpl();
        Long previousTenant = TenantContext.getTenantId();
        try {
            SaManager.setSaTokenDao(ownedDao);
            StpUtil.setStpLogic(new StpLogic("login"));
            CloudFlowStpInterface permissions = new CloudFlowStpInterface();
            inject(permissions, "tokenService", tokens);
            inject(permissions, "currentPermissions", current);
            SaManager.setStpInterface(permissions);
            String adminToken = session(ADMIN, TENANT, Set.of("*:*:*"));
            session(EMPLOYEE, TENANT, employeePermissions);
            independent();
            requestBoundaries(adminToken);
            menuAndRole();
            controlMenus();
            oauth();
            damagedSnapshots(adminToken);
            equal(null, tokens.verifyToken("not-a-session"), "unknown token still rejected");
            CloudFlowStpInterface missing = new CloudFlowStpInterface();
            inject(missing, "tokenService", tokens);
            rejected(() -> missing.getPermissionList(ADMIN, "login"), 503, "missing business-service provider fails closed");
        } finally {
            RequestContextHolder.resetRequestAttributes();
            UserContext.clear();
            TenantContext.setTenantId(previousTenant);
            StpUtil.setStpLogic(previousLogic);
            SaManager.setStpInterface(previousPermissions);
            SaManager.setSaTokenDao(previousDao);
            ownedDao.destroy();
            SaManager.setConfig(previousConfig);
        }
        System.out.println("TENANT_ENTITLEMENT_CHECKS: assertions=" + checks + "; failed=0; optional_features=19; fixed_account_features=3; real_mysql=true; real_sa_token=true; production_interceptor=true; production_menu_service=true; production_role_service=true; production_oauth_actor=true; http=false; request_double=true");
    }

    private void independent() {
        for (Map.Entry<Long, String> selected : TenantPackageRules.INDEPENDENT_OPERATIONS.entrySet()) {
            assign(Set.of(selected.getKey()));
            equal(true, StpUtil.hasPermission(ADMIN, selected.getValue()), "selected independent feature granted to original admin");
            for (Map.Entry<Long, String> candidate : TenantPackageRules.INDEPENDENT_OPERATIONS.entrySet()) {
                equal(candidate.getKey().equals(selected.getKey()), StpUtil.hasPermission(ADMIN, candidate.getValue()), "only selected optional feature is granted");
            }
            for (String account : TenantPackageRules.ACCOUNT_OPERATIONS.values()) equal(true, StpUtil.hasPermission(ADMIN, account), "three account permissions retained");
            Set<String> granted = Set.copyOf(StpUtil.getPermissionList(EMPLOYEE));
            equal(true, employeePermissions.containsAll(granted), "employee has no permission beyond formal role grants");
            equal(employeePermissions.contains(selected.getValue()), granted.contains(selected.getValue()), "selecting a feature does not confer a missing role permission");
            equal(false, StpUtil.getPermissionList(ADMIN).contains("*:*:*"), "admin wildcard is not returned for restricted tenant");
        }
        equal(Set.of("*:*:*"), current.permissions(LEGACY, Set.of("*:*:*")), "null package retains legacy wildcard");
        equal(Set.of(), current.permissions(TENANT, Set.of()), "package alone never grants any role permission");
    }

    private void requestBoundaries(String token) throws Exception {
        assign(Set.of(1986L));
        HttpServletRequest request = request(token);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request));
        int before = reads.get();
        equal(true, StpUtil.hasPermission(ADMIN, "system:search:business"), "first request loads entitlement");
        UserContextInterceptor interceptor = new UserContextInterceptor();
        inject(interceptor, "tokenService", tokens);
        inject(interceptor, "currentPermissions", current);
        equal(true, interceptor.preHandle(request, null, null), "real context interceptor accepts session");
        equal(Set.copyOf(StpUtil.getPermissionList(ADMIN)), UserContext.getPermissions(), "interceptor and Sa-Token share the same permissions");
        equal(before + 1, reads.get(), "one entitlement read per tenant per request");
        equal(Set.of("*:*:*"), Set.copyOf((java.util.Collection<?>) tokens.getLoginUserByLoginId(ADMIN).get("permissions")), "request filtering never overwrites raw session grants");
        assign(Set.of());
        equal(true, StpUtil.hasPermission(ADMIN, "system:search:business"), "in-flight request uses one immutable snapshot");
        interceptor.afterCompletion(request, null, null, null);
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request(token)));
        equal(false, StpUtil.hasPermission(ADMIN, "system:search:business"), "next request immediately loses removed feature");
        equal(Set.of("*:*:*"), current.permissions(LEGACY, Set.of("*:*:*")), "second tenant in same request has separate cache");
        assign(Set.of(1986L));
        RequestContextHolder.setRequestAttributes(new ServletRequestAttributes(request(token)));
        equal(true, StpUtil.hasPermission(ADMIN, "system:search:business"), "next request regains newly added feature without relogin");
        for (String domain : List.of("portal", "oauth2", "unknown")) {
            equal(List.of(), SaManager.getStpInterface().getPermissionList(ADMIN, domain), "same numeric ID cannot inherit internal grants across domains");
        }
        RequestContextHolder.resetRequestAttributes();
    }

    private void menuAndRole() throws Exception {
        UserContext.setTenantId(TENANT);
        UserContext.setUserId(ADMIN);
        UserContext.setRoles(Set.of("admin"));
        TenantContext.setTenantId(TENANT);
        SysMenuServiceImpl menus = new SysMenuServiceImpl();
        inject(menus, "menuMapper", sessions.getMapper(SysMenuMapper.class));
        inject(menus, "currentPermissions", current);
        assign(Set.of());
        equal(List.of(), menus.selectMenuTreeByUserId(ADMIN), "admin tree is empty when no page selected");
        assign(Set.of(1986L));
        equal(1, menus.selectMenuTreeByUserId(ADMIN).size(), "selected independent search includes only its directory");
        assign(Set.of());
        equal(List.of(), menus.selectMenuTreeByUserId(ADMIN), "menu tree does not retain stale cached directory");
        SysRoleServiceImpl roles = new SysRoleServiceImpl();
        inject(roles, "roleMapper", sessions.getMapper(SysRoleMapper.class));
        inject(roles, "roleMenuMapper", sessions.getMapper(SysRoleMenuMapper.class));
        inject(roles, "currentPermissions", current);
        SysRole role = new SysRole();
        role.setRoleId(95L);
        role.setTenantId(LEGACY);
        role.setMenuIds(new Long[] {1986L});
        rejected(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> roles.insertRoleMenu(role)), 403, "forged legacy tenant cannot bypass stored role tenant ceiling");
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=95", Long.class), "rejected role update inserts no grants");
        assign(Set.of(1986L));
        new TransactionTemplate(transactions).executeWithoutResult(status -> roles.insertRoleMenu(role));
        equal(TENANT, jdbc.queryForObject("SELECT tenant_id FROM sys_role_menu WHERE role_id=95", Long.class), "role grant uses stored tenant despite forged body");
        role.setMenuIds(new Long[] {900L, 905L});
        rejected(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> roles.insertRoleMenu(role)), 403, "all requested menus checked before any grant insert");
        equal(1L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=95", Long.class), "partial invalid role submission leaves existing grants intact");
        SysRole update = sessions.getMapper(SysRoleMapper.class).selectById(95L);
        String originalName = update.getRoleName();
        update.setRoleName("不得保留的角色名称");
        update.setTenantId(LEGACY);
        update.setMenuIds(new Long[] {905L});
        rejected(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> roles.updateRole(update)), 403, "full role update checks package after resolving actual role tenant");
        equal(originalName, jdbc.queryForObject("SELECT role_name FROM sys_role WHERE role_id=95", String.class), "invalid full update rolls back role fields");
        equal(1986L, jdbc.queryForObject("SELECT menu_id FROM sys_role_menu WHERE role_id=95", Long.class), "invalid full update restores deleted old grants");
        SysRole create = new SysRole();
        create.setTenantId(LEGACY);
        create.setRoleName("不得保留的新角色");
        create.setRoleKey("rejected-entitlement-create");
        create.setRoleSort(98);
        create.setMenuIds(new Long[] {905L});
        rejected(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> roles.insertRole(create)), 403, "new role uses current tenant package rather than forged body");
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role WHERE role_key='rejected-entitlement-create'", Long.class), "invalid creation rolls back new role");
        equal(List.copyOf(employeeMenuIds), jdbc.queryForList("SELECT menu_id FROM sys_role_menu WHERE role_id=5 ORDER BY menu_id", Long.class), "formal employee grant identities unchanged");
        UserContext.clear();
    }

    private void oauth() {
        com.cloudflow.auth.mapper.OAuthMapper mapper = sessions.getMapper(com.cloudflow.auth.mapper.OAuthMapper.class);
        com.cloudflow.auth.oauth2.OAuthActors actors = new com.cloudflow.auth.oauth2.OAuthActors(null,
                new com.cloudflow.auth.oauth2.OAuthProperties(), tokens, current);
        equal(true, employeePermissions.contains("system:search:business"), "formal employee has original search permission");
        assign(Set.of(1986L));
        equal(true, actors.load(mapper, TENANT, EMPLOYEE).permissions().contains("system:search:business"), "OAuth actor uses effective package selection");
        assign(Set.of());
        equal(false, actors.load(mapper, TENANT, EMPLOYEE).permissions().contains("system:search:business"), "OAuth actor loses removed feature without changing role grants");
        assign(Set.of(1986L));
        equal(true, actors.load(mapper, TENANT, EMPLOYEE).permissions().contains("system:search:business"), "OAuth actor regains feature after package restore");
        equal(true, employeePermissions.containsAll(actors.load(mapper, TENANT, EMPLOYEE).permissions()), "OAuth package cannot expand employee permissions");
    }

    private void controlMenus() throws Exception {
        String controlPermission = "system:data-source:list";
        org.springframework.beans.factory.support.DefaultListableBeanFactory beans = new org.springframework.beans.factory.support.DefaultListableBeanFactory();
        com.cloudflow.common.core.permission.PlatformPermissionPolicy platform = (userId, tenantId) ->
                Objects.equals(userId, ADMIN) && Objects.equals(tenantId, TENANT) ? Set.of(controlPermission) : Set.of();
        beans.registerSingleton("controlledPlatformFixture", platform);
        CurrentPermissionService withPlatform = new CurrentPermissionService(policy,
                beans.getBeanProvider(com.cloudflow.common.core.permission.PlatformPermissionPolicy.class));
        SysMenuServiceImpl menus = new SysMenuServiceImpl();
        inject(menus, "menuMapper", sessions.getMapper(SysMenuMapper.class));
        inject(menus, "currentPermissions", withPlatform);
        assign(Set.of());
        UserContext.setTenantId(TENANT);
        UserContext.setUserId(ADMIN);
        UserContext.setRoles(Set.of("admin"));
        try {
            UserContext.setPermissions(Set.of());
            equal(List.of(), menus.selectMenuTreeByUserId(ADMIN), "platform identity with no role permission cannot expose control menu");
            UserContext.setPermissions(Set.of(controlPermission));
            Set<Long> visible = new TreeSet<>();
            collectMenus(menus.selectMenuTreeByUserId(ADMIN), visible);
            equal(true, visible.contains(1973L), "authorized platform can see control page outside business package");
            equal(false, visible.contains(903L), "tenant switching is never a control menu exception");
            equal(false, menus.selectMenuList(new com.cloudflow.auth.domain.SysMenu(), ADMIN).stream()
                    .anyMatch(menu -> menu.getMenuId() == 1973L), "control visibility does not enlarge grantable role menu catalog");
            Long parentId = jdbc.queryForObject("SELECT parent_id FROM sys_menu WHERE menu_id=1973", Long.class);
            jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=?", parentId);
            try { equal(List.of(), menus.selectMenuTreeByUserId(ADMIN), "disabled ancestor blocks control page"); }
            finally { jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=?", parentId); }
            UserContext.setUserId(EMPLOYEE);
            equal(List.of(), menus.selectMenuTreeByUserId(EMPLOYEE), "nonplatform account does not inherit platform page");
            equal(Set.of(), withPlatform.permissions(TENANT, Set.of(controlPermission)), "resource-side permission intersection excludes control exception");
        } finally { UserContext.clear(); }
    }

    private void collectMenus(List<com.cloudflow.auth.domain.SysMenu> menus, Set<Long> result) {
        for (com.cloudflow.auth.domain.SysMenu menu : menus) {
            result.add(menu.getMenuId());
            if (menu.getChildren() != null) collectMenus(menu.getChildren(), result);
        }
    }

    private void damagedSnapshots(String token) {
        for (String invalid : List.of("null", "{}", "[0]", "[-1]", "[1,1]", "[1.0]", "[1e0]", "[\"1\"]", "[true]", "[null]", "[9223372036854775808]", "[999999]", "[1986]")) {
            jdbc.update("UPDATE sys_tenant SET effective_menu_ids=? WHERE tenant_id=?", invalid, TENANT);
            rejected(() -> StpUtil.hasPermission(ADMIN, "system:search:business"), 503, "invalid stored entitlement fails closed");
            equal(true, tokens.verifyToken(token) != null, "entitlement failure does not destroy valid login");
        }
        assign(Set.of(1986L));
        jdbc.update("UPDATE sys_menu SET status='1' WHERE menu_id=2");
        try {
            equal(false, StpUtil.hasPermission(ADMIN, "system:search:business"), "disabled ancestor blocks selected child");
            equal(true, StpUtil.hasPermission(ADMIN, "system:auth:info"), "fixed account access remains available");
        } finally { jdbc.update("UPDATE sys_menu SET status='0' WHERE menu_id=2"); }
        jdbc.update("UPDATE sys_menu SET perms='system:user:add' WHERE menu_id=1986");
        try { rejected(() -> StpUtil.hasPermission(ADMIN, "system:user:add"), 503, "independent feature ID cannot be rebound to another permission"); }
        finally { jdbc.update("UPDATE sys_menu SET perms='system:search:business' WHERE menu_id=1986"); }
        jdbc.update("UPDATE sys_menu SET menu_type='F' WHERE menu_id=2");
        try { rejected(() -> StpUtil.hasPermission(ADMIN, "system:search:business"), 503, "button cannot be an ancestor"); }
        finally { jdbc.update("UPDATE sys_menu SET menu_type='M' WHERE menu_id=2"); }
        rejected(() -> policy.current(999999L), 503, "missing tenant fails closed");
        equal(false, TenantContext.getTenantSkip(), "permission reads restore tenant isolation flag");
        equal(TENANT, TenantContext.getTenantId(), "permission reads restore caller tenant");
        equal(true, StpUtil.hasPermission(ADMIN, "system:search:business"), "recovered entitlement works with unchanged session");
    }

    private void assign(Set<Long> selected) {
        TenantPackageRules.Effective effective = rules.compose(selected, TenantPackageRules.MODULES,
                new TenantPackageRules.Quotas(10, 100), TenantPackageRules.Adjustments.none());
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids=?,version=version+1 WHERE tenant_id=?", codec.encode(effective.menuIds()), TENANT);
    }

    private String session(long userId, long tenantId, Set<String> permissions) {
        String token = StpUtil.getStpLogic().createLoginSession(userId, new SaLoginParameter().setTimeout(3600).setIsShare(false));
        StpUtil.getSessionByLoginId(userId).set(TokenService.LOGIN_USER_SESSION_KEY,
                Map.of("userId", userId, "tenantId", tenantId, "permissions", permissions, "roles", userId == ADMIN ? Set.of("admin") : Set.of("employee")));
        return token;
    }

    private static HttpServletRequest request(String token) {
        Map<String, Object> attributes = new HashMap<>();
        return (HttpServletRequest) Proxy.newProxyInstance(HttpServletRequest.class.getClassLoader(), new Class<?>[] {HttpServletRequest.class},
                (proxy, method, arguments) -> switch (method.getName()) {
                    case "getRequestURI" -> "/system/search";
                    case "getHeader" -> "Authorization".equalsIgnoreCase(String.valueOf(arguments[0])) ? "Bearer " + token : null;
                    case "getCookies" -> null;
                    case "getAttribute" -> attributes.get(String.valueOf(arguments[0]));
                    case "setAttribute" -> { attributes.put(String.valueOf(arguments[0]), arguments[1]); yield null; }
                    case "removeAttribute" -> { attributes.remove(String.valueOf(arguments[0])); yield null; }
                    default -> throw new AssertionError("Unexpected request method: " + method.getName());
                });
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }

    private static void rejected(Runnable action, int code, String message) {
        try { action.run(); }
        catch (ServiceException failure) { equal(code, failure.getCode(), message); return; }
        throw new AssertionError(message);
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}

package com.cloudflow.auth.controller;

import com.cloudflow.auth.domain.SysRole;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.service.ILoginLogService;
import com.cloudflow.auth.service.ISysUserService;
import com.cloudflow.auth.service.LoginCompletionService;
import com.cloudflow.auth.service.impl.SysRoleServiceImpl;
import com.cloudflow.auth.service.impl.SysUserServiceImpl;
import com.cloudflow.common.cache.TenantRedisCacheManager;
import com.cloudflow.common.core.constant.CacheConstants;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.cache.Cache;
import org.springframework.cache.annotation.CacheEvict;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.data.redis.cache.RedisCacheConfiguration;
import org.springframework.data.redis.cache.RedisCacheWriter;

public class AuthLoginTenantCacheChecks {
    private static final Long LOGIN_TENANT_ID = 100000L;
    private static final String LOGIN_USERNAME = "offline-login-cache-fixture";
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        Method userLookup = SysUserServiceImpl.class.getMethod("findUserInfo", String.class, Long.class);
        Cacheable cacheable = AnnotatedElementUtils.findMergedAnnotation(userLookup, Cacheable.class);
        check(cacheable != null, "user details lookup has cache metadata");
        check(List.of(cacheable.cacheNames()).contains(CacheConstants.USER_DETAILS), "login lookup caches user details");
        Method roleUpdate = SysRoleServiceImpl.class.getMethod("updateRole", SysRole.class);
        CacheEvict eviction = AnnotatedElementUtils.findMergedAnnotation(roleUpdate, CacheEvict.class);
        check(eviction != null && eviction.allEntries(), "role update clears all entries of its declared caches");
        check(List.of(eviction.cacheNames()).contains(CacheConstants.USER_DETAILS), "role update evicts the login user details cache");
        for (boolean existingContext : new boolean[]{false, true}) {
            loginBoundary(existingContext, false);
            loginBoundary(existingContext, true);
        }
        System.out.println("Auth login tenant cache checks passed: " + checks);
    }

    private static void loginBoundary(boolean existingContext, boolean queryThrows) throws Exception {
        String scenario = (existingContext ? "different incoming tenants" : "no incoming context")
                + (queryThrows ? " / lookup exception: " : " / null lookup: ");
        prepareContext(existingContext);
        UserSnapshot originalUser = UserSnapshot.capture();
        Long originalTenant = TenantContext.getTenantId();
        boolean originalTenantSkip = TenantContext.getTenantSkip();
        try {
            List<CacheCall> cacheCalls = new ArrayList<>();
            TenantRedisCacheManager cacheManager = cacheManager(cacheCalls);
            AtomicInteger lookupCalls = new AtomicInteger();
            AtomicReference<LookupObservation> lookup = new AtomicReference<>();
            List<LoginFailure> failures = new ArrayList<>();
            IllegalStateException queryFailure = new IllegalStateException("offline user lookup failure");
            ISysUserService users = offlineProxy(ISysUserService.class, (proxy, method, values) -> {
                if (!"findUserInfo".equals(method.getName()) || method.getParameterCount() != 2) {
                    throw new AssertionError("Unexpected user service call: " + method.getName());
                }
                lookupCalls.incrementAndGet();
                String username = (String) values[0];
                Long tenantId = (Long) values[1];
                Cache cache = Objects.requireNonNull(cacheManager.getCache(CacheConstants.USER_DETAILS));
                lookup.set(new LookupObservation(username, tenantId, UserSnapshot.capture(),
                        TenantContext.getTenantId(), TenantContext.getTenantSkip(), cache.getName()));
                cache.get(tenantId + ":" + username);
                if (queryThrows) {
                    throw queryFailure;
                }
                return null;
            });
            ILoginLogService loginLog = offlineProxy(ILoginLogService.class, (proxy, method, values) -> {
                if (!"recordLoginFailure".equals(method.getName())) {
                    throw new AssertionError("Unexpected login log call: " + method.getName());
                }
                failures.add(new LoginFailure((String) values[0], (Long) values[1],
                        (HttpServletRequest) values[2], (String) values[3], UserSnapshot.capture(),
                        TenantContext.getTenantId()));
                return null;
            });
            HttpServletRequest request = offlineProxy(HttpServletRequest.class, (proxy, method, values) -> {
                throw new AssertionError("Unexpected servlet request call: " + method.getName());
            });
            AuthController controller = new AuthController();
            inject(controller, "loginCompletionService", new LoginCompletionService(users, loginLog, null, null, null,
                    null, null, null, null, null, null));
            SysUser user = new SysUser();
            user.setUserId(987654L);
            user.setUserName(LOGIN_USERNAME);
            user.setTenantId(LOGIN_TENANT_ID);
            SysTenant tenant = new SysTenant();
            tenant.setTenantId(LOGIN_TENANT_ID);
            Method completeLogin = AuthController.class.getDeclaredMethod("completeLogin", SysUser.class,
                    SysTenant.class, String.class, HttpServletRequest.class, HttpServletResponse.class, long.class);
            completeLogin.setAccessible(true);
            R<?> result = null;
            Throwable actualFailure = null;
            try {
                result = (R<?>) completeLogin.invoke(controller, user, tenant, null, request, null,
                        System.currentTimeMillis());
            } catch (InvocationTargetException exception) {
                actualFailure = exception.getCause();
            }

            check(lookupCalls.get() == 1, scenario + "real controller invokes the tenant-qualified lookup exactly once");
            LookupObservation observed = lookup.get();
            check(observed != null, scenario + "lookup context is captured inside the service proxy");
            check(LOGIN_USERNAME.equals(observed.username()), scenario + "lookup receives the login username");
            check(LOGIN_TENANT_ID.equals(observed.tenantId()), scenario + "lookup argument uses the resolved login tenant");
            check(LOGIN_TENANT_ID.equals(observed.user().tenantId()), scenario + "UserContext uses the login tenant during lookup");
            check(LOGIN_TENANT_ID.equals(observed.contextTenantId()), scenario + "TenantContext uses the login tenant during lookup");
            check(originalUser.withTenant(LOGIN_TENANT_ID).equals(observed.user()), scenario + "lookup preserves all unrelated user context fields");
            check(observed.tenantSkip() == originalTenantSkip, scenario + "lookup does not enable a tenant-filter bypass");
            check(originalUser.equals(UserSnapshot.capture()), scenario + "completeLogin restores the original UserContext");
            check(Objects.equals(originalTenant, TenantContext.getTenantId()), scenario + "completeLogin restores the independent TenantContext");
            check(originalTenantSkip == TenantContext.getTenantSkip(), scenario + "completeLogin preserves the tenant-filter flag");

            if (queryThrows) {
                check(actualFailure == queryFailure, scenario + "the original lookup exception propagates unchanged");
                check(result == null, scenario + "lookup exception does not produce a login response");
                check(failures.isEmpty(), scenario + "lookup exception does not enter the null-result logging branch");
            } else {
                check(actualFailure == null, scenario + "the null-result branch completes without an exception");
                check(result != null && result.getCode() == R.FAIL, scenario + "a missing user returns R.fail");
                check("用户信息异常".equals(result.getMsg()) && result.getData() == null, scenario + "failure response contains no login token");
                check(failures.size() == 1, scenario + "the null-result branch records one login failure");
                LoginFailure failure = failures.get(0);
                check(LOGIN_USERNAME.equals(failure.username()) && LOGIN_TENANT_ID.equals(failure.tenantId())
                        && failure.request() == request && "用户信息异常".equals(failure.reason()),
                        scenario + "failure logging receives the original login arguments");
                check(originalUser.equals(failure.user()), scenario + "UserContext is restored before failure logging");
                check(Objects.equals(originalTenant, failure.contextTenantId()), scenario + "TenantContext is restored before failure logging");
            }

            String namespace = LOGIN_TENANT_ID + ":" + CacheConstants.USER_DETAILS;
            check(namespace.equals(observed.cacheName()), scenario + "login reads the tenant-prefixed user details namespace");
            check(cacheCalls.size() == 1, scenario + "the offline cache writer captures exactly one lookup");
            CacheCall read = cacheCalls.get(0);
            check("get".equals(read.operation()) && namespace.equals(read.namespace()), scenario + "the Redis reader receives the login tenant namespace");
            check((namespace + "::" + LOGIN_TENANT_ID + ":" + LOGIN_USERNAME).equals(read.key()), scenario + "the physical read key includes the tenant prefix");
            TenantBroker.runAs(LOGIN_TENANT_ID, tenantId ->
                    Objects.requireNonNull(cacheManager.getCache(CacheConstants.USER_DETAILS)).clear());
            check(cacheCalls.size() == 2, scenario + "the role-update cache metadata is exercised with an offline clear");
            CacheCall clear = cacheCalls.get(1);
            check("clean".equals(clear.operation()) && read.namespace().equals(clear.namespace()), scenario + "login read and role-update eviction use the same namespace");
            check((namespace + "::*").equals(clear.key()), scenario + "role-update eviction covers the physical login cache key");
            check(originalUser.equals(UserSnapshot.capture()) && Objects.equals(originalTenant, TenantContext.getTenantId()),
                    scenario + "the offline eviction comparison also restores both incoming contexts");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static TenantRedisCacheManager cacheManager(List<CacheCall> calls) {
        RedisCacheWriter writer = offlineProxy(RedisCacheWriter.class, (proxy, method, values) -> {
            if (!Set.of("get", "clean").contains(method.getName())) {
                throw new AssertionError("Unexpected offline cache writer call: " + method.getName());
            }
            calls.add(new CacheCall(method.getName(), (String) values[0],
                    new String((byte[]) values[1], StandardCharsets.UTF_8)));
            return null;
        });
        TenantRedisCacheManager manager = new TenantRedisCacheManager(writer,
                RedisCacheConfiguration.defaultCacheConfig(), true, Map.of());
        manager.afterPropertiesSet();
        return manager;
    }

    private static void prepareContext(boolean existingContext) {
        UserContext.clear();
        TenantContext.clear();
        if (existingContext) {
            UserContext.setUserId(123456L);
            UserContext.setUserName("offline-outer-context-fixture");
            UserContext.setTenantId(210001L);
            UserContext.setRoles(Set.of("fixture-role"));
            UserContext.setDeptId(234L);
            UserContext.setDeptName("fixture-department");
            UserContext.setPermissions(Set.of("fixture:read"));
            UserContext.setAuthToken("offline-context-token");
            UserContext.setDsType(4);
            UserContext.setDsDeptIds(List.of(234L));
            TenantContext.setTenantId(220002L);
        }
    }

    private static void inject(AuthController controller, String fieldName, Object value) throws Exception {
        Field field = AuthController.class.getDeclaredField(fieldName);
        field.setAccessible(true);
        field.set(controller, value);
    }

    private static <Service> Service offlineProxy(Class<Service> serviceType, InvocationHandler handler) {
        return serviceType.cast(Proxy.newProxyInstance(serviceType.getClassLoader(), new Class<?>[]{serviceType},
                (proxy, method, values) -> {
                    if (method.getDeclaringClass() == Object.class) {
                        return switch (method.getName()) {
                            case "toString" -> "offline-" + serviceType.getSimpleName();
                            case "hashCode" -> System.identityHashCode(proxy);
                            case "equals" -> proxy == values[0];
                            default -> throw new AssertionError("Unexpected object method: " + method.getName());
                        };
                    }
                    return handler.invoke(proxy, method, values);
                }));
    }

    private static void check(boolean condition, String description) {
        if (!condition) {
            throw new AssertionError(description);
        }
        checks++;
    }

    private record UserSnapshot(Long userId, String username, Long tenantId, Set<String> roles, Long deptId,
                                String deptName, Set<String> permissions, String authToken, Integer dsType,
                                List<Long> dsDeptIds) {
        private static UserSnapshot capture() {
            return new UserSnapshot(UserContext.getUserId(), UserContext.getUserName(), UserContext.getTenantId(),
                    UserContext.getRoles(), UserContext.getDeptId(), UserContext.getDeptName(), UserContext.getPermissions(),
                    UserContext.getAuthToken(), UserContext.getDsType(), UserContext.getDsDeptIds());
        }

        private UserSnapshot withTenant(Long replacement) {
            return new UserSnapshot(userId, username, replacement, roles, deptId, deptName, permissions,
                    authToken, dsType, dsDeptIds);
        }
    }

    private record LookupObservation(String username, Long tenantId, UserSnapshot user, Long contextTenantId,
                                     boolean tenantSkip, String cacheName) { }

    private record LoginFailure(String username, Long tenantId, HttpServletRequest request, String reason,
                                UserSnapshot user, Long contextTenantId) { }

    private record CacheCall(String operation, String namespace, String key) { }
}

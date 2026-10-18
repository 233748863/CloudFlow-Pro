package com.cloudflow.auth.platform;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpInterface;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.cloudflow.auth.controller.PlatformAccessController;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.SysUserTotp;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.permission.PlatformPermissionPolicy;
import com.cloudflow.common.core.permission.TenantFeatureRegistry;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.ratelimiter.annotation.RateLimiter;
import com.cloudflow.common.ratelimiter.enums.LimitType;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.security.service.CloudFlowStpInterface;
import com.cloudflow.common.security.service.CurrentPermissionService;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.databind.exc.InvalidDefinitionException;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.data.redis.RedisConnectionFailureException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

public class PlatformAccessChecks {
    private static final Long USER_ID = 780L;
    private static final Long TENANT_ID = 100000L;
    private static final String READ = "system:tenant-package:list";
    private static final String WRITE = "system:tenant-package:manage";
    private static final String PASSWORD = "Fixture-Only-Platform-Passphrase-2026!";
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        requestAndAnnotations();
        storeBoundaries();
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaManager.setConfig(new SaTokenConfig().setIsPrint(false).setDataRefreshPeriod(-1));
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        StpInterface previousPermissions = SaManager.getStpInterface();
        StpLogic previousLogic = StpUtil.getStpLogic();
        SaTokenDaoDefaultImpl ownedDao = new SaTokenDaoDefaultImpl();
        try {
            SaManager.setSaTokenDao(ownedDao);
            StpUtil.setStpLogic(new StpLogic("login"));
            Fixture fixture = new Fixture();
            CloudFlowStpInterface permissions = new CloudFlowStpInterface();
            Field tokenField = CloudFlowStpInterface.class.getDeclaredField("tokenService");
            tokenField.setAccessible(true);
            tokenField.set(permissions, fixture.tokens);
            Field policyField = CloudFlowStpInterface.class.getDeclaredField("currentPermissions");
            policyField.setAccessible(true);
            policyField.set(permissions, new com.cloudflow.common.security.service.CurrentPermissionService(
                    tenantId -> new com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement(null, null, 0, Set.of(), Set.of())));
            SaManager.setStpInterface(permissions);
            configuration(fixture);
            identity(fixture);
            authentication(fixture);
            proofBoundaries(fixture);
            totp(fixture);
            restrictedPlatform(fixture, permissions, policyField);
            sessionIsolation(fixture);
        } finally {
            UserContext.clear();
            TenantContext.clear();
            StpUtil.setStpLogic(previousLogic);
            SaManager.setStpInterface(previousPermissions);
            SaManager.setSaTokenDao(previousDao);
            ownedDao.destroy();
            if (previousDao instanceof SaTokenDaoDefaultImpl previousInProcess) previousInProcess.destroy();
            SaManager.setConfig(previousConfig);
        }
        System.out.println("PLATFORM_ACCESS_CHECKS: assertions=" + checks
                + "; failed=0; real_sa_token=true; real_password_hash=true; mysql=false; redis=false; http=false"
                + "; mapper=in_process_double; proof_store=in_process_double; totp_verifier=in_process_double; restricted_platform_policy=true; production_modified=false");
    }

    private static void restrictedPlatform(Fixture fixture, CloudFlowStpInterface permissions, Field policyField) throws Exception {
        Object previous = policyField.get(permissions);
        DefaultListableBeanFactory beans = new DefaultListableBeanFactory();
        beans.registerSingleton("platformPolicy", new PlatformControlPermissionService(fixture.service));
        Set<String> fixed = Set.copyOf(TenantFeatureRegistry.ACCOUNT_OPERATIONS.values());
        CurrentPermissionService current = new CurrentPermissionService(tenantId ->
                new TenantPermissionPolicy.Entitlement(1L, 0, 1, TenantFeatureRegistry.ACCOUNT_OPERATIONS.keySet(), fixed),
                beans.getBeanProvider(PlatformPermissionPolicy.class));
        String token = fixture.currentToken.get();
        try {
            policyField.set(permissions, current);
            fixture.permissions(Set.of("*:*:*"));
            fixture.proofs.values.clear();
            Set<String> controls = fixture.service.controlPermissions(USER_ID, TENANT_ID);
            equal(Set.of(READ, WRITE, "system:tenant-package:sync", "system:data-source:list",
                    "system:data-source:manage", "system:data-source:test", "system:data-source:register",
                    "system:oauth2:client:list", "system:oauth2:client:manage", "system:tenant:list",
                    "system:tenant:query", "system:tenant:add", "system:tenant:edit", "system:tenant:remove"),
                    controls, "only registered platform control plane bypasses package ceiling");
            for (String control : controls) check(StpUtil.hasPermission(USER_ID, control), "strict platform identity retains original control permission");
            for (String optional : TenantFeatureRegistry.INDEPENDENT_OPERATIONS.values()) {
                check(!StpUtil.hasPermission(USER_ID, optional), "nineteen optional functions including tenant switching remain package controlled");
            }
            check(!StpUtil.hasPermission(USER_ID, "hr:employee:add"), "platform identity does not bypass ordinary business quota");
            check(!StpUtil.getPermissionList(USER_ID).contains("*:*:*"), "restricted platform never exposes wildcard");
            equal(fixed, current.permissions(TENANT_ID, Set.of("*:*:*")), "resource identities never inherit internal platform exception");
            equal(Set.of(), current.internalPermissions(USER_ID, TENANT_ID, Set.of()), "platform candidate permissions still intersect original role");
            denied(() -> fixture.service.requireRecent(WRITE), 403, "control candidate alone does not bypass reauthentication");
            check(fixture.service.authenticate(credentials()).verified(), "restricted platform can reach reauthentication without permission recursion");
            equal(new PlatformAccessService.Operator(USER_ID, TENANT_ID), fixture.service.requireRecent(WRITE), "recent restricted platform identity can manage");
            fixture.permissions(Set.of(READ));
            equal(Set.of(READ), Set.copyOf(StpUtil.getPermissionList(USER_ID)), "read-only platform role receives no management permission");
            denied(() -> fixture.service.requireRecent(WRITE), 403, "valid proof does not confer role write permission");
            fixture.permissions(Set.of("*:*:*"));
            fixture.clock.advance(300000);
            denied(() -> fixture.service.requireRecent(WRITE), 403, "restricted platform proof expires exactly after five minutes");
            check(StpUtil.hasPermission(USER_ID, READ), "reauthentication entry remains reachable after proof expiry");
            fixture.permissions(Set.of("system:tenant:list"));
            check(fixture.service.authenticate(credentials()).verified(), "tenant-only management role can reach the shared reauthentication entry");
            denied(() -> fixture.service.requireRecent(WRITE), 403, "tenant reauthentication never grants package management");
            fixture.permissions(Set.of("*:*:*"));
            fixture.properties.setAdministratorUserIds(Set.of(1L));
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "ordinary admin without deployment allowlist only has package permissions");
            fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
            equal(Set.of(), current.controlPermissions(USER_ID + 1, TENANT_ID), "foreign user cannot claim current platform identity");
            equal(Set.of(), current.controlPermissions(USER_ID, TENANT_ID + 1), "foreign tenant cannot claim platform identity");
            fixture.user.setTenantId(TENANT_ID + 1);
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "real account ownership must match platform tenant");
            fixture.user.setTenantId(TENANT_ID);
            fixture.user.setStatus("1");
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "disabled account has no platform exception");
            fixture.user.setStatus("0");
            fixture.user.setDeleted(1);
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "deleted account has no platform exception");
            fixture.user.setDeleted(0);
            Map<String, Object> login = fixture.loginMap();
            login.put("tenantId", TENANT_ID + 1);
            fixture.replaceLogin(login);
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "switched session loses control exception");
            login.put("tenantId", TENANT_ID);
            fixture.replaceLogin(login);
            for (String realm : List.of("portal", "oauth2")) {
                StpLogic foreign = new StpLogic(realm);
                String foreignToken = foreign.createLoginSession(USER_ID, new SaLoginParameter().setTimeout(3600));
                try {
                    foreign.getSessionByLoginId(USER_ID).set(TokenService.LOGIN_USER_SESSION_KEY, fixture.loginMap());
                    fixture.currentToken.set(foreignToken);
                    equal(Set.of(), current.controlPermissions(USER_ID, TENANT_ID), "foreign login domain cannot inherit exception through equal numeric ID");
                } finally { fixture.currentToken.set(token); foreign.logoutByTokenValue(foreignToken); }
            }
            fixture.properties.setManagementTenantId(null);
            equal(fixed, Set.copyOf(StpUtil.getPermissionList(USER_ID)), "missing deployment configuration removes exception");
            fixture.properties.setManagementTenantId(TENANT_ID);
            CurrentPermissionService unavailable = new CurrentPermissionService(tenantId -> { throw new ServiceException("套餐不可用", 503); }, beans.getBeanProvider(PlatformPermissionPolicy.class));
            denied(() -> unavailable.internalPermissions(USER_ID, TENANT_ID, Set.of("*:*:*")), 503, "platform identity cannot bypass unavailable entitlement snapshot");
        } finally {
            fixture.currentToken.set(token);
            fixture.properties.setManagementTenantId(TENANT_ID);
            fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
            fixture.user.setTenantId(TENANT_ID);
            fixture.user.setStatus("0");
            fixture.user.setDeleted(0);
            fixture.permissions(Set.of(READ, WRITE));
            policyField.set(permissions, previous);
        }
    }

    private static void requestAndAnnotations() throws Exception {
        PlatformReauthenticationRequest request = credentials();
        request.setTotpCode("123456");
        ObjectMapper json = new ObjectMapper();
        try {
            json.writeValueAsString(request);
            throw new AssertionError("strict mapper must identify the all-write-only DTO as empty");
        } catch (InvalidDefinitionException expected) {
            check(!expected.getMessage().contains(PASSWORD) && !expected.getMessage().contains("123456"), "strict empty-bean failure never leaks request credentials");
        }
        json.disable(SerializationFeature.FAIL_ON_EMPTY_BEANS);
        equal("{}", json.writeValueAsString(request), "credential request is write-only in JSON");
        check(!request.toString().contains(PASSWORD) && !request.toString().contains("123456"), "request string excludes both credentials");
        PlatformReauthenticationRequest decoded = json.readValue("{\"password\":\"candidate\",\"totpCode\":\"123456\"}", PlatformReauthenticationRequest.class);
        equal("candidate", decoded.getPassword(), "write-only password remains accepted on input");
        equal("123456", decoded.getTotpCode(), "write-only challenge remains accepted on input");
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            check(factory.getValidator().validate(request).isEmpty(), "valid input accepts existing six-digit challenge");
            for (String invalid : List.of("", "1", "12345", "1234567", "abcdef", "１２３４５６")) {
                request.setTotpCode(invalid);
                check(!factory.getValidator().validate(request).isEmpty(), "malformed challenge denied");
            }
            request.setTotpCode(null);
            check(factory.getValidator().validate(request).isEmpty(), "optional challenge accepted for unenrolled accounts");
            for (String invalid : List.of("", "   ", "a".repeat(257))) {
                request.setPassword(invalid);
                check(!factory.getValidator().validate(request).isEmpty(), "invalid password length denied");
            }
            PlatformAccessProperties properties = new PlatformAccessProperties();
            check(factory.getValidator().validate(properties).isEmpty() && !properties.configured(), "missing deployment configuration disables rather than breaking startup");
            properties.setManagementTenantId(0L);
            check(!factory.getValidator().validate(properties).isEmpty(), "zero deployment tenant rejected at validation");
            properties.setManagementTenantId(TENANT_ID);
            properties.setAdministratorUserIds(Set.of(-1L));
            check(!factory.getValidator().validate(properties).isEmpty(), "negative deployment administrator rejected at validation");
        }
        int endpoints = 0;
        for (Method endpoint : PlatformAccessController.class.getDeclaredMethods()) {
            if (!org.springframework.core.annotation.AnnotatedElementUtils.hasAnnotation(endpoint,
                    org.springframework.web.bind.annotation.RequestMapping.class)) continue;
            endpoints++;
            SaCheckPermission permission = endpoint.getAnnotation(SaCheckPermission.class);
            check(permission != null && permission.mode() == SaMode.OR, "every platform endpoint uses an explicit permission guard");
            equal(Set.of(READ, "system:data-source:list", "system:oauth2:client:list", "system:tenant:list"), Set.of(permission.value()), "only approved platform entry permissions accepted");
            RateLimiter limit = endpoint.getAnnotation(RateLimiter.class);
            check(limit != null && limit.time() == 60 && limit.limitType() == LimitType.USER, "all endpoints have user-scoped rate limits");
            if (endpoint.getName().equals("authenticate")) {
                equal(5, limit.count(), "reauthentication allows five requests per minute");
                check(endpoint.isAnnotationPresent(RepeatSubmit.Disabled.class), "credential response is never reused by repeat-submit cache");
                SysLog log = endpoint.getAnnotation(SysLog.class);
                check(log != null && !log.logParams(), "credential request parameters excluded from operation logs");
            }
        }
        equal(2, endpoints, "both mapped platform endpoints have explicit guards");
        Method authenticate = PlatformAccessService.class.getMethod("authenticate", PlatformReauthenticationRequest.class);
        check(authenticate.isAnnotationPresent(HighRiskAction.class), "reauthentication is marked high risk");
        Audit audit = authenticate.getAnnotation(Audit.class);
        check(audit != null && audit.highRisk() && audit.spel().isEmpty(), "reauthentication audit omits credential arguments");
    }

    private static void configuration(Fixture fixture) {
        fixture.properties.setAdministratorUserIds(Set.of());
        equal(false, fixture.service.status().configured(), "empty deployment allowlist disables access");
        denied(() -> fixture.service.authenticate(credentials()), 503, "disabled access rejects reauthentication");
        fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
        fixture.properties.setManagementTenantId(null);
        equal(false, fixture.service.status().configured(), "missing platform tenant disables access");
        fixture.properties.setManagementTenantId(TENANT_ID);
        check(fixture.properties.configured(), "both deployment values enable identity checks");
        check(!fixture.service.status().verified(), "enabling identity is not reauthentication");
        fixture.properties.setAdministratorUserIds(Set.of(1L));
        denied(fixture.service::status, 403, "ordinary ADMIN role cannot replace deployment allowlist");
        fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
        fixture.permissions(Set.of());
        denied(fixture.service::status, 403, "allowlisted identity without entry permission denied");
        fixture.permissions(Set.of(READ, WRITE));
    }

    private static void identity(Fixture fixture) {
        UserContext.setUserId(1L);
        UserContext.setTenantId(12345L);
        UserContext.setRoles(Set.of("ADMIN"));
        TenantContext.setTenantId(12345L);
        check(!fixture.service.status().verified(), "browser-derived context cannot create a platform proof");
        equal(12345L, TenantContext.getTenantId(), "account lookup restores previous tenant context");
        check(!TenantContext.getTenantSkip(), "account lookup restores tenant filtering");
        UserContext.clear();
        TenantContext.clear();
        Map<String, Object> login = fixture.loginMap();
        login.put("tenantId", 222222L);
        fixture.replaceLogin(login);
        denied(fixture.service::status, 403, "switching session away from platform tenant denied");
        login.put("tenantId", TENANT_ID);
        for (Object invalid : List.of(0L, -1L, "780.0", "0780", "9223372036854775808", "portal:780")) {
            login.put("userId", invalid);
            fixture.replaceLogin(login);
            denied(fixture.service::status, 403, "malformed internal identity denied");
        }
        fixture.properties.setAdministratorUserIds(Set.of(USER_ID, 781L));
        login.put("userId", 781L);
        fixture.replaceLogin(login);
        denied(fixture.service::status, 403, "persisted user identifier must match authenticated login identifier");
        fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
        login.put("userId", USER_ID);
        fixture.replaceLogin(login);
        fixture.user.setTenantId(222222L);
        denied(fixture.service::status, 403, "real account home tenant must be the platform tenant");
        fixture.user.setTenantId(TENANT_ID);
        fixture.user.setStatus("1");
        denied(fixture.service::status, 403, "disabled account cannot reuse a session");
        fixture.user.setStatus("0");
        fixture.user.setDeleted(1);
        denied(fixture.service::status, 403, "deleted account cannot reuse a session");
        fixture.user.setDeleted(0);
        fixture.user.setVersion(null);
        denied(fixture.service::status, 403, "unverifiable account version denied");
        fixture.user.setVersion(4);
    }

    private static void authentication(Fixture fixture) {
        denied(() -> fixture.service.requireRecent(WRITE), 403, "platform identity alone cannot execute an operation");
        PlatformAccessService.AccessState result = fixture.service.authenticate(credentials());
        check(result.configured() && result.verified() && !result.totpRequired(), "password-only unenrolled account reauthenticates");
        equal(fixture.clock.millis() + 300000, result.verifiedUntil(), "proof validity is exactly five minutes");
        equal(new PlatformAccessService.Operator(USER_ID, TENANT_ID), fixture.service.requireRecent(WRITE), "recent identity and operation permission required together");
        fixture.permissions(Set.of(READ));
        denied(() -> fixture.service.requireRecent(WRITE), 403, "a proof does not grant a missing write permission");
        fixture.permissions(Set.of(READ, WRITE));
        try {
            fixture.service.requireRecent("hr:employees:edit");
            throw new AssertionError("unregistered business permission accepted by platform gate");
        } catch (IllegalArgumentException expected) { checks++; }
        PlatformReauthenticationRequest wrong = credentials();
        wrong.setPassword(PASSWORD + "x");
        denied(() -> fixture.service.authenticate(wrong), 403, "wrong password denied");
        denied(() -> fixture.service.requireRecent(WRITE), 403, "failed reauthentication clears earlier proof");
        denied(() -> fixture.service.authenticate(null), 403, "missing request denied at service boundary");
        wrong.setPassword("x".repeat(257));
        denied(() -> fixture.service.authenticate(wrong), 403, "oversized credential denied at service boundary");
        wrong.setPassword(PASSWORD);
        wrong.setTotpCode("wrong");
        denied(() -> fixture.service.authenticate(wrong), 403, "malformed unused challenge denied at service boundary");
        fixture.service.authenticate(credentials());
        fixture.clock.advance(299999);
        fixture.service.requireRecent(WRITE);
        checks++;
        fixture.clock.advance(1);
        denied(() -> fixture.service.requireRecent(WRITE), 403, "proof expires at exactly five minutes");
    }

    private static void proofBoundaries(Fixture fixture) {
        fixture.service.authenticate(credentials());
        PlatformAuthenticationProof valid = fixture.proofs.values.get(fixture.currentToken.get());
        for (PlatformAuthenticationProof invalid : List.of(
                new PlatformAuthenticationProof(999L, valid.tenantId(), valid.credentialStamp(), valid.authenticatedAt(), valid.expiresAt()),
                new PlatformAuthenticationProof(valid.userId(), 999L, valid.credentialStamp(), valid.authenticatedAt(), valid.expiresAt()),
                new PlatformAuthenticationProof(valid.userId(), valid.tenantId(), "changed", valid.authenticatedAt(), valid.expiresAt()),
                new PlatformAuthenticationProof(valid.userId(), valid.tenantId(), valid.credentialStamp(), -1, valid.expiresAt()),
                new PlatformAuthenticationProof(valid.userId(), valid.tenantId(), valid.credentialStamp(), fixture.clock.millis() + 1, fixture.clock.millis() + 300001),
                new PlatformAuthenticationProof(valid.userId(), valid.tenantId(), valid.credentialStamp(), valid.authenticatedAt(), valid.expiresAt() + 1))) {
            fixture.proofs.values.put(fixture.currentToken.get(), invalid);
            denied(() -> fixture.service.requireRecent(WRITE), 403, "forged or inconsistent proof denied");
            check(!fixture.proofs.values.containsKey(fixture.currentToken.get()), "invalid proof removed without using it");
        }
        fixture.service.authenticate(credentials());
        fixture.user.setVersion(5);
        denied(() -> fixture.service.requireRecent(WRITE), 403, "account version change immediately invalidates proof");
        fixture.service.authenticate(credentials());
        String stored = fixture.user.getPassword();
        fixture.user.setPassword(fixture.passwords.encodePassword(PASSWORD + "new"));
        denied(() -> fixture.service.requireRecent(WRITE), 403, "password change invalidates proof even without a version bump");
        fixture.user.setPassword(stored);
        fixture.service.authenticate(credentials());
        fixture.proofs.values.clear();
        denied(() -> fixture.service.requireRecent(WRITE), 403, "clearing proof storage never expands access");
        fixture.auditFailure.set(true);
        denied(() -> fixture.service.authenticate(credentials()), 503, "failed audit persistence cannot issue a proof");
        check(fixture.proofs.values.isEmpty(), "no access granted before durable audit result");
        fixture.auditFailure.set(false);
        fixture.service.authenticate(credentials());
        fixture.properties.setAdministratorUserIds(Set.of());
        denied(() -> fixture.service.requireRecent(WRITE), 503, "deployment disablement immediately stops old proofs");
        fixture.properties.setAdministratorUserIds(Set.of(USER_ID));
    }

    private static void totp(Fixture fixture) {
        SysUserTotp record = new SysUserTotp();
        record.setUserId(USER_ID);
        record.setTenantId(TENANT_ID);
        record.setEnabled(1);
        record.setSecretCiphertext("isolated-encrypted-totp-marker");
        fixture.totpAccount.set(record);
        check(fixture.service.status().totpRequired(), "persisted enabled challenge is authoritative");
        denied(() -> fixture.service.requireRecent(WRITE), 403, "enabling TOTP invalidates a password-only proof");
        denied(() -> fixture.service.authenticate(credentials()), 403, "enabled TOTP cannot be skipped");
        PlatformReauthenticationRequest request = credentials();
        request.setTotpCode("654321");
        denied(() -> fixture.service.authenticate(request), 403, "wrong challenge denied");
        fixture.totpFailure.set(new IllegalStateException("private-totp-adapter-secret"));
        request.setTotpCode("123456");
        denied(() -> fixture.service.authenticate(request), 403, "disabled or unavailable TOTP adapter cannot bypass enrollment");
        fixture.totpFailure.set(null);
        check(fixture.service.authenticate(request).verified(), "enrolled account requires both password and consumed challenge");
        fixture.service.requireRecent(WRITE);
        checks++;
        record.setSecretCiphertext("different-encrypted-totp-marker");
        denied(() -> fixture.service.requireRecent(WRITE), 403, "challenge secret rotation invalidates existing proof");
        record.setEnabled(0);
        int calls = fixture.totpCalls.get();
        fixture.service.authenticate(credentials());
        equal(calls, fixture.totpCalls.get(), "unenrolled account does not use challenge verifier");
        fixture.totpAccount.set(null);
    }

    private static void sessionIsolation(Fixture fixture) {
        fixture.service.authenticate(credentials());
        String original = fixture.currentToken.get();
        String other = StpUtil.getStpLogic().createLoginSession(USER_ID,
                new SaLoginParameter().setTimeout(3600).setIsConcurrent(true).setIsShare(false));
        fixture.currentToken.set(other);
        denied(() -> fixture.service.requireRecent(WRITE), 403, "another session of the same user cannot reuse proof");
        fixture.currentToken.set(original);
        fixture.service.requireRecent(WRITE);
        checks++;
        for (String realm : List.of("portal", "oauth2")) {
            StpLogic foreign = new StpLogic(realm);
            String foreignToken = foreign.createLoginSession(USER_ID, new SaLoginParameter().setTimeout(3600));
            foreign.getSessionByLoginId(USER_ID).set(TokenService.LOGIN_USER_SESSION_KEY,
                    Map.of("userId", USER_ID, "tenantId", TENANT_ID, "permissions", List.of("*:*:*"), "roles", List.of("ADMIN")));
            fixture.currentToken.set(foreignToken);
            denied(fixture.service::status, 401, "foreign login domain with identical numeric ID cannot use platform access");
            foreign.logoutByTokenValue(foreignToken);
        }
        fixture.currentToken.set(original);
        StpUtil.logoutByTokenValue(original);
        denied(() -> fixture.service.requireRecent(WRITE), 401, "logout invalidates a still-stored platform proof");
        fixture.currentToken.set(null);
        denied(fixture.service::status, 401, "missing current session denied");
    }

    private static void storeBoundaries() throws Exception {
        String token = "isolated-proof-credential-not-for-production";
        AtomicReference<String> value = new AtomicReference<>();
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<Duration> expiry = new AtomicReference<>();
        AtomicReference<RuntimeException> failure = new AtomicReference<>();
        @SuppressWarnings("unchecked")
        ValueOperations<String, String> operations = (ValueOperations<String, String>) Proxy.newProxyInstance(
                PlatformAccessChecks.class.getClassLoader(), new Class<?>[]{ValueOperations.class}, (proxy, method, arguments) -> {
                    if (failure.get() != null) throw failure.get();
                    key.set(String.valueOf(arguments[0]));
                    if (method.getName().equals("get")) return value.get();
                    if (method.getName().equals("set") && arguments[2] instanceof Duration duration) {
                        value.set(String.valueOf(arguments[1]));
                        expiry.set(duration);
                        return null;
                    }
                    throw new AssertionError("Unexpected proof store operation " + method.getName());
                });
        StringRedisTemplate redis = new StringRedisTemplate() {
            @Override public ValueOperations<String, String> opsForValue() { return operations; }
            @Override public Boolean delete(String redisKey) {
                if (failure.get() != null) throw failure.get();
                key.set(redisKey);
                value.set(null);
                return true;
            }
        };
        PlatformAuthenticationStore store = new PlatformAuthenticationStore(redis, new ObjectMapper());
        PlatformAuthenticationProof proof = new PlatformAuthenticationProof(USER_ID, TENANT_ID, "fixture-stamp", 1000, 301000);
        store.write(token, proof);
        equal(Duration.ofSeconds(300), expiry.get(), "Redis proof TTL exactly 300 seconds");
        check(key.get().matches("auth:platform:recent:internal:[a-f0-9]{64}"), "Redis key only contains a fixed purpose and token hash");
        check(!key.get().contains(token) && !value.get().contains(token) && !value.get().contains(PASSWORD), "new proof state never stores raw credential");
        equal(proof, store.read(token), "proof uses production JSON round trip");
        check(!proof.toString().contains("fixture-stamp"), "proof string excludes credential fingerprint");
        store.clear(token);
        equal(null, store.read(token), "proof removal clears only owned hash key");
        value.set("malformed-private-proof-secret");
        denied(() -> store.read(token), 503, "malformed stored proof fails closed without leaking content");
        failure.set(new RedisConnectionFailureException("private-redis-location-and-secret"));
        denied(() -> store.read(token), 503, "Redis read failure cannot reuse stale proof");
        denied(() -> store.write(token, proof), 503, "Redis write failure cannot claim success");
        denied(() -> store.clear(token), 503, "Redis deletion failure stops reauthentication");
        failure.set(null);
        denied(() -> store.clear(null), 401, "empty token cannot address a shared proof key");
    }

    private static PlatformReauthenticationRequest credentials() {
        PlatformReauthenticationRequest request = new PlatformReauthenticationRequest();
        request.setPassword(PASSWORD);
        return request;
    }

    private static void check(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
    }

    private static void equal(Object expected, Object actual, String label) {
        check(Objects.equals(expected, actual), label);
    }

    private static void denied(Runnable action, int code, String label) {
        try { action.run(); }
        catch (ServiceException expected) {
            equal(code, expected.getCode(), label);
            check(expected.getCause() == null && !expected.getMessage().contains("private-")
                    && !expected.getMessage().contains(PASSWORD), label + " returns safe failure details");
            return;
        }
        throw new AssertionError(label);
    }

    private static class MutableClock extends Clock {
        private long now = Instant.parse("2026-09-27T00:00:00Z").toEpochMilli();
        @Override public ZoneId getZone() { return ZoneOffset.UTC; }
        @Override public Clock withZone(ZoneId zone) { return this; }
        @Override public Instant instant() { return Instant.ofEpochMilli(now); }
        void advance(long duration) { now += duration; }
    }

    private static class MemoryProofs extends PlatformAuthenticationStore {
        private final Map<String, PlatformAuthenticationProof> values = new HashMap<>();
        MemoryProofs() { super(null, new ObjectMapper()); }
        @Override public PlatformAuthenticationProof read(String token) { return values.get(token); }
        @Override public void write(String token, PlatformAuthenticationProof proof) { values.put(token, proof); }
        @Override public void clear(String token) { values.remove(token); }
    }

    private static class Fixture {
        final PlatformAccessProperties properties = new PlatformAccessProperties();
        final SysUser user = new SysUser();
        final AtomicReference<SysUserTotp> totpAccount = new AtomicReference<>();
        final AtomicReference<RuntimeException> totpFailure = new AtomicReference<>();
        final AtomicInteger totpCalls = new AtomicInteger();
        final AtomicReference<Boolean> auditFailure = new AtomicReference<>(false);
        final AtomicReference<String> currentToken = new AtomicReference<>();
        final MutableClock clock = new MutableClock();
        final MemoryProofs proofs = new MemoryProofs();
        final PasswordService passwords = new PasswordService(null, null, null);
        final TokenService tokens = new TokenService() {
            @Override public String getCurrentTokenValue() { return currentToken.get(); }
        };
        final PlatformAccessService service;

        Fixture() {
            properties.setManagementTenantId(TENANT_ID);
            properties.setAdministratorUserIds(Set.of(USER_ID));
            user.setUserId(USER_ID);
            user.setTenantId(TENANT_ID);
            user.setStatus("0");
            user.setDeleted(0);
            user.setVersion(4);
            user.setUserName("owned-platform-fixture");
            user.setPassword(passwords.encodePassword(PASSWORD));
            SysUserMapper users = (SysUserMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{SysUserMapper.class}, (proxy, method, arguments) -> {
                        equal("selectById", method.getName(), "only exact account lookup used");
                        equal(USER_ID, arguments[0], "account lookup uses authenticated identifier");
                        check(TenantContext.getTenantSkip(), "exact account lookup explicitly leaves foreign incoming tenant context");
                        return user;
                    });
            SysUserTotpMapper totpAccounts = (SysUserTotpMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{SysUserTotpMapper.class}, (proxy, method, arguments) -> {
                        equal("selectOne", method.getName(), "only enrolled challenge lookup used");
                        check(TenantContext.getTenantSkip(), "challenge lookup uses explicit account tenant scope");
                        return totpAccount.get();
                    });
            TotpService verifier = new TotpService(null, null, null, null, null, null) {
                @Override public boolean verifyLoginCode(Long userId, Long tenantId, String code) {
                    equal(USER_ID, userId, "challenge consumes authenticated account code");
                    equal(TENANT_ID, tenantId, "challenge consumes original account tenant code");
                    totpCalls.incrementAndGet();
                    if (totpFailure.get() != null) throw totpFailure.get();
                    return "123456".equals(code);
                }
            };
            SysAuditLogMapper audits = (SysAuditLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{SysAuditLogMapper.class}, (proxy, method, arguments) -> {
                        equal("insert", method.getName(), "identity verification only appends audit records");
                        SysAuditLogEntity entry = (SysAuditLogEntity) arguments[0];
                        equal(TENANT_ID, entry.getTenantId(), "audit uses authenticated platform tenant");
                        equal(String.valueOf(USER_ID), entry.getCreateBy(), "audit uses authenticated platform account");
                        equal("PLATFORM_REAUTHENTICATION", entry.getAuditName(), "identity verification has a stable audit event");
                        check(Integer.valueOf(1).equals(entry.getHighRisk()) && "HIGH".equals(entry.getRiskLevel()), "manual audit carries high-risk marker");
                        equal("IDENTITY_VERIFIED", entry.getAfterVal(), "audit records identity validation, not unissued access");
                        check(!entry.toString().contains(PASSWORD) && !entry.toString().contains(currentToken.get()), "audit omits credentials and session token");
                        if (auditFailure.get()) throw new IllegalStateException("private-audit-storage-secret");
                        return 1;
                    });
            service = new PlatformAccessService(properties, users, totpAccounts, tokens, passwords, verifier, proofs, audits, clock);
            currentToken.set(StpUtil.getStpLogic().createLoginSession(USER_ID,
                    new SaLoginParameter().setTimeout(3600).setIsConcurrent(true).setIsShare(false)));
            replaceLogin(Map.of("userId", USER_ID, "tenantId", TENANT_ID, "roles", List.of("ADMIN"),
                    "permissions", Set.of(READ, WRITE)));
        }

        Map<String, Object> loginMap() { return new HashMap<>(tokens.getLoginUserByToken(currentToken.get())); }
        void replaceLogin(Map<String, Object> login) { StpUtil.getSessionByLoginId(USER_ID).set(TokenService.LOGIN_USER_SESSION_KEY, new HashMap<>(login)); }
        void permissions(Set<String> permissions) {
            Map<String, Object> login = loginMap();
            login.put("permissions", permissions);
            replaceLogin(login);
        }
    }
}

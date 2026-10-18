package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.controller.system.TenantPackageController;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.math.BigDecimal;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import java.util.function.Consumer;
import org.springframework.jdbc.core.JdbcTemplate;

public final class TenantPackageManagementChecks {
    private static final long PLATFORM = 100000;
    private static final String READ = "system:tenant-package:list";
    private static final String WRITE = "system:tenant-package:manage";
    private static int checks;
    private final JdbcTemplate jdbc;
    private final TenantPackageStore store;
    private final TenantPackageCodec codec;
    private final SysAuditLogMapper audits;
    private final AtomicReference<String> failAuditName;
    private final AtomicReference<Set<String>> permissions = new AtomicReference<>(Set.of(READ, WRITE));
    private final TenantPackageManagementService service;

    TenantPackageManagementChecks(JdbcTemplate jdbc, TenantPackageStore store, TenantPackageCodec codec,
            SysAuditLogMapper audits, AtomicReference<String> failAuditName) {
        this.jdbc = jdbc;
        this.store = store;
        this.codec = codec;
        this.audits = audits;
        this.failAuditName = failAuditName;
        service = management(PLATFORM);
    }

    private TenantPackageManagementService management(long platform) {
        PlatformAccessService identity = new PlatformAccessService(null, null, null, null, null, null, null, null) {
            @Override public Operator requireRecent(String permission) {
                if (!Set.of(READ, WRITE).contains(permission)) throw new AssertionError("Unexpected management permission");
                if (!permissions.get().contains(permission)) throw new ServiceException("平台测试身份无权限", 403);
                return new Operator(42L, platform);
            }
        };
        return new TenantPackageManagementService(identity, store, codec, audits);
    }

    void verify() throws Exception {
        inputsAndAnnotations();
        TenantPackageViews.Catalog catalog = service.catalog();
        equal(3L, catalog.features().stream().filter(TenantPackageViews.Feature::fixedAccountOperation).count(), "only three fixed account operations");
        equal(19L, catalog.features().stream().filter(TenantPackageViews.Feature::independentOperation).count(), "all nineteen optional features exposed");
        equal(TenantPackageRules.MODULES, catalog.modules(), "catalog has exactly approved modules");
        long before = service.list(1, 10).total();
        TenantPackageSaveRequest request = request();
        TenantPackageViews.Template created = service.create(request);
        equal(before + 1, service.list(1, 10).total(), "management saves template through production mapper");
        equal(0, created.version(), "created template version zero");
        equal("MANAGEMENT_CHECK", created.packageCode(), "code trimmed before storage");
        equal(new BigDecimal("12.30"), created.price(), "display price stored with exact scale");
        equal(Set.of(2L, 900L, 901L, 906L, 1986L), created.menuIds(), "independent choice stores choice, parent directory and fixed account operations");
        equal(created, service.detail(created.packageId()), "detail reloads identical durable template");
        equal(List.of(), service.list(Integer.MAX_VALUE, 100).rows(), "large page offset remains safe long");
        equal(1L, auditCount(created.packageId(), "CREATED"), "creation and success audit commit together");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_name LIKE 'TENANT_PACKAGE_TEMPLATE_%' AND (tenant_id<>100000 OR create_by<>'42' OR high_risk<>1)", Integer.class), "template audit records actual platform operator and high risk");
        rejects("PACKAGE_CODE_EXISTS", 409, () -> service.create(request()));
        equal(before + 1, service.list(1, 10).total(), "duplicate code has no inserted template");
        TenantPackageManagementService foreign = management(PLATFORM + 1);
        equal(0L, foreign.list(1, 10).total(), "other platform cannot enumerate template");
        rejects("PACKAGE_NOT_FOUND", 404, () -> foreign.detail(created.packageId()));
        request.setPackageId(created.packageId());
        request.setVersion(0);
        rejects("PACKAGE_NOT_FOUND", 404, () -> foreign.update(request));
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,package_id,package_version,effective_menu_ids,user_limit,storage_limit,version) VALUES (650,'MANAGEMENT_TARGET','模板变更隔离',?,0,'[900,901,906,1986]',10,100,0)", created.packageId());
        request.setPackageCode("RENAMED_CHECK");
        request.setMenuIds(List.of());
        request.setMaxUsers(5);
        request.setMaxStorageMb(50L);
        request.setStatus("DISABLED");
        TenantPackageViews.Template updated = service.update(request);
        equal(1, updated.version(), "update advances version exactly once");
        equal("RENAMED_CHECK", updated.packageCode(), "approved code editing persists");
        equal("DISABLED", updated.status(), "status update persists");
        equal(Set.of(900L, 901L, 906L), updated.menuIds(), "removed optional function absent from updated template");
        equal(0, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=650", Integer.class), "editing template never silently synchronizes assigned tenant");
        equal(10, jdbc.queryForObject("SELECT user_limit FROM sys_tenant WHERE tenant_id=650", Integer.class), "tenant keeps previous quota until explicit synchronization");
        equal(true, codec.ids(jdbc.queryForObject("SELECT effective_menu_ids FROM sys_tenant WHERE tenant_id=650", String.class)).contains(1986L), "tenant keeps applied feature snapshot after template change");
        rejects("PACKAGE_VERSION_CONFLICT", 409, () -> service.update(request));
        request.setVersion(1);
        request.setPackageCode("SYNC_CHECK");
        rejects("PACKAGE_CODE_EXISTS", 409, () -> service.update(request));
        equal(updated, service.detail(created.packageId()), "duplicate rename rolls back entire update");
        request.setPackageCode("RENAMED_CHECK");
        request.setPackageName("不应落库的修改");
        failAuditName.set("TENANT_PACKAGE_TEMPLATE_UPDATED");
        rejects("WRITE_FAILED", 503, () -> service.update(request));
        equal(updated, service.detail(created.packageId()), "failed update audit rolls back version and all fields");
        equal(1L, auditCount(created.packageId(), "UPDATED"), "rollback leaves only actual success audit");
        TenantPackageSaveRequest failedCreate = request();
        failedCreate.setPackageCode("AUDIT_REJECTED");
        failAuditName.set("TENANT_PACKAGE_TEMPLATE_CREATED");
        rejects("WRITE_FAILED", 503, () -> service.create(failedCreate));
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant_package WHERE package_code='AUDIT_REJECTED'", Long.class), "failed creation audit rolls back inserted template");
        permissions.set(Set.of(READ));
        rejects(null, 403, () -> service.create(request()));
        rejects(null, 403, () -> service.update(request));
        equal(updated, service.detail(created.packageId()), "read-only platform identity can still read");
        permissions.set(Set.of(WRITE));
        rejects(null, 403, () -> service.list(1, 10));
        rejects(null, 403, service::catalog);
        rejects(null, 403, () -> service.detail(created.packageId()));
        permissions.set(Set.of(READ, WRITE));
        invalidValues();
        concurrent(created.packageId());
        jdbc.update("UPDATE sys_tenant_package SET version=2147483647 WHERE package_id=?", created.packageId());
        request.setVersion(Integer.MAX_VALUE);
        rejects("PACKAGE_VERSION_CONFLICT", 409, () -> service.update(request));
        equal(700000L, TenantContext.getTenantId(), "management operations restore caller tenant context");
        System.out.println("TENANT_PACKAGE_MANAGEMENT_CHECKS: assertions=" + checks + "; failed=0; real_mysql=true; production_management_service=true; production_mapper=true; identity_double=true; audit_rollback=true; concurrent_update=true; http=false");
    }

    private void invalidValues() {
        rejects("INVALID_PACKAGE", 400, () -> service.create(null));
        rejects("INVALID_PACKAGE", 400, () -> service.update(null));
        rejects("INVALID_PACKAGE", 400, () -> service.update(request()));
        rejects("INVALID_PACKAGE", 400, () -> service.list(0, 10));
        rejects("INVALID_PACKAGE", 400, () -> service.list(1, 101));
        rejects("INVALID_PACKAGE", 400, () -> service.detail(0));
        List<Consumer<TenantPackageSaveRequest>> mutations = List.of(
                value -> value.setPackageId(1L), value -> value.setVersion(0),
                value -> value.setPackageCode(" "), value -> value.setPackageCode("x".repeat(65)),
                value -> value.setPackageName(null), value -> value.setPackageName("x".repeat(101)),
                value -> value.setPrice(new BigDecimal("-1")), value -> value.setPrice(new BigDecimal("1.001")),
                value -> value.setPrice(new BigDecimal("1000000000000")), value -> value.setPrice(null),
                value -> value.setBillingCycle("AUTO_CHARGE"), value -> value.setStatus("deleted"),
                value -> value.setSortNo(-1), value -> value.setRemark("x".repeat(501)),
                value -> value.setMaxUsers(0), value -> value.setMaxStorageMb(Long.MAX_VALUE),
                value -> value.setMaxStorageMb(0L), value -> value.setEnabledModules(List.of("CRM", "CRM")),
                value -> value.setEnabledModules(List.of("UNKNOWN")), value -> value.setMenuIds(List.of(1986L, 1986L)),
                value -> value.setMenuIds(List.of(Long.MAX_VALUE)), value -> value.setMenuIds(null));
        long before = service.list(1, 10).total();
        for (Consumer<TenantPackageSaveRequest> mutation : mutations) {
            TenantPackageSaveRequest invalid = request();
            mutation.accept(invalid);
            rejects(null, 400, () -> service.create(invalid));
        }
        equal(before, service.list(1, 10).total(), "all rejected inputs preserve template count");
    }

    private void concurrent(long packageId) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.ArrayList<Future<String>> results = new java.util.ArrayList<>();
            for (String name : List.of("并发甲", "并发乙")) {
                results.add(workers.submit(() -> {
                    start.await();
                    TenantPackageSaveRequest request = request();
                    request.setPackageId(packageId);
                    request.setVersion(1);
                    request.setPackageCode("RENAMED_CHECK");
                    request.setPackageName(name);
                    try { service.update(request); return "UPDATED"; }
                    catch (TenantPackageFailure conflict) { return conflict.reason(); }
                }));
            }
            start.countDown();
            Set<String> outcomes = new HashSet<>();
            for (Future<String> result : results) outcomes.add(result.get(15, TimeUnit.SECONDS));
            equal(Set.of("UPDATED", "PACKAGE_VERSION_CONFLICT"), outcomes, "one concurrent editor succeeds and one sees conflict");
            equal(2, service.detail(packageId).version(), "concurrent update advances version only once");
            equal(2L, auditCount(packageId, "UPDATED"), "concurrent loser never emits success audit");
        } finally { workers.shutdownNow(); }
    }

    private void inputsAndAnnotations() throws Exception {
        ObjectMapper json = new ObjectMapper();
        for (Class<?> type : List.of(TenantPackageSaveRequest.class, TenantPackageSyncRequests.Preview.class, TenantPackageSyncRequests.Confirmation.class)) {
            try {
                json.readValue("{\"effectiveMenuIds\":[1986]}", type);
                throw new AssertionError("Unknown or forged effective fields accepted: " + type.getName());
            } catch (com.fasterxml.jackson.core.JsonProcessingException expected) { checks++; }
        }
        try (ValidatorFactory factory = Validation.buildDefaultValidatorFactory()) {
            equal(Set.of(), factory.getValidator().validate(request()), "normal request passes production validation");
            equal(false, factory.getValidator().validate(new TenantPackageSyncRequests.Preview(List.of())).isEmpty(), "empty preview targets rejected");
            equal(false, factory.getValidator().validate(new TenantPackageSyncRequests.Confirmation("invalid")).isEmpty(), "malformed preview hash rejected");
        }
        int endpoints = 0;
        for (java.lang.reflect.Method method : TenantPackageController.class.getDeclaredMethods()) {
            if (!org.springframework.core.annotation.AnnotatedElementUtils.hasAnnotation(method, org.springframework.web.bind.annotation.RequestMapping.class)) continue;
            endpoints++;
            cn.dev33.satoken.annotation.SaCheckPermission permission = method.getAnnotation(cn.dev33.satoken.annotation.SaCheckPermission.class);
            equal(true, permission != null && permission.value().length == 1 && Set.of(READ, WRITE, "system:tenant-package:sync").contains(permission.value()[0]), "every HTTP entry uses one approved permission");
            if (method.isAnnotationPresent(org.springframework.web.bind.annotation.GetMapping.class)) continue;
            com.cloudflow.common.log.annotation.SysLog log = method.getAnnotation(com.cloudflow.common.log.annotation.SysLog.class);
            equal(true, log != null && !log.logParams(), "mutation request content excluded from operation log");
            equal(true, method.isAnnotationPresent(com.cloudflow.common.ratelimiter.annotation.RateLimiter.class), "mutation rate limited");
        }
        equal(9, endpoints, "exactly nine management and synchronization HTTP entries");
    }

    private TenantPackageSaveRequest request() {
        TenantPackageSaveRequest request = new TenantPackageSaveRequest();
        request.setPackageCode(" MANAGEMENT_CHECK ");
        request.setPackageName("套餐管理测试");
        request.setMenuIds(List.of(1986L));
        request.setEnabledModules(List.of());
        request.setMaxUsers(10);
        request.setMaxStorageMb(100L);
        request.setPrice(new BigDecimal("12.30"));
        request.setBillingCycle("MONTHLY");
        request.setSortNo(0);
        request.setStatus("ACTIVE");
        return request;
    }

    private long auditCount(long packageId, String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_field=? AND audit_name=?", Long.class,
                "tenant_package:" + packageId, "TENANT_PACKAGE_TEMPLATE_" + action);
    }

    private static void rejects(String reason, int status, Runnable action) {
        try { action.run(); }
        catch (ServiceException rejected) {
            equal(status, rejected.getCode(), "expected safe error status");
            if (reason != null) equal(reason, ((TenantPackageFailure) rejected).reason(), "expected safe error reason");
            return;
        }
        throw new AssertionError("Expected rejection " + reason);
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}

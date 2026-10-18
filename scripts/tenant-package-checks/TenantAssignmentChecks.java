package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.jdbc.core.JdbcTemplate;

public final class TenantAssignmentChecks {
    private static int checks;
    private final JdbcTemplate jdbc;
    private final TenantPackageCodec codec;
    private final AtomicReference<String> failAuditName;
    private final AtomicReference<Set<String>> allowed = new AtomicReference<>(Set.of("system:tenant:add", "system:tenant:edit"));
    private final TenantAssignmentService service;
    private final TenantAssignmentService foreign;
    private final TenantPackageManagementService management;
    private final TenantPackageSyncService synchronization;

    TenantAssignmentChecks(JdbcTemplate jdbc, TenantPackageStore store, TenantPackageCodec codec,
            SysAuditLogMapper audits, AtomicReference<String> failAuditName) {
        this.jdbc = jdbc;
        this.codec = codec;
        this.failAuditName = failAuditName;
        service = new TenantAssignmentService(identity(100000), store, codec, audits);
        foreign = new TenantAssignmentService(identity(100001), store, codec, audits);
        PlatformAccessService creator = new PlatformAccessService(null, null, null, null, null, null, null, null) {
            @Override public Operator requireRecent(String permission) {
                if (!"system:tenant-package:manage".equals(permission)) throw new AssertionError("Unexpected fixture setup permission");
                return new Operator(42L, 100000L);
            }
        };
        management = new TenantPackageManagementService(creator, store, codec, audits);
        PlatformAccessService syncIdentity = new PlatformAccessService(null, null, null, null, null, null, null, null) {
            @Override public Operator requireRecent(String permission) {
                if (!"system:tenant-package:sync".equals(permission)) throw new AssertionError("Unexpected synchronization permission");
                return new Operator(42L, 100000L);
            }
        };
        synchronization = new TenantPackageSyncService(syncIdentity, store, codec, audits);
    }

    private PlatformAccessService identity(long platform) {
        return new PlatformAccessService(null, null, null, null, null, null, null, null) {
            @Override public Operator requireRecent(String permission) {
                if (!Set.of("system:tenant:add", "system:tenant:edit").contains(permission)) throw new AssertionError("Unexpected assignment permission");
                if (!allowed.get().contains(permission)) throw new ServiceException("测试身份权限不足", 403);
                return new Operator(42L, platform);
            }
        };
    }

    void verify() throws Exception {
        inputBoundary();
        TenantPackageSaveRequest template = new TenantPackageSaveRequest();
        template.setPackageCode("ASSIGNMENT_CHECK");
        template.setPackageName("分配测试套餐");
        template.setMenuIds(List.of(1986L));
        template.setEnabledModules(List.of());
        template.setMaxUsers(10);
        template.setMaxStorageMb(100L);
        template.setPrice(BigDecimal.ZERO);
        template.setBillingCycle("NONE");
        template.setSortNo(0);
        template.setStatus("ACTIVE");
        TenantPackageViews.Template saved = management.create(template);
        TenantSaveRequest.Selection selection = new TenantSaveRequest.Selection(saved.packageId(), 0,
                new TenantSaveRequest.AdjustmentsRequest(List.of(1762L), List.of(1986L), 5, 20L));
        TenantSaveRequest request = request("ASSIGN_TARGET");
        rejects("PACKAGE_REQUIRED", 400, () -> service.create(request));
        request.setPackageSelection(selection);
        rejects("PACKAGE_UNAVAILABLE", 409, () -> foreign.create(request));
        request.setUserLimit(999);
        rejects("EXPLICIT_OVERRIDE_REQUIRED", 400, () -> service.create(request));
        request.setUserLimit(null);
        allowed.set(Set.of());
        rejects(null, 403, () -> service.create(request));
        allowed.set(Set.of("system:tenant:add", "system:tenant:edit"));
        failAuditName.set("TENANT_ASSIGNMENT_CREATED");
        rejects("WRITE_FAILED", 503, () -> service.create(request));
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant WHERE tenant_code='ASSIGN_TARGET'", Long.class), "audit failure rolls back whole tenant creation");
        SysTenant tenant = service.create(request);
        equal(saved.packageId(), tenant.getPackageId(), "new tenant receives selected package");
        equal(0, tenant.getPackageVersion(), "applied template version persisted");
        equal(0, tenant.getVersion(), "new tenant version starts at zero");
        equal(5, tenant.getUserLimit(), "explicit user quota override applied");
        equal(20L, tenant.getStorageLimit(), "explicit MB storage override applied");
        equal(0L, tenant.getStorageUsed(), "new tenant usage initialized only by server");
        equal(selection.adjustments().rules(), codec.adjustments(tenant.getPackageOverride()), "exact custom adjustments saved");
        equal(true, codec.ids(tenant.getEffectiveMenuIds()).contains(1762L), "explicit independent addition applied");
        equal(false, codec.ids(tenant.getEffectiveMenuIds()).contains(1986L), "explicit independent removal applied");
        equal(1L, auditCount(tenant.getTenantId(), "CREATED"), "creation success audit belongs to target");
        rejects("TENANT_NAME_EXISTS", 409, () -> service.create(request));
        request.setTenantName("同编码不同名称");
        rejects("TENANT_CODE_EXISTS", 409, () -> service.create(request));
        request.setTenantName("ASSIGN_TARGET");
        request.setTenantId(tenant.getTenantId());
        request.setVersion(0);
        request.setPackageSelection(null);
        request.setContactName("只修改联系信息");
        jdbc.update("UPDATE sys_tenant SET storage_used=30,allowed_email_domains='example.test',contact_email='owner@example.test',expire_time='2027-01-01 00:00:00' WHERE tenant_id=?", tenant.getTenantId());
        template.setPackageId(saved.packageId());
        template.setVersion(0);
        template.setStatus("DISABLED");
        management.update(template);
        SysTenant metadata = service.update(request);
        equal(tenant.getPackageId(), metadata.getPackageId(), "absent selection preserves existing package even when disabled");
        equal(tenant.getPackageOverride(), metadata.getPackageOverride(), "metadata edit retains overrides byte-for-byte");
        equal(tenant.getEffectiveMenuIds(), metadata.getEffectiveMenuIds(), "metadata edit retains applied snapshot rather than recomputing latest template");
        equal(0, metadata.getPackageVersion(), "metadata edit does not claim latest package version");
        equal(30L, metadata.getStorageUsed(), "over-quota stored usage never truncated by tenant editing");
        equal("example.test", metadata.getAllowedEmailDomains(), "omitted registration whitelist remains unchanged");
        equal("owner@example.test", metadata.getContactEmail(), "omitted contact metadata remains unchanged");
        equal(java.time.LocalDateTime.of(2027, 1, 1, 0, 0), metadata.getExpireTime(), "omitted expiry retains existing limit");
        equal(5, metadata.getUserLimit(), "metadata edit keeps quota");
        rejects("TENANT_VERSION_CONFLICT", 409, () -> service.update(request));
        request.setVersion(1);
        request.setUserLimit(999);
        rejects("EXPLICIT_OVERRIDE_REQUIRED", 400, () -> service.update(request));
        request.setUserLimit(null);
        request.setStorageLimit(999L);
        rejects("EXPLICIT_OVERRIDE_REQUIRED", 400, () -> service.update(request));
        request.setStorageLimit(null);
        request.setPackageSelection(selection);
        rejects("PACKAGE_UNAVAILABLE", 409, () -> service.update(request));
        template.setVersion(1);
        template.setStatus("ACTIVE");
        management.update(template);
        rejects("PACKAGE_VERSION_CONFLICT", 409, () -> service.update(request));
        request.setPackageSelection(new TenantSaveRequest.Selection(saved.packageId(), 2, selection.adjustments()));
        failAuditName.set("TENANT_ASSIGNMENT_UPDATED");
        rejects("WRITE_FAILED", 503, () -> service.update(request));
        equal(1, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenant.getTenantId()), "failed assignment audit rolls back tenant version");
        equal(0, jdbc.queryForObject("SELECT package_version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenant.getTenantId()), "failed assignment audit rolls back package snapshot");
        SysTenant reapplied = service.update(request);
        equal(2, reapplied.getVersion(), "explicit reapplication advances tenant version");
        equal(2, reapplied.getPackageVersion(), "explicit reapplication records selected template version");
        equal(selection.adjustments().rules(), codec.adjustments(reapplied.getPackageOverride()), "explicit reapplication preserves selected custom overrides");
        request.setVersion(2);
        request.setPackageSelection(new TenantSaveRequest.Selection(saved.packageId(), 2,
                new TenantSaveRequest.AdjustmentsRequest(List.of(1986L), List.of(1986L), null, null)));
        rejects("CONTRADICTORY_OVERRIDE", 400, () -> service.update(request));
        equal(2, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenant.getTenantId()), "rejected contradictory override changes no tenant");
        allowed.set(Set.of("system:tenant:add"));
        rejects(null, 403, () -> service.update(request));
        allowed.set(Set.of("system:tenant:add", "system:tenant:edit"));
        legacy(saved.packageId());
        concurrent(tenant.getTenantId());
        TenantPackageSyncService.View preview = synchronization.preview(saved.packageId(), List.of(tenant.getTenantId()));
        TenantSaveRequest editing = request("ASSIGN_TARGET");
        editing.setTenantId(tenant.getTenantId());
        editing.setVersion(3);
        editing.setContactName("同步预览后的编辑");
        service.update(editing);
        TenantPackageSyncService.View conflict = synchronization.confirm(preview.syncId(), preview.preview().hash());
        equal("PARTIAL", conflict.status(), "assignment edit invalidates previously generated synchronization batch");
        equal("CONFLICT", conflict.items().get(0).status(), "synchronization reports actual tenant version conflict");
        equal(4, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenant.getTenantId()), "synchronization does not overwrite newer assignment edit");
        equal(700000L, TenantContext.getTenantId(), "assignment restores incoming tenant context");
        System.out.println("TENANT_ASSIGNMENT_CHECKS: assertions=" + checks + "; failed=0; real_mysql=true; production_assignment_service=true; original_legacy_permissions_preserved=true; audit_rollback=true; concurrent_edit=true; identity_double=true; http=false");
    }

    private void legacy(long packageId) {
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,user_limit,storage_limit,storage_used) VALUES (660,'LEGACY_ASSIGN','LEGACY_ASSIGN',0,0,23)");
        TenantSaveRequest request = request("LEGACY_ASSIGN");
        request.setTenantId(660L);
        request.setVersion(0);
        SysTenant preserved = service.update(request);
        equal(null, preserved.getPackageId(), "old unassigned tenant keeps unassigned state");
        equal(null, preserved.getEffectiveMenuIds(), "legacy permissions never implicitly replaced");
        equal(0, preserved.getUserLimit(), "legacy unlimited user quota preserved");
        equal(0L, preserved.getStorageLimit(), "legacy unlimited storage quota preserved");
        request.setVersion(1);
        request.setUserLimit(20);
        request.setStorageLimit(100L);
        SysTenant legacyQuotas = service.update(request);
        equal(20, legacyQuotas.getUserLimit(), "legacy direct quota editing remains supported");
        equal(100L, legacyQuotas.getStorageLimit(), "legacy direct MB quota editing remains supported");
        request.setVersion(2);
        request.setUserLimit(null);
        request.setStorageLimit(null);
        request.setPackageSelection(new TenantSaveRequest.Selection(packageId, 2,
                new TenantSaveRequest.AdjustmentsRequest(List.of(), List.of(), null, null)));
        SysTenant assigned = service.update(request);
        equal(packageId, assigned.getPackageId(), "explicitly selecting package enrolls legacy tenant");
        equal(true, codec.ids(assigned.getEffectiveMenuIds()).contains(1986L), "enrollment installs full template snapshot");
        equal(10, assigned.getUserLimit(), "legacy direct quota does not silently become package override");
        equal(23L, assigned.getStorageUsed(), "enrollment retains actual usage");
    }

    private void concurrent(long tenantId) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            java.util.ArrayList<Future<String>> results = new java.util.ArrayList<>();
            for (String name : List.of("并发修改甲", "并发修改乙")) results.add(workers.submit(() -> {
                start.await();
                TenantSaveRequest request = request("ASSIGN_TARGET");
                request.setTenantId(tenantId);
                request.setVersion(2);
                request.setContactName(name);
                try { service.update(request); return "UPDATED"; }
                catch (TenantPackageFailure failure) { return failure.reason(); }
            }));
            start.countDown();
            Set<String> outcomes = new java.util.HashSet<>();
            for (Future<String> result : results) outcomes.add(result.get(15, TimeUnit.SECONDS));
            equal(Set.of("UPDATED", "TENANT_VERSION_CONFLICT"), outcomes, "concurrent assignment metadata edits do not overwrite each other");
            equal(3, jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenantId), "concurrent tenant version advances once");
        } finally { workers.shutdownNow(); }
    }

    private void inputBoundary() throws Exception {
        ObjectMapper json = new ObjectMapper();
        for (String field : List.of("effectiveMenuIds", "packageId", "packageVersion", "packageOverride", "storageUsed", "deleted", "createBy")) {
            try {
                json.readValue("{\"" + field + "\":1}", TenantSaveRequest.class);
                throw new AssertionError("Untrusted write accepted: " + field);
            } catch (com.fasterxml.jackson.core.JsonProcessingException expected) { checks++; }
        }
        try {
            json.readValue("{\"packageSelection\":{\"packageId\":1,\"packageVersion\":0,\"adjustments\":{\"addMenuIds\":[],\"removeMenuIds\":[],\"effectiveMenuIds\":[1]}}}", TenantSaveRequest.class);
            throw new AssertionError("Nested untrusted effective fields accepted");
        } catch (com.fasterxml.jackson.core.JsonProcessingException expected) { checks++; }
        rejects("INVALID_PACKAGE", 400, () -> service.create(null));
        rejects("INVALID_PACKAGE", 400, () -> service.update(null));
        rejects("INVALID_PACKAGE", 400, () -> service.update(request("MISSING_ID")));
    }

    private TenantSaveRequest request(String code) {
        TenantSaveRequest request = new TenantSaveRequest();
        request.setTenantCode(code);
        request.setTenantName(code);
        request.setStatus("0");
        return request;
    }

    private long auditCount(long tenantId, String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_field=? AND audit_name=? AND tenant_id=100000 AND create_by='42'", Long.class, "tenant:" + tenantId, "TENANT_ASSIGNMENT_" + action);
    }

    private static void rejects(String reason, int code, Runnable action) {
        try { action.run(); }
        catch (ServiceException failure) {
            equal(code, failure.getCode(), "expected failure status");
            if (reason != null) equal(reason, ((TenantPackageFailure) failure).reason(), "expected failure reason");
            return;
        }
        throw new AssertionError("Expected rejection: " + reason);
    }

    private static void equal(Object expected, Object actual, String label) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }
}

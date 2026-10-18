package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.auth.platform.PlatformAccessService.Operator;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.RuleViolation;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TenantAssignmentService {
    private final PlatformAccessService access;
    private final TenantPackageStore store;
    private final TenantPackageCodec codec;
    private final SysAuditLogMapper audits;

    @HighRiskAction
    @Audit(name = "新增租户并分配套餐", highRisk = true)
    public SysTenant create(TenantSaveRequest request) {
        Operator operator = access.requireRecent("system:tenant:add");
        if (request == null || request.getTenantId() != null || request.getVersion() != null) throw TenantPackageFailure.invalid();
        if (request.getPackageSelection() == null) throw new TenantPackageFailure("PACKAGE_REQUIRED", "新增租户须选择已启用套餐", 400);
        try {
            return store.write(mapper -> {
                SysTenantPackage template = template(mapper, request.getPackageSelection(), operator);
                SysTenant tenant = metadata(request);
                uniqueName(mapper, tenant);
                apply(mapper, tenant, template, request);
                tenant.setCreateBy(String.valueOf(operator.userId()));
                tenant.setUpdateBy(tenant.getCreateBy());
                tenant.setCreateTime(now());
                tenant.setUpdateTime(tenant.getCreateTime());
                requireWrite(mapper.insertTenant(tenant));
                SysTenant saved = mapper.tenant(tenant.getTenantId());
                audit(operator, "CREATED", null, saved);
                return saved;
            });
        } catch (DuplicateKeyException duplicate) { throw duplicateCode(); }
        catch (RuleViolation invalid) { throw selection(invalid); }
    }

    @HighRiskAction
    @Audit(name = "修改租户及明确套餐覆盖", highRisk = true)
    public SysTenant update(TenantSaveRequest request) {
        Operator operator = access.requireRecent("system:tenant:edit");
        if (request == null || request.getTenantId() == null || request.getTenantId() <= 0
                || request.getVersion() == null || request.getVersion() < 0) throw TenantPackageFailure.invalid();
        try {
            return store.write(mapper -> {
                SysTenantPackage template = template(mapper, request.getPackageSelection(), operator);
                SysTenant current = mapper.lockTenant(request.getTenantId());
                if (current == null) throw new TenantPackageFailure("TENANT_NOT_FOUND", "租户不存在", 404);
                if (!request.getVersion().equals(current.getVersion()) || current.getVersion() == Integer.MAX_VALUE) {
                    throw new TenantPackageFailure("TENANT_VERSION_CONFLICT", "租户已被修改，请刷新后重试", 409);
                }
                SysTenant proposed = metadata(request);
                preserveOmittedMetadata(request, current, proposed);
                proposed.setTenantId(current.getTenantId());
                proposed.setVersion(current.getVersion());
                uniqueName(mapper, proposed);
                if (template != null) apply(mapper, proposed, template, request);
                else {
                    proposed.setPackageId(current.getPackageId());
                    proposed.setPackageVersion(current.getPackageVersion());
                    proposed.setPackageOverride(current.getPackageOverride());
                    proposed.setEffectiveMenuIds(current.getEffectiveMenuIds());
                    proposed.setUserLimit(current.getUserLimit());
                    proposed.setStorageLimit(current.getStorageLimit());
                    if (current.getPackageId() != null) {
                        if (request.getUserLimit() != null || request.getStorageLimit() != null) throw explicitOverride();
                    } else {
                        if (request.getUserLimit() != null) proposed.setUserLimit(request.getUserLimit());
                        if (request.getStorageLimit() != null) proposed.setStorageLimit(request.getStorageLimit());
                    }
                }
                proposed.setUpdateBy(String.valueOf(operator.userId()));
                proposed.setUpdateTime(now());
                requireWrite(mapper.updateTenant(proposed));
                SysTenant saved = mapper.tenant(current.getTenantId());
                audit(operator, "UPDATED", current, saved);
                return saved;
            });
        } catch (DuplicateKeyException duplicate) { throw duplicateCode(); }
        catch (RuleViolation invalid) { throw selection(invalid); }
    }

    private SysTenantPackage template(TenantPackageMapper mapper, TenantSaveRequest.Selection selection, Operator operator) {
        if (selection == null) return null;
        if (selection.packageId() == null || selection.packageId() <= 0 || selection.packageVersion() == null
                || selection.packageVersion() < 0 || selection.adjustments() == null) throw TenantPackageFailure.invalid();
        SysTenantPackage template = mapper.lockPackage(operator.tenantId(), selection.packageId());
        if (template == null || !"ACTIVE".equals(template.getStatus())) {
            throw new TenantPackageFailure("PACKAGE_UNAVAILABLE", "套餐不存在或尚未启用", 409);
        }
        if (!selection.packageVersion().equals(template.getVersion())) {
            throw new TenantPackageFailure("PACKAGE_VERSION_CONFLICT", "套餐已被修改，请刷新后重试", 409);
        }
        return template;
    }

    private void apply(TenantPackageMapper mapper, SysTenant tenant, SysTenantPackage template, TenantSaveRequest request) {
        if (request.getUserLimit() != null || request.getStorageLimit() != null) throw explicitOverride();
        Adjustments adjustments = request.getPackageSelection().adjustments().rules();
        Effective effective = codec.compose(codec.rules(mapper.catalog()), template, adjustments);
        tenant.setPackageId(template.getPackageId());
        tenant.setPackageVersion(template.getVersion());
        tenant.setPackageOverride(codec.encode(adjustments));
        tenant.setEffectiveMenuIds(codec.encode(effective.menuIds()));
        tenant.setUserLimit(effective.quotas().maxUsers());
        tenant.setStorageLimit(effective.quotas().maxStorageMb());
    }

    private SysTenant metadata(TenantSaveRequest request) {
        if (request.getStatus() == null || !Set.of("0", "1").contains(request.getStatus())
                || request.getUserLimit() != null && request.getUserLimit() < 0
                || request.getStorageLimit() != null && (request.getStorageLimit() < 0
                        || request.getStorageLimit() > Long.MAX_VALUE / TenantPackageRules.BYTES_PER_MB)) throw TenantPackageFailure.invalid();
        SysTenant tenant = new SysTenant();
        tenant.setTenantCode(requiredText(request.getTenantCode(), 50));
        tenant.setTenantName(requiredText(request.getTenantName(), 50));
        tenant.setContactName(optionalText(request.getContactName(), 50));
        tenant.setContactPhone(optionalText(request.getContactPhone(), 20));
        tenant.setContactEmail(optionalText(request.getContactEmail(), 50));
        tenant.setAllowedEmailDomains(optionalText(request.getAllowedEmailDomains(), 500));
        tenant.setDomain(optionalText(request.getDomain(), 100));
        tenant.setStatus(request.getStatus());
        tenant.setExpireTime(request.getExpireTime());
        tenant.setRemark(optionalText(request.getRemark(), 500));
        return tenant;
    }

    private void uniqueName(TenantPackageMapper mapper, SysTenant tenant) {
        if (mapper.tenantNameCount(tenant.getTenantName(), tenant.getTenantId()) != 0) {
            throw new TenantPackageFailure("TENANT_NAME_EXISTS", "租户名称已存在", 409);
        }
    }

    private void preserveOmittedMetadata(TenantSaveRequest request, SysTenant current, SysTenant proposed) {
        if (request.getContactName() == null) proposed.setContactName(current.getContactName());
        if (request.getContactPhone() == null) proposed.setContactPhone(current.getContactPhone());
        if (request.getContactEmail() == null) proposed.setContactEmail(current.getContactEmail());
        if (request.getAllowedEmailDomains() == null) proposed.setAllowedEmailDomains(current.getAllowedEmailDomains());
        if (request.getDomain() == null) proposed.setDomain(current.getDomain());
        if (request.getExpireTime() == null) proposed.setExpireTime(current.getExpireTime());
        if (request.getRemark() == null) proposed.setRemark(current.getRemark());
    }

    private void audit(Operator operator, String action, SysTenant before, SysTenant after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(operator.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("TENANT_ASSIGNMENT_" + action);
        entry.setAuditField("tenant:" + after.getTenantId());
        entry.setBeforeVal(before == null ? "" : codec.encode(snapshot(before)));
        entry.setAfterVal(codec.encode(snapshot(after)));
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(String.valueOf(operator.userId()));
        entry.setCreateTime(now());
        requireWrite(audits.insert(entry));
    }

    private Assignment snapshot(SysTenant tenant) {
        return new Assignment(tenant.getTenantId(), tenant.getTenantCode(), tenant.getTenantName(), tenant.getStatus(), tenant.getExpireTime(),
                tenant.getPackageId(), tenant.getPackageVersion(), tenant.getPackageOverride(), tenant.getEffectiveMenuIds(),
                tenant.getUserLimit(), tenant.getStorageLimit(), tenant.getVersion());
    }

    private static String requiredText(String value, int limit) {
        if (value == null || value.isBlank()) throw TenantPackageFailure.invalid();
        return optionalText(value, limit);
    }

    private static String optionalText(String value, int limit) {
        if (value != null && value.length() > limit) throw TenantPackageFailure.invalid();
        return value == null ? null : value.trim();
    }

    private static LocalDateTime now() { return LocalDateTime.now(ZoneOffset.UTC).withNano(0); }
    private static TenantPackageFailure duplicateCode() { return new TenantPackageFailure("TENANT_CODE_EXISTS", "租户编码已存在", 409); }
    private static TenantPackageFailure selection(RuleViolation invalid) { return new TenantPackageFailure(invalid.code(), "套餐及个别覆盖不符合约束，请检查选择", 400); }
    private static TenantPackageFailure explicitOverride() { return new TenantPackageFailure("EXPLICIT_OVERRIDE_REQUIRED", "已分配套餐的配额只能通过明确的套餐覆盖修改", 400); }
    private static void requireWrite(int rows) {
        if (rows != 1) throw new TenantPackageFailure("WRITE_FAILED", "租户变更或审计未能保存", 503);
    }

    private record Assignment(Long tenantId, String tenantCode, String tenantName, String status, LocalDateTime expireTime,
            Long packageId, Integer packageVersion, String adjustments, String menuIds, Integer maxUsers, Long maxStorageMb, Integer version) { }
}

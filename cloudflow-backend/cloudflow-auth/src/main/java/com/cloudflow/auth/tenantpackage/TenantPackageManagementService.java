package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.auth.platform.PlatformAccessService.Operator;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Quotas;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.RuleViolation;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;
import lombok.RequiredArgsConstructor;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TenantPackageManagementService {
    private final PlatformAccessService access;
    private final TenantPackageStore store;
    private final TenantPackageCodec codec;
    private final SysAuditLogMapper audits;

    public TenantPackageViews.Page list(int pageNum, int pageSize) {
        Operator operator = access.requireRecent("system:tenant-package:list");
        if (pageNum < 1 || pageSize < 1 || pageSize > 100) throw TenantPackageFailure.invalid();
        long offset = Math.multiplyExact((long) pageNum - 1, pageSize);
        return store.read(mapper -> new TenantPackageViews.Page(mapper.page(operator.tenantId(), offset, pageSize)
                .stream().map(this::view).toList(), mapper.count(operator.tenantId()), pageNum, pageSize));
    }

    public TenantPackageViews.Template detail(long packageId) {
        Operator operator = access.requireRecent("system:tenant-package:list");
        if (packageId <= 0) throw TenantPackageFailure.invalid();
        return store.read(mapper -> view(required(mapper.findPackage(operator.tenantId(), packageId))));
    }

    public TenantPackageViews.Catalog catalog() {
        access.requireRecent("system:tenant-package:list");
        return store.read(mapper -> {
            List<SysMenu> menus = mapper.catalog();
            codec.rules(menus);
            return new TenantPackageViews.Catalog(menus.stream().map(menu -> new TenantPackageViews.Feature(
                    menu.getMenuId(), menu.getParentId(), menu.getMenuName(), menu.getMenuType(), menu.getPerms(),
                    "0".equals(menu.getStatus()), TenantPackageRules.ACCOUNT_OPERATIONS.containsKey(menu.getMenuId()),
                    TenantPackageRules.INDEPENDENT_OPERATIONS.containsKey(menu.getMenuId()))).toList(), TenantPackageRules.MODULES);
        });
    }

    @HighRiskAction
    @Audit(name = "新增租户套餐模板", highRisk = true)
    public TenantPackageViews.Template create(TenantPackageSaveRequest request) {
        Operator operator = access.requireRecent("system:tenant-package:manage");
        if (request == null || request.getPackageId() != null || request.getVersion() != null) throw TenantPackageFailure.invalid();
        try {
            return store.write(mapper -> {
                SysTenantPackage template = prepare(mapper, request, operator);
                template.setCreateBy(template.getUpdateBy());
                template.setCreateTime(template.getUpdateTime());
                requireWrite(mapper.insertPackage(template));
                SysTenantPackage saved = required(mapper.findPackage(operator.tenantId(), template.getPackageId()));
                audit(operator, "CREATED", saved.getPackageId(), "", codec.encode(view(saved)));
                return view(saved);
            });
        } catch (DuplicateKeyException duplicate) { throw duplicateCode(); }
        catch (RuleViolation invalid) { throw selection(invalid); }
    }

    @HighRiskAction
    @Audit(name = "修改租户套餐模板", highRisk = true)
    public TenantPackageViews.Template update(TenantPackageSaveRequest request) {
        Operator operator = access.requireRecent("system:tenant-package:manage");
        if (request == null || request.getPackageId() == null || request.getPackageId() <= 0
                || request.getVersion() == null || request.getVersion() < 0) throw TenantPackageFailure.invalid();
        try {
            return store.write(mapper -> {
                SysTenantPackage current = required(mapper.lockPackage(operator.tenantId(), request.getPackageId()));
                if (!request.getVersion().equals(current.getVersion()) || current.getVersion() == Integer.MAX_VALUE) {
                    throw new TenantPackageFailure("PACKAGE_VERSION_CONFLICT", "套餐已被修改，请刷新后重试", 409);
                }
                SysTenantPackage proposed = prepare(mapper, request, operator);
                proposed.setPackageId(current.getPackageId());
                proposed.setVersion(current.getVersion());
                requireWrite(mapper.updatePackage(proposed));
                SysTenantPackage saved = required(mapper.findPackage(operator.tenantId(), current.getPackageId()));
                audit(operator, "UPDATED", saved.getPackageId(), codec.encode(view(current)), codec.encode(view(saved)));
                return view(saved);
            });
        } catch (DuplicateKeyException duplicate) { throw duplicateCode(); }
        catch (RuleViolation invalid) { throw selection(invalid); }
    }

    private SysTenantPackage prepare(TenantPackageMapper mapper, TenantPackageSaveRequest request, Operator operator) {
        if (request.getMaxUsers() == null || request.getMaxStorageMb() == null || request.getMenuIds() == null
                || request.getEnabledModules() == null || request.getSortNo() == null || request.getSortNo() < 0
                || request.getPrice() == null || request.getPrice().signum() < 0
                || request.getPrice().compareTo(new BigDecimal("999999999999.99")) > 0
                || request.getBillingCycle() == null || !Set.of("NONE", "MONTHLY", "YEARLY").contains(request.getBillingCycle())
                || request.getStatus() == null || !Set.of("DRAFT", "ACTIVE", "DISABLED").contains(request.getStatus())) throw TenantPackageFailure.invalid();
        BigDecimal price;
        try { price = request.getPrice().setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException invalid) { throw TenantPackageFailure.invalid(); }
        Effective effective = codec.rules(mapper.catalog()).compose(request.getMenuIds(), request.getEnabledModules(),
                new Quotas(request.getMaxUsers(), request.getMaxStorageMb()), Adjustments.none());
        SysTenantPackage template = new SysTenantPackage();
        template.setTenantId(operator.tenantId());
        template.setPackageCode(requiredText(request.getPackageCode(), 64));
        template.setPackageName(requiredText(request.getPackageName(), 100));
        template.setMenuIds(codec.encode(effective.menuIds()));
        template.setEnabledModules(codec.encode(new java.util.TreeSet<>(request.getEnabledModules())));
        template.setMaxUsers(effective.quotas().maxUsers());
        template.setMaxStorageMb(effective.quotas().maxStorageMb());
        template.setPrice(price);
        template.setBillingCycle(request.getBillingCycle());
        template.setSortNo(request.getSortNo());
        template.setStatus(request.getStatus());
        if (request.getRemark() != null && request.getRemark().length() > 500) throw TenantPackageFailure.invalid();
        template.setRemark(request.getRemark());
        template.setUpdateBy(String.valueOf(operator.userId()));
        template.setUpdateTime(LocalDateTime.now(ZoneOffset.UTC).withNano(0));
        return template;
    }

    private TenantPackageViews.Template view(SysTenantPackage template) {
        return new TenantPackageViews.Template(template.getPackageId(), template.getPackageCode(), template.getPackageName(),
                codec.ids(template.getMenuIds()), codec.modules(template.getEnabledModules()), template.getMaxUsers(), template.getMaxStorageMb(),
                template.getPrice(), template.getBillingCycle(), template.getSortNo(), template.getStatus(), template.getRemark(),
                template.getVersion(), template.getCreateTime(), template.getUpdateTime());
    }

    private void audit(Operator operator, String action, long packageId, String before, String after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(operator.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("TENANT_PACKAGE_TEMPLATE_" + action);
        entry.setAuditField("tenant_package:" + packageId);
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(String.valueOf(operator.userId()));
        entry.setCreateTime(LocalDateTime.now(ZoneOffset.UTC).withNano(0));
        requireWrite(audits.insert(entry));
    }

    private static String requiredText(String value, int limit) {
        if (value == null || value.isBlank() || value.length() > limit) throw TenantPackageFailure.invalid();
        return value.trim();
    }

    private static SysTenantPackage required(SysTenantPackage template) {
        if (template == null) throw new TenantPackageFailure("PACKAGE_NOT_FOUND", "套餐不存在", 404);
        return template;
    }

    private static TenantPackageFailure duplicateCode() { return new TenantPackageFailure("PACKAGE_CODE_EXISTS", "套餐编码已存在", 409); }
    private static TenantPackageFailure selection(RuleViolation invalid) { return new TenantPackageFailure(invalid.code(), "套餐功能选择不符合约束，请检查模块、页面及按钮", 400); }
    private static void requireWrite(int rows) {
        if (rows != 1) throw new TenantPackageFailure("WRITE_FAILED", "套餐变更或审计未能保存", 503);
    }
}

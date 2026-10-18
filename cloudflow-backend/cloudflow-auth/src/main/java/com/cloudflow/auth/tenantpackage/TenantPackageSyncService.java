package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.domain.SysTenantPackageSync;
import com.cloudflow.auth.domain.SysTenantPackageSyncItem;
import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.auth.platform.PlatformAccessService.Operator;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.RuleViolation;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Decision;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Item;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Preview;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Snapshot;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class TenantPackageSyncService {
    private final PlatformAccessService access;
    private final TenantPackageStore store;
    private final TenantPackageCodec codec;
    private final SysAuditLogMapper audits;
    private final Clock clock;

    @Autowired
    public TenantPackageSyncService(PlatformAccessService access, TenantPackageStore store, TenantPackageCodec codec, SysAuditLogMapper audits) {
        this(access, store, codec, audits, Clock.systemUTC());
    }

    TenantPackageSyncService(PlatformAccessService access, TenantPackageStore store, TenantPackageCodec codec, SysAuditLogMapper audits, Clock clock) {
        this.access = access;
        this.store = store;
        this.codec = codec;
        this.audits = audits;
        this.clock = clock;
    }

    @Audit(name = "生成租户套餐同步预览", highRisk = true)
    public View preview(long packageId, Collection<Long> tenantIds) {
        Operator operator = access.requireRecent("system:tenant-package:sync");
        if (packageId <= 0 || tenantIds == null || tenantIds.isEmpty()
                || tenantIds.stream().anyMatch(tenantId -> tenantId == null || tenantId <= 0)
                || new TreeSet<>(tenantIds).size() != tenantIds.size()) throw TenantPackageFailure.invalid();
        return store.write(mapper -> {
            SysTenantPackage template = active(mapper.lockPackage(operator.tenantId(), packageId));
            TenantPackageRules rules = codec.rules(mapper.catalog());
            codec.compose(rules, template, TenantPackageRules.Adjustments.none());
            List<Item> items = new ArrayList<>();
            for (Long tenantId : new TreeSet<>(tenantIds)) {
                SysTenant tenant = mapper.tenant(tenantId);
                if (tenant == null || !Objects.equals(tenant.getPackageId(), packageId)) {
                    throw new TenantPackageFailure("TARGET_PACKAGE_MISMATCH", "目标租户不存在或未使用此套餐", 409);
                }
                Snapshot before = codec.snapshot(tenant, rules);
                try {
                    if (before.tenantVersion() == Integer.MAX_VALUE) {
                        items.add(new Item(tenantId, before, null, "TENANT_VERSION_EXHAUSTED"));
                        continue;
                    }
                    Effective effective = codec.compose(rules, template, before.adjustments());
                    Snapshot proposed = new Snapshot(tenantId, packageId, template.getVersion(), before.tenantVersion() + 1, before.adjustments(), effective);
                    items.add(new Item(tenantId, before, proposed, null));
                } catch (RuleViolation conflict) {
                    items.add(new Item(tenantId, before, null, conflict.code()));
                }
            }
            Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
            Preview preview = TenantPackageSyncRules.preview(operator.tenantId(), operator.userId(), packageId, template.getVersion(), now, items);
            SysTenantPackageSync batch = new SysTenantPackageSync();
            batch.setTenantId(operator.tenantId());
            batch.setPackageId(packageId);
            batch.setPackageVersion(template.getVersion());
            batch.setTargetTenantIds(codec.encode(preview.items().stream().map(Item::targetTenantId).toList()));
            batch.setPreviewHash(preview.hash());
            batch.setPreviewExpireTime(local(preview.expiresAt()));
            batch.setRequestedBy(operator.userId());
            batch.setStatus("PREVIEWED");
            batch.setCreateBy(String.valueOf(operator.userId()));
            batch.setUpdateBy(batch.getCreateBy());
            batch.setCreateTime(local(now));
            batch.setUpdateTime(batch.getCreateTime());
            requireWrite(mapper.insertSync(batch));
            for (Item item : preview.items()) {
                SysTenantPackageSyncItem row = new SysTenantPackageSyncItem();
                row.setTenantId(operator.tenantId());
                row.setSyncId(batch.getSyncId());
                row.setTargetTenantId(item.targetTenantId());
                row.setExpectedVersion(item.before().tenantVersion());
                row.setBeforeSnapshot(codec.encode(item.before()));
                row.setProposedSnapshot(codec.encode(new Proposal(item.proposed(), item.errorCode())));
                row.setStatus(item.errorCode() == null ? "PREVIEWED" : "CONFLICT");
                row.setErrorCode(item.errorCode());
                row.setCreateBy(batch.getCreateBy());
                row.setUpdateBy(batch.getCreateBy());
                row.setCreateTime(batch.getCreateTime());
                row.setUpdateTime(batch.getCreateTime());
                requireWrite(mapper.insertItem(row));
            }
            audit(operator, "PREVIEW", batch.getSyncId(), "", preview.hash());
            return view(mapper, batch);
        });
    }

    public View detail(long syncId) {
        Operator operator = access.requireRecent("system:tenant-package:sync");
        return store.read(mapper -> view(mapper, owned(mapper.findSync(operator.tenantId(), syncId), operator)));
    }

    @HighRiskAction
    @Audit(name = "确认租户套餐同步", highRisk = true)
    public View confirm(long syncId, String previewHash) {
        Operator operator = access.requireRecent("system:tenant-package:sync");
        List<Long> itemIds = store.write(mapper -> {
            SysTenantPackageSync current = owned(mapper.findSync(operator.tenantId(), syncId), operator);
            SysTenantPackage template = active(mapper.lockPackage(operator.tenantId(), current.getPackageId()));
            SysTenantPackageSync batch = owned(mapper.lockSync(operator.tenantId(), syncId), operator);
            if (!Set.of("PREVIEWED", "RUNNING", "PARTIAL", "COMPLETED").contains(batch.getStatus())) throw TenantPackageFailure.conflict();
            Preview preview = restore(mapper, batch);
            try {
                TenantPackageSyncRules.confirm(preview, operator.tenantId(), operator.userId(), previewHash, clock.instant(),
                        batch.getConfirmedTime() == null ? null : instant(batch.getConfirmedTime()), template.getVersion());
            } catch (TenantPackageSyncRules.SyncViolation exception) {
                throw new TenantPackageFailure(exception.code(), "预览已过期、内容已变更或确认信息不匹配，请重新预览", 409);
            }
            if (!"COMPLETED".equals(batch.getStatus())) {
                if (batch.getConfirmedTime() == null) batch.setConfirmedTime(now());
                batch.setStatus("RUNNING");
                batch.setUpdateBy(String.valueOf(operator.userId()));
                batch.setUpdateTime(now());
                requireWrite(mapper.updateSync(batch));
                audit(operator, "CONFIRM", syncId, preview.hash(), "RUNNING");
            }
            return mapper.items(operator.tenantId(), syncId).stream().filter(item -> !"APPLIED".equals(item.getStatus()))
                    .map(SysTenantPackageSyncItem::getItemId).toList();
        });
        for (Long itemId : itemIds) {
            access.requireRecent("system:tenant-package:sync");
            try {
                store.write(mapper -> { applyItem(mapper, operator, syncId, itemId, previewHash); return null; });
            } catch (RuntimeException failed) {
                store.write(mapper -> {
                    SysTenantPackageSync batch = owned(mapper.lockSync(operator.tenantId(), syncId), operator);
                    if ("CANCELLED".equals(batch.getStatus())) return batch;
                    SysTenantPackageSyncItem item = mapper.lockItem(operator.tenantId(), syncId, itemId);
                    if (item == null) throw TenantPackageFailure.conflict();
                    if (!"APPLIED".equals(item.getStatus()) && !"CONFLICT".equals(item.getStatus())) {
                        finishItem(mapper, operator, item, "FAILED", "APPLY_FAILED");
                        audit(operator, "ITEM_FAILED", syncId, String.valueOf(item.getTargetTenantId()), "APPLY_FAILED");
                    }
                    return batch;
                });
            }
        }
        return store.write(mapper -> {
            SysTenantPackageSync batch = owned(mapper.lockSync(operator.tenantId(), syncId), operator);
            if ("CANCELLED".equals(batch.getStatus())) return view(mapper, batch);
            String status = TenantPackageSyncRules.result(mapper.items(operator.tenantId(), syncId).stream().map(SysTenantPackageSyncItem::getStatus).toList());
            if (!status.equals(batch.getStatus())) {
                batch.setStatus(status);
                batch.setUpdateBy(String.valueOf(operator.userId()));
                batch.setUpdateTime(now());
                requireWrite(mapper.updateSync(batch));
                audit(operator, "RESULT", syncId, "RUNNING", status);
            }
            return view(mapper, batch);
        });
    }

    private void applyItem(TenantPackageMapper mapper, Operator operator, long syncId, long itemId, String previewHash) {
        SysTenantPackageSync found = owned(mapper.findSync(operator.tenantId(), syncId), operator);
        SysTenantPackage template = mapper.lockPackage(operator.tenantId(), found.getPackageId());
        SysTenantPackageSync batch = owned(mapper.lockSync(operator.tenantId(), syncId), operator);
        if ("CANCELLED".equals(batch.getStatus())) return;
        SysTenantPackageSyncItem row = mapper.lockItem(operator.tenantId(), syncId, itemId);
        if (row == null || batch.getConfirmedTime() == null) throw TenantPackageFailure.conflict();
        Preview preview = restore(mapper, batch);
        if (!preview.hash().equals(previewHash)) throw TenantPackageFailure.conflict();
        Item item = preview.items().stream().filter(candidate -> candidate.targetTenantId() == row.getTargetTenantId()).findFirst().orElseThrow(TenantPackageFailure::conflict);
        if ("APPLIED".equals(row.getStatus()) || "CONFLICT".equals(row.getStatus())) return;
        if (template == null || !"ACTIVE".equals(template.getStatus()) || !Objects.equals(template.getVersion(), batch.getPackageVersion())) {
            finishItem(mapper, operator, row, "CONFLICT", "PACKAGE_VERSION_CONFLICT");
            audit(operator, "ITEM_CONFLICT", syncId, String.valueOf(row.getTargetTenantId()), "PACKAGE_VERSION_CONFLICT");
            return;
        }
        SysTenant tenant = mapper.lockTenant(row.getTargetTenantId());
        TenantPackageRules rules = codec.rules(mapper.catalog());
        Snapshot current = null;
        try { if (tenant != null) current = codec.snapshot(tenant, rules); }
        catch (IllegalArgumentException | TenantPackageFailure invalid) { current = null; }
        if (TenantPackageSyncRules.decide(item, current, row.getStatus()) != Decision.APPLY) {
            finishItem(mapper, operator, row, "CONFLICT", "TENANT_VERSION_CONFLICT");
            audit(operator, "ITEM_CONFLICT", syncId, String.valueOf(row.getTargetTenantId()), "TENANT_VERSION_CONFLICT");
            return;
        }
        Effective proposed = codec.compose(rules, template, item.before().adjustments());
        if (!proposed.equals(item.proposed().effective())) throw TenantPackageFailure.conflict();
        tenant.setPackageVersion(item.proposed().packageVersion());
        tenant.setPackageOverride(codec.encode(item.proposed().adjustments()));
        tenant.setEffectiveMenuIds(codec.encode(proposed.menuIds()));
        tenant.setUserLimit(proposed.quotas().maxUsers());
        tenant.setStorageLimit(proposed.quotas().maxStorageMb());
        tenant.setUpdateBy(String.valueOf(operator.userId()));
        tenant.setUpdateTime(now());
        requireWrite(mapper.applyTenant(tenant, item.before().tenantVersion(), item.before().packageId()));
        finishItem(mapper, operator, row, "APPLIED", null);
        audit(operator, "ITEM_APPLIED", syncId, codec.encode(item.before()), codec.encode(item.proposed()));
    }

    @HighRiskAction
    @Audit(name = "取消租户套餐同步", highRisk = true)
    public View cancel(long syncId, String previewHash) {
        Operator operator = access.requireRecent("system:tenant-package:sync");
        return store.write(mapper -> {
            SysTenantPackageSync found = owned(mapper.findSync(operator.tenantId(), syncId), operator);
            mapper.lockPackage(operator.tenantId(), found.getPackageId());
            SysTenantPackageSync batch = owned(mapper.lockSync(operator.tenantId(), syncId), operator);
            if (!restore(mapper, batch).hash().equals(previewHash)) throw TenantPackageFailure.conflict();
            if ("CANCELLED".equals(batch.getStatus())) return view(mapper, batch);
            if (!Set.of("PREVIEWED", "RUNNING", "PARTIAL").contains(batch.getStatus())) throw TenantPackageFailure.conflict();
            if (mapper.items(operator.tenantId(), syncId).stream().allMatch(item -> "APPLIED".equals(item.getStatus()))) {
                throw TenantPackageFailure.conflict();
            }
            String before = batch.getStatus();
            batch.setStatus("CANCELLED");
            batch.setUpdateBy(String.valueOf(operator.userId()));
            batch.setUpdateTime(now());
            requireWrite(mapper.updateSync(batch));
            audit(operator, "CANCELLED", syncId, before, "CANCELLED");
            return view(mapper, batch);
        });
    }

    private Preview restore(TenantPackageMapper mapper, SysTenantPackageSync batch) {
        List<Item> items = new ArrayList<>();
        for (SysTenantPackageSyncItem row : mapper.items(batch.getTenantId(), batch.getSyncId())) {
            Snapshot before = codec.decode(row.getBeforeSnapshot(), Snapshot.class);
            Proposal proposed = codec.decode(row.getProposedSnapshot(), Proposal.class);
            if (row.getExpectedVersion() == null || row.getExpectedVersion() != before.tenantVersion()) throw TenantPackageFailure.conflict();
            items.add(new Item(row.getTargetTenantId(), before, proposed.snapshot(), proposed.errorCode()));
        }
        Preview result = TenantPackageSyncRules.preview(batch.getTenantId(), batch.getRequestedBy(), batch.getPackageId(), batch.getPackageVersion(),
                instant(batch.getCreateTime()), items);
        if (!result.hash().equals(batch.getPreviewHash()) || !result.expiresAt().equals(instant(batch.getPreviewExpireTime()))
                || !codec.ids(batch.getTargetTenantIds()).equals(new TreeSet<>(items.stream().map(Item::targetTenantId).toList()))) {
            throw TenantPackageFailure.conflict();
        }
        return result;
    }

    private View view(TenantPackageMapper mapper, SysTenantPackageSync batch) {
        Preview preview = restore(mapper, batch);
        List<ItemResult> results = mapper.items(batch.getTenantId(), batch.getSyncId()).stream()
                .map(item -> new ItemResult(item.getTargetTenantId(), item.getStatus(), item.getErrorCode(), item.getAppliedTime())).toList();
        return new View(batch.getSyncId(), batch.getStatus(), preview, results);
    }

    private void finishItem(TenantPackageMapper mapper, Operator operator, SysTenantPackageSyncItem item, String status, String errorCode) {
        item.setStatus(status);
        item.setErrorCode(errorCode);
        item.setAppliedTime("APPLIED".equals(status) ? now() : null);
        item.setUpdateBy(String.valueOf(operator.userId()));
        item.setUpdateTime(now());
        requireWrite(mapper.updateItem(item));
    }

    private SysTenantPackage active(SysTenantPackage template) {
        if (template == null || !"ACTIVE".equals(template.getStatus()) || template.getVersion() == null || template.getVersion() < 0) {
            throw new TenantPackageFailure("PACKAGE_UNAVAILABLE", "套餐不存在或尚未启用", 409);
        }
        return template;
    }

    private SysTenantPackageSync owned(SysTenantPackageSync batch, Operator operator) {
        if (batch == null || !Objects.equals(batch.getTenantId(), operator.tenantId()) || !Objects.equals(batch.getRequestedBy(), operator.userId())) {
            throw new TenantPackageFailure("PREVIEW_NOT_FOUND", "同步预览不存在或不属于当前平台账号", 404);
        }
        return batch;
    }

    private void audit(Operator operator, String action, long syncId, String before, String after) {
        SysAuditLogEntity entry = new SysAuditLogEntity();
        entry.setTenantId(operator.tenantId());
        entry.setBizModule("system");
        entry.setAuditName("TENANT_PACKAGE_" + action);
        entry.setAuditField("tenant_package_sync:" + syncId);
        entry.setBeforeVal(before);
        entry.setAfterVal(after);
        entry.setHighRisk(1);
        entry.setRiskLevel("HIGH");
        entry.setCreateBy(String.valueOf(operator.userId()));
        entry.setCreateTime(now());
        requireWrite(audits.insert(entry));
    }

    private static void requireWrite(int affected) {
        if (affected != 1) throw new TenantPackageFailure("WRITE_FAILED", "套餐变更或审计未能保存", 503);
    }

    private LocalDateTime now() { return local(clock.instant().truncatedTo(ChronoUnit.SECONDS)); }
    private static LocalDateTime local(Instant time) { return LocalDateTime.ofInstant(time, ZoneOffset.UTC); }
    private static Instant instant(LocalDateTime time) { return time.toInstant(ZoneOffset.UTC); }

    public record Proposal(Snapshot snapshot, String errorCode) { }
    public record ItemResult(long tenantId, String status, String errorCode, LocalDateTime appliedTime) { }
    public record View(long syncId, String status, Preview preview, List<ItemResult> items) { }
}

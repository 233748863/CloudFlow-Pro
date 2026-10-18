package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import java.io.ByteArrayOutputStream;
import java.io.DataOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.HexFormat;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;

public final class TenantPackageSyncRules {
    public static final long PREVIEW_SECONDS = 300;

    private TenantPackageSyncRules() { }

    public static Preview preview(long platformTenantId, long operatorId, long packageId, int packageVersion,
            Instant createdAt, Collection<Item> items) {
        if (platformTenantId <= 0 || operatorId <= 0 || packageId <= 0 || packageVersion < 0 || createdAt == null
                || items == null || items.isEmpty() || items.stream().anyMatch(Objects::isNull)) {
            throw failure("INVALID_PREVIEW");
        }
        List<Item> ordered = items.stream().sorted(Comparator.comparingLong(Item::targetTenantId)).toList();
        Set<Long> targets = new TreeSet<>();
        for (Item item : ordered) {
            if (!targets.add(item.targetTenantId()) || item.before().packageId() != packageId
                    || item.proposed() != null && (item.proposed().packageId() != packageId
                    || item.proposed().packageVersion() != packageVersion
                    || !item.before().adjustments().equals(item.proposed().adjustments()))) {
                throw failure("INVALID_PREVIEW");
            }
        }
        Instant expiresAt = createdAt.plusSeconds(PREVIEW_SECONDS);
        return new Preview(platformTenantId, operatorId, packageId, packageVersion, createdAt, expiresAt, ordered,
                digest(platformTenantId, operatorId, packageId, packageVersion, createdAt, expiresAt, ordered));
    }

    public static void confirm(Preview preview, long platformTenantId, long operatorId, String expectedHash,
            Instant now, Instant confirmedAt, int currentPackageVersion) {
        if (preview == null || now == null || expectedHash == null || !expectedHash.matches("[a-f0-9]{64}")) {
            throw failure("INVALID_CONFIRMATION");
        }
        if (preview.platformTenantId() != platformTenantId || preview.operatorId() != operatorId) throw failure("PREVIEW_OWNER_MISMATCH");
        String calculated = digest(preview.platformTenantId(), preview.operatorId(), preview.packageId(), preview.packageVersion(),
                preview.createdAt(), preview.expiresAt(), preview.items());
        if (!equalHash(calculated, preview.hash()) || !equalHash(calculated, expectedHash)) throw failure("PREVIEW_HASH_MISMATCH");
        if (now.isBefore(preview.createdAt()) || confirmedAt != null && (confirmedAt.isBefore(preview.createdAt())
                || !confirmedAt.isBefore(preview.expiresAt()) || confirmedAt.isAfter(now))) throw failure("INVALID_CONFIRMATION_TIME");
        if (confirmedAt == null && !now.isBefore(preview.expiresAt())) throw failure("PREVIEW_EXPIRED");
        if (preview.packageVersion() != currentPackageVersion) throw failure("PACKAGE_VERSION_CONFLICT");
    }

    public static Decision decide(Item item, Snapshot current, String itemStatus) {
        if (item == null || itemStatus == null) throw failure("INVALID_ITEM");
        if ("APPLIED".equals(itemStatus)) return Decision.ALREADY_APPLIED;
        if ("CONFLICT".equals(itemStatus) || item.errorCode() != null) return Decision.CONFLICT;
        if (!Set.of("PREVIEWED", "FAILED").contains(itemStatus)) throw failure("INVALID_ITEM_STATUS");
        return item.before().equals(current) ? Decision.APPLY : Decision.CONFLICT;
    }

    public static String result(Collection<String> itemStatuses) {
        if (itemStatuses == null || itemStatuses.isEmpty() || itemStatuses.stream().anyMatch(status -> status == null
                || !Set.of("PREVIEWED", "APPLIED", "CONFLICT", "FAILED").contains(status))) throw failure("INVALID_ITEM_STATUS");
        return itemStatuses.stream().allMatch("APPLIED"::equals) ? "COMPLETED" : "PARTIAL";
    }

    private static String digest(long platformTenantId, long operatorId, long packageId, int packageVersion,
            Instant createdAt, Instant expiresAt, List<Item> items) {
        try {
            ByteArrayOutputStream buffer = new ByteArrayOutputStream();
            try (DataOutputStream output = new DataOutputStream(buffer)) {
                output.writeUTF("CLOUDFLOW_TENANT_PACKAGE_PREVIEW_V1");
                output.writeLong(platformTenantId);
                output.writeLong(operatorId);
                output.writeLong(packageId);
                output.writeInt(packageVersion);
                output.writeUTF(createdAt.toString());
                output.writeUTF(expiresAt.toString());
                output.writeInt(items.size());
                for (Item item : items) {
                    output.writeLong(item.targetTenantId());
                    snapshot(output, item.before());
                    output.writeBoolean(item.proposed() != null);
                    if (item.proposed() != null) snapshot(output, item.proposed());
                    output.writeUTF(item.errorCode() == null ? "" : item.errorCode());
                }
            }
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(buffer.toByteArray()));
        } catch (IOException | NoSuchAlgorithmException exception) {
            throw new IllegalStateException("套餐预览摘要计算失败", exception);
        }
    }

    private static void snapshot(DataOutputStream output, Snapshot snapshot) throws IOException {
        output.writeLong(snapshot.tenantId());
        output.writeLong(snapshot.packageId());
        output.writeInt(snapshot.packageVersion());
        output.writeInt(snapshot.tenantVersion());
        ids(output, snapshot.effective().menuIds());
        List<String> permissions = snapshot.effective().permissions().stream().sorted().toList();
        output.writeInt(permissions.size());
        for (String permission : permissions) output.writeUTF(permission);
        output.writeInt(snapshot.effective().quotas().maxUsers());
        output.writeLong(snapshot.effective().quotas().maxStorageMb());
        Adjustments override = snapshot.adjustments();
        ids(output, override.addMenuIds());
        ids(output, override.removeMenuIds());
        output.writeBoolean(override.maxUsers() != null);
        if (override.maxUsers() != null) output.writeInt(override.maxUsers());
        output.writeBoolean(override.maxStorageMb() != null);
        if (override.maxStorageMb() != null) output.writeLong(override.maxStorageMb());
    }

    private static void ids(DataOutputStream output, Collection<Long> ids) throws IOException {
        List<Long> sorted = ids.stream().sorted().toList();
        output.writeInt(sorted.size());
        for (Long menuId : sorted) output.writeLong(menuId);
    }

    private static boolean equalHash(String expected, String actual) {
        return actual != null && MessageDigest.isEqual(expected.getBytes(StandardCharsets.US_ASCII), actual.getBytes(StandardCharsets.US_ASCII));
    }

    private static SyncViolation failure(String code) { return new SyncViolation(code); }

    public enum Decision { APPLY, CONFLICT, ALREADY_APPLIED }

    public record Snapshot(long tenantId, long packageId, int packageVersion, int tenantVersion,
            Adjustments adjustments, Effective effective) {
        public Snapshot {
            if (tenantId <= 0 || packageId <= 0 || packageVersion < 0 || tenantVersion < 0 || adjustments == null || effective == null) {
                throw failure("INVALID_SNAPSHOT");
            }
            adjustments = new Adjustments(adjustments.addMenuIds().stream().sorted().toList(),
                    adjustments.removeMenuIds().stream().sorted().toList(), adjustments.maxUsers(), adjustments.maxStorageMb());
        }
    }

    public record Item(long targetTenantId, Snapshot before, Snapshot proposed, String errorCode) {
        public Item {
            if (targetTenantId <= 0 || before == null || before.tenantId() != targetTenantId
                    || proposed != null && (proposed.tenantId() != targetTenantId || before.tenantVersion() == Integer.MAX_VALUE
                    || proposed.tenantVersion() != before.tenantVersion() + 1)
                    || (proposed == null) != (errorCode != null)
                    || errorCode != null && !errorCode.matches("[A-Z_]{1,64}")) throw failure("INVALID_ITEM");
        }
    }

    public record Preview(long platformTenantId, long operatorId, long packageId, int packageVersion,
            Instant createdAt, Instant expiresAt, List<Item> items, String hash) {
        public Preview {
            if (createdAt == null || expiresAt == null || !expiresAt.equals(createdAt.plusSeconds(PREVIEW_SECONDS))
                    || items == null || items.isEmpty() || hash == null || !hash.matches("[a-f0-9]{64}")) throw failure("INVALID_PREVIEW");
            items = List.copyOf(items);
        }
    }

    public static final class SyncViolation extends IllegalArgumentException {
        private final String code;
        private SyncViolation(String code) { super(code); this.code = code; }
        public String code() { return code; }
    }
}

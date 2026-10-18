package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Quotas;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Decision;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Item;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Preview;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Snapshot;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.SyncViolation;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

public final class TenantPackageSyncChecks {
    private static final Instant START = Instant.parse("2026-09-28T08:00:00Z");
    private static int checks;

    public static void main(String[] arguments) {
        confirmation();
        decisions();
        digest();
        invalid();
        System.out.println("TENANT_PACKAGE_SYNC_RULE_CHECKS: assertions=" + checks
                + "; failed=0; production_rules=true; clock_controlled=true; database_locks=false; http=false");
    }

    private static Snapshot snapshot(long tenantId, int tenantVersion, int packageVersion, long menuId, Adjustments override) {
        return new Snapshot(tenantId, 100, packageVersion, tenantVersion, override,
                new Effective(Set.of(menuId, 900L, 901L, 906L), Set.of("system:auth:info"), new Quotas(10, 100)));
    }

    private static Item item(long tenantId) {
        return new Item(tenantId, snapshot(tenantId, 10, 1, 30, Adjustments.none()), snapshot(tenantId, 11, 2, 31, Adjustments.none()), null);
    }

    private static Preview preview(List<Item> items) { return TenantPackageSyncRules.preview(100000, 42, 100, 2, START, items); }

    private static void confirmation() {
        Preview preview = preview(List.of(item(500)));
        check(preview.expiresAt().equals(START.plusSeconds(300)), "preview expires exactly five minutes later");
        TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START, null, 2);
        checks++;
        TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(299).plusNanos(999999999), null, 2);
        checks++;
        rejects("PREVIEW_EXPIRED", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(300), null, 2));
        rejects("PREVIEW_EXPIRED", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(301), null, 2));
        rejects("PREVIEW_OWNER_MISMATCH", () -> TenantPackageSyncRules.confirm(preview, 100001, 42, preview.hash(), START, null, 2));
        rejects("PREVIEW_OWNER_MISMATCH", () -> TenantPackageSyncRules.confirm(preview, 100000, 43, preview.hash(), START, null, 2));
        rejects("INVALID_CONFIRMATION", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, "ABC", START, null, 2));
        rejects("PREVIEW_HASH_MISMATCH", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, "0".repeat(64), START, null, 2));
        rejects("PACKAGE_VERSION_CONFLICT", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START, null, 3));
        rejects("INVALID_CONFIRMATION_TIME", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.minusSeconds(1), null, 2));
        rejects("INVALID_CONFIRMATION_TIME", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(400), START.plusSeconds(300), 2));
        rejects("INVALID_CONFIRMATION_TIME", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(100), START.plusSeconds(101), 2));
        rejects("INVALID_CONFIRMATION_TIME", () -> TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(100), START.minusNanos(1), 2));
        TenantPackageSyncRules.confirm(preview, 100000, 42, preview.hash(), START.plusSeconds(86400), START.plusSeconds(299), 2);
        checks++;
    }

    private static void decisions() {
        Item item = item(500);
        check(TenantPackageSyncRules.decide(item, item.before(), "PREVIEWED") == Decision.APPLY, "unchanged preview may apply");
        check(TenantPackageSyncRules.decide(item, item.before(), "FAILED") == Decision.APPLY, "failed item retry allowed only when unchanged");
        check(TenantPackageSyncRules.decide(item, item.proposed(), "APPLIED") == Decision.ALREADY_APPLIED, "applied item never repeats");
        check(TenantPackageSyncRules.decide(item, null, "APPLIED") == Decision.ALREADY_APPLIED, "already applied remains immutable after tenant deletion");
        check(TenantPackageSyncRules.decide(item, item.before(), "CONFLICT") == Decision.CONFLICT, "conflict requires new preview");
        check(TenantPackageSyncRules.decide(item, null, "PREVIEWED") == Decision.CONFLICT, "missing tenant is conflict");
        check(TenantPackageSyncRules.decide(item, snapshot(500, 11, 1, 30, Adjustments.none()), "PREVIEWED") == Decision.CONFLICT, "version mutation blocks");
        check(TenantPackageSyncRules.decide(item, snapshot(500, 10, 1, 31, Adjustments.none()), "PREVIEWED") == Decision.CONFLICT, "same-version effective change blocks");
        check(TenantPackageSyncRules.decide(item, snapshot(500, 10, 1, 30, new Adjustments(List.of(), List.of(), 5, null)), "PREVIEWED") == Decision.CONFLICT, "concurrent explicit override blocks");
        Item invalidOverride = new Item(500, item.before(), null, "REMOVED_ANCESTOR");
        check(TenantPackageSyncRules.decide(invalidOverride, item.before(), "PREVIEWED") == Decision.CONFLICT, "invalid proposed override cannot apply");
        check("COMPLETED".equals(TenantPackageSyncRules.result(List.of("APPLIED", "APPLIED"))), "only every applied item completes");
        for (String status : List.of("PREVIEWED", "CONFLICT", "FAILED")) {
            check("PARTIAL".equals(TenantPackageSyncRules.result(List.of("APPLIED", status))), "mixed result cannot claim completed");
        }
        rejects("INVALID_ITEM_STATUS", () -> TenantPackageSyncRules.result(List.of()));
        rejects("INVALID_ITEM_STATUS", () -> TenantPackageSyncRules.result(List.of("RUNNING")));
        rejects("INVALID_ITEM_STATUS", () -> TenantPackageSyncRules.decide(item, item.before(), "RUNNING"));
    }

    private static void digest() {
        Preview initial = preview(List.of(item(501), item(500)));
        check(initial.hash().equals(preview(List.of(item(500), item(501))).hash()), "input target order does not change hash");
        check(initial.items().get(0).targetTenantId() == 500, "target ordering stable");
        check(!initial.hash().equals(preview(List.of(item(500))).hash()), "target set protected by hash");
        check(!initial.hash().equals(TenantPackageSyncRules.preview(100000, 43, 100, 2, START, initial.items()).hash()), "operator protected by hash");
        check(!initial.hash().equals(TenantPackageSyncRules.preview(100001, 42, 100, 2, START, initial.items()).hash()), "platform tenant protected by hash");
        check(!initial.hash().equals(TenantPackageSyncRules.preview(100000, 42, 100, 2, START.plusSeconds(1), initial.items()).hash()), "expiry protected by hash");
        Item altered = new Item(500, item(500).before(), snapshot(500, 11, 2, 32, Adjustments.none()), null);
        Preview tampered = new Preview(initial.platformTenantId(), initial.operatorId(), initial.packageId(), initial.packageVersion(),
                initial.createdAt(), initial.expiresAt(), List.of(altered, item(501)), initial.hash());
        rejects("PREVIEW_HASH_MISMATCH", () -> TenantPackageSyncRules.confirm(tampered, 100000, 42, initial.hash(), START, null, 2));
        List<Item> mutable = new ArrayList<>(List.of(item(500)));
        Preview immutable = preview(mutable);
        mutable.add(item(501));
        check(immutable.items().size() == 1, "target collection defensively copied");
    }

    private static void invalid() {
        rejects("INVALID_PREVIEW", () -> preview(List.of(item(500), item(500))));
        rejects("INVALID_PREVIEW", () -> preview(List.of()));
        rejects("INVALID_PREVIEW", () -> TenantPackageSyncRules.preview(100000, 42, 100, 3, START, List.of(item(500))));
        Item lostOverride = new Item(500, snapshot(500, 10, 1, 30, new Adjustments(List.of(30L), List.of(), null, null)), item(500).proposed(), null);
        rejects("INVALID_PREVIEW", () -> preview(List.of(lostOverride)));
        rejects("INVALID_ITEM", () -> new Item(500, item(500).before(), item(500).before(), null));
        rejects("INVALID_ITEM", () -> new Item(500, item(500).before(), null, null));
        rejects("INVALID_ITEM", () -> new Item(500, item(500).before(), item(500).proposed(), "ERROR"));
        rejects("INVALID_ITEM", () -> new Item(500, item(500).before(), null, "unsafe error message"));
        rejects("INVALID_ITEM", () -> new Item(500, snapshot(500, Integer.MAX_VALUE, 1, 30, Adjustments.none()), item(500).proposed(), null));
        rejects("INVALID_SNAPSHOT", () -> snapshot(500, -1, 1, 30, Adjustments.none()));
    }

    private static void rejects(String code, Runnable action) {
        try { action.run(); }
        catch (SyncViolation exception) {
            check(code.equals(exception.code()), "expected " + code + ", got " + exception.code());
            return;
        }
        throw new AssertionError("Expected " + code);
    }

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }
}

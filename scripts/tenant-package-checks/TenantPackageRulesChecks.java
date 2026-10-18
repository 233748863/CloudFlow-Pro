package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Difference;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Menu;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Quotas;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.RuleViolation;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class TenantPackageRulesChecks {
    private static int checks;
    private static final Quotas QUOTAS = new Quotas(10, 100);

    public static void main(String[] arguments) throws Exception {
        selections();
        overrides();
        quotas();
        permissions();
        invalidCatalogs();
        formalCatalog(Path.of(arguments[0]), Path.of(arguments[1]));
        System.out.println("TENANT_PACKAGE_RULE_CHECKS: assertions=" + checks
                + "; failed=0; production_rules=true; formal_sql_catalog=true; mysql=false; redis=false; http=false");
    }

    private static List<Menu> catalog() {
        List<Menu> menus = new ArrayList<>();
        menus.add(new Menu(6, 0, "M", Set.of(), true));
        menus.add(new Menu(20, 0, "M", Set.of(), true));
        menus.add(new Menu(30, 20, "C", Set.of("crm:customer:list"), true));
        menus.add(new Menu(31, 30, "F", Set.of("crm:customer:add"), true));
        menus.add(new Menu(32, 30, "C", Set.of("crm:customer:detail"), true));
        menus.add(new Menu(33, 32, "F", Set.of("crm:customer:edit"), true));
        menus.add(new Menu(34, 20, "F", Set.of("crm:customer:orphan"), true));
        menus.add(new Menu(40, 0, "C", Set.of("oa:asset:list"), false));
        menus.add(new Menu(41, 40, "F", Set.of("oa:asset:add"), true));
        TenantPackageRules.ACCOUNT_OPERATIONS.forEach((menuId, permission) -> menus.add(new Menu(menuId, 6, "F", Set.of(permission), true)));
        TenantPackageRules.INDEPENDENT_OPERATIONS.forEach((menuId, permission) -> menus.add(new Menu(menuId, 6, "F", Set.of(permission), true)));
        return menus;
    }

    private static void selections() {
        TenantPackageRules rules = new TenantPackageRules(catalog());
        Effective empty = compose(rules, List.of(), Adjustments.none());
        check(empty.menuIds().equals(Set.of(900L, 901L, 906L)), "only approved account operations survive empty package");
        check(empty.permissions().equals(Set.copyOf(TenantPackageRules.ACCOUNT_OPERATIONS.values())), "exact fixed permissions");
        check(!empty.menuIds().contains(6L), "account operations do not expose system directory");
        for (Map.Entry<Long, String> entry : TenantPackageRules.INDEPENDENT_OPERATIONS.entrySet()) {
            Effective enabled = compose(rules, List.of(entry.getKey()), Adjustments.none());
            check(enabled.menuIds().contains(entry.getKey()) && enabled.permissions().contains(entry.getValue()), "independent function explicitly selected");
            check(enabled.menuIds().size() == 5, "independent operation adds only its directory and fixed account operations");
            check(!empty.permissions().contains(entry.getValue()), "independent operation never fixed by default");
            check(!rules.intersectPermissions(Set.of("*:*:*"), empty).contains(entry.getValue()), "ADMIN cannot bypass unselected independent operation");
            check(rules.intersectPermissions(Set.of("hr:employees:list"), enabled).isEmpty(), "selected independent operation cannot grant missing role permission");
        }
        Effective page = compose(rules, List.of(30L), Adjustments.none());
        check(page.menuIds().contains(20L), "parent directory automatically supplied");
        check(!page.permissions().contains("crm:customer:add"), "page selection does not select buttons");
        rejects("BUTTON_WITHOUT_PAGE", () -> compose(rules, List.of(31L), Adjustments.none()));
        rejects("BUTTON_WITHOUT_PAGE", () -> compose(rules, List.of(30L, 33L), Adjustments.none()));
        rejects("BUTTON_WITHOUT_PAGE", () -> compose(rules, List.of(34L), Adjustments.none()));
        check(compose(rules, List.of(32L, 33L), Adjustments.none()).menuIds().containsAll(List.of(20L, 30L, 32L, 33L)), "nearest explicit page supplies ancestors");
        rejects("MENU_DISABLED", () -> compose(rules, List.of(40L), Adjustments.none()));
        rejects("MENU_DISABLED", () -> compose(rules, List.of(41L), Adjustments.none()));
        rejects("UNKNOWN_MENU", () -> compose(rules, List.of(99999L), Adjustments.none()));
        rejects("MODULE_DISABLED", () -> rules.compose(List.of(30L), List.of(), QUOTAS, Adjustments.none()));
        rejects("MODULE_DISABLED", () -> rules.compose(List.of(876L), List.of(), QUOTAS, Adjustments.none()));
        rejects("INVALID_MODULE", () -> rules.compose(List.of(), List.of("crm"), QUOTAS, Adjustments.none()));
        rejects("INVALID_MODULE", () -> rules.compose(List.of(), List.of("CRM", "CRM"), QUOTAS, Adjustments.none()));
        rejects("INVALID_MODULE", () -> rules.compose(List.of(), Arrays.asList((String) null), QUOTAS, Adjustments.none()));
        rejects("INVALID_MENU_IDS", () -> compose(rules, List.of(30L, 30L), Adjustments.none()));
        rejects("INVALID_MENU_IDS", () -> compose(rules, Arrays.asList((Long) null), Adjustments.none()));
        rejects("INVALID_MENU_IDS", () -> compose(rules, List.of(0L), Adjustments.none()));
        rejects("INVALID_MENU_IDS", () -> compose(rules, null, Adjustments.none()));
        rejects("INVALID_PACKAGE", () -> rules.compose(List.of(), null, QUOTAS, Adjustments.none()));
        rejects("INVALID_PACKAGE", () -> rules.compose(List.of(), Set.of(), null, Adjustments.none()));
        rejects("INVALID_PACKAGE", () -> rules.compose(List.of(), Set.of(), QUOTAS, null));
    }

    private static void overrides() {
        TenantPackageRules rules = new TenantPackageRules(catalog());
        rejects("INVALID_OVERRIDE", () -> new Adjustments(null, List.of(), null, null));
        rejects("INVALID_OVERRIDE", () -> new Adjustments(List.of(), null, null, null));
        rejects("INVALID_OVERRIDE", () -> new Adjustments(Arrays.asList((Long) null), List.of(), null, null));
        rejects("INVALID_OVERRIDE", () -> new Adjustments(List.of(), Arrays.asList((Long) null), null, null));
        rejects("CONTRADICTORY_OVERRIDE", () -> compose(rules, List.of(30L), new Adjustments(List.of(30L), List.of(30L), null, null)));
        rejects("REMOVED_ANCESTOR", () -> compose(rules, List.of(30L, 31L), new Adjustments(List.of(), List.of(20L), null, null)));
        rejects("REMOVED_ANCESTOR", () -> compose(rules, List.of(30L, 31L), new Adjustments(List.of(), List.of(30L), null, null)));
        for (Long account : TenantPackageRules.ACCOUNT_OPERATIONS.keySet()) {
            rejects("ACCOUNT_OPERATION_REQUIRED", () -> compose(rules, List.of(), new Adjustments(List.of(), List.of(account), null, null)));
        }
        Effective removed = compose(rules, List.of(30L, 31L), new Adjustments(List.of(), List.of(31L), 5, 20L));
        check(!removed.permissions().contains("crm:customer:add"), "remove button revokes write");
        check(removed.quotas().equals(new Quotas(5, 20)), "explicit quota override wins");
        Effective custom = rules.compose(List.of(), Set.of(), QUOTAS, new Adjustments(List.of(30L, 31L), List.of(), null, null));
        check(custom.permissions().contains("crm:customer:add") && !custom.menuIds().contains(876L), "specific cross-module override never grants whole module");
        Difference delta = rules.difference(custom, removed);
        check(delta.removedMenuIds().equals(Set.of(31L)) && delta.removedPermissions().equals(Set.of("crm:customer:add")), "precise preview removal");
        check(delta.addedMenuIds().isEmpty() && delta.addedPermissions().isEmpty(), "no invented additions");
        check(delta.beforeQuotas().equals(QUOTAS) && delta.proposedQuotas().equals(removed.quotas()), "quota preview retains both snapshots");
        rejects("INVALID_SNAPSHOT", () -> rules.difference(null, removed));
        List<Long> additions = new ArrayList<>(List.of(30L));
        Adjustments copied = new Adjustments(additions, List.of(), null, null);
        additions.add(31L);
        check(copied.addMenuIds().equals(List.of(30L)), "caller mutation cannot extend override");
        immutable(() -> copied.addMenuIds().add(31L));
        immutable(() -> removed.menuIds().add(31L));
        immutable(() -> removed.permissions().add("crm:customer:add"));
        immutable(() -> delta.removedMenuIds().clear());
    }

    private static void quotas() {
        long bytes = 100L * TenantPackageRules.BYTES_PER_MB;
        check(QUOTAS.usage(9, bytes - 1, 1).canAddUser(), "last user slot available");
        check(QUOTAS.usage(9, bytes - 1, 1).canStoreFile(), "last byte available");
        check(!QUOTAS.usage(10, bytes, 1).canAddUser(), "exact user quota blocks creation");
        check(!QUOTAS.usage(10, bytes, 1).usersExceeded(), "at user quota is not over quota");
        check(!QUOTAS.usage(10, bytes, 1).canStoreFile(), "one byte over quota blocks storage");
        check(!QUOTAS.usage(10, bytes, 1).storageExceeded(), "at storage quota is not over quota");
        check(QUOTAS.usage(11, bytes + 1, 0).usersExceeded() && QUOTAS.usage(11, bytes + 1, 0).storageExceeded(), "overridden quotas report excess");
        check(!QUOTAS.usage(11, bytes + 1, 0).canStoreFile(), "excess forbids even empty new upload");
        check(!QUOTAS.usage(Long.MAX_VALUE, Long.MAX_VALUE, Long.MAX_VALUE).canStoreFile(), "storage addition cannot overflow");
        rejects("INVALID_USAGE", () -> QUOTAS.usage(-1, 0, 0));
        rejects("INVALID_USAGE", () -> QUOTAS.usage(0, -1, 0));
        rejects("INVALID_USAGE", () -> QUOTAS.usage(0, 0, -1));
        rejects("INVALID_QUOTA", () -> new Quotas(0, 100));
        rejects("INVALID_QUOTA", () -> new Quotas(10, 0));
        rejects("INVALID_QUOTA", () -> new Quotas(10, Long.MAX_VALUE));
        long maximumMb = Long.MAX_VALUE / TenantPackageRules.BYTES_PER_MB;
        check(new Quotas(Integer.MAX_VALUE, maximumMb).usage(0, maximumMb * TenantPackageRules.BYTES_PER_MB, 0).canStoreFile(), "maximum supported MB is safe");
        rejects("INVALID_QUOTA", () -> new Quotas(10, maximumMb + 1));
    }

    private static void permissions() {
        TenantPackageRules rules = new TenantPackageRules(catalog());
        Effective page = compose(rules, List.of(30L, 31L), Adjustments.none());
        check(rules.intersectPermissions(Set.of("*:*:*"), page).equals(page.permissions()), "ADMIN narrowed to concrete package permissions");
        check(rules.intersectPermissions(Set.of("crm:*"), page).equals(Set.of("crm:customer:list", "crm:customer:add")), "module wildcard intersects");
        check(rules.intersectPermissions(Set.of("crm:customer:list"), page).equals(Set.of("crm:customer:list")), "role remains narrower than package");
        check(rules.intersectPermissions(List.of("crm:customer:.*", "crm:customer:(add)", ""), page).isEmpty(), "role grants cannot inject regex");
        check(rules.intersectPermissions(null, page).isEmpty(), "no roles means no permissions");
        check(rules.intersectPermissions(Set.of("*:*:*"), null).equals(Set.of("*:*:*")), "unassigned tenant keeps legacy authorization");
        rejects("ROLE_EXCEEDS_PACKAGE", () -> rules.requireRoleSubset(List.of(876L), page));
        rules.requireRoleSubset(List.of(30L, 31L), page);
        checks++;
        rules.requireRoleSubset(List.of(99999L), null);
        checks++;
    }

    private static void invalidCatalogs() {
        rejects("INVALID_CATALOG", () -> new TenantPackageRules(List.of()));
        rejects("INVALID_CATALOG", () -> new TenantPackageRules(null));
        List<Menu> duplicate = catalog();
        duplicate.add(duplicate.get(0));
        rejects("INVALID_CATALOG", () -> new TenantPackageRules(duplicate));
        List<Menu> missingParent = catalog();
        missingParent.add(new Menu(50, 99999, "C", Set.of(), true));
        rejects("MISSING_PARENT", () -> new TenantPackageRules(missingParent));
        List<Menu> cycle = catalog();
        cycle.add(new Menu(50, 51, "M", Set.of(), true));
        cycle.add(new Menu(51, 50, "M", Set.of(), true));
        rejects("CYCLIC_MENU", () -> new TenantPackageRules(cycle));
        List<Menu> buttonParent = catalog();
        buttonParent.add(new Menu(50, 31, "F", Set.of("crm:customer:child"), true));
        rejects("BUTTON_AS_PARENT", () -> new TenantPackageRules(buttonParent));
        List<Menu> badIndependent = catalog();
        badIndependent.removeIf(menu -> menu.id() == 876);
        badIndependent.add(new Menu(876, 6, "F", Set.of("crm:approval:refund"), true));
        rejects("INVALID_INDEPENDENT_OPERATION", () -> new TenantPackageRules(badIndependent));
        List<Menu> disabledAccount = catalog();
        disabledAccount.removeIf(menu -> menu.id() == 900);
        disabledAccount.add(new Menu(900, 6, "F", Set.of("system:auth:info"), false));
        rejects("ACCOUNT_OPERATION_DISABLED", () -> new TenantPackageRules(disabledAccount));
        rejects("INVALID_PERMISSION", () -> new Menu(50, 0, "F", Set.of("sys:customer:list"), true));
        rejects("INVALID_PERMISSION", () -> new Menu(50, 0, "F", Set.of("*:*:*"), true));
        rejects("INVALID_PERMISSION", () -> new Menu(50, 0, "F", null, true));
    }

    private static void formalCatalog(Path source, Path employeeSource) throws Exception {
        List<Menu> menus = new ArrayList<>();
        for (String row : Files.readAllLines(source)) {
            String[] values = row.split("\t", -1);
            Set<String> grants = values[4].isBlank() ? Set.of() : new HashSet<>(Arrays.asList(values[4].split(",")));
            menus.add(new Menu(Long.parseLong(values[0]), Long.parseLong(values[1]), values[2], grants, "0".equals(values[3])));
        }
        TenantPackageRules rules = new TenantPackageRules(menus);
        Map<Long, Menu> indexed = new HashMap<>();
        menus.forEach(menu -> indexed.put(menu.id(), menu));
        Set<Long> noPage = new HashSet<>();
        for (Menu menu : menus) {
            if (!"F".equals(menu.type())) continue;
            long ancestor = menu.parentId();
            boolean hasPage = false;
            while (ancestor != 0) {
                Menu parent = indexed.get(ancestor);
                hasPage |= "C".equals(parent.type());
                ancestor = parent.parentId();
            }
            if (!hasPage) noPage.add(menu.id());
        }
        Set<Long> approvedNoPage = new HashSet<>(TenantPackageRules.ACCOUNT_OPERATIONS.keySet());
        approvedNoPage.addAll(TenantPackageRules.INDEPENDENT_OPERATIONS.keySet());
        check(noPage.equals(approvedNoPage), "all standalone formal operations exactly match approved 3+19 registry");
        Set<String> employeePermissions = new HashSet<>();
        for (String row : Files.readAllLines(employeeSource)) employeePermissions.addAll(indexed.get(Long.parseLong(row)).permissions());
        for (Menu menu : menus) {
            if (!menu.enabled()) continue;
            Set<Long> selection = new HashSet<>();
            selection.add(menu.id());
            long ancestor = menu.parentId();
            while (ancestor != 0) {
                Menu parent = indexed.get(ancestor);
                if ("C".equals(parent.type())) selection.add(parent.id());
                ancestor = parent.parentId();
            }
            Effective effective = compose(rules, selection, Adjustments.none());
            check(effective.menuIds().contains(menu.id()), "every enabled formal menu composes with legal page selection");
            check(rules.intersectPermissions(Set.of("*:*:*"), effective).equals(effective.permissions()), "formal ADMIN remains bounded");
            Set<String> employeeActual = rules.intersectPermissions(employeePermissions, effective);
            Set<String> employeeExpected = new HashSet<>(employeePermissions);
            employeeExpected.retainAll(effective.permissions());
            check(employeeActual.equals(employeeExpected), "EMPLOYEE intersection never creates ungranted permission");
        }
        System.out.println("TENANT_PACKAGE_FORMAL_BOUNDARIES: menus=" + menus.size() + "; account_fixed=3; standalone_optional=19; employee_added_permissions=0");
    }

    private static Effective compose(TenantPackageRules rules, Collection<Long> selected, Adjustments adjustments) {
        return rules.compose(selected, TenantPackageRules.MODULES, QUOTAS, adjustments);
    }

    private static void rejects(String code, Runnable action) {
        try {
            action.run();
        } catch (RuleViolation exception) {
            check(code.equals(exception.code()), "expected " + code + ", got " + exception.code());
            return;
        }
        throw new AssertionError("Expected " + code);
    }

    private static void immutable(Runnable action) {
        try {
            action.run();
        } catch (UnsupportedOperationException expected) {
            checks++;
            return;
        }
        throw new AssertionError("Expected immutable result");
    }

    private static void check(boolean value, String message) {
        if (!value) throw new AssertionError(message);
        checks++;
    }
}

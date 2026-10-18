package com.cloudflow.auth.tenantpackage;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import com.cloudflow.common.core.permission.PermissionIntersection;
import com.cloudflow.common.core.permission.TenantFeatureRegistry;

public final class TenantPackageRules {
    public static final long BYTES_PER_MB = 1024L * 1024L;
    public static final Set<String> MODULES = Set.of("WORKFLOW", "OA", "CRM", "HR");
    public static final Map<Long, String> ACCOUNT_OPERATIONS = TenantFeatureRegistry.ACCOUNT_OPERATIONS;
    public static final Map<Long, String> INDEPENDENT_OPERATIONS = TenantFeatureRegistry.INDEPENDENT_OPERATIONS;
    private static final Map<String, String> PERMISSION_MODULES = Map.of(
            "workflow", "WORKFLOW", "oa", "OA", "crm", "CRM", "hr", "HR");
    private static final Pattern PERMISSION = Pattern.compile("(?:system|workflow|oa|crm|hr):[a-zA-Z0-9-]+(?::[a-zA-Z0-9-]+)+");
    private final Map<Long, Menu> catalog;
    private final Map<Long, List<Long>> ancestors;
    private final Set<Long> independentOperations;

    public TenantPackageRules(Collection<Menu> menus) {
        this(menus, INDEPENDENT_OPERATIONS);
    }

    public TenantPackageRules(Collection<Menu> menus, Map<Long, String> registeredIndependentOperations) {
        if (menus == null || menus.isEmpty() || registeredIndependentOperations == null) throw failure("INVALID_CATALOG", null);
        Map<Long, Menu> indexed = new LinkedHashMap<>();
        for (Menu menu : menus) {
            if (menu == null || menu.id() <= 0 || menu.parentId() < 0 || menu.type() == null || !Set.of("M", "C", "F").contains(menu.type())
                    || indexed.putIfAbsent(menu.id(), menu) != null) throw failure("INVALID_CATALOG", menu == null ? null : menu.id());
            if ("F".equals(menu.type()) && menu.permissions().isEmpty()) throw failure("INVALID_PERMISSION", menu.id());
            for (String permission : menu.permissions()) {
                if (!PERMISSION.matcher(permission).matches()) throw failure("INVALID_PERMISSION", menu.id());
            }
        }
        Map<Long, List<Long>> paths = new HashMap<>();
        for (Menu menu : indexed.values()) {
            List<Long> lineage = new ArrayList<>();
            Set<Long> visited = new HashSet<>();
            visited.add(menu.id());
            long parentId = menu.parentId();
            while (parentId != 0) {
                Menu parent = indexed.get(parentId);
                if (parent == null) throw failure("MISSING_PARENT", menu.id());
                if (!visited.add(parentId)) throw failure("CYCLIC_MENU", menu.id());
                if ("F".equals(parent.type())) throw failure("BUTTON_AS_PARENT", parentId);
                lineage.add(parentId);
                parentId = parent.parentId();
            }
            paths.put(menu.id(), List.copyOf(lineage));
        }
        Map<Long, String> independent = new HashMap<>(registeredIndependentOperations);
        for (Map.Entry<Long, String> account : ACCOUNT_OPERATIONS.entrySet()) {
            String registered = independent.putIfAbsent(account.getKey(), account.getValue());
            if (registered != null && !registered.equals(account.getValue())) throw failure("INVALID_ACCOUNT_OPERATION", account.getKey());
        }
        for (Map.Entry<Long, String> entry : independent.entrySet()) {
            Menu menu = indexed.get(entry.getKey());
            if (menu == null || !"F".equals(menu.type()) || !menu.permissions().equals(Set.of(entry.getValue()))) {
                throw failure("INVALID_INDEPENDENT_OPERATION", entry.getKey());
            }
            if (ACCOUNT_OPERATIONS.containsKey(entry.getKey()) && !menu.enabled()) throw failure("ACCOUNT_OPERATION_DISABLED", entry.getKey());
        }
        catalog = Map.copyOf(indexed);
        ancestors = Map.copyOf(paths);
        independentOperations = Set.copyOf(independent.keySet());
    }

    public Effective compose(Collection<Long> packageMenuIds, Collection<String> enabledModules,
            Quotas packageQuotas, Adjustments adjustments) {
        if (packageQuotas == null || adjustments == null || enabledModules == null) throw failure("INVALID_PACKAGE", null);
        Set<String> modules = uniqueModules(enabledModules);
        Set<Long> base = uniqueIds(packageMenuIds);
        Set<Long> additions = uniqueIds(adjustments.addMenuIds());
        Set<Long> removals = uniqueIds(adjustments.removeMenuIds());
        for (Long menuId : additions) {
            if (removals.contains(menuId)) throw failure("CONTRADICTORY_OVERRIDE", menuId);
        }
        for (Long menuId : removals) {
            requireMenu(menuId, false);
            if (ACCOUNT_OPERATIONS.containsKey(menuId)) throw failure("ACCOUNT_OPERATION_REQUIRED", menuId);
        }
        validateSelection(base, modules, Set.of());
        Set<Long> selected = new TreeSet<>(base);
        selected.addAll(additions);
        selected.removeAll(removals);
        selected.addAll(ACCOUNT_OPERATIONS.keySet());
        validateSelection(selected, null, removals);
        Set<Long> effectiveIds = new TreeSet<>(selected);
        for (Long menuId : selected) {
            if (ACCOUNT_OPERATIONS.containsKey(menuId)) continue;
            effectiveIds.addAll(ancestors.get(menuId));
        }
        Set<String> permissions = new TreeSet<>();
        for (Long menuId : effectiveIds) permissions.addAll(requireMenu(menuId, true).permissions());
        Quotas quotas = new Quotas(adjustments.maxUsers() == null ? packageQuotas.maxUsers() : adjustments.maxUsers(),
                adjustments.maxStorageMb() == null ? packageQuotas.maxStorageMb() : adjustments.maxStorageMb());
        return new Effective(effectiveIds, permissions, quotas);
    }

    public Set<String> intersectPermissions(Collection<String> rolePermissions, Effective effective) {
        return PermissionIntersection.retain(rolePermissions, effective == null ? null : effective.permissions());
    }

    public void requireRoleSubset(Collection<Long> roleMenuIds, Effective effective) {
        if (effective == null) return;
        Set<Long> requested = uniqueIds(roleMenuIds);
        for (Long menuId : requested) {
            requireMenu(menuId, true);
            if (!effective.menuIds().contains(menuId)) throw failure("ROLE_EXCEEDS_PACKAGE", menuId);
        }
    }

    public Difference difference(Effective before, Effective proposed) {
        if (before == null || proposed == null) throw failure("INVALID_SNAPSHOT", null);
        Set<Long> added = new TreeSet<>(proposed.menuIds());
        added.removeAll(before.menuIds());
        Set<Long> removed = new TreeSet<>(before.menuIds());
        removed.removeAll(proposed.menuIds());
        Set<String> granted = new TreeSet<>(proposed.permissions());
        granted.removeAll(before.permissions());
        Set<String> revoked = new TreeSet<>(before.permissions());
        revoked.removeAll(proposed.permissions());
        return new Difference(added, removed, granted, revoked, before.quotas(), proposed.quotas());
    }

    private void validateSelection(Set<Long> selected, Set<String> modules, Set<Long> removed) {
        for (Long menuId : selected) {
            Menu menu = requireMenu(menuId, true);
            if (ACCOUNT_OPERATIONS.containsKey(menuId)) continue;
            List<Long> lineage = ancestors.get(menuId);
            boolean selectedPage = false;
            boolean foundPage = false;
            for (Long ancestorId : lineage) {
                Menu ancestor = requireMenu(ancestorId, true);
                if (removed.contains(ancestorId)) throw failure("REMOVED_ANCESTOR", ancestorId);
                if ("C".equals(ancestor.type()) && !foundPage) {
                    selectedPage = selected.contains(ancestorId);
                    foundPage = true;
                }
                validateModules(ancestor, modules);
            }
            if ("F".equals(menu.type()) && !independentOperations.contains(menuId) && !selectedPage) {
                throw failure("BUTTON_WITHOUT_PAGE", menuId);
            }
            validateModules(menu, modules);
        }
    }

    private void validateModules(Menu menu, Set<String> modules) {
        if (modules == null) return;
        for (String permission : menu.permissions()) {
            String module = PERMISSION_MODULES.get(permission.substring(0, permission.indexOf(':')));
            if (module != null && !modules.contains(module)) throw failure("MODULE_DISABLED", menu.id());
        }
    }

    private Menu requireMenu(Long menuId, boolean mustBeEnabled) {
        Menu menu = catalog.get(menuId);
        if (menu == null) throw failure("UNKNOWN_MENU", menuId);
        if (mustBeEnabled && !menu.enabled()) throw failure("MENU_DISABLED", menuId);
        return menu;
    }

    private Set<Long> uniqueIds(Collection<Long> menuIds) {
        if (menuIds == null) throw failure("INVALID_MENU_IDS", null);
        Set<Long> unique = new TreeSet<>();
        for (Long menuId : menuIds) {
            if (menuId == null || menuId <= 0 || !unique.add(menuId)) throw failure("INVALID_MENU_IDS", menuId);
        }
        return unique;
    }

    private Set<String> uniqueModules(Collection<String> values) {
        Set<String> modules = new HashSet<>();
        for (String value : values) {
            if (value == null || !MODULES.contains(value) || !modules.add(value)) throw failure("INVALID_MODULE", null);
        }
        return modules;
    }

    private static <Element extends Comparable<? super Element>> Set<Element> sorted(Collection<Element> values) {
        return Collections.unmodifiableSet(new TreeSet<>(values));
    }

    private static RuleViolation failure(String code, Long menuId) {
        return new RuleViolation(code, menuId);
    }

    public record Menu(long id, long parentId, String type, Set<String> permissions, boolean enabled) {
        public Menu {
            if (permissions == null || permissions.stream().anyMatch(permission -> permission == null || !PERMISSION.matcher(permission).matches())) {
                throw failure("INVALID_PERMISSION", id);
            }
            permissions = sorted(permissions);
        }
    }

    public record Quotas(int maxUsers, long maxStorageMb) {
        public Quotas {
            if (maxUsers <= 0 || maxStorageMb <= 0 || maxStorageMb > Long.MAX_VALUE / BYTES_PER_MB) {
                throw failure("INVALID_QUOTA", null);
            }
        }

        public Usage usage(long users, long bytes, long incomingBytes) {
            if (users < 0 || bytes < 0 || incomingBytes < 0) throw failure("INVALID_USAGE", null);
            long capacity = maxStorageMb * BYTES_PER_MB;
            return new Usage(users > maxUsers, bytes > capacity, users < maxUsers,
                    bytes <= capacity && incomingBytes <= capacity - bytes);
        }
    }

    public record Adjustments(List<Long> addMenuIds, List<Long> removeMenuIds, Integer maxUsers, Long maxStorageMb) {
        public Adjustments {
            if (addMenuIds == null || removeMenuIds == null || addMenuIds.stream().anyMatch(Objects::isNull)
                    || removeMenuIds.stream().anyMatch(Objects::isNull)) {
                throw failure("INVALID_OVERRIDE", null);
            }
            addMenuIds = List.copyOf(addMenuIds);
            removeMenuIds = List.copyOf(removeMenuIds);
        }
        public static Adjustments none() { return new Adjustments(List.of(), List.of(), null, null); }
    }

    public record Effective(Set<Long> menuIds, Set<String> permissions, Quotas quotas) {
        public Effective {
            if (menuIds == null || permissions == null || quotas == null
                    || menuIds.stream().anyMatch(menuId -> menuId == null || menuId <= 0)
                    || permissions.stream().anyMatch(permission -> permission == null || !PERMISSION.matcher(permission).matches())) {
                throw failure("INVALID_SNAPSHOT", null);
            }
            menuIds = sorted(menuIds);
            permissions = sorted(permissions);
        }
    }

    public record Difference(Set<Long> addedMenuIds, Set<Long> removedMenuIds, Set<String> addedPermissions,
            Set<String> removedPermissions, Quotas beforeQuotas, Quotas proposedQuotas) {
        public Difference {
            addedMenuIds = sorted(addedMenuIds);
            removedMenuIds = sorted(removedMenuIds);
            addedPermissions = sorted(addedPermissions);
            removedPermissions = sorted(removedPermissions);
        }
    }

    public record Usage(boolean usersExceeded, boolean storageExceeded, boolean canAddUser, boolean canStoreFile) { }

    public static final class RuleViolation extends IllegalArgumentException {
        private final String code;
        private final Long menuId;

        private RuleViolation(String code, Long menuId) {
            super(code);
            this.code = code;
            this.menuId = menuId;
        }

        public String code() { return code; }
        public Long menuId() { return menuId; }
    }
}

package com.cloudflow.auth.tenantpackage;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Set;

public final class TenantPackageViews {
    private TenantPackageViews() { }

    public record Template(long packageId, String packageCode, String packageName, Set<Long> menuIds,
            Set<String> enabledModules, int maxUsers, long maxStorageMb, BigDecimal price, String billingCycle,
            int sortNo, String status, String remark, int version, LocalDateTime createTime, LocalDateTime updateTime) {
        public Template { menuIds = Set.copyOf(menuIds); enabledModules = Set.copyOf(enabledModules); }
    }

    public record Page(List<Template> rows, long total, int pageNum, int pageSize) {
        public Page { rows = List.copyOf(rows); }
    }

    public record Feature(long menuId, long parentId, String menuName, String menuType, String permissions,
            boolean enabled, boolean fixedAccountOperation, boolean independentOperation) { }

    public record Catalog(List<Feature> features, Set<String> modules) {
        public Catalog { features = List.copyOf(features); modules = Set.copyOf(modules); }
    }
}

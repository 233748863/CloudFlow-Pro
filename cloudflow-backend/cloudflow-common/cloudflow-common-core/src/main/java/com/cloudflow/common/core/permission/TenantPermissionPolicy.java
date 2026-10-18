package com.cloudflow.common.core.permission;

import java.util.Collection;
import java.util.Set;

public interface TenantPermissionPolicy {
    Entitlement current(Long tenantId);

    default Set<String> intersect(Long tenantId, Collection<String> rolePermissions) {
        Entitlement entitlement = current(tenantId);
        return PermissionIntersection.retain(rolePermissions, entitlement.restricted() ? entitlement.permissions() : null);
    }

    record Entitlement(Long packageId, Integer packageVersion, Integer tenantVersion, Set<Long> menuIds, Set<String> permissions) {
        public Entitlement {
            if (packageId != null && (packageId <= 0 || packageVersion == null || packageVersion < 0 || tenantVersion == null || tenantVersion < 0)) {
                throw new IllegalArgumentException("套餐权限版本不合法");
            }
            menuIds = Set.copyOf(menuIds);
            permissions = Set.copyOf(permissions);
        }
        public boolean restricted() { return packageId != null; }
    }
}

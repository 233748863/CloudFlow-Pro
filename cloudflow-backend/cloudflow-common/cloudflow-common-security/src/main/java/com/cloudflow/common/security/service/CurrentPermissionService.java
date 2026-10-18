package com.cloudflow.common.security.service;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.permission.PermissionIntersection;
import com.cloudflow.common.core.permission.PlatformPermissionPolicy;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.core.permission.TenantPermissionPolicy.Entitlement;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class CurrentPermissionService {
    private static final String CACHE_KEY = CurrentPermissionService.class.getName() + ".entitlement.";
    private final TenantPermissionPolicy policy;
    private final ObjectProvider<PlatformPermissionPolicy> platformPolicies;

    public CurrentPermissionService(TenantPermissionPolicy policy) {
        this(policy, null);
    }

    @Autowired
    public CurrentPermissionService(TenantPermissionPolicy policy, ObjectProvider<PlatformPermissionPolicy> platformPolicies) {
        this.policy = policy;
        this.platformPolicies = platformPolicies;
    }

    public Entitlement current(Long tenantId) {
        if (tenantId == null || tenantId <= 0) throw unavailable();
        if (!(RequestContextHolder.getRequestAttributes() instanceof ServletRequestAttributes attributes)) {
            return policy.current(tenantId);
        }
        synchronized (attributes.getRequest()) {
            String key = CACHE_KEY + tenantId;
            Object cached = attributes.getRequest().getAttribute(key);
            if (cached instanceof Entitlement entitlement) return entitlement;
            Entitlement entitlement = policy.current(tenantId);
            attributes.getRequest().setAttribute(key, entitlement);
            return entitlement;
        }
    }

    public Set<String> permissions(Long tenantId, Collection<String> rolePermissions) {
        Entitlement entitlement = current(tenantId);
        return PermissionIntersection.retain(rolePermissions, entitlement.restricted() ? entitlement.permissions() : null);
    }

    public Set<String> internalPermissions(Long userId, Long tenantId, Collection<String> rolePermissions) {
        Entitlement entitlement = current(tenantId);
        if (!entitlement.restricted()) return PermissionIntersection.retain(rolePermissions, null);
        Set<String> ceiling = new TreeSet<>(entitlement.permissions());
        ceiling.addAll(controlPermissions(userId, tenantId));
        return PermissionIntersection.retain(rolePermissions, ceiling);
    }

    public Set<String> controlPermissions(Long userId, Long tenantId) {
        if (platformPolicies == null || userId == null || tenantId == null) return Set.of();
        PlatformPermissionPolicy platform = platformPolicies.getIfAvailable();
        return platform == null ? Set.of() : platform.controlPermissions(userId, tenantId);
    }

    public Set<String> permissions(Map<String, Object> loginUser) {
        if (loginUser == null) return Set.of();
        List<String> roles = new ArrayList<>();
        if (loginUser.get("permissions") instanceof Collection<?> values) {
            for (Object value : values) if (value instanceof String permission && !permission.isBlank()) roles.add(permission.trim());
        }
        Long userId = null;
        Object identifier = loginUser.get("userId");
        if (identifier != null && String.valueOf(identifier).matches("[1-9][0-9]{0,18}")) {
            try { userId = Long.valueOf(String.valueOf(identifier)); }
            catch (NumberFormatException invalid) { throw unavailable(); }
        }
        return internalPermissions(userId, tenantId(loginUser), roles);
    }

    private Long tenantId(Map<String, Object> loginUser) {
        String value = String.valueOf(loginUser.get("tenantId"));
        if (!value.matches("[1-9][0-9]{0,18}")) throw unavailable();
        try { return Long.valueOf(value); }
        catch (NumberFormatException exception) { throw unavailable(); }
    }

    private static ServiceException unavailable() { return new ServiceException("租户套餐权限暂不可用，请稍后重试", 503); }
}

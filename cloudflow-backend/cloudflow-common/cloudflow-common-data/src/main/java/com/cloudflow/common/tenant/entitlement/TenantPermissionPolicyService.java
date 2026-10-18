package com.cloudflow.common.tenant.entitlement;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.permission.TenantPermissionPolicy;
import com.cloudflow.common.core.permission.TenantFeatureRegistry;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Pattern;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public final class TenantPermissionPolicyService implements TenantPermissionPolicy {
    public static final Map<Long, String> ACCOUNT_OPERATIONS = TenantFeatureRegistry.ACCOUNT_OPERATIONS;
    private static final Pattern IDS = Pattern.compile("\\[\\s*(?:[1-9][0-9]*(?:\\s*,\\s*[1-9][0-9]*)*)?\\s*]");
    private static final Pattern PERMISSION = Pattern.compile("(?:system|workflow|oa|crm|hr):[a-zA-Z0-9-]+(?::[a-zA-Z0-9-]+)+");
    private final TenantEntitlementMapper mapper;
    private final TransactionTemplate reads;

    public TenantPermissionPolicyService(TenantEntitlementMapper mapper, PlatformTransactionManager transactionManager) {
        this.mapper = mapper;
        reads = new TransactionTemplate(transactionManager);
        reads.setReadOnly(true);
        reads.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        reads.setIsolationLevel(TransactionDefinition.ISOLATION_READ_COMMITTED);
    }

    @Override
    public Entitlement current(Long tenantId) {
        if (tenantId == null || tenantId <= 0) throw unavailable();
        try {
            return TenantBroker.applyWithoutTenant(ignored -> reads.execute(status -> load(tenantId)));
        } catch (ServiceException exception) {
            throw exception;
        } catch (RuntimeException exception) {
            throw unavailable();
        }
    }

    private Entitlement load(long tenantId) {
        TenantEntitlementRow row = mapper.current(tenantId);
        if (row == null || !Long.valueOf(tenantId).equals(row.getTenantId())) throw unavailable();
        if (row.getPackageId() == null) return new Entitlement(null, null, row.getVersion(), Set.of(), Set.of());
        Set<Long> selected = ids(row.getEffectiveMenuIds());
        selected.addAll(ACCOUNT_OPERATIONS.keySet());
        List<TenantEntitlementMenu> menus = mapper.menus(selected);
        Map<Long, TenantEntitlementMenu> indexed = new HashMap<>();
        for (TenantEntitlementMenu menu : menus) {
            if (menu == null || menu.getMenuId() == null || !selected.contains(menu.getMenuId())
                    || indexed.putIfAbsent(menu.getMenuId(), menu) != null) throw unavailable();
            if (menu.getMenuType() == null || !Set.of("M", "C", "F").contains(menu.getMenuType())
                    || menu.getStatus() == null || !Set.of("0", "1").contains(menu.getStatus())) throw unavailable();
            String independent = TenantFeatureRegistry.INDEPENDENT_OPERATIONS.get(menu.getMenuId());
            if (independent != null && (!"F".equals(menu.getMenuType()) || !independent.equals(menu.getPerms()))) throw unavailable();
        }
        if (indexed.size() != selected.size()) throw unavailable();
        for (Map.Entry<Long, String> entry : ACCOUNT_OPERATIONS.entrySet()) {
            TenantEntitlementMenu account = indexed.get(entry.getKey());
            if (!"F".equals(account.getMenuType()) || !"0".equals(account.getStatus()) || !entry.getValue().equals(account.getPerms())) throw unavailable();
        }
        Set<Long> allowed = new TreeSet<>();
        Set<String> permissions = new TreeSet<>();
        for (TenantEntitlementMenu menu : menus) {
            if (!enabled(menu, indexed)) continue;
            allowed.add(menu.getMenuId());
            if (menu.getPerms() == null || menu.getPerms().isBlank()) continue;
            for (String value : menu.getPerms().split(",")) {
                String permission = value.trim();
                if (!PERMISSION.matcher(permission).matches()) throw unavailable();
                permissions.add(permission);
            }
        }
        return new Entitlement(row.getPackageId(), row.getPackageVersion(), row.getVersion(), allowed, permissions);
    }

    private boolean enabled(TenantEntitlementMenu menu, Map<Long, TenantEntitlementMenu> indexed) {
        if (!"0".equals(menu.getStatus())) return false;
        if (ACCOUNT_OPERATIONS.containsKey(menu.getMenuId())) return true;
        Set<Long> visited = new HashSet<>();
        visited.add(menu.getMenuId());
        TenantEntitlementMenu current = menu;
        boolean page = false;
        while (current.getParentId() == null || current.getParentId() != 0) {
            if (current.getParentId() == null || !visited.add(current.getParentId())) throw unavailable();
            current = indexed.get(current.getParentId());
            if (current == null || !Set.of("M", "C").contains(current.getMenuType())) throw unavailable();
            if (!"0".equals(current.getStatus())) return false;
            page |= "C".equals(current.getMenuType());
        }
        if ("F".equals(menu.getMenuType()) && !page && !TenantFeatureRegistry.INDEPENDENT_OPERATIONS.containsKey(menu.getMenuId())) throw unavailable();
        return true;
    }

    private Set<Long> ids(String value) {
        if (value == null || !IDS.matcher(value.trim()).matches()) throw unavailable();
        String body = value.trim();
        body = body.substring(1, body.length() - 1).trim();
        Set<Long> result = new TreeSet<>();
        if (!body.isEmpty()) {
            for (String item : body.split(",")) if (!result.add(Long.valueOf(item.trim()))) throw unavailable();
        }
        return result;
    }

    private static ServiceException unavailable() { return new ServiceException("租户套餐权限暂不可用，请稍后重试", 503); }
}

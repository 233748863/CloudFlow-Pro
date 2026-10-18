package com.cloudflow.auth.tenantpackage;

import com.cloudflow.auth.domain.SysMenu;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Menu;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Quotas;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncRules.Snapshot;
import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Arrays;
import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import org.springframework.stereotype.Component;

@Component
public final class TenantPackageCodec {
    private final ObjectMapper json;

    public TenantPackageCodec(ObjectMapper json) {
        this.json = json.copy().enable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES,
                DeserializationFeature.FAIL_ON_NULL_FOR_PRIMITIVES, DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .enable(JsonParser.Feature.STRICT_DUPLICATE_DETECTION).disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT);
    }

    public String encode(Object value) {
        try { return json.writeValueAsString(value); }
        catch (JsonProcessingException exception) { throw TenantPackageFailure.invalid(); }
    }

    public <Value> Value decode(String value, Class<Value> type) {
        if (value == null || value.isBlank()) throw TenantPackageFailure.invalid();
        try {
            Value decoded = json.readValue(value, type);
            if (decoded == null) throw TenantPackageFailure.invalid();
            return decoded;
        }
        catch (JsonProcessingException exception) { throw TenantPackageFailure.invalid(); }
    }

    public Set<Long> ids(String value) {
        JsonNode tree = tree(value);
        if (!tree.isArray()) throw TenantPackageFailure.invalid();
        Set<Long> result = new TreeSet<>();
        for (JsonNode item : tree) {
            if (!item.isIntegralNumber() || !item.canConvertToLong() || item.longValue() <= 0 || !result.add(item.longValue())) {
                throw TenantPackageFailure.invalid();
            }
        }
        return result;
    }

    public Set<String> modules(String value) {
        JsonNode tree = tree(value);
        if (!tree.isArray()) throw TenantPackageFailure.invalid();
        Set<String> result = new TreeSet<>();
        for (JsonNode item : tree) {
            if (!item.isTextual() || !TenantPackageRules.MODULES.contains(item.textValue()) || !result.add(item.textValue())) {
                throw TenantPackageFailure.invalid();
            }
        }
        return result;
    }

    public Adjustments adjustments(String value) {
        return value == null ? Adjustments.none() : decode(value, Adjustments.class);
    }

    public TenantPackageRules rules(Collection<SysMenu> catalog) {
        List<Menu> menus = catalog.stream().map(menu -> new Menu(menu.getMenuId(), menu.getParentId(), menu.getMenuType(),
                menu.getPerms() == null || menu.getPerms().isBlank() ? Set.of()
                        : new HashSet<>(Arrays.stream(menu.getPerms().split(",")).map(String::trim).toList()), "0".equals(menu.getStatus()))).toList();
        return new TenantPackageRules(menus);
    }

    public Effective compose(TenantPackageRules rules, SysTenantPackage template, Adjustments adjustments) {
        if (template == null || template.getMaxUsers() == null || template.getMaxStorageMb() == null) throw TenantPackageFailure.invalid();
        return rules.compose(ids(template.getMenuIds()), modules(template.getEnabledModules()),
                new Quotas(template.getMaxUsers(), template.getMaxStorageMb()), adjustments);
    }

    public Snapshot snapshot(SysTenant tenant, TenantPackageRules rules) {
        if (tenant == null || tenant.getPackageId() == null || tenant.getPackageVersion() == null || tenant.getVersion() == null
                || tenant.getUserLimit() == null || tenant.getStorageLimit() == null) throw TenantPackageFailure.invalid();
        Set<Long> ids = ids(tenant.getEffectiveMenuIds());
        Effective effective = rules.compose(ids, TenantPackageRules.MODULES,
                new Quotas(tenant.getUserLimit(), tenant.getStorageLimit()), Adjustments.none());
        if (!effective.menuIds().equals(ids)) throw TenantPackageFailure.invalid();
        return new Snapshot(tenant.getTenantId(), tenant.getPackageId(), tenant.getPackageVersion(), tenant.getVersion(),
                adjustments(tenant.getPackageOverride()), effective);
    }

    private JsonNode tree(String value) {
        if (value == null || value.isBlank()) throw TenantPackageFailure.invalid();
        try { return json.readTree(value); }
        catch (JsonProcessingException exception) { throw TenantPackageFailure.invalid(); }
    }
}

package com.cloudflow.common.core.permission;

import java.util.Map;

public final class TenantFeatureRegistry {
    public static final Map<Long, String> ACCOUNT_OPERATIONS = Map.of(
            900L, "system:auth:info", 901L, "system:auth:logout", 906L, "system:user:profile:password");
    public static final Map<Long, String> INDEPENDENT_OPERATIONS = Map.ofEntries(
            Map.entry(876L, "crm:approval:query"), Map.entry(877L, "crm:approval:customer-claim"),
            Map.entry(878L, "crm:approval:customer-level"), Map.entry(879L, "crm:approval:opportunity-downgrade"),
            Map.entry(880L, "crm:approval:refund"), Map.entry(881L, "crm:notification:dispatch"),
            Map.entry(882L, "crm:handover-task:list"), Map.entry(883L, "crm:handover-task:reassign"),
            Map.entry(884L, "crm:handover-task:close"), Map.entry(902L, "system:auth:router"),
            Map.entry(903L, "system:tenant:switch"), Map.entry(904L, "system:user:profile:view"),
            Map.entry(905L, "system:user:profile:edit"), Map.entry(1206L, "system:legal:list"),
            Map.entry(1207L, "system:legal:add"), Map.entry(1208L, "system:legal:edit"),
            Map.entry(1762L, "system:lookup:read"), Map.entry(1985L, "system:file:preview"),
            Map.entry(1986L, "system:search:business"));

    private TenantFeatureRegistry() { }
}

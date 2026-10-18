package com.cloudflow.common.core.search;

import java.util.List;

public enum BusinessSearchType {
    CUSTOMER("crm", List.of("crm:customer:list"), "/office/crm/customer/"),
    CONTRACT("oa", List.of("oa:contract:list"), "/office/contracts?searchId="),
    EMPLOYEE("hr", List.of("hr:employees:list", "hr:employees:view"), "/hr/employees?searchId="),
    WORKFLOW_INSTANCE("workflow", List.of("workflow:process:view"), "/workflow/search-instance/"),
    TICKET("crm", List.of("crm:ticket:list"), "/office/crm/tickets?searchId="),
    ASSET("oa", List.of("oa:asset:list"), "/admin/asset?searchId=");

    private final String module;
    private final List<String> permissions;
    private final String routePrefix;

    BusinessSearchType(String module, List<String> permissions, String routePrefix) {
        this.module = module;
        this.permissions = List.copyOf(permissions);
        this.routePrefix = routePrefix;
    }

    public String module() { return module; }
    public List<String> permissions() { return permissions; }

    public String route(String identifier) {
        String pattern = this == WORKFLOW_INSTANCE ? "[A-Za-z0-9_-]{1,64}" : "[1-9][0-9]{0,18}";
        if (identifier == null || !identifier.matches(pattern)) throw new IllegalArgumentException("搜索结果编号无效");
        return routePrefix + identifier;
    }
}

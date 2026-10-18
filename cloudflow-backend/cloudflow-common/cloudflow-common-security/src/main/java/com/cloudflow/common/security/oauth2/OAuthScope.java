package com.cloudflow.common.security.oauth2;

import java.util.Arrays;
import java.util.List;
import java.util.Set;

public enum OAuthScope {
    PROFILE("profile", "本人基本资料", "仅姓名和内部账号编号", "PROFILE", "system:oauth2:profile", Set.of()),
    CUSTOMER("crm.customer.read", "客户只读", "仅当前业务权限允许查看的客户", "CRM_CUSTOMER", "crm:customer:list", Set.of("crm:customer:list")),
    INSTANCE("workflow.instance.read", "流程只读", "仅当前允许查看的流程及其可见字段", "WORKFLOW_INSTANCE", "workflow:process:view", Set.of("workflow:process:view")),
    TENANT("system.tenant.read", "当前企业基本信息", "仅当前企业编号和名称", "TENANT", "system:oauth2:tenant", Set.of());

    private final String code;
    private final String title;
    private final String description;
    private final String resource;
    private final String authority;
    private final Set<String> businessPermissions;

    OAuthScope(String code, String title, String description, String resource, String authority, Set<String> businessPermissions) {
        this.code = code;
        this.title = title;
        this.description = description;
        this.resource = resource;
        this.authority = authority;
        this.businessPermissions = businessPermissions;
    }

    public String code() { return code; }
    public String resource() { return resource; }
    public String authority() { return authority; }
    public Set<String> businessPermissions() { return businessPermissions; }

    public View view() { return new View(code, title, description, resource, authority); }

    public static OAuthScope require(String code) {
        return Arrays.stream(values()).filter(scope -> scope.code.equals(code)).findFirst()
                .orElseThrow(() -> new OAuthFailure("invalid_scope", "包含未登记的授权范围", 400));
    }

    public static List<View> views() { return Arrays.stream(values()).map(OAuthScope::view).toList(); }

    public record View(String code, String title, String description, String resource, String authority) { }
}

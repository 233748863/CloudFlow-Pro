package com.cloudflow.common.tenant.entitlement;

import lombok.Data;

@Data
public class TenantEntitlementMenu {
    private Long menuId;
    private Long parentId;
    private String menuType;
    private String perms;
    private String status;
}

package com.cloudflow.common.tenant.entitlement;

import lombok.Data;

@Data
public class TenantEntitlementRow {
    private Long tenantId;
    private Long packageId;
    private Integer packageVersion;
    private Integer version;
    private String effectiveMenuIds;
}

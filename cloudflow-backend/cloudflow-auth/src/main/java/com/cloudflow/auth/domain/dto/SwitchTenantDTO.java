package com.cloudflow.auth.domain.dto;

import lombok.Data;

/**
 * 租户切换入参。
 */
@Data
public class SwitchTenantDTO {

    private Long tenantId;
}

package com.cloudflow.common.tenant.quota;

public record TenantQuotaRow(Long tenantId, Integer userLimit, Long storageLimit) { }

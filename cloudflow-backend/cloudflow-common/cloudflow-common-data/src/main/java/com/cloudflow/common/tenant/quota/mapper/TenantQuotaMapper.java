package com.cloudflow.common.tenant.quota.mapper;

import com.cloudflow.common.tenant.quota.TenantQuotaRow;
import java.math.BigDecimal;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface TenantQuotaMapper {
    TenantQuotaRow lockTenant(@Param("tenantId") Long tenantId);
    long countUsers(@Param("tenantId") Long tenantId);
    BigDecimal storageBytes(@Param("tenantId") Long tenantId);
    int refreshStorage(@Param("tenantId") Long tenantId, @Param("usedMb") long usedMb);
}

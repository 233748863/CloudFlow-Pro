package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.extension.service.IService;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;

import java.util.Collection;
import java.util.List;

/**
 * 租户 Service 接口。
 *
 * @author CloudFlow
 */
public interface ISysTenantService extends IService<SysTenant> {

    boolean isTenantExpired(Long tenantId);

    boolean isTenantDisabled(Long tenantId);

    boolean isUserLimitReached(Long tenantId);

    long countActiveUsers(Long tenantId);

    TenantStatisticsDTO getTenantStatistics(Long tenantId);

    List<TenantStatisticsDTO> getTenantStatisticsBatch(Collection<Long> tenantIds);

    TenantStorageSummaryDTO getTenantStorageSummary(Long tenantId);

    TenantStorageSummaryDTO refreshTenantStorageSummary(Long tenantId);

    boolean hasAvailableStorage(Long tenantId, long incomingBytes);

    boolean updateStorageUsed(Long tenantId, Long size);
}
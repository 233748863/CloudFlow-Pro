package com.cloudflow.auth.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.service.impl.ServiceImpl;
import com.cloudflow.auth.domain.SysFile;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysUser;
import com.cloudflow.auth.domain.dto.TenantStatisticsDTO;
import com.cloudflow.auth.domain.dto.TenantStorageSummaryDTO;
import com.cloudflow.auth.mapper.SysFileMapper;
import com.cloudflow.auth.mapper.SysTenantMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.service.ISysTenantService;
import com.cloudflow.common.tenant.TenantContext;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.function.Supplier;
import java.util.stream.Collectors;

/**
 * 租户 Service 实现类。
 *
 * @author CloudFlow
 */
@Slf4j
@Service
public class SysTenantServiceImpl extends ServiceImpl<SysTenantMapper, SysTenant> implements ISysTenantService {

    private static final long MB_BYTES = 1024L * 1024L;

    @Autowired
    private SysUserMapper sysUserMapper;

    @Autowired
    private SysFileMapper sysFileMapper;

    @Override
    public boolean isTenantExpired(Long tenantId) {
        return getTenantStatistics(tenantId).isExpired();
    }

    @Override
    public boolean isTenantDisabled(Long tenantId) {
        return getTenantStatistics(tenantId).isDisabled();
    }

    @Override
    public boolean isUserLimitReached(Long tenantId) {
        return getTenantStatistics(tenantId).isUserLimitReached();
    }

    @Override
    public long countActiveUsers(Long tenantId) {
        if (tenantId == null) {
            return 0L;
        }
        return countActiveUsersBatch(Collections.singletonList(tenantId)).getOrDefault(tenantId, 0L);
    }

    @Override
    public TenantStatisticsDTO getTenantStatistics(Long tenantId) {
        if (tenantId == null) {
            return new TenantStatisticsDTO(null, true, true, true, 0L);
        }

        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return new TenantStatisticsDTO(tenantId, true, true, true, 0L);
        }

        long activeUserCount = countActiveUsers(tenantId);
        return buildTenantStatistics(tenant, activeUserCount);
    }

    @Override
    public List<TenantStatisticsDTO> getTenantStatisticsBatch(Collection<Long> tenantIds) {
        List<Long> normalizedTenantIds = normalizeTenantIds(tenantIds);
        if (normalizedTenantIds.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, SysTenant> tenantMap = this.listByIds(normalizedTenantIds).stream()
            .collect(Collectors.toMap(SysTenant::getTenantId, tenant -> tenant, (left, right) -> left, LinkedHashMap::new));
        Map<Long, Long> activeUserCountMap = countActiveUsersBatch(normalizedTenantIds);

        List<TenantStatisticsDTO> statisticsList = new ArrayList<>(normalizedTenantIds.size());
        for (Long tenantId : normalizedTenantIds) {
            SysTenant tenant = tenantMap.get(tenantId);
            if (tenant == null) {
                continue;
            }
            statisticsList.add(buildTenantStatistics(tenant, activeUserCountMap.getOrDefault(tenantId, 0L)));
        }
        return statisticsList;
    }

    @Override
    public TenantStorageSummaryDTO getTenantStorageSummary(Long tenantId) {
        if (tenantId == null) {
            return new TenantStorageSummaryDTO(null, 0L, 0L, 0L, 0D);
        }

        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return new TenantStorageSummaryDTO(tenantId, 0L, 0L, 0L, 0D);
        }

        long storageUsed = bytesToMb(countStorageUsedBytesBatch(Collections.singletonList(tenantId)).getOrDefault(tenantId, 0L));
        return buildTenantStorageSummary(tenant, storageUsed);
    }

    @Override
    public TenantStorageSummaryDTO refreshTenantStorageSummary(Long tenantId) {
        TenantStorageSummaryDTO summary = getTenantStorageSummary(tenantId);
        if (summary.getTenantId() == null) {
            return summary;
        }

        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return summary;
        }

        if (!Objects.equals(tenant.getStorageUsed(), summary.getStorageUsed())) {
            tenant.setStorageUsed(summary.getStorageUsed());
            this.updateById(tenant);
        }
        return summary;
    }

    @Override
    public boolean hasAvailableStorage(Long tenantId, long incomingBytes) {
        if (tenantId == null) {
            return false;
        }

        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            return false;
        }

        Long storageLimit = tenant.getStorageLimit();
        if (storageLimit == null || storageLimit <= 0) {
            return true;
        }

        long currentUsedBytes = countStorageUsedBytesBatch(Collections.singletonList(tenantId)).getOrDefault(tenantId, 0L);
        long normalizedIncomingBytes = Math.max(incomingBytes, 0L);
        long storageLimitBytes = storageLimit * MB_BYTES;
        return currentUsedBytes + normalizedIncomingBytes <= storageLimitBytes;
    }

    private Map<Long, Long> countActiveUsersBatch(Collection<Long> tenantIds) {
        List<Long> normalizedTenantIds = normalizeTenantIds(tenantIds);
        if (normalizedTenantIds.isEmpty()) {
            return Collections.emptyMap();
        }

        return executeWithoutTenant(() -> {
            QueryWrapper<SysUser> wrapper = new QueryWrapper<>();
            wrapper.select("tenant_id", "COUNT(*) AS user_count")
                .in("tenant_id", normalizedTenantIds)
                .eq("deleted", 0)
                .groupBy("tenant_id");

            Map<Long, Long> activeUserCountMap = new HashMap<>();
            for (Map<String, Object> row : sysUserMapper.selectMaps(wrapper)) {
                Long tenantId = toLong(row.get("tenant_id"));
                Long userCount = toLong(row.get("user_count"));
                if (tenantId != null) {
                    activeUserCountMap.put(tenantId, userCount != null ? userCount : 0L);
                }
            }
            return activeUserCountMap;
        });
    }

    private Map<Long, Long> countStorageUsedBytesBatch(Collection<Long> tenantIds) {
        List<Long> normalizedTenantIds = normalizeTenantIds(tenantIds);
        if (normalizedTenantIds.isEmpty()) {
            return Collections.emptyMap();
        }

        return executeWithoutTenant(() -> {
            QueryWrapper<SysFile> wrapper = new QueryWrapper<>();
            wrapper.select("tenant_id", "SUM(file_size) AS total_bytes")
                .in("tenant_id", normalizedTenantIds)
                .eq("deleted", 0)
                .groupBy("tenant_id");

            Map<Long, Long> usedBytesMap = new HashMap<>();
            for (Map<String, Object> row : sysFileMapper.selectMaps(wrapper)) {
                Long tenantId = toLong(row.get("tenant_id"));
                Long totalBytes = toLong(row.get("total_bytes"));
                if (tenantId != null) {
                    usedBytesMap.put(tenantId, totalBytes != null ? totalBytes : 0L);
                }
            }
            return usedBytesMap;
        });
    }

    private List<Long> normalizeTenantIds(Collection<Long> tenantIds) {
        if (tenantIds == null || tenantIds.isEmpty()) {
            return Collections.emptyList();
        }
        return tenantIds.stream()
            .filter(Objects::nonNull)
            .distinct()
            .collect(Collectors.toList());
    }

    private TenantStatisticsDTO buildTenantStatistics(SysTenant tenant, long activeUserCount) {
        LocalDateTime expireTime = tenant.getExpireTime();
        boolean expired = expireTime != null && LocalDateTime.now().isAfter(expireTime);
        boolean disabled = "1".equals(tenant.getStatus());
        Integer userLimit = tenant.getUserLimit();
        boolean userLimitReached = userLimit != null && userLimit > 0 && activeUserCount >= userLimit;
        return new TenantStatisticsDTO(tenant.getTenantId(), expired, disabled, userLimitReached, activeUserCount);
    }

    private TenantStorageSummaryDTO buildTenantStorageSummary(SysTenant tenant, long storageUsed) {
        long storageLimit = tenant.getStorageLimit() != null ? tenant.getStorageLimit() : 0L;
        long remainingStorage = storageLimit > 0 ? Math.max(storageLimit - storageUsed, 0L) : 0L;
        double storageUsagePercent = storageLimit > 0 ? Math.min((storageUsed * 100D) / storageLimit, 100D) : 0D;
        return new TenantStorageSummaryDTO(tenant.getTenantId(), storageLimit, storageUsed, remainingStorage, storageUsagePercent);
    }

    private long bytesToMb(long bytes) {
        if (bytes <= 0) {
            return 0L;
        }
        return (bytes + MB_BYTES - 1) / MB_BYTES;
    }

    private Long toLong(Object value) {
        if (value instanceof Number numberValue) {
            return numberValue.longValue();
        }
        if (value instanceof String stringValue && !stringValue.isBlank()) {
            try {
                return Long.parseLong(stringValue);
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
        return null;
    }

    private <T> T executeWithoutTenant(Supplier<T> supplier) {
        Long originalTenantId = TenantContext.getTenantId();
        boolean originalSkip = TenantContext.getTenantSkip();
        try {
            TenantContext.setTenantSkip();
            return supplier.get();
        } finally {
            if (!originalSkip) {
                TenantContext.clearTenantSkip();
            }
            if (originalTenantId != null) {
                TenantContext.setTenantId(originalTenantId);
            }
        }
    }

    @Override
    public boolean updateStorageUsed(Long tenantId, Long size) {
        SysTenant tenant = this.getById(tenantId);
        if (tenant == null) {
            log.warn("租户不存在: {}", tenantId);
            return false;
        }

        long actualUsed = getTenantStorageSummary(tenantId).getStorageUsed();
        long delta = size != null ? size : 0L;
        long newUsed = Math.max(actualUsed + delta, 0L);
        Long storageLimit = tenant.getStorageLimit();
        if (delta > 0 && storageLimit != null && storageLimit > 0 && newUsed > storageLimit) {
            log.warn("租户 {} 存储空间不足，当前使用: {}MB, 限制: {}MB", tenantId, newUsed, storageLimit);
            return false;
        }

        tenant.setStorageUsed(newUsed);
        return this.updateById(tenant);
    }
}
package com.cloudflow.common.tenant.quota;

import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.core.exception.StorageCapacityError;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import lombok.RequiredArgsConstructor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@RequiredArgsConstructor
public class TenantQuotaService {
    private static final BigDecimal BYTES_PER_MB = BigDecimal.valueOf(1024L * 1024L);
    private final TenantQuotaMapper mapper;

    public void requireUserCapacity(Long tenantId) {
        TenantQuotaRow tenant = lock(tenantId);
        if (tenant.userLimit() != null && tenant.userLimit() > 0 && mapper.countUsers(tenantId) >= tenant.userLimit()) {
            throw new ServiceException("当前租户用户数已达上限，无法新增用户", 409);
        }
    }

    public void requireStorageCapacity(Long tenantId, long incomingBytes) {
        if (incomingBytes < 0) throw new ServiceException("文件大小无效", 400);
        TenantQuotaRow tenant = lock(tenantId);
        if (tenant.storageLimit() == null || tenant.storageLimit() == 0) return;
        BigDecimal proposed = mapper.storageBytes(tenantId).add(BigDecimal.valueOf(incomingBytes));
        if (tenant.storageLimit() < 0 || proposed.compareTo(BigDecimal.valueOf(tenant.storageLimit()).multiply(BYTES_PER_MB)) > 0) {
            throw StorageCapacityError.exception();
        }
    }

    public void refreshStorage(Long tenantId) {
        lock(tenantId);
        long usedMb = mapper.storageBytes(tenantId).divide(BYTES_PER_MB, 0, RoundingMode.CEILING).longValueExact();
        if (mapper.refreshStorage(tenantId, usedMb) != 1) throw new ServiceException("租户存储用量刷新失败", 409);
    }

    private TenantQuotaRow lock(Long tenantId) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !TransactionSynchronizationManager.isSynchronizationActive()
                || TransactionSynchronizationManager.isCurrentTransactionReadOnly()) {
            throw new IllegalStateException("额度准入必须与新增记录处于同一写事务");
        }
        Long currentTenant = TenantContext.getTenantId();
        if (currentTenant != null && !currentTenant.equals(tenantId)) throw new ServiceException("额度检查租户与当前业务租户不一致", 403);
        TenantQuotaRow tenant = tenantId == null || tenantId <= 0 ? null : mapper.lockTenant(tenantId);
        if (tenant == null) throw new ServiceException("租户不存在或已删除", 403);
        return tenant;
    }
}

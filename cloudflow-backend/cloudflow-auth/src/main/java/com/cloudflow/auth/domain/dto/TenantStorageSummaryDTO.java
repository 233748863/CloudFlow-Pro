package com.cloudflow.auth.domain.dto;

import java.io.Serializable;

/**
 * 租户存储空间摘要。
 */
public class TenantStorageSummaryDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private Long storageLimit;
    private Long storageUsed;
    private Long remainingStorage;
    private double storageUsagePercent;

    public TenantStorageSummaryDTO() {
    }

    public TenantStorageSummaryDTO(Long tenantId, Long storageLimit, Long storageUsed, Long remainingStorage, double storageUsagePercent) {
        this.tenantId = tenantId;
        this.storageLimit = storageLimit;
        this.storageUsed = storageUsed;
        this.remainingStorage = remainingStorage;
        this.storageUsagePercent = storageUsagePercent;
    }

    public Long getTenantId() {
        return tenantId;
    }

    public void setTenantId(Long tenantId) {
        this.tenantId = tenantId;
    }

    public Long getStorageLimit() {
        return storageLimit;
    }

    public void setStorageLimit(Long storageLimit) {
        this.storageLimit = storageLimit;
    }

    public Long getStorageUsed() {
        return storageUsed;
    }

    public void setStorageUsed(Long storageUsed) {
        this.storageUsed = storageUsed;
    }

    public Long getRemainingStorage() {
        return remainingStorage;
    }

    public void setRemainingStorage(Long remainingStorage) {
        this.remainingStorage = remainingStorage;
    }

    public double getStorageUsagePercent() {
        return storageUsagePercent;
    }

    public void setStorageUsagePercent(double storageUsagePercent) {
        this.storageUsagePercent = storageUsagePercent;
    }
}
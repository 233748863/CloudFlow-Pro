package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

/**
 * 用印/证照借还统计。
 */
@Data
public class OaBorrowManagementStatsDTO {

    private long pendingBorrowCount;
    private long borrowedCount;
    private long overdueCount;
    private long expiringLicenseCount;
    private List<TrendItem> trend = new ArrayList<>();
    private List<ResourceUsageItem> resourceUsage = new ArrayList<>();

    @Data
    public static class TrendItem {
        private String date;
        private long sealCount;
        private long licenseCount;
    }

    @Data
    public static class ResourceUsageItem {
        private String businessType;
        private Long resourceId;
        private String resourceName;
        private long count;
    }
}

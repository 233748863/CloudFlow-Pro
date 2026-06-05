package com.cloudflow.oa.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.oa.domain.OaLicense;
import com.cloudflow.oa.domain.OaLicenseBorrow;
import com.cloudflow.oa.domain.OaRiskAlert;
import com.cloudflow.oa.domain.OaSealApplication;
import com.cloudflow.oa.domain.dto.OaBorrowManagementStatsDTO;
import com.cloudflow.oa.domain.dto.OaBorrowManagementSummaryDTO;
import com.cloudflow.oa.mapper.OaRiskAlertMapper;
import com.cloudflow.oa.mapper.OaLicenseBorrowMapper;
import com.cloudflow.oa.mapper.OaLicenseMapper;
import com.cloudflow.oa.mapper.OaSealApplicationMapper;
import com.cloudflow.oa.service.IOaBorrowManagementService;
import com.cloudflow.oa.util.OaBorrowConstants;
import com.cloudflow.oa.util.OaContractConstants;
import com.cloudflow.common.audit.annotation.Audit;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 借还管理聚合服务实现。
 */
@Service
@RequiredArgsConstructor
public class OaBorrowManagementServiceImpl implements IOaBorrowManagementService {

    private final OaSealApplicationMapper sealApplicationMapper;
    private final OaLicenseBorrowMapper licenseBorrowMapper;
    private final OaLicenseMapper licenseMapper;
    private final OaRiskAlertMapper riskAlertMapper;

    @Override
    public OaBorrowManagementSummaryDTO getSummary() {
        OaBorrowManagementSummaryDTO summary = new OaBorrowManagementSummaryDTO();
        List<OaSealApplication> pendingSeals = sealApplications(OaBorrowConstants.STATUS_APPROVED, 5);
        List<OaLicenseBorrow> pendingLicenses = licenseBorrows(OaBorrowConstants.STATUS_APPROVED, 5);
        List<OaSealApplication> overdueSeals = sealApplications(OaBorrowConstants.STATUS_OVERDUE, 5);
        List<OaLicenseBorrow> overdueLicenses = licenseBorrows(OaBorrowConstants.STATUS_OVERDUE, 5);
        List<OaLicense> expiringLicenses = expiringLicenses(30, 5);
        summary.setPendingSealApplications(pendingSeals);
        summary.setPendingLicenseBorrows(pendingLicenses);
        summary.setOverdueSealApplications(overdueSeals);
        summary.setOverdueLicenseBorrows(overdueLicenses);
        summary.setExpiringLicenses(expiringLicenses);
        summary.setPendingBorrowCount(countApplications(OaBorrowConstants.STATUS_APPROVED) + countBorrows(OaBorrowConstants.STATUS_APPROVED));
        summary.setOverdueCount(countApplications(OaBorrowConstants.STATUS_OVERDUE) + countBorrows(OaBorrowConstants.STATUS_OVERDUE));
        summary.setExpiringLicenseCount(countExpiringLicenses(30));
        return summary;
    }

    @Override
    public OaBorrowManagementStatsDTO getStats() {
        OaBorrowManagementStatsDTO stats = new OaBorrowManagementStatsDTO();
        stats.setPendingBorrowCount(countApplications(OaBorrowConstants.STATUS_APPROVED) + countBorrows(OaBorrowConstants.STATUS_APPROVED));
        stats.setBorrowedCount(countApplications(OaBorrowConstants.STATUS_BORROWED) + countBorrows(OaBorrowConstants.STATUS_BORROWED));
        stats.setOverdueCount(countApplications(OaBorrowConstants.STATUS_OVERDUE) + countBorrows(OaBorrowConstants.STATUS_OVERDUE));
        stats.setExpiringLicenseCount(countExpiringLicenses(30));
        stats.setContractUnsealedRiskCount(countOpenRisk("CONTRACT_APPROVED_UNSEALED"));
        stats.setOverdueReturnRiskCount(countOpenRisk("SEAL_RETURN_OVERDUE"));
        stats.setUnarchivedRiskCount(countOpenRisk("CONTRACT_SEALED_UNARCHIVED"));
        stats.setTrend(buildTrend());
        stats.setResourceUsage(buildResourceUsage());
        return stats;
    }

    private List<OaSealApplication> sealApplications(String status, int limit) {
        return sealApplicationMapper.selectPage(new Page<>(1, Math.max(1, limit), false),
                new LambdaQueryWrapper<OaSealApplication>()
                        .eq(OaSealApplication::getStatus, status)
                        .eq(OaSealApplication::getDeleted, "0")
                        .orderByAsc(OaSealApplication::getExpectedReturnTime)).getRecords();
    }

    private List<OaLicenseBorrow> licenseBorrows(String status, int limit) {
        return licenseBorrowMapper.selectPage(new Page<>(1, Math.max(1, limit), false),
                new LambdaQueryWrapper<OaLicenseBorrow>()
                        .eq(OaLicenseBorrow::getStatus, status)
                        .eq(OaLicenseBorrow::getDeleted, "0")
                        .orderByAsc(OaLicenseBorrow::getExpectedReturnTime)).getRecords();
    }

    private List<OaLicense> expiringLicenses(int days, int limit) {
        LocalDate today = LocalDate.now();
        return licenseMapper.selectPage(new Page<>(1, Math.max(1, limit), false),
                new LambdaQueryWrapper<OaLicense>()
                .eq(OaLicense::getDeleted, "0")
                .ne(OaLicense::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                .isNotNull(OaLicense::getExpireDate)
                .between(OaLicense::getExpireDate, today, today.plusDays(days))
                .orderByAsc(OaLicense::getExpireDate)).getRecords();
    }

    private long countApplications(String status) {
        Long count = sealApplicationMapper.selectCount(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getStatus, status)
                .eq(OaSealApplication::getDeleted, "0"));
        return count == null ? 0 : count;
    }

    private long countBorrows(String status) {
        Long count = licenseBorrowMapper.selectCount(new LambdaQueryWrapper<OaLicenseBorrow>()
                .eq(OaLicenseBorrow::getStatus, status)
                .eq(OaLicenseBorrow::getDeleted, "0"));
        return count == null ? 0 : count;
    }

    private long countExpiringLicenses(int days) {
        LocalDate today = LocalDate.now();
        Long count = licenseMapper.selectCount(new LambdaQueryWrapper<OaLicense>()
                .eq(OaLicense::getDeleted, "0")
                .ne(OaLicense::getStatus, OaBorrowConstants.RESOURCE_DISABLED)
                .isNotNull(OaLicense::getExpireDate)
                .between(OaLicense::getExpireDate, today, today.plusDays(days)));
        return count == null ? 0 : count;
    }

    private long countOpenRisk(String riskCode) {
        Long count = riskAlertMapper.selectCount(new LambdaQueryWrapper<OaRiskAlert>()
                .eq(OaRiskAlert::getRiskCode, riskCode)
                .in(OaRiskAlert::getRiskStatus, OaContractConstants.RISK_STATUS_OPEN, OaContractConstants.RISK_STATUS_HANDLING));
        return count == null ? 0 : count;
    }

    private List<OaBorrowManagementStatsDTO.TrendItem> buildTrend() {
        LocalDate today = LocalDate.now();
        List<OaBorrowManagementStatsDTO.TrendItem> result = new ArrayList<>();
        for (int i = 6; i >= 0; i--) {
            LocalDate date = today.minusDays(i);
            LocalDateTime start = date.atStartOfDay();
            LocalDateTime end = date.plusDays(1).atStartOfDay();
            OaBorrowManagementStatsDTO.TrendItem item = new OaBorrowManagementStatsDTO.TrendItem();
            item.setDate(date.toString());
            item.setSealCount(countSealCreatedBetween(start, end));
            item.setLicenseCount(countLicenseCreatedBetween(start, end));
            result.add(item);
        }
        return result;
    }

    private long countSealCreatedBetween(LocalDateTime start, LocalDateTime end) {
        Long count = sealApplicationMapper.selectCount(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getDeleted, "0")
                .ge(OaSealApplication::getCreateTime, start)
                .lt(OaSealApplication::getCreateTime, end));
        return count == null ? 0 : count;
    }

    private long countLicenseCreatedBetween(LocalDateTime start, LocalDateTime end) {
        Long count = licenseBorrowMapper.selectCount(new LambdaQueryWrapper<OaLicenseBorrow>()
                .eq(OaLicenseBorrow::getDeleted, "0")
                .ge(OaLicenseBorrow::getCreateTime, start)
                .lt(OaLicenseBorrow::getCreateTime, end));
        return count == null ? 0 : count;
    }

    private List<OaBorrowManagementStatsDTO.ResourceUsageItem> buildResourceUsage() {
        Map<String, OaBorrowManagementStatsDTO.ResourceUsageItem> usage = new LinkedHashMap<>();
        List<OaSealApplication> sealList = sealApplicationMapper.selectList(new LambdaQueryWrapper<OaSealApplication>()
                .eq(OaSealApplication::getDeleted, "0")
                .in(OaSealApplication::getStatus, OaBorrowConstants.STATUS_BORROWED, OaBorrowConstants.STATUS_RETURNED, OaBorrowConstants.STATUS_OVERDUE));
        for (OaSealApplication item : sealList) {
            mergeUsage(usage, OaBorrowConstants.BUSINESS_TYPE_SEAL, item.getSealId(), item.getSealName());
        }
        List<OaLicenseBorrow> licenseList = licenseBorrowMapper.selectList(new LambdaQueryWrapper<OaLicenseBorrow>()
                .eq(OaLicenseBorrow::getDeleted, "0")
                .in(OaLicenseBorrow::getStatus, OaBorrowConstants.STATUS_BORROWED, OaBorrowConstants.STATUS_RETURNED, OaBorrowConstants.STATUS_OVERDUE));
        for (OaLicenseBorrow item : licenseList) {
            mergeUsage(usage, OaBorrowConstants.BUSINESS_TYPE_LICENSE, item.getLicenseId(), item.getLicenseName());
        }
        return usage.values().stream()
                .sorted(Comparator.comparingLong(OaBorrowManagementStatsDTO.ResourceUsageItem::getCount).reversed())
                .limit(8)
                .toList();
    }

    private void mergeUsage(Map<String, OaBorrowManagementStatsDTO.ResourceUsageItem> usage, String businessType, Long resourceId, String resourceName) {
        String key = businessType + ":" + resourceId;
        OaBorrowManagementStatsDTO.ResourceUsageItem item = usage.computeIfAbsent(key, ignored -> {
            OaBorrowManagementStatsDTO.ResourceUsageItem created = new OaBorrowManagementStatsDTO.ResourceUsageItem();
            created.setBusinessType(businessType);
            created.setResourceId(resourceId);
            created.setResourceName(resourceName);
            return created;
        });
        item.setCount(item.getCount() + 1);
    }
}

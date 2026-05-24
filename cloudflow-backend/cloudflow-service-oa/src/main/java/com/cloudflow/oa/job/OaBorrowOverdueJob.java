package com.cloudflow.oa.job;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.service.IOaRiskScanService;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaSealService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

/**
 * 用印/证照逾期归还扫描任务。
 * <p>
 * 平台级跨租户定时任务：通过 {@link TenantIterator} 遍历所有活跃租户，
 * 以单租户上下文调用业务 service，避免 MP 因 TenantContext 为 null 整张表跳过过滤。
 * </p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OaBorrowOverdueJob {

    private final IOaSealApplicationService sealApplicationService;
    private final IOaSealService sealService;
    private final IOaLicenseBorrowService licenseBorrowService;
    private final IOaLicenseService licenseService;
    private final IOaRiskScanService riskScanService;
    private final TenantIterator tenantIterator;

    @Scheduled(cron = "${cloudflow.oa.borrow.overdue-cron:0 0 9 * * ?}")
    public void scanOverdueBorrows() {
        AtomicInteger sealTotal = new AtomicInteger();
        AtomicInteger licenseTotal = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            sealTotal.addAndGet(sealApplicationService.scanAndRemindOverdue());
            licenseTotal.addAndGet(licenseBorrowService.scanAndRemindOverdue());
        });
        if (sealTotal.get() > 0 || licenseTotal.get() > 0) {
            log.info("用印/证照逾期扫描完成: sealCount={}, licenseCount={}", sealTotal.get(), licenseTotal.get());
        }
    }

    @Scheduled(cron = "${cloudflow.oa.license.expiry-cron:0 30 9 * * ?}")
    public void scanExpiringLicenses() {
        AtomicInteger sealTotal = new AtomicInteger();
        AtomicInteger licenseTotal = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> {
            sealTotal.addAndGet(sealService.scanAndRemindExpiring());
            licenseTotal.addAndGet(licenseService.scanAndRemindExpiring());
        });
        if (sealTotal.get() > 0 || licenseTotal.get() > 0) {
            log.info("印章/证照到期提醒扫描完成: sealCount={}, licenseCount={}", sealTotal.get(), licenseTotal.get());
        }
    }

    @Scheduled(cron = "${cloudflow.oa.contract.risk-cron:0 0 9 * * ?}")
    public void scanContractRisks() {
        AtomicInteger total = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> total.addAndGet(riskScanService.scanContractRisks()));
        if (total.get() > 0) {
            log.info("合同风险扫描完成: count={}", total.get());
        }
    }
}

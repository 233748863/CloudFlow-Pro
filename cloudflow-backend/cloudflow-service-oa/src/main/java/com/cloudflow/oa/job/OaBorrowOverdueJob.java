package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.oa.service.IOaLicenseBorrowService;
import com.cloudflow.oa.service.IOaLicenseService;
import com.cloudflow.oa.service.IOaRiskScanService;
import com.cloudflow.oa.service.IOaSealApplicationService;
import com.cloudflow.oa.service.IOaSealService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.ArrayList;
import java.util.List;
import java.util.function.IntSupplier;

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

    @JobHandler(value = "borrowOverdueScan", desc = "扫描借用逾期")
    @DistributedJob(name = "oa-borrow-overdue-scan-job", lockTime = 1800, waitTime = 5)
    public JobResult scanOverdueBorrows() {
        AtomicInteger sealTotal = new AtomicInteger();
        AtomicInteger licenseTotal = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            sealTotal.addAndGet(scan(tid, "用印逾期", sealApplicationService::scanAndRemindOverdue, failures));
            licenseTotal.addAndGet(scan(tid, "证照借用逾期", licenseBorrowService::scanAndRemindOverdue, failures));
        });
        throwFailures("借用逾期扫描", failures);
        if (sealTotal.get() > 0 || licenseTotal.get() > 0) {
            log.info("用印/证照逾期扫描完成: sealCount={}, licenseCount={}", sealTotal.get(), licenseTotal.get());
        }
        return JobResult.success(sealTotal.get() + licenseTotal.get(), "借用逾期扫描完成：用印"
                + sealTotal.get() + "份，证照借用" + licenseTotal.get() + "份");
    }

    @JobHandler(value = "licenseExpiryScan", desc = "扫描证照到期")
    @DistributedJob(name = "oa-license-expiry-scan-job", lockTime = 1800, waitTime = 5)
    public JobResult scanExpiringLicenses() {
        AtomicInteger sealTotal = new AtomicInteger();
        AtomicInteger licenseTotal = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            sealTotal.addAndGet(scan(tid, "印章到期", sealService::scanAndRemindExpiring, failures));
            licenseTotal.addAndGet(scan(tid, "证照到期", licenseService::scanAndRemindExpiring, failures));
        });
        throwFailures("印章证照到期扫描", failures);
        if (sealTotal.get() > 0 || licenseTotal.get() > 0) {
            log.info("印章/证照到期提醒扫描完成: sealCount={}, licenseCount={}", sealTotal.get(), licenseTotal.get());
        }
        return JobResult.success(sealTotal.get() + licenseTotal.get(), "印章证照到期扫描完成：印章"
                + sealTotal.get() + "条，证照" + licenseTotal.get() + "条提醒");
    }

    @JobHandler(value = "contractRiskScan", desc = "扫描合同风险")
    @DistributedJob(name = "oa-contract-risk-scan-job", lockTime = 1800, waitTime = 5)
    public JobResult scanContractRisks() {
        AtomicInteger total = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> total.addAndGet(scan(tid, "合同风险",
                riskScanService::scanContractRisks, failures)));
        throwFailures("合同风险扫描", failures);
        if (total.get() > 0) {
            log.info("合同风险扫描完成: count={}", total.get());
        }
        return JobResult.success(total.get(), "合同风险扫描完成：新增" + total.get() + "条风险");
    }

    private int scan(Long tenantId, String business, IntSupplier operation, List<RuntimeException> failures) {
        try {
            return operation.getAsInt();
        } catch (RuntimeException exception) {
            log.error("办公定时扫描失败, tenantId={}, business={}", tenantId, business, exception);
            failures.add(new IllegalStateException(business + "失败，租户：" + tenantId, exception));
            return 0;
        }
    }

    private void throwFailures(String task, List<RuntimeException> failures) {
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException(task + "存在失败分项：" + failures.size() + "项");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
    }
}

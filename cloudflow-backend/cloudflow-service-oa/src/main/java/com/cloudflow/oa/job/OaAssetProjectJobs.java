package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.impl.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.IntSupplier;

@Component
@RequiredArgsConstructor
public class OaAssetProjectJobs {
    private final TenantIterator tenants;
    private final OaDepreciationService depreciation;
    private final OaAssetMaintenanceService maintenance;
    private final OaSupplierGovernanceService suppliers;
    private final OaOperationsReminderService reminders;
    private final OaContractFulfilmentService contracts;
    private final OaRfqService rfqs;

    @JobHandler(value = "oaAssetDepreciationPost", desc = "资产折旧过账")
    @DistributedJob(name = "oaAssetDepreciationPost", lockTime = 1800, waitTime = 1)
    public JobResult oaAssetDepreciationPost() { return assetJob("资产折旧过账", depreciation::postDue); }

    @JobHandler(value = "oaAssetMaintenanceGenerate", desc = "资产维保任务生成及提醒")
    @DistributedJob(name = "oaAssetMaintenanceGenerate", lockTime = 1800, waitTime = 1)
    public JobResult oaAssetMaintenanceGenerate() { return assetJob("资产维保任务生成", maintenance::generateTasks); }

    @JobHandler(value = "oaAssetExpiryReminder", desc = "资产保险及保修到期提醒")
    @DistributedJob(name = "oaAssetExpiryReminder", lockTime = 1800, waitTime = 1)
    public JobResult oaAssetExpiryReminder() { return assetJob("资产到期提醒", maintenance::scanExpiry); }

    private JobResult assetJob(String title, IntSupplier operation) {
        AtomicInteger total = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try { total.addAndGet(operation.getAsInt()); }
            catch (RuntimeException exception) {
                failures.add(new IllegalStateException(title + "失败，租户：" + tenantId, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException(title + "存在失败租户：" + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(total.get(), title + "完成，本次处理" + total.get() + "项");
    }

    @JobHandler(value = "oaSupplierQualificationScan", desc = "供应商资质到期扫描")
    @DistributedJob(name = "oaSupplierQualificationScan", lockTime = 1800, waitTime = 1)
    public void oaSupplierQualificationScan() { tenants.forEachActiveTenant(tenantId -> suppliers.scanQualificationExpiry()); }

    @JobHandler(value = "oaSupplierScoringReminder", desc = "供应商周期评分提醒")
    @DistributedJob(name = "oaSupplierScoringReminder", lockTime = 1800, waitTime = 1)
    public void oaSupplierScoringReminder() { tenants.forEachActiveTenant(tenantId -> reminders.supplierScoring()); }

    @JobHandler(value = "oaTimesheetFilingReminder", desc = "项目工时填报提醒")
    @DistributedJob(name = "oaTimesheetFilingReminder", lockTime = 1800, waitTime = 1)
    public void oaTimesheetFilingReminder() { tenants.forEachActiveTenant(tenantId -> reminders.timesheetFiling()); }

    @JobHandler(value = "oaContractFulfilmentScan", desc = "合同履约到期及违约扫描")
    @DistributedJob(name = "oaContractFulfilmentScan", lockTime = 1800, waitTime = 1)
    public void oaContractFulfilmentScan() { tenants.forEachActiveTenant(tenantId -> contracts.scanDue()); }

    @JobHandler(value = "oaRfqDeadlineScan", desc = "询价截止及线下联系提醒")
    @DistributedJob(name = "oaRfqDeadlineScan", lockTime = 1800, waitTime = 1)
    public void oaRfqDeadlineScan() { tenants.forEachActiveTenant(tenantId -> rfqs.scanDeadlines()); }

}

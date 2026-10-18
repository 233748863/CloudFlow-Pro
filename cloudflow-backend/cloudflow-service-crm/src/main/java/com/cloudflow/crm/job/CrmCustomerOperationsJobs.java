package com.cloudflow.crm.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.crm.service.impl.CrmActivityReminderService;
import com.cloudflow.crm.service.impl.CrmCampaignDeliveryService;
import com.cloudflow.crm.service.impl.CrmCampaignRevenueService;
import com.cloudflow.crm.service.impl.CrmCampaignLogArchiveService;
import com.cloudflow.crm.service.impl.CrmSlaService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
public class CrmCustomerOperationsJobs {
    private final TenantIterator tenants;
    private final CrmActivityReminderService activities;
    private final CrmSlaService sla;
    private final CrmCampaignRevenueService revenue;
    private final CrmCampaignDeliveryService delivery;
    private final CrmCampaignLogArchiveService archives;

    @JobHandler(value = "crmActivityReminder", desc = "扫描CRM活动待提交提醒")
    @DistributedJob(name = "crm-activity-reminder", lockTime = 300, waitTime = 1)
    public void activityReminder() { tenants.forEachActiveTenant(tenantId -> activities.dispatch()); }

    @JobHandler(value = "crmActivityOverdue", desc = "标记CRM任务类活动逾期")
    @DistributedJob(name = "crm-activity-overdue", lockTime = 1800, waitTime = 1)
    public void activityOverdue() { tenants.forEachActiveTenant(tenantId -> activities.markOverdue()); }

    @JobHandler(value = "crmSlaBreachScan", desc = "检测CRM工单SLA违约并升级告警")
    @DistributedJob(name = "crm-sla-breach-scan", lockTime = 600, waitTime = 1)
    public JobResult slaBreachScan() {
        AtomicInteger changed = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try {
                changed.addAndGet(sla.scanBreaches());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("工单违约扫描失败，租户：" + tenantId, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("工单违约扫描存在失败租户：" + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(changed.get(), "工单违约扫描完成：已更新" + changed.get() + "张工单");
    }

    @JobHandler(value = "crmCampaignRevenueRecalc", desc = "重算营销活动归因收入与ROI")
    @DistributedJob(name = "crm-campaign-revenue-recalc", lockTime = 1800, waitTime = 1)
    public void campaignRevenueRecalc() { tenants.forEachActiveTenant(tenantId -> revenue.recalculateAll()); }

    @JobHandler(value = "crmCampaignCountAggregate", desc = "营销邮件效果对账与到期详情归档")
    @DistributedJob(name = "crm-campaign-count-aggregate", lockTime = 1800, waitTime = 1)
    public JobResult campaignCountAggregate() {
        AtomicInteger checked = new AtomicInteger();
        AtomicInteger archived = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try {
                delivery.aggregate();
                CrmCampaignLogArchiveService.Result result = archives.archiveExpired();
                checked.addAndGet(result.checked());
                archived.addAndGet(result.archived());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("营销效果对账与归档失败，租户：" + tenantId, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("营销效果对账与归档存在失败租户：" + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(archived.get(), "营销效果对账完成：检查" + checked.get() + "条到期日志，归档" + archived.get() + "条详情");
    }

    @JobHandler(value = "crmMassEmailDispatch", desc = "按冻结名单分批提交营销邮件，每轮最多100人")
    @DistributedJob(name = "crm-mass-email-dispatch", lockTime = 300, waitTime = 1)
    public void massEmailDispatch() { tenants.forEachActiveTenant(tenantId -> delivery.dispatch()); }
}

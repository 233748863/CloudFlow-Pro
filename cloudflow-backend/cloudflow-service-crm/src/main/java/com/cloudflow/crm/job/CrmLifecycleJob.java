package com.cloudflow.crm.job;

import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.crm.service.impl.CrmCustomerPoolServiceImpl;
import com.cloudflow.crm.service.impl.CrmQuoteServiceImpl;
import com.cloudflow.crm.service.opportunity.CrmOpportunityReminderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmLifecycleJob {

    private final TenantIterator tenantIterator;
    private final CrmCustomerPoolServiceImpl customerPoolService;
    private final CrmQuoteServiceImpl quoteService;
    private final CrmOpportunityReminderService opportunityReminders;

    @JobHandler(value = "crmOpportunityStageReminder", desc = "商机阶段停留刷新及超期提醒")
    @DistributedJob(name = "crm-opportunity-stage-reminder", lockTime = 300, waitTime = 1)
    public void opportunityStageReminders() {
        AtomicInteger queued = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tenantId -> queued.addAndGet(opportunityReminders.dispatch()));
        log.info("CRM opportunity stage reminders queued={}", queued.get());
    }

    @JobHandler(value = "customerPoolRelease", desc = "释放客户池客户")
    @DistributedJob(name = "crm-customer-pool-release-job", lockTime = 1800, waitTime = 5)
    public JobResult releaseCustomersToPool() {
        AtomicInteger released = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                released.addAndGet(customerPoolService.autoReleaseExpiredCustomers());
            } catch (RuntimeException exception) {
                log.error("CRM客户公海释放租户失败, tenantId={}", tid, exception);
                failures.add(new IllegalStateException("客户公海释放失败，租户：" + tid, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("客户公海释放存在失败租户："
                    + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        if (released.get() > 0) {
            log.info("CRM customer pool auto release completed: released={}", released.get());
        }
        return JobResult.success(released.get(), "客户公海释放完成：已释放" + released.get() + "名客户");
    }

    @JobHandler(value = "quoteExpire", desc = "处理报价过期")
    @DistributedJob(name = "crm-quote-expire-job", lockTime = 1800, waitTime = 5)
    public JobResult expireQuotes() {
        AtomicInteger expired = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenantIterator.forEachActiveTenant(tid -> {
            try {
                expired.addAndGet(quoteService.expireDueQuotes());
            } catch (RuntimeException exception) {
                log.error("报价过期处理租户失败, tenantId={}", tid, exception);
                failures.add(new IllegalStateException("报价过期处理失败，租户：" + tid, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("报价过期处理存在失败租户："
                    + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        if (expired.get() > 0) {
            log.info("CRM quote expire job completed: expired={}", expired.get());
        }
        return JobResult.success(expired.get(), "报价过期处理完成：已处理" + expired.get() + "份报价");
    }
}

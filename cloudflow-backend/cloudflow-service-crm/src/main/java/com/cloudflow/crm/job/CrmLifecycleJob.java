package com.cloudflow.crm.job;

import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.crm.service.impl.CrmCustomerPoolServiceImpl;
import com.cloudflow.crm.service.impl.CrmQuoteServiceImpl;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.concurrent.atomic.AtomicInteger;

@Slf4j
@Component
@RequiredArgsConstructor
public class CrmLifecycleJob {

    private final TenantIterator tenantIterator;
    private final CrmCustomerPoolServiceImpl customerPoolService;
    private final CrmQuoteServiceImpl quoteService;

    @Scheduled(cron = "${cloudflow.crm.customer-pool.release-cron:0 0 2 * * ?}")
    @DistributedJob(name = "crm-customer-pool-release-job", lockTime = 1800, waitTime = 5)
    public void releaseCustomersToPool() {
        AtomicInteger released = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> released.addAndGet(customerPoolService.autoReleaseExpiredCustomers()));
        if (released.get() > 0) {
            log.info("CRM customer pool auto release completed: released={}", released.get());
        }
    }

    @Scheduled(cron = "${cloudflow.crm.quote-expire-cron:0 0 3 * * ?}")
    @DistributedJob(name = "crm-quote-expire-job", lockTime = 1800, waitTime = 5)
    public void expireQuotes() {
        AtomicInteger expired = new AtomicInteger();
        tenantIterator.forEachActiveTenant(tid -> expired.addAndGet(quoteService.expireDueQuotes()));
        if (expired.get() > 0) {
            log.info("CRM quote expire job completed: expired={}", expired.get());
        }
    }
}

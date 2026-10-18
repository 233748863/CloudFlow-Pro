package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.impl.OaProjectAccountingService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
public class OaProjectAccountingJob {
    private final TenantIterator tenants;
    private final OaProjectAccountingService accounting;

    @JobHandler(value = "oaProjectCostRecalculate", desc = "项目工时与成本全量重算")
    @DistributedJob(name = "oaProjectCostRecalculate", lockTime = 1800, waitTime = 1)
    public JobResult recalculate() {
        AtomicInteger processed = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try { processed.addAndGet(accounting.recalculateAll()); }
            catch (RuntimeException exception) {
                failures.add(new IllegalStateException("项目工时与成本重算失败，租户：" + tenantId, exception));
            }
        });
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("项目工时与成本重算存在失败租户：" + failures.size() + "个");
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(processed.get(), "项目工时与成本重算完成，本次处理" + processed.get() + "个项目");
    }
}

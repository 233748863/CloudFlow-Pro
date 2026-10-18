package com.cloudflow.hr.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.hr.service.HrHSupport;
import com.cloudflow.hr.service.HrReferralProgressService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicInteger;

@Component
@RequiredArgsConstructor
public class HrReferralProgressJob {
    private final TenantIterator tenants;
    private final HrReferralProgressService progress;

    @JobHandler(value = "hrReferralEmployment", desc = "员工内推入职生效扫描")
    @DistributedJob(name = "hr-referral-employment", lockTime = 240, waitTime = 1)
    public JobResult applyEmployment() {
        AtomicInteger changed = new AtomicInteger();
        List<RuntimeException> failures = new ArrayList<>();
        for (Long tenantId : tenants.listActiveTenantIds()) {
            try {
                HrHSupport.runAsTenant(tenantId, () -> changed.addAndGet(progress.applyDueEmployment()));
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("内推入职生效扫描失败，租户：" + tenantId, exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("内推入职生效扫描存在失败租户："
                    + failures.size() + "个；已完成记录数：" + changed.get());
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        return JobResult.success(changed.get(), "内推入职生效扫描完成：" + changed.get() + "条");
    }
}

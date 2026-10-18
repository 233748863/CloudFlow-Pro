package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.impl.OaContractPerformanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class OaContractPerformanceJob {
    private final TenantIterator tenants;
    private final OaContractPerformanceService performance;

    @JobHandler(value = "oaContractPerformanceConfirm", desc = "确认已到开始日期的合同销售业绩")
    @DistributedJob(name = "oaContractPerformanceConfirm", lockTime = 1800, waitTime = 1)
    public void confirmDueContracts() {
        int failed = 0;
        for (Long tenantId : tenants.listActiveTenantIds()) {
            try { TenantBroker.runAs(tenantId, current -> performance.scanDue()); }
            catch (RuntimeException failure) {
                failed++;
                log.error("合同业绩扫描存在失败，tenantId={}", tenantId, failure);
            }
        }
        if (failed > 0) throw new IllegalStateException("合同业绩扫描失败租户数=" + failed);
    }
}

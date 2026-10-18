package com.cloudflow.oa.job;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.tenant.support.TenantIterator;
import com.cloudflow.oa.service.impl.ConsumableMaintenanceService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.util.ArrayList;
import java.util.List;

@Component
@RequiredArgsConstructor
public class OaConsumableJobs {
    private final TenantIterator tenants;
    private final ConsumableMaintenanceService maintenance;

    @JobHandler(value = "oaConsumableStockWarning", desc = "耗材低库存预警")
    @DistributedJob(name = "oaConsumableStockWarning", lockTime = 1800, waitTime = 1)
    public void oaConsumableStockWarning() {
        acrossTenants(maintenance::scanWarnings);
    }

    @JobHandler(value = "oaConsumableStockRecalculate", desc = "耗材库存台账核对重算")
    @DistributedJob(name = "oaConsumableStockRecalculate", lockTime = 1800, waitTime = 1)
    public void oaConsumableStockRecalculate() {
        acrossTenants(maintenance::scanRecalculation);
    }

    private void acrossTenants(Runnable action) {
        List<RuntimeException> failures = new ArrayList<>();
        tenants.forEachActiveTenant(tenantId -> {
            try { action.run(); }
            catch (RuntimeException exception) { failures.add(new IllegalStateException("耗材任务租户" + tenantId + "失败", exception)); }
        });
        if (!failures.isEmpty()) {
            IllegalStateException error = new IllegalStateException("耗材任务失败租户数：" + failures.size());
            failures.forEach(error::addSuppressed);
            throw error;
        }
    }
}

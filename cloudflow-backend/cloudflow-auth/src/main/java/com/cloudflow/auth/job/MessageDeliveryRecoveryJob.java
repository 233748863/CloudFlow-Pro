package com.cloudflow.auth.job;

import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class MessageDeliveryRecoveryJob {
    private final MessageDeliveryService deliveries;
    private final TenantIterator tenants;
    private final int retentionDays;

    public MessageDeliveryRecoveryJob(MessageDeliveryService deliveries, TenantIterator tenants,
            @Value("${cloudflow.message.delivery.payload-retention-days:30}") int retentionDays) {
        if (retentionDays < 1 || retentionDays > 3650) throw new IllegalArgumentException("发送载荷保留天数必须在1至3650之间");
        this.deliveries = deliveries;
        this.tenants = tenants;
        this.retentionDays = retentionDays;
    }

    @JobHandler(value = "messageDeliveryRecovery", desc = "恢复确定未发送的投递，隔离结果未明并清理到期密文载荷")
    @DistributedJob(name = "message-delivery-recovery", lockTime = 300)
    public JobResult recover() {
        AtomicInteger processed = new AtomicInteger();
        for (Long tenantId : tenants.listActiveTenantIds()) {
            TenantBroker.runAs(tenantId, current -> {
                processed.addAndGet(deliveries.processDue(tenantId, 100));
                deliveries.expirePayloads(tenantId, retentionDays);
            });
        }
        return JobResult.success(processed.get(), "外部投递恢复完成；结果未明记录保持人工核验");
    }
}

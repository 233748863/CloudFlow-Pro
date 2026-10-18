package com.cloudflow.auth.job;

import com.cloudflow.auth.service.LocalImportFileStore;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.time.LocalDateTime;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "cloudflow.import.enabled", havingValue = "true")
public class ImportCleanupJob {
    private final TenantIterator tenants;
    private final LocalImportFileStore files;
    private final int retentionDays;

    public ImportCleanupJob(TenantIterator tenants, LocalImportFileStore files,
            @Value("${cloudflow.import.retention-days:30}") int retentionDays) {
        if (retentionDays < 1) throw new IllegalArgumentException("导入任务保留天数必须为正整数");
        this.tenants = tenants;
        this.files = files;
        this.retentionDays = retentionDays;
    }

    @JobHandler(value = "importTaskCleanup", desc = "清理到期导入任务、错误明细及私有文件")
    @DistributedJob(name = "import-task-cleanup", lockTime = 1800)
    public JobResult cleanup() {
        LocalDateTime cutoff = LocalDateTime.now().minusDays(retentionDays);
        AtomicInteger cleaned = new AtomicInteger();
        AtomicInteger originals = new AtomicInteger();
        for (Long tenantId : tenants.listActiveTenantIds()) {
            TenantBroker.runAs(tenantId, current -> {
                originals.addAndGet(files.cleanupCompletedOriginals());
                cleaned.addAndGet(files.cleanupExpired(cutoff));
            });
        }
        return JobResult.success(cleaned.get() + originals.get(), "到期导入任务清理" + cleaned.get() + "项，业务原文件清理" + originals.get() + "项");
    }
}

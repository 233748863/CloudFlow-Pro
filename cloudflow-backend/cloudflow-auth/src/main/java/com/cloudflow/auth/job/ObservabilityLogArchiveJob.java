package com.cloudflow.auth.job;

import com.cloudflow.common.audit.service.AuditLogArchiveService;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.util.ArrayList;
import java.util.List;
import javax.sql.DataSource;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/** 复用审计归档事务；按租户独立执行，任何失败均交给既有任务告警。 */
@Component
public class ObservabilityLogArchiveJob {
    private final TenantIterator tenantIterator;
    private final AuditLogArchiveService archiveService;

    public ObservabilityLogArchiveJob(TenantIterator tenantIterator, DataSource dataSource,
            @Value("${cloudflow.observability.archive.dry-run:false}") boolean dryRun) {
        this.tenantIterator = tenantIterator;
        this.archiveService = new AuditLogArchiveService(dataSource, dryRun);
    }

    @JobHandler(value = "observabilityLogArchive", desc = "归档访问与错误日志")
    @DistributedJob(name = "observability-log-archive-job", lockTime = 1800, waitTime = 5)
    public JobResult archiveExpiredLogs() {
        List<RuntimeException> failures = new ArrayList<>();
        int inserted = 0;
        int deleted = 0;
        int candidates = 0;
        for (Long tenantId : tenantIterator.listActiveTenantIds()) {
            try {
                AuditLogArchiveService.ArchiveResult result = TenantBroker.applyAs(tenantId,
                        ignored -> archiveService.archiveObservabilityLogsForCurrentTenant());
                inserted = Math.addExact(inserted, result.getInserted());
                deleted = Math.addExact(deleted, result.getDeleted());
                candidates = Math.addExact(candidates, result.getCandidates());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("日志归档租户失败：" + tenantId, exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("日志归档存在失败租户：" + failures.size());
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        String prefix = archiveService.isDryRun() ? "日志归档预演完成" : "日志归档完成";
        return JobResult.success(deleted, prefix + "：候选" + candidates + "条，新增" + inserted + "条，移出" + deleted + "条");
    }
}

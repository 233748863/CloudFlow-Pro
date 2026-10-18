package com.cloudflow.auth.job;

import com.cloudflow.common.job.annotation.JobHandler;

import com.cloudflow.common.audit.service.AuditLogArchiveService;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.support.TenantIterator;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuditLogArchiveJob {

    private final TenantIterator tenantIterator;
    private final AuditLogArchiveService auditLogArchiveService;

    @JobHandler(value = "auditLogArchive", desc = "归档审计日志")
    @DistributedJob(name = "audit-log-archive-job", lockTime = 1800, waitTime = 5)
    public JobResult archiveExpiredLogs() {
        List<RuntimeException> failures = new ArrayList<>();
        int inserted = 0;
        int deleted = 0;
        int candidates = 0;
        for (Long tenantId : tenantIterator.listActiveTenantIds()) {
            try {
                AuditLogArchiveService.ArchiveResult result = TenantBroker.applyAs(tenantId,
                        ignored -> auditLogArchiveService.archiveExpiredLogsForCurrentTenant());
                inserted = Math.addExact(inserted, result.getInserted());
                deleted = Math.addExact(deleted, result.getDeleted());
                candidates = Math.addExact(candidates, result.getCandidates());
                log.info("audit log archive completed, tenantId={}, dryRun={}, candidates={}, inserted={}, deleted={}",
                        tenantId, result.isDryRun(), result.getCandidates(), result.getInserted(), result.getDeleted());
            } catch (RuntimeException exception) {
                failures.add(new IllegalStateException("审计归档租户失败：" + tenantId, exception));
            }
        }
        if (!failures.isEmpty()) {
            IllegalStateException failure = new IllegalStateException("审计归档存在失败租户：" + failures.size());
            failures.forEach(failure::addSuppressed);
            throw failure;
        }
        String summary = auditLogArchiveService.isDryRun() ? "审计归档预演完成：候选" + candidates + "条，实际移出0条"
                : "审计归档完成：候选" + candidates + "条，新增" + inserted + "条，移出" + deleted + "条";
        return JobResult.success(deleted, summary);
    }
}

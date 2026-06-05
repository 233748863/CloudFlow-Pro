package com.cloudflow.auth.job;

import com.cloudflow.common.audit.service.AuditLogArchiveService;
import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.tenant.support.TenantIterator;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class AuditLogArchiveJob {

    private final TenantIterator tenantIterator;
    private final AuditLogArchiveService auditLogArchiveService;

    @Scheduled(cron = "${cloudflow.auth.audit-archive-cron:0 0 3 1 * ?}")
    @DistributedJob(name = "audit-log-archive-job", lockTime = 1800, waitTime = 5)
    public void archiveExpiredLogs() {
        tenantIterator.forEachActiveTenant(tenantId -> {
            AuditLogArchiveService.ArchiveResult result = auditLogArchiveService.archiveExpiredLogsForCurrentTenant();
            log.info("audit log archive completed, tenantId={}, dryRun={}, candidates={}, inserted={}, deleted={}",
                    tenantId, result.isDryRun(), result.getCandidates(), result.getInserted(), result.getDeleted());
        });
    }
}

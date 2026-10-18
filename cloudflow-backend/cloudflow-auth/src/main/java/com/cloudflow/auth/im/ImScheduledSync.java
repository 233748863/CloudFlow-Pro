package com.cloudflow.auth.im;

import com.cloudflow.common.job.annotation.DistributedJob;
import com.cloudflow.common.job.annotation.JobHandler;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
public class ImScheduledSync {
    private final ImDatabase database;
    private final ImSyncService previews;
    private final ImSyncBatchExecutor batches;
    private final ImSyncRunner runner;

    @JobHandler(value = "imOrganizationSync", desc = "按已授权范围定时同步企业微信组织并保留结果报告")
    @DistributedJob(name = "im-organization-sync", lockTime = 300)
    public JobResult execute(String parameter) {
        Long tenantId = TenantContext.getTenantId();
        if (tenantId == null || tenantId <= 0 || TenantContext.getTenantSkip()) return JobResult.failed("IM_PERMISSION_DENIED");
        long deadline = System.nanoTime() + Duration.ofMinutes(3).toNanos();
        try { return ImSyncBudget.within(deadline, () -> execute(tenantId, parameter, deadline)); }
        catch (ImSyncBudget.Exhausted exhausted) { return JobResult.failed("IM_SYNC_BUDGET_EXHAUSTED"); }
    }

    private JobResult execute(long tenantId, String parameter, long deadline) {
        String reference = "";
        try {
            ImScheduledClaim claim = database.read(tenantId, mapper -> ImScheduledClaim.capture(mapper, parameter));
            ImSyncViews.Report preview = previews.scheduledPreview(claim);
            long runId = preview.header().syncRunId();
            reference = ImScheduledClaim.reference(runId);
            if (preview.failureCode() != null) return JobResult.failed(reference + preview.failureCode());
            ImSyncApplication application = batches.scheduled(claim, runId, preview.hash());
            if (!application.finished() && System.nanoTime() < deadline) application = runner.recover(tenantId, runId, deadline);
            String message = reference + "status=" + application.status() + ";processed=" + application.next();
            return "PARTIAL".equals(application.status()) ? JobResult.failed(message) : JobResult.success(application.next(), message);
        } catch (ImSyncBudget.Exhausted exhausted) { return JobResult.failed(reference + "IM_SYNC_BUDGET_EXHAUSTED"); }
        catch (ImFailure failure) { return JobResult.failed(reference + failure.getReasonCode()); }
        catch (RuntimeException failure) { return JobResult.failed(reference + ImFailure.orgApplyPersistence().getReasonCode()); }
    }
}

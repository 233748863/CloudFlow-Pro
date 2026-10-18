package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImOrganizationMapper;
import com.cloudflow.common.audit.annotation.Audit;
import com.cloudflow.common.audit.annotation.HighRiskAction;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantContext;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.atomic.AtomicLong;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ImSyncRunner {
    private final ImSyncBatchExecutor batches;
    private final ImSyncEffectsExecutor effects;
    private final ImDatabase database;
    private final ImOrganizationMapper writes;
    private final ImOrgSnapshotCodec codec;
    private final AtomicLong cursor = new AtomicLong();

    @HighRiskAction
    @Audit(name = "确认执行企业微信组织同步", highRisk = true)
    public Result apply(long runId, ImSyncApplyRequest request) {
        if (request == null || request.getVersion() == null || request.getHash() == null) throw ImFailure.configuration();
        ImSyncApplication application = batches.step(runId, request.getVersion(), request.getHash());
        String reason = null;
        if (application.effectsPending()) {
            try { application = effects.recover(application.preview().source().tenantId(), runId); }
            catch (ImFailure failure) { reason = failure.getReasonCode(); }
        }
        return new Result(runId, application.status(), application.summary(), reason);
    }

    public Sweep recoverDue() {
        if (Thread.currentThread().isInterrupted()) return new Sweep(0, 0, 0, 0);
        long deadline = System.nanoTime() + Duration.ofMinutes(3).toNanos();
        List<Target> targets;
        boolean previousSkip = TenantContext.getTenantSkip();
        try { targets = TenantBroker.applyWithoutTenant(ignored -> writes.recoveryTargets(cursor.get(), 100)); }
        finally { if (previousSkip) TenantContext.setTenantSkip(); }
        int completed = 0;
        int pending = 0;
        int failed = 0;
        int attempted = 0;
        for (Target target : targets) {
            if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) break;
            cursor.set(target.runId());
            attempted++;
            try {
                ImSyncApplication application = recover(target.tenantId(), target.runId(), deadline);
                if (!application.finished()) pending++;
                else if ("COMPLETED".equals(application.status())) completed++;
                else failed++;
            } catch (RuntimeException failure) { failed++; }
        }
        if (targets.size() < 100 && attempted == targets.size()) cursor.set(0);
        return new Sweep(attempted, completed, pending, failed);
    }

    ImSyncApplication recover(long tenantId, long runId, long deadline) {
        boolean interrupted = Thread.currentThread().isInterrupted();
        ImSyncApplication application = database.read(tenantId, mapper -> codec.decodeRun(mapper.syncRun(tenantId, runId)));
        if (interrupted) {
            Thread.currentThread().interrupt();
            return application;
        }
        for (int step = 0; step < 40 && !application.finished(); step++) {
            if (Thread.currentThread().isInterrupted() || System.nanoTime() >= deadline) break;
            try {
                ImSyncApplication previous = application;
                application = ImSyncBudget.within(deadline, () -> {
                    ImSyncApplication recovered = effects.recover(tenantId, runId);
                    if (recovered.equals(previous) && !recovered.finished() && !recovered.effectsPending()) {
                        return batches.recover(tenantId, runId, previous.preview().source().configVersion(), previous.previewHash());
                    }
                    return recovered;
                });
            } catch (ImSyncBudget.Exhausted exhausted) { break; }
            catch (ImFailure failure) {
                if (!"IM_VERSION_CONFLICT".equals(failure.getReasonCode())) throw failure;
            }
        }
        return application;
    }

    public record Target(long tenantId, long runId) { }
    public record Result(long runId, String status, ImSyncApplication.Summary progress, String recoveryReason) { }
    public record Sweep(int attempted, int completed, int pending, int failed) { }
}

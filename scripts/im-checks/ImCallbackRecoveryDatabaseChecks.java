package com.cloudflow.auth.im;

import com.cloudflow.auth.job.ImCallbackRecoveryJob;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.job.config.JobHandlerRegistry;
import com.cloudflow.common.job.model.JobResult;
import com.cloudflow.common.security.im.ImTaskCallbacks;
import com.cloudflow.common.tenant.TenantContext;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import org.springframework.context.support.GenericApplicationContext;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImCallbackRecoveryDatabaseChecks {
    private final JdbcTemplate jdbc;
    private final ImCallbackInbox inbox;
    private final ImCallbackMapper mapper;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private int assertions;

    ImCallbackRecoveryDatabaseChecks(JdbcTemplate jdbc, ImCallbackInbox inbox, ImCallbackMapper mapper, ImConfigRules rules, ImProperties properties) {
        this.jdbc = jdbc; this.inbox = inbox; this.mapper = mapper; this.rules = rules; this.properties = properties;
    }

    void run(WeComCredentials credentials, List<ImCardCallback> events, ImCardCallback leased) throws Exception {
        check(events.size() == 104, "more than one recovery batch prepared");
        long failId = inbox.receive(credentials, events.get(0), "127.0.0.1").callbackId();
        for (ImCardCallback event : events.subList(1, events.size())) inbox.receive(credentials, event, "127.0.0.1");
        long leasedId = inbox.receive(credentials, leased, "127.0.0.1").callbackId();
        ImCallbackRow live = inbox.claim(credentials.tenantId(), leasedId);
        AtomicBoolean failOnce = new AtomicBoolean(true);
        AtomicInteger calls = new AtomicInteger();
        ImCallbackWorkflowClient client = request -> {
            calls.incrementAndGet();
            if (!Long.valueOf(request.tenantId()).equals(jdbc.queryForObject("SELECT tenant_id FROM sys_im_callback_event WHERE callback_id=?", Long.class, request.callbackId()))) throw new AssertionError("Persisted target tenant required");
            return R.ok(new ImTaskCallbacks.Outcome("COMPLETED", "IM_TASK_COMPLETED"));
        };
        ImCallbackProcessor processor = new ImCallbackProcessor(inbox, client, rules) {
            @Override public boolean process(long tenantId, long callbackId) {
                if (callbackId == failId && failOnce.compareAndSet(true, false)) throw new IllegalStateException("controlled recovery failure");
                return super.process(tenantId, callbackId);
            }
        };
        ImCallbackRecovery recovery = new ImCallbackRecovery(mapper, processor, properties);
        properties.setEnabled(false);
        try { check(recovery.recoverDue().attempted() == 0 && calls.get() == 0, "disabled deployment invokes no workflow"); }
        finally { properties.setEnabled(true); }
        TenantContext.setTenantId(990100L);
        try {
            ImCallbackRecovery.Sweep first = recovery.recoverDue();
            check(first.attempted() == 100 && first.failed() == 1 && first.recorded() == 99, "bounded first batch continues after one failed event");
            check(Long.valueOf(990100).equals(TenantContext.getTenantId()), "global target scan restores caller tenant");
            ImCallbackRecovery.Sweep second = recovery.recoverDue();
            check(second.attempted() >= 4 && second.attempted() < 100 && second.failed() == 0, "cursor reaches later events without failed-row starvation");
            check("RECEIVED".equals(status(failId)), "failed earlier row remains pending until cursor wraps");
            ImCallbackRecovery.Sweep retry = recovery.recoverDue();
            check(retry.attempted() == 1 && retry.recorded() == 1 && "COMPLETED".equals(status(failId)), "wrapped cursor safely retries prior failure");
            check(recovery.recoverDue().attempted() == 0 && "PROCESSING".equals(status(leasedId)), "live processing lease is not taken over");
            check(inbox.finish(live, "RETRYABLE", "IM_WORKFLOW_UNCERTAIN"), "live owner may schedule uncertain result");
            check(recovery.recoverDue().attempted() == 0, "retryable event waits until its deadline");
            jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE callback_id=?", leasedId);
            check(recovery.recoverDue().recorded() == 1 && "COMPLETED".equals(status(leasedId)), "expired retry is recovered from persistent inbox");
            Thread.currentThread().interrupt();
            try { check(recovery.recoverDue().attempted() == 0 && Thread.currentThread().isInterrupted(), "interruption stops sweep without clearing signal"); }
            finally { Thread.interrupted(); }
        } finally { TenantContext.clear(); }
        try (GenericApplicationContext context = new GenericApplicationContext()) {
            context.registerBean("callbackRecovery", ImCallbackRecoveryJob.class, () -> new ImCallbackRecoveryJob(recovery));
            context.refresh();
            JobHandlerRegistry registry = new JobHandlerRegistry(context);
            registry.refresh();
            check(registry.contains("imCallbackRecovery") && "im-callback-recovery".equals(registry.lockName("imCallbackRecovery")), "production registry discovers handler with expected lock identity");
            JobResult result = registry.invoke("imCallbackRecovery", null);
            check("SUCCESS".equals(result.getExecuteStatus()) && result.getResultMsg().contains("已记录结果=0"), "job reports persisted processing counts without claiming approvals");
        }
        System.out.println("G4_IM_CALLBACK_RECOVERY_DATABASE: assertions=" + assertions + "; failed=0; real_mysql=true; durable_inbox=true; cursor=in_memory; batch_size=100; actual_handler_registry=true; workflow_transport=controlled; scheduler_http=false; redis_job_lock=false; vendor_service=false");
    }

    private String status(long callbackId) { return jdbc.queryForObject("SELECT status FROM sys_im_callback_event WHERE callback_id=?", String.class, callbackId); }
    private void check(boolean value, String message) { assertions++; if (!value) throw new AssertionError(message); }
}

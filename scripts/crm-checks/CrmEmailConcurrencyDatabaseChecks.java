package com.cloudflow.crm.service.email;

import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.crm.domain.CrmMassEmail;
import com.cloudflow.crm.domain.CrmMassEmailRecipient;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.exception.CrmBusinessException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

final class CrmEmailConcurrencyDatabaseChecks {
    static void run(CrmEmailDatabaseChecks suite) throws Exception {
        batchBoundaries(suite);
        cancelRace(suite);
        observations(suite);
        System.out.println("E5_CONCURRENCY: groups=3; frozen_recipients=201; maximum_batch=100; duplicate_events=0; cancel_dispatch_race=true; observation_workers=8; duplicate_observations=0");
    }

    private static CrmMassEmail scheduled(CrmEmailDatabaseChecks suite, String label, int count) {
        CrmMassEmail task = CrmEmailBoundaryDatabaseChecks.draft(suite, label, count);
        suite.campaigns.schedule(task.getMassEmailId(), suite.command(task, LocalDateTime.now().plusHours(1), null));
        suite.jdbc.update("UPDATE crm_mass_email SET scheduled_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE mass_email_id=?", task.getMassEmailId());
        return suite.task(task.getMassEmailId());
    }

    private static CrmMassEmailCommand cancelCommand(CrmMassEmail task) {
        return new CrmMassEmailCommand(task.getVersion(), null, null, null, null, null);
    }

    private static void batchBoundaries(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail task = scheduled(suite, "201人竞争分批", 201);
        long before = suite.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'");
        Callable<Integer> dispatch = () -> suite.campaigns.dispatchBatch(task.getMassEmailId(), 1000);
        List<Integer> results = concurrent(suite, List.of(dispatch, dispatch));
        suite.equal(List.of(100, 100), results, "each concurrent dispatcher clamps a requested 1000 to at most 100 recipients");
        suite.equal(200L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=? AND status='QUEUED'", task.getMassEmailId()), "concurrent dispatchers claim two disjoint 100-person batches");
        suite.equal(200, suite.json.readTree(suite.task(task.getMassEmailId()).getDeliverySummary()).path("QUEUED").intValue(), "concurrent task summary includes the earlier committed batch");
        suite.equal(before + 200, suite.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'"), "two concurrent batches create exactly 200 durable outgoing events");
        suite.equal(1, suite.campaigns.dispatchBatch(task.getMassEmailId(), 1000), "third batch only claims the last frozen recipient");
        suite.equal(0, suite.campaigns.dispatchBatch(task.getMassEmailId(), 1000), "exhausted frozen audience is not queued again");
        suite.equal(before + 201, suite.scalar("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'"), "exhausted dispatch has no duplicate source events");
        suite.campaigns.cancel(task.getMassEmailId(), cancelCommand(suite.task(task.getMassEmailId())));
        int connections = suite.smtp.connections();
        suite.pump();
        suite.equal(connections, suite.smtp.connections(), "cancelling queued batches before consumption prevents all 201 external sends");
        suite.equal(201L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=? AND status='CANCELLED'", task.getMassEmailId()), "all 201 queued recipients preserve confirmed cancellation evidence");
        suite.equal(0L, suite.scalar("SELECT COUNT(*) FROM sys_message_delivery delivery JOIN crm_mass_email_recipient recipient ON recipient.tenant_id=delivery.tenant_id AND recipient.message_record_id=delivery.record_id WHERE recipient.mass_email_id=? AND (delivery.attempt_count!=0 OR delivery.status!='SKIPPED')", task.getMassEmailId()), "cancelled batches consume no provider attempt in the central delivery ledger");
    }

    private static void cancelRace(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail task = scheduled(suite, "取消与领取竞争", 2);
        Callable<Integer> dispatch = () -> suite.campaigns.dispatchBatch(task.getMassEmailId(), 100);
        Callable<Integer> cancel = () -> {
            try { suite.campaigns.cancel(task.getMassEmailId(), cancelCommand(task)); return 1; }
            catch (CrmBusinessException changed) {
                if (!"邮件任务已变化，请刷新后重试".equals(changed.getMessage())) throw changed;
                return 0;
            }
        };
        concurrent(suite, List.of(dispatch, cancel));
        CrmMassEmail latest = suite.task(task.getMassEmailId());
        if (!"CANCELLED".equals(latest.getStatus())) suite.campaigns.cancel(task.getMassEmailId(), cancelCommand(latest));
        int connections = suite.smtp.connections();
        suite.pump();
        suite.equal(connections, suite.smtp.connections(), "cancel racing dispatch blocks every not-started provider call");
        suite.equal("CANCELLED", suite.task(task.getMassEmailId()).getStatus(), "late delivery events preserve the cancelled task state");
        suite.equal(2L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=? AND status IN ('CANCELLED','SKIPPED')", task.getMassEmailId()), "both race orderings preserve each recipient with an explicit stopped status");
    }

    private static void observations(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail task = CrmEmailBoundaryDatabaseChecks.draft(suite, "真实并发观察", 1);
        suite.send(task); suite.pump();
        CrmMassEmailRecipient recipient = suite.recipients(task.getMassEmailId()).get(0);
        suite.equal("SENT", recipient.getStatus(), "observation race uses a genuinely accepted SMTP delivery");
        String opening = suite.tokens(recipient, "open").get(0);
        String clicking = suite.tokens(recipient, "click").get(0);
        String unsubscribe = suite.tokens(recipient, "unsubscribe").get(0);
        Callable<Integer> operation = () -> {
            suite.tracking.open(opening, "e5-concurrency", "192.0.2.17");
            suite.tracking.click(clicking, "e5-concurrency", "192.0.2.17");
            suite.tracking.unsubscribe(unsubscribe, "重复并发确认", "e5-concurrency", "192.0.2.17");
            return 1;
        };
        suite.equal(8, concurrent(suite, java.util.Collections.nCopies(8, operation)).stream().mapToInt(Integer::intValue).sum(), "all concurrent public observations complete");
        for (String action : List.of("OPENED", "CLICKED", "UNSUBSCRIBED")) {
            suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM crm_campaign_log WHERE tenant_id=? AND source_event_key=?", suite.TENANT, "MAIL:" + recipient.getRecipientId() + ":" + action), "parallel observations retain one unique " + action + " fact");
        }
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM crm_email_suppression WHERE tenant_id=? AND email_hash=?", suite.TENANT, recipient.getEmailHash()), "concurrent unsubscribe produces one durable suppression");
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM crm_campaign WHERE campaign_id=? AND opened_count=1 AND clicked_count=1 AND unsubscribed_count=1", task.getCampaignId()), "campaign counters equal the three unique observation facts after contention");
    }

    private static List<Integer> concurrent(CrmEmailDatabaseChecks suite, List<Callable<Integer>> operations) throws Exception {
        CountDownLatch ready = new CountDownLatch(operations.size());
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService executor = Executors.newFixedThreadPool(operations.size());
        List<Future<Integer>> futures = new ArrayList<>();
        try {
            for (Callable<Integer> operation : operations) futures.add(executor.submit(() -> {
                suite.identity(10); ready.countDown();
                try {
                    if (!start.await(20, TimeUnit.SECONDS)) throw new IllegalStateException("Concurrent release timed out");
                    return operation.call();
                } finally { UserContext.clear(); TenantContext.clear(); }
            }));
            suite.check(ready.await(20, TimeUnit.SECONDS), "all email concurrency workers reached the start barrier");
            start.countDown();
            List<Integer> results = new ArrayList<>();
            for (Future<Integer> future : futures) results.add(future.get(90, TimeUnit.SECONDS));
            suite.concurrentGroups++;
            return results;
        } finally { start.countDown(); executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); }
    }
}

package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import java.time.LocalTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class MessageDeliveryPolicyChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = ChannelSendResult::success;
        suite.jdbc.update("INSERT INTO sys_message_template(template_id,tenant_id,template_code,template_name,channel_type,content_template,title_template,params_declare) VALUES (500,?,'DELIVERY_POLICY','策略核验','EMAIL','<p>${name}</p>','策略邮件','[{\"name\":\"name\",\"required\":true}]')", suite.TENANT);
        AtomicBoolean sourceValid = new AtomicBoolean(true);
        MessageDeliverySourceGuard guard = new MessageDeliverySourceGuard() {
            public boolean supports(String module, String business) { return "cloudflow-auth".equals(module) && "FIXTURE".equals(business); }
            public String rejectionCode(MessageDeliveryPayload payload) { return sourceValid.get() ? null : "SOURCE_CANCELLED"; }
        };
        MessageDeliveryService worker = suite.service(suite.senderFactory, List.of(guard));
        MessageSendRequest request = suite.request("policy@example.com").toBuilder().templateCode("DELIVERY_POLICY")
                .content(null).title(null).bizType("FIXTURE").bizId("policy-source").params(Map.of("name", "<script>untrusted</script>")).build();
        SysMessageRecord first = suite.reserve(request);
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, first.getRecordId()).getSendStatus()), "first valid template business message is accepted");
        MessageDeliveryPayload protectedPayload = suite.json.readValue(suite.cipher.decrypt(suite.deliveries.findByRecord(suite.TENANT, first.getRecordId()).getPayloadEncrypted()), MessageDeliveryPayload.class);
        suite.check(protectedPayload.context().getContent().contains("&lt;script&gt;") && !protectedPayload.context().getContent().contains("<script>"), "template parameter markup is escaped before delivery");
        int sends = suite.sends.get();
        SysMessageRecord duplicate = suite.reserve(request);
        SysMessageRecord deduped = worker.deliverRecord(suite.TENANT, duplicate.getRecordId());
        suite.check("SKIPPED".equals(deduped.getSendStatus()) && "DEDUPED".equals(deduped.getSkipReason()), "different events obey the configured template receiver business window");
        suite.check(suite.sends.get() == sends, "deduplication prevents the second external transport call");
        concurrentDedupe(suite, worker, request.toBuilder().bizId("concurrent-policy-source").build());
        SysMessageRecord different = suite.reserve(request.toBuilder().bizId("different-source").build());
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, different.getRecordId()).getSendStatus()), "different business sources are not deduplicated together");
        SysMessageRecord missing = suite.reserve(request.toBuilder().params(Map.of()).build());
        suite.check("FAILED".equals(missing.getSendStatus()) && missing.getErrorMsg().contains("name"), "missing template parameter records FAILED with its parameter name");
        SysMessageRecord stale = suite.reserve(request.toBuilder().bizId("stale-template").build());
        suite.jdbc.update("UPDATE sys_message_template SET version=version+1 WHERE template_id=500");
        suite.check("TEMPLATE_CHANGED".equals(worker.deliverRecord(suite.TENANT, stale.getRecordId()).getSkipReason()), "template revision after reserve prevents stale external content");
        suite.jdbc.update("UPDATE sys_message_template SET status='DISABLED' WHERE template_id=500");
        SysMessageRecord disabled = suite.reserve(request.toBuilder().content("explicit body").renderedContent(true).build());
        suite.check("FAILED".equals(disabled.getSendStatus()), "direct content cannot bypass an explicitly disabled named template");
        suite.jdbc.update("UPDATE sys_message_template SET status='ENABLED' WHERE template_id=500");
        sourceValid.set(false);
        SysMessageRecord invalid = suite.reserve(request.toBuilder().bizId("cancelled-source").build());
        suite.check("SOURCE_CANCELLED".equals(worker.deliverRecord(suite.TENANT, invalid.getRecordId()).getSkipReason()), "source cancellation after reserve prevents external send");
        sourceValid.set(true);
        subscriptions(suite, worker, request);
        fallbackAndQuotas(suite);
        System.out.println("MESSAGE_POLICY_BOUNDARY: real_database=true; source_guard_fixture=true; transport_recorders=true; production_sources_not_claimed=true");
    }

    static void concurrentDedupe(MessageDeliveryDatabaseChecks suite, MessageDeliveryService worker, MessageSendRequest request) throws Exception {
        List<SysMessageRecord> records = List.of(suite.reserve(request), suite.reserve(request));
        CountDownLatch ready = new CountDownLatch(2);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        int before = suite.sends.get();
        try {
            List<Future<String>> futures = records.stream().map(record -> executor.submit(() -> {
                UserContext.setTenantId(suite.TENANT);
                try {
                    ready.countDown();
                    if (!ready.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("CHECK_BARRIER_TIMEOUT");
                    return worker.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus();
                } finally { UserContext.clear(); }
            })).toList();
            List<String> statuses = List.of(futures.get(0).get(15, TimeUnit.SECONDS), futures.get(1).get(15, TimeUnit.SECONDS));
            suite.check(statuses.contains("SUCCESS") && statuses.contains("SKIPPED") && suite.sends.get() == before + 1, "concurrent different events for one business recipient send exactly once");
        } finally { executor.shutdownNow(); }
    }

    static void subscriptions(MessageDeliveryDatabaseChecks suite, MessageDeliveryService worker, MessageSendRequest template) {
        suite.jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,email) VALUES (2,?,'policy-recipient','接收人','member@example.com')", suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_message_subscribe(tenant_id,user_id,message_category,channel_type,enabled_flag) VALUES (?,2,'SYSTEM','EMAIL',0)", suite.TENANT);
        MessageSendRequest request = template.toBuilder().receivers(List.of(MessageReceiver.builder().receiverType("USER").receiverId(2L).build())).build();
        SysMessageRecord unsubscribed = suite.reserve(request.toBuilder().bizId("unsubscribed").build());
        suite.check("UNSUBSCRIBED".equals(worker.deliverRecord(suite.TENANT, unsubscribed.getRecordId()).getSkipReason()), "user subscription is checked again before external send");
        LocalTime start = LocalTime.now().minusMinutes(1).withNano(0);
        LocalTime end = LocalTime.now().plusMinutes(5).withNano(0);
        suite.jdbc.update("UPDATE sys_message_subscribe SET enabled_flag=1,quiet_start=?,quiet_end=? WHERE user_id=2", java.sql.Time.valueOf(start), java.sql.Time.valueOf(end));
        SysMessageRecord quiet = suite.reserve(request.toBuilder().bizId("quiet-hours").build());
        suite.check("PENDING".equals(worker.deliverRecord(suite.TENANT, quiet.getRecordId()).getSendStatus()), "quiet hours retain a pending delivery without a transport attempt");
        SysMessageDelivery deferred = suite.deliveries.findByRecord(suite.TENANT, quiet.getRecordId());
        suite.check(deferred.getAttemptCount() == 0 && deferred.getNextAttemptTime() != null && "QUIET_HOURS".equals(deferred.getLastErrorCode()), "quiet-hours next attempt and zero actual attempts are persisted");
        suite.jdbc.update("UPDATE sys_message_subscribe SET quiet_start=NULL,quiet_end=NULL WHERE user_id=2");
        suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE record_id=?", quiet.getRecordId());
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, quiet.getRecordId()).getSendStatus()), "expired quiet-hours delivery resumes through normal validation");
        suite.jdbc.update("UPDATE sys_message_subscribe SET enabled_flag=0,quiet_start=?,quiet_end=? WHERE user_id=2", java.sql.Time.valueOf(start), java.sql.Time.valueOf(end));
        suite.jdbc.update("UPDATE sys_message_template SET force_send_flag=1 WHERE template_id=500");
        SysMessageRecord forced = suite.reserve(request.toBuilder().bizId("forced-security").build());
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, forced.getRecordId()).getSendStatus()), "approved forced template bypasses quiet hours and subscription");
        suite.jdbc.update("UPDATE sys_message_template SET force_send_flag=0 WHERE template_id=500");
        SysMessageRecord inactive = suite.reserve(request.toBuilder().bizId("disabled-recipient").build());
        suite.jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=2");
        suite.check("RECEIVER_UNAVAILABLE".equals(worker.deliverRecord(suite.TENANT, inactive.getRecordId()).getSkipReason()), "disabled recipient cannot receive even already reserved messages");
    }

    static void fallbackAndQuotas(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,retry_interval_sec) VALUES (101,?,'EMAIL','fallback-mail','备用邮件','ENABLED',1,20,1,1)", suite.TENANT);
        List<Long> calls = new CopyOnWriteArrayList<>();
        AtomicBoolean uncertain = new AtomicBoolean();
        AtomicBoolean temporary = new AtomicBoolean();
        MessageChannelSender transport = new MessageChannelSender() {
            public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
            public boolean implemented() { return true; }
            public ChannelSendResult send(ChannelSendContext context) {
                suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "fallback transport executes outside database transactions");
                calls.add(context.getChannelId());
                if (uncertain.get()) return ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
                if (temporary.get()) return ChannelSendResult.retryable("SMTP_REJECTED_450");
                return context.getChannelId() == 101L || context.getChannelId() == 203L
                        ? ChannelSendResult.success() : ChannelSendResult.failed("SMTP_REJECTED_550");
            }
        };
        MessageDeliveryService worker = suite.service(new MessageChannelSenderFactory(List.of(transport)));
        SysMessageRecord record = suite.reserve(suite.request("fallback@example.com"));
        suite.check("RETRYABLE".equals(worker.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus()), "known primary refusal queues the next configured channel");
        SysMessageRecord fallbackResult = whenDue(suite, worker, record);
        suite.check("SUCCESS".equals(fallbackResult.getSendStatus()) && calls.equals(List.of(100L, 101L)), "fallback follows configured priority and accepts on the second channel");
        uncertain.set(true);
        SysMessageRecord unknown = suite.reserve(suite.request("unknown-fallback@example.com"));
        int before = calls.size();
        worker.deliverRecord(suite.TENANT, unknown.getRecordId());
        worker.deliverRecord(suite.TENANT, unknown.getRecordId());
        suite.check(calls.size() == before + 1 && "UNKNOWN".equals(suite.deliveries.findByRecord(suite.TENANT, unknown.getRecordId()).getStatus()), "unknown primary outcome never falls back or retries");
        uncertain.set(false);
        temporary.set(true);
        calls.clear();
        SysMessageRecord retries = suite.reserve(suite.request("retry-limits@example.com"));
        for (int attempt = 0; attempt < 5; attempt++) {
            suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE record_id=?", retries.getRecordId());
            worker.deliverRecord(suite.TENANT, retries.getRecordId());
        }
        suite.check(calls.equals(List.of(100L, 100L, 100L, 101L, 101L)) && "FAILED".equals(suite.deliveries.findByRecord(suite.TENANT, retries.getRecordId()).getStatus()), "retry budgets are per channel and exhaustion produces one terminal failure");
        temporary.set(false);
        suite.jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE channel_id IN (100,101)");
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,rate_limit_minute,daily_limit) VALUES (202,?,'EMAIL','quota-primary','限额主邮件','ENABLED',1,10,0,1,NULL),(203,?,'EMAIL','quota-secondary','限额备用邮件','ENABLED',1,20,0,NULL,2)", suite.TENANT, suite.TENANT);
        SysMessageRecord primary = suite.reserve(suite.request("quota-fallback@example.com"));
        worker.deliverRecord(suite.TENANT, primary.getRecordId());
        SysMessageRecord blocked = suite.reserve(suite.request("quota-blocked@example.com"));
        suite.check("PENDING".equals(worker.deliverRecord(suite.TENANT, blocked.getRecordId()).getSendStatus()), "primary minute quota still counts attempts after the record switches channels");
        suite.check(suite.deliveries.findByRecord(suite.TENANT, blocked.getRecordId()).getAttemptCount() == 0, "quota defer consumes no transport attempt");
        suite.check("SUCCESS".equals(whenDue(suite, worker, primary).getSendStatus()), "secondary channel has an independent quota");
        suite.jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE channel_id=202");
        SysMessageRecord second = suite.reserve(suite.request("quota-second@example.com"));
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, second.getRecordId()).getSendStatus()), "second acceptance exactly reaches the daily quota");
        SysMessageRecord third = suite.reserve(suite.request("quota-third@example.com"));
        suite.check("PENDING".equals(worker.deliverRecord(suite.TENANT, third.getRecordId()).getSendStatus()), "next recipient cannot exceed the exact daily quota without Redis");
        suite.jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE channel_id IN (101,202,203)");
        suite.jdbc.update("UPDATE sys_message_channel SET status='ENABLED' WHERE channel_id=100");
    }

    static SysMessageRecord whenDue(MessageDeliveryDatabaseChecks suite, MessageDeliveryService worker, SysMessageRecord record) throws Exception {
        SysMessageDelivery queued = suite.deliveries.findByRecord(suite.TENANT, record.getRecordId());
        if (queued.getNextAttemptTime() != null) {
            long delay = java.time.Duration.between(java.time.LocalDateTime.now(), queued.getNextAttemptTime()).toMillis();
            if (delay > 1200) throw new AssertionError("unexpected fallback delay");
            if (delay > 0) Thread.sleep(delay + 20);
        }
        return worker.deliverRecord(suite.TENANT, record.getRecordId());
    }
}

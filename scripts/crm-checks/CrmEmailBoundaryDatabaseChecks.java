package com.cloudflow.crm.service.email;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageDeliverySnapshot;
import com.cloudflow.crm.domain.*;
import com.cloudflow.crm.domain.dto.CrmMassEmailCommand;
import com.cloudflow.crm.domain.dto.CrmMassEmailDraft;
import com.cloudflow.crm.mapper.*;
import com.cloudflow.crm.service.impl.CrmRecordSupport;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

final class CrmEmailBoundaryDatabaseChecks {
    static void run(CrmEmailDatabaseChecks suite) throws Exception {
        rollbackAndConcurrency(suite);
        sourceBoundary(suite);
        resendAndOrdering(suite);
        contactUnsubscribe(suite);
        CrmEmailConcurrencyDatabaseChecks.run(suite);
        quota(suite);
        System.out.println("E5_BOUNDARIES: rollback=true; concurrent_single_winner=true; cancel_unstarted=true; corrupt_snapshot_isolated=true; permission_revocation=true; last_boundary_unsubscribe=true; source_outage_preserves_attempt=true; verified_resend=true; stale_result_rejected=true; contact_suppression=true; durable_quota=true");
    }

    static CrmMassEmail draft(CrmEmailDatabaseChecks suite, String label, int count) {
        CrmCampaign campaign = suite.campaign(label);
        CrmLead[] leads = new CrmLead[count];
        for (int index = 0; index < count; index++) leads[index] = suite.lead(label + index, "mail-" + UUID.randomUUID() + "@example.com", 10, 0);
        suite.list(campaign, false, leads); return suite.draft(campaign);
    }

    private static void rollbackAndConcurrency(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail rollback = draft(suite, "事务回滚", 2);
        suite.jdbc.update("UPDATE sys_message_template SET content_template=? WHERE template_id=100", "<a href='https://evil.example.com/'>reject</a>");
        long beforeLinks = suite.scalar("SELECT COUNT(*) FROM crm_email_tracking_link");
        suite.rejects(() -> suite.send(rollback), "invalid content rejects after placeholder insert in transaction");
        suite.equal(0L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=?", rollback.getMassEmailId()), "failed freeze rolls back all recipients");
        suite.equal(beforeLinks, suite.scalar("SELECT COUNT(*) FROM crm_email_tracking_link"), "failed freeze rolls back generated links");
        suite.equal("DRAFT", suite.task(rollback.getMassEmailId()).getStatus(), "failed freeze retains draft status");
        suite.jdbc.update("UPDATE sys_message_template SET content_template=? WHERE template_id=100", suite.HTML);
        CrmMassEmail concurrent = draft(suite, "并发单胜", 2);
        CrmMassEmailCommand command = suite.command(concurrent, LocalDateTime.now().plusHours(1), null);
        CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1); ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<Integer> operation = () -> {
                suite.identity(10); ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("start timeout");
                try { suite.campaigns.schedule(concurrent.getMassEmailId(), command); return 1; }
                catch (RuntimeException expectedConflict) { return 0; }
                finally { UserContext.clear(); com.cloudflow.common.tenant.TenantContext.clear(); }
            };
            Future<Integer> first = executor.submit(operation); Future<Integer> second = executor.submit(operation);
            suite.check(ready.await(10, TimeUnit.SECONDS), "both concurrent writers ready"); start.countDown();
            suite.equal(1, first.get(30, TimeUnit.SECONDS) + second.get(30, TimeUnit.SECONDS), "concurrent schedule has one winner"); suite.concurrentGroups++;
        } finally { executor.shutdownNow(); executor.awaitTermination(10, TimeUnit.SECONDS); }
        suite.equal(2, suite.recipients(concurrent.getMassEmailId()).size(), "single frozen audience under concurrent schedule");
        suite.jdbc.update("UPDATE crm_mass_email SET scheduled_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE mass_email_id=?", concurrent.getMassEmailId());
        suite.equal(1, suite.campaigns.dispatchBatch(concurrent.getMassEmailId(), 1), "small dispatch queues only requested prefix");
        CrmMassEmail cancelling = suite.task(concurrent.getMassEmailId());
        suite.campaigns.cancel(cancelling.getMassEmailId(), new CrmMassEmailCommand(cancelling.getVersion(), null, false, null, null, null));
        suite.equal("CANCELLED", suite.task(cancelling.getMassEmailId()).getStatus(), "cancel status actually persists");
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=? AND status='CANCELLED'", cancelling.getMassEmailId()), "unpublished recipient cancelled immediately");
        int before = suite.smtp.count(); suite.pump();
        suite.equal(before, suite.smtp.count(), "already queued but unstarted recipient prevented by source check");
        suite.equal(2L, suite.scalar("SELECT COUNT(*) FROM crm_mass_email_recipient WHERE mass_email_id=? AND status='CANCELLED'", cancelling.getMassEmailId()), "auth confirms queued cancellation without changing sent facts");
        CrmMassEmail damaged = draft(suite, "单条快照损坏", 2);
        suite.campaigns.schedule(damaged.getMassEmailId(), suite.command(damaged, LocalDateTime.now().plusHours(1), null));
        List<CrmMassEmailRecipient> recipients = suite.recipients(damaged.getMassEmailId());
        suite.jdbc.update("UPDATE crm_mass_email_recipient SET variable_snapshot_encrypted='damaged' WHERE recipient_id=?", recipients.get(0).getRecipientId());
        suite.jdbc.update("UPDATE crm_mass_email SET scheduled_time=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE mass_email_id=?", damaged.getMassEmailId());
        suite.equal(2, suite.campaigns.dispatchBatch(damaged.getMassEmailId(), 100), "bad snapshot does not poison remaining batch");
        suite.pump();
        suite.equal("FAILED", suite.recipient(recipients.get(0).getRecipientId()).getStatus(), "corrupt recipient fails closed");
        suite.equal("SENT", suite.recipient(recipients.get(1).getRecipientId()).getStatus(), "healthy recipient still reaches SMTP");
        suite.equal("PARTIAL", suite.task(damaged.getMassEmailId()).getStatus(), "mixed actual outcomes represented as partial");
    }

    private static void sourceBoundary(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail revoked = draft(suite, "权限收回", 1); suite.send(revoked);
        suite.jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=? AND role_id=9 AND menu_id=1615", suite.TENANT);
        int connections = suite.smtp.connections(); suite.pump();
        suite.equal(connections, suite.smtp.connections(), "revoked DB permission stops send without Redis snapshot dependence");
        suite.equal("SKIPPED", suite.recipients(revoked.getMassEmailId()).get(0).getStatus(), "revoked source represented as skipped");
        suite.jdbc.update("INSERT INTO sys_role_menu (tenant_id,role_id,menu_id) VALUES (?,9,1615)", suite.TENANT);
        CrmMassEmail unsubscribe = draft(suite, "发送前退订", 1); suite.send(unsubscribe);
        CrmMassEmailRecipient selected = suite.recipients(unsubscribe.getMassEmailId()).get(0);
        String token = suite.tokens(selected, "unsubscribe").get(0);
        suite.boundaryAction = () -> suite.tracking.unsubscribe(token, null, "e5-boundary", "192.0.2.11");
        connections = suite.smtp.connections(); suite.pump();
        suite.equal(connections, suite.smtp.connections(), "unsubscribe after durable SENDING but before sender prevents external contact");
        CrmMassEmailRecipient stopped = suite.recipients(unsubscribe.getMassEmailId()).get(0);
        suite.equal("SKIPPED", stopped.getStatus(), "boundary unsubscribe is skipped");
        suite.equal(0, suite.deliveries.findByRecord(suite.TENANT, stopped.getMessageRecordId()).getAttemptCount(), "stopped boundary does not consume real send attempt");
        CrmMassEmail unavailable = draft(suite, "来源临时不可用", 1); suite.send(unavailable); suite.boundaryUnavailable = true;
        connections = suite.smtp.connections(); suite.pump();
        CrmMassEmailRecipient pendingRecipient = suite.recipients(unavailable.getMassEmailId()).get(0);
        long recordId = suite.scalar("SELECT record_id FROM sys_message_record WHERE tenant_id=? AND biz_type='CRM_MASS_EMAIL' AND biz_id=?", suite.TENANT, String.valueOf(pendingRecipient.getRecipientId()));
        SysMessageDelivery pending = suite.deliveries.findByRecord(suite.TENANT, recordId);
        suite.equal("PENDING", pending.getStatus(), "temporary last-boundary outage returns to pending");
        suite.equal(0, pending.getAttemptCount(), "temporary last-boundary outage preserves attempts and quotas");
        suite.equal(connections, suite.smtp.connections(), "temporary last-boundary outage never connects SMTP");
        suite.check(pending.getNextAttemptTime().isAfter(LocalDateTime.now()), "temporary source outage has bounded retry delay");
        suite.boundaryUnavailable = false;
        suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE delivery_id=?", pending.getDeliveryId());
        suite.deliveries.deliverRecord(suite.TENANT, recordId); suite.outcomes();
        suite.equal("SENT", suite.recipient(pendingRecipient.getRecipientId()).getStatus(), "same queued source recovers once available");
        suite.equal(1, suite.deliveries.findByRecord(suite.TENANT, recordId).getAttemptCount(), "only actual SMTP attempt counted after recovery");
        CrmMassEmail changedTemplate = draft(suite, "冻结后模板变化", 1); suite.send(changedTemplate);
        suite.jdbc.update("UPDATE sys_message_template SET force_send_flag=1 WHERE template_id=100");
        connections = suite.smtp.connections(); suite.pump();
        suite.equal(connections, suite.smtp.connections(), "template force-send changed after freezing cannot bypass suppression policy");
        suite.equal("SKIPPED", suite.recipients(changedTemplate.getMassEmailId()).get(0).getStatus(), "rejected force-template result still projects to CRM");
        suite.jdbc.update("UPDATE sys_message_template SET force_send_flag=0 WHERE template_id=100");
    }

    private static void resendAndOrdering(CrmEmailDatabaseChecks suite) throws Exception {
        CrmMassEmail retry = draft(suite, "明确拒收重发", 1); suite.send(retry); suite.smtp.mode("PERMANENT"); suite.pump();
        CrmMassEmailRecipient failed = suite.recipients(retry.getMassEmailId()).get(0);
        suite.equal("FAILED", failed.getStatus(), "SMTP permanent refusal projected as failure");
        suite.equal(1, suite.mapper(CrmCampaignMapper.class).selectById(retry.getCampaignId()).getBouncedCount(), "explicit SMTP refusal counted as bounce");
        long originalRecord = failed.getMessageRecordId();
        suite.check(suite.deliveries.requestResend(suite.TENANT, originalRecord), "central message service registers legal failed resend");
        suite.check(suite.deliveries.requestResend(suite.TENANT, originalRecord), "duplicate resend request returns idempotent registration");
        int before = suite.smtp.count(); suite.smtp.mode("ACCEPT"); suite.pump();
        CrmMassEmailRecipient sent = suite.recipient(failed.getRecipientId());
        suite.equal(before + 1, suite.smtp.count(), "duplicate resend registration invokes SMTP only once");
        suite.equal("SENT", sent.getStatus(), "accepted resend replaces failed current projection");
        suite.check(!sent.getMessageRecordId().equals(originalRecord), "resend keeps original message and links new one");
        suite.equal(1, suite.task(retry.getMassEmailId()).getSentCount(), "resend does not count recipient twice");
        suite.equal(0, suite.mapper(CrmCampaignMapper.class).selectById(retry.getCampaignId()).getBouncedCount(), "eventual acceptance removes old failure from current bounce rate");
        BusinessEventEnvelope old = suite.envelope(suite.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_DELIVERY_RESULT' AND aggregate_id=? ORDER BY id LIMIT 1", String.class, failed.getDeliveryId()));
        suite.source.deliveryEvent(old);
        suite.equal(sent.getMessageRecordId(), suite.recipient(failed.getRecipientId()).getMessageRecordId(), "late prior-record callback cannot overwrite accepted resend");
        CrmMassEmail uncertain = draft(suite, "未明与核验", 1); suite.send(uncertain); suite.smtp.mode("UNKNOWN"); suite.pump();
        CrmMassEmailRecipient unknown = suite.recipients(uncertain.getMassEmailId()).get(0);
        suite.equal("UNKNOWN", unknown.getStatus(), "disconnect after DATA remains unknown");
        suite.equal("UNKNOWN", suite.task(uncertain.getMassEmailId()).getStatus(), "task distinguishes unknown from success");
        suite.equal(0, suite.mapper(CrmCampaignMapper.class).selectById(uncertain.getCampaignId()).getDeliveredCount(), "unknown does not count as delivery");
        suite.check(!suite.deliveries.requestResend(suite.TENANT, unknown.getMessageRecordId()), "unverified unknown cannot be resent");
        MessageDeliverySnapshot captured = suite.deliveries.businessSnapshot(suite.TENANT, unknown.getMessageRecordId(), "cloudflow-service-crm");
        SysMessageDelivery delivery = suite.deliveries.findByRecord(suite.TENANT, unknown.getMessageRecordId());
        suite.deliveries.recordResolution(suite.TENANT, delivery.getDeliveryId(), UserContext.getUserId(), delivery.getVersion(), "NOT_ACCEPTED", "Isolated provider evidence confirms no final SMTP acceptance."); suite.outcomes();
        suite.equal("FAILED", suite.recipient(unknown.getRecipientId()).getStatus(), "verified nonacceptance projects as failed");
        BusinessEventEnvelope announced = BusinessEventEnvelope.builder().sourceModule("cloudflow-auth").tenantId(suite.TENANT).payload(suite.json.writeValueAsString(captured.result())).build();
        suite.capturedReads.put(unknown.getMessageRecordId(), captured);
        try { suite.source.deliveryEvent(announced); } finally { suite.capturedReads.clear(); }
        suite.equal("FAILED", suite.recipient(unknown.getRecipientId()).getStatus(), "captured stale auth result cannot regress newer persisted version");
        suite.check(suite.deliveries.requestResend(suite.TENANT, unknown.getMessageRecordId()), "verified not-accepted permits explicit resend");
        suite.smtp.mode("ACCEPT"); suite.pump();
        suite.equal("SENT", suite.recipient(unknown.getRecipientId()).getStatus(), "verified resend completes true SMTP acceptance");
        suite.equal(1, suite.task(uncertain.getMassEmailId()).getSentCount(), "verified resend increments only once");
    }

    private static void contactUnsubscribe(CrmEmailDatabaseChecks suite) throws Exception {
        CrmCustomer customer = new CrmCustomer(); customer.setCustomerCode("E5-" + UUID.randomUUID()); customer.setCustomerName("联系人抑制测试");
        customer.setOwnerId(10L); customer.setDeptId(100L); customer.setStatus("ACTIVE"); customer.setUnsubscribeFlag(0); CrmRecordSupport.create(customer, "customerId"); suite.mapper(CrmCustomerMapper.class).insert(customer);
        CrmCampaign campaign = suite.campaign("CONTACT退订"); CrmTargetList list = suite.list(campaign, false);
        for (int index = 0; index < 2; index++) {
            CrmContact contact = new CrmContact(); contact.setCustomerId(customer.getCustomerId()); contact.setContactName("Contact " + index); contact.setEmail("contact" + index + "@example.com");
            CrmRecordSupport.create(contact, "contactId"); suite.mapper(CrmContactMapper.class).insert(contact);
            CrmTargetListMember member = new CrmTargetListMember(); member.setListId(list.getListId()); member.setMemberType("CONTACT"); member.setMemberRefId(contact.getContactId()); member.setMemberName(contact.getContactName());
            CrmRecordSupport.create(member, "memberId"); suite.mapper(CrmTargetListMemberMapper.class).insert(member);
        }
        CrmMassEmail task = suite.draft(campaign); suite.send(task); suite.pump();
        CrmMassEmailRecipient recipient = suite.recipients(task.getMassEmailId()).get(0);
        suite.tracking.unsubscribe(suite.tokens(recipient, "unsubscribe").get(0), "不再接收这类邮件", "contact-check", "192.0.2.14");
        suite.equal("不再接收这类邮件", suite.jdbc.queryForObject("SELECT reason FROM crm_email_suppression WHERE tenant_id=? AND email_hash=?", String.class, suite.TENANT, recipient.getEmailHash()), "ordinary unsubscribe reason is preserved unchanged");
        suite.equal(0L, suite.scalar("SELECT unsubscribe_flag FROM crm_customer WHERE customer_id=?", customer.getCustomerId()), "CONTACT unsubscribe does not opt out entire company");
        suite.equal(1, suite.audience.collect(campaign.getCampaignId(), suite.access.current()).recipients().size(), "only matching contact mailbox suppressed");
    }

    private static void quota(CrmEmailDatabaseChecks suite) throws Exception {
        suite.jdbc.update("INSERT INTO sys_message_channel (channel_id,tenant_id,channel_code,channel_name,channel_type,status,implemented_flag,priority,retry_count,retry_interval_sec,smtp_host,smtp_port,smtp_ssl_flag,smtp_username,smtp_pwd_cipher,from_address,from_name,rate_limit_minute,daily_limit,deleted,version) VALUES (101,?,'quota','E5 quota','EMAIL','ENABLED',1,1,0,1,'localhost',?,0,'fixture-user',?,'sender@example.com','CloudFlow',1,1,0,0)", suite.TENANT, suite.smtp.port(), suite.cipher.encrypt("fixture-password"));
        CrmMassEmail task = draft(suite, "持久限额", 2); suite.send(task); int before = suite.smtp.count(); suite.pump();
        suite.equal(before + 1, suite.smtp.count(), "one-minute and daily quotas allow only one actual SMTP acceptance");
        suite.equal(1L, suite.scalar("SELECT COUNT(*) FROM sys_message_delivery delivery JOIN sys_message_record record ON record.record_id=delivery.record_id WHERE record.channel_id=101 AND delivery.status='PENDING' AND delivery.attempt_count=0"), "quota-deferred recipient preserves zero attempts");
        suite.equal("SENDING", suite.task(task.getMassEmailId()).getStatus(), "quota-deferred task never reports complete");
        suite.equal(1, suite.task(task.getMassEmailId()).getSentCount(), "partial accepted count reflects actual quota-limited sends");
        suite.deliveries.processDue(suite.TENANT, 100); suite.outcomes();
        suite.equal(before + 1, suite.smtp.count(), "repeat worker cannot bypass durable daily quota");
        suite.equal(1, suite.jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE tenant_id=? AND channel_id=101 AND channel_code='quota'",
                suite.TENANT), "disable only the owned quota-test channel before subsequent mail cases");
    }
}

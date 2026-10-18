package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.common.message.channel.ChannelSendResult;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class MessageSendBoundaryChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = ChannelSendResult::success;
        for (String reason : List.of("UNSUBSCRIBED", "SOURCE_UNAVAILABLE")) {
            Guard guard = new Guard(suite); guard.boundaryReason = reason;
            MessageDeliveryService worker = suite.service(suite.senderFactory, List.of(guard));
            SysMessageRecord record = suite.reserve(suite.request("boundary-" + UUID.randomUUID() + "@example.test").toBuilder().bizType("LAST_BOUNDARY_TEST").bizId("1").build());
            int before = suite.sends.get();
            SysMessageRecord actual = worker.deliverRecord(suite.TENANT, record.getRecordId());
            SysMessageDelivery delivery = worker.findByRecord(suite.TENANT, record.getRecordId());
            suite.check("SOURCE_UNAVAILABLE".equals(reason) ? "PENDING".equals(actual.getSendStatus()) : "SKIPPED".equals(actual.getSendStatus()), "last-boundary rejection has explicit nonacceptance state");
            suite.check(guard.calls == 3 && suite.sends.get() == before, "opt-in third source check prevents transport invocation");
            suite.check(delivery.getAttemptCount() == 0 && payload(suite, delivery.getPayloadEncrypted()).attempts().isEmpty(), "last-boundary rejection restores durable quota and attempt history");
            suite.check(delivery.getClaimOwner() == null && delivery.getClaimUntil() == null && delivery.getSendStartedTime() == null && actual.getSendTime() == null, "unstarted delivery clears send and lease markers");
            if ("SOURCE_UNAVAILABLE".equals(reason)) {
                suite.check(delivery.getNextAttemptTime().isAfter(LocalDateTime.now()), "last-boundary temporary outage schedules delayed retry");
                guard.boundaryReason = null;
                suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE delivery_id=?", delivery.getDeliveryId());
                suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus()), "last-boundary source recovery sends same pending record");
                suite.check(worker.findByRecord(suite.TENANT, record.getRecordId()).getAttemptCount() == 1 && suite.sends.get() == before + 1, "source recovery counts exactly one real attempt");
            }
        }
        Guard guard = new Guard(suite);
        MessageDeliveryService worker = suite.service(suite.senderFactory, List.of(guard));
        SysMessageRecord missing = suite.reserve(suite.request("missing-id-" + UUID.randomUUID() + "@example.test").toBuilder().bizType("LAST_BOUNDARY_TEST").build());
        int beforeMissing = suite.sends.get();
        suite.check("SKIPPED".equals(worker.deliverRecord(suite.TENANT, missing.getRecordId()).getSendStatus()) && suite.sends.get() == beforeMissing, "protected source without business identity cannot bypass source guard");
        SysMessageRecord record = suite.reserve(suite.request("prior-attempt-" + UUID.randomUUID() + "@example.test").toBuilder().bizType("LAST_BOUNDARY_TEST").bizId("1").build());
        try {
            suite.outcome = () -> ChannelSendResult.retryable("SMTP_REJECTED_450");
            SysMessageRecord retryable = worker.deliverRecord(suite.TENANT, record.getRecordId());
            SysMessageDelivery first = worker.findByRecord(suite.TENANT, record.getRecordId());
            List<MessageDeliveryPayload.Attempt> history = payload(suite, first.getPayloadEncrypted()).attempts();
            suite.check("RETRYABLE".equals(retryable.getSendStatus()) && first.getAttemptCount() == 1, "real provider refusal creates first durable attempt");
            guard.boundaryReason = "SOURCE_UNAVAILABLE";
            suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE delivery_id=?", first.getDeliveryId());
            int before = suite.sends.get();
            SysMessageRecord deferred = worker.deliverRecord(suite.TENANT, record.getRecordId());
            SysMessageDelivery pending = worker.findByRecord(suite.TENANT, record.getRecordId());
            suite.check("PENDING".equals(deferred.getSendStatus()) && suite.sends.get() == before, "retry source outage prevents new provider contact");
            suite.check(pending.getAttemptCount() == 1 && history.equals(payload(suite, pending.getPayloadEncrypted()).attempts()), "source outage removes only unstarted attempt and preserves real refusal history");
            suite.check(Objects.equals(retryable.getSendTime(), deferred.getSendTime()), "source outage preserves prior actual provider attempt time");
            guard.boundaryReason = null; suite.outcome = ChannelSendResult::success;
            suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE delivery_id=?", pending.getDeliveryId());
            suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus()), "retry resumes after source recovery");
            suite.check(worker.findByRecord(suite.TENANT, record.getRecordId()).getAttemptCount() == 2, "one refusal and one acceptance count as exactly two provider attempts");
        } finally { suite.outcome = ChannelSendResult::success; }
    }

    private static MessageDeliveryPayload payload(MessageDeliveryDatabaseChecks suite, String encrypted) throws Exception {
        return suite.json.readValue(suite.cipher.decrypt(encrypted), MessageDeliveryPayload.class);
    }

    private static final class Guard implements MessageDeliverySourceGuard {
        private final MessageDeliveryDatabaseChecks suite;
        private int calls;
        private String boundaryReason;

        private Guard(MessageDeliveryDatabaseChecks suite) { this.suite = suite; }
        public boolean supports(String source, String businessType) { return "cloudflow-auth".equals(source) && "LAST_BOUNDARY_TEST".equals(businessType); }
        public boolean verifyAtSendBoundary() { return true; }
        public String rejectionCode(MessageDeliveryPayload payload) {
            suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "last-boundary source verification does not hold a delivery transaction");
            calls++;
            if (calls % 3 != 0) return null;
            String state = suite.jdbc.queryForObject("SELECT status FROM sys_message_delivery WHERE record_id=?", String.class, payload.context().getRecordId());
            suite.check("SENDING".equals(state), "last source check observes committed SENDING state");
            return boundaryReason;
        }
    }
}

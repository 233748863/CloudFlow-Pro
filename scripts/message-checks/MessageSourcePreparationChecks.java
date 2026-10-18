package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.common.message.api.MessageAttachment;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSender;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.IntStream;
import org.springframework.transaction.support.TransactionSynchronizationManager;

final class MessageSourcePreparationChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        byte[] content = "private-attachment-protocol-evidence".getBytes(StandardCharsets.UTF_8);
        Guard guard = new Guard(suite, List.of(new MessageAttachment(44L, "private.pdf", "application/pdf", content)));
        AtomicInteger sends = new AtomicInteger();
        MessageChannelSender sender = new MessageChannelSender() {
            public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
            public boolean implemented() { return true; }
            public ChannelSendResult send(ChannelSendContext context) {
                suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "attachment transport occurs outside the delivery transaction");
                suite.check(context.getAttachments().size() == 1 && java.util.Arrays.equals(content, context.getAttachments().get(0).content()), "only source-authorized bytes reach the transport");
                sends.incrementAndGet();
                return ChannelSendResult.success();
            }
        };
        MessageDeliveryService worker = suite.service(new MessageChannelSenderFactory(List.of(sender)), List.of(guard));
        SysMessageRecord accepted = suite.reserve(request(suite, "attachment", List.of(44L)));
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, accepted.getRecordId()).getSendStatus()), "authorized attachment sends after two source checks");
        suite.check(guard.checks == 2 && guard.reads == 1, "source checked before and after attachment retrieval");
        String encrypted = suite.cipher.decrypt(worker.findByRecord(suite.TENANT, accepted.getRecordId()).getPayloadEncrypted());
        suite.check(!encrypted.contains(new String(content, StandardCharsets.UTF_8)) && !encrypted.contains(java.util.Base64.getEncoder().encodeToString(content)), "attachment bytes never enter persisted delivery payload");
        guard.reason = "SOURCE_UNAVAILABLE";
        SysMessageRecord unavailable = suite.reserve(request(suite, "unavailable", List.of(44L)));
        int before = sends.get();
        suite.check("PENDING".equals(worker.deliverRecord(suite.TENANT, unavailable.getRecordId()).getSendStatus()), "temporary source outage leaves a pending delivery");
        SysMessageDelivery pending = worker.findByRecord(suite.TENANT, unavailable.getRecordId());
        suite.check(pending.getAttemptCount() == 0 && pending.getNextAttemptTime().isAfter(LocalDateTime.now()) && sends.get() == before, "source outage schedules retry without consuming a provider attempt");
        guard.reason = null;
        suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE delivery_id=?", pending.getDeliveryId());
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, unavailable.getRecordId()).getSendStatus()), "recovered source rechecks attachments and sends the same record");
        guard.failure = new IllegalStateException("isolated source transport unavailable");
        SysMessageRecord disconnected = suite.reserve(request(suite, "disconnected", List.of(44L)));
        before = sends.get();
        suite.check("PENDING".equals(worker.deliverRecord(suite.TENANT, disconnected.getRecordId()).getSendStatus()) && sends.get() == before, "source transport exception cannot be mistaken for acceptance");
        suite.check(worker.findByRecord(suite.TENANT, disconnected.getRecordId()).getAttemptCount() == 0, "source transport failure preserves zero actual attempts");
        guard.failure = null;
        guard.reason = "SOURCE_INVALID";
        SysMessageRecord invalid = suite.reserve(request(suite, "invalid", List.of(44L)));
        suite.check("SKIPPED".equals(worker.deliverRecord(suite.TENANT, invalid.getRecordId()).getSendStatus()) && sends.get() == before, "invalid business source never invokes transport");
        guard.reason = null;
        guard.rejectAt = guard.checks + 2;
        SysMessageRecord revoked = suite.reserve(request(suite, "revoked", List.of(44L)));
        suite.check("SKIPPED".equals(worker.deliverRecord(suite.TENANT, revoked.getRecordId()).getSendStatus()) && sends.get() == before, "source revoked during attachment retrieval prevents network send");
        guard.rejectAt = -1;
        for (Object invalidIds : List.of("https://example.test/attachment", List.of(45L), List.of())) {
            SysMessageRecord mismatch = suite.reserve(request(suite, "mismatch-" + System.nanoTime(), invalidIds));
            suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, mismatch.getRecordId()).getSendStatus()) && sends.get() == before, "mismatched or non-list attachment references fail before provider contact");
        }
        guard.files = IntStream.range(0, 11).mapToObj(index -> new MessageAttachment(100L + index, "part.pdf", "application/pdf", content)).toList();
        SysMessageRecord tooMany = suite.reserve(request(suite, "too-many", guard.files.stream().map(MessageAttachment::fileId).toList()));
        suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, tooMany.getRecordId()).getSendStatus()) && sends.get() == before, "more than ten authorized attachments cannot reach provider");
        guard.files = List.of(new MessageAttachment(44L, "oversized.pdf", "application/pdf", new byte[10 * 1024 * 1024 + 1]));
        SysMessageRecord oversized = suite.reserve(request(suite, "oversized", List.of(44L)));
        suite.check("FAILED".equals(worker.deliverRecord(suite.TENANT, oversized.getRecordId()).getSendStatus()) && sends.get() == before, "attachment total above ten MiB fails without network contact");
    }

    private static MessageSendRequest request(MessageDeliveryDatabaseChecks suite, String suffix, Object fileIds) {
        return suite.request(suffix + "@example.test").toBuilder().bizType("SOURCE_PREPARATION_TEST").bizId("44").params(Map.of("attachmentIds", fileIds)).build();
    }

    private static final class Guard implements MessageDeliverySourceGuard {
        private final MessageDeliveryDatabaseChecks suite;
        private List<MessageAttachment> files;
        private String reason;
        private RuntimeException failure;
        private int checks;
        private int reads;
        private int rejectAt = -1;

        private Guard(MessageDeliveryDatabaseChecks suite, List<MessageAttachment> files) { this.suite = suite; this.files = files; }

        public boolean supports(String module, String businessType) { return "cloudflow-auth".equals(module) && "SOURCE_PREPARATION_TEST".equals(businessType); }

        public String rejectionCode(MessageDeliveryPayload payload) {
            suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "business source verification runs outside database transaction");
            checks++;
            if (failure != null) throw failure;
            return checks == rejectAt ? "SOURCE_INVALID" : reason;
        }

        public List<MessageAttachment> attachments(MessageDeliveryPayload payload) {
            suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "private attachment retrieval runs outside database transaction");
            reads++;
            return files;
        }
    }
}

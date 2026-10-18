package com.cloudflow.auth.message;

import com.cloudflow.auth.config.properties.TotpProperties;
import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.domain.dto.MessageDeliveryResolveDTO;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserTotpMapper;
import com.cloudflow.auth.service.MessageDeliveryResolutionService;
import com.cloudflow.auth.service.PasswordService;
import com.cloudflow.auth.service.TotpSecretCipher;
import com.cloudflow.auth.service.TotpService;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageDeliveryResult;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.tenant.TenantConfigProperties;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.nio.ByteBuffer;
import java.time.Instant;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageDeliveryResolutionChecks {
    static void run(MessageDeliveryDatabaseChecks suite) throws Exception {
        PasswordService passwords = new PasswordService(suite.mapper(SysUserMapper.class), null, new TenantConfigProperties());
        String password = "fixture-resolution-password";
        suite.jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,email) VALUES (1,?,'resolution-user','核验员',?,'reviewer@example.com')",
                suite.TENANT, passwords.encodePassword(password));
        TotpProperties properties = new TotpProperties();
        properties.setEnabled(true);
        properties.setEncryptionKey("message-totp-fixture-key-at-least-32-characters");
        TotpSecretCipher cipher = new TotpSecretCipher(properties);
        TotpService totp = new TotpService(suite.mapper(SysUserTotpMapper.class), cipher, properties, null, suite.json, null);
        MessageDeliveryResolutionService resolver = new MessageDeliveryResolutionService(suite.deliveries, suite.mapper(SysUserMapper.class), passwords, totp);
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageRecord original = suite.send("resolution@example.com");
        SysMessageDelivery pending = suite.deliveries.findByRecord(suite.TENANT, original.getRecordId());
        int sends = suite.sends.get();
        MessageDeliveryResolveDTO request = request(pending, password, "NOT_ACCEPTED");
        String serialized = suite.json.writeValueAsString(request);
        suite.check(!serialized.contains(password) && !serialized.contains("password") && !request.toString().contains(password), "resolution request excludes password from JSON and string logs");
        request.setPassword("incorrect-fixture-password");
        suite.rejects(() -> resolver.resolve(pending.getDeliveryId(), request), "incorrect current password cannot resolve UNKNOWN");
        request.setPassword(password);
        request.setEvidence("too short");
        try (ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            suite.check(!validators.getValidator().validate(request).isEmpty(), "resolution HTTP contract rejects short evidence");
        }
        suite.rejects(() -> resolver.resolve(pending.getDeliveryId(), request), "resolution service independently rejects short evidence");
        request.setEvidence("已核对隔离邮件服务的完整接纳记录，确认未被接纳。");
        request.setVersion(pending.getVersion() - 1);
        suite.rejects(() -> resolver.resolve(pending.getDeliveryId(), request), "stale resolution version rejected");
        request.setVersion(pending.getVersion());
        suite.check("FAILED".equals(resolver.resolve(pending.getDeliveryId(), request).getStatus()), "verified non-acceptance becomes FAILED without another send");
        suite.check(suite.sends.get() == sends, "manual verification performs no transport operation");
        suite.rejects(() -> resolver.resolve(pending.getDeliveryId(), request), "resolution cannot be submitted twice");
        SysMessageDelivery resolved = suite.deliveries.getOwned(suite.TENANT, pending.getDeliveryId());
        suite.check(resolved.getResolvedBy().equals(1L) && resolved.getResolutionReason().equals(request.getEvidence()), "resolution identity and evidence persisted");
        String view = suite.json.writeValueAsString(resolver.get(pending.getDeliveryId()));
        suite.check(!view.contains("payload") && !view.contains("receiverKey") && !view.contains("claimOwner"), "delivery detail excludes protected payload and lease internals");
        suite.check(suite.deliveries.requestResend(suite.TENANT, original.getRecordId()), "verified FAILED may request an audited new message event");
        int resendEvents = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
        suite.check(suite.deliveries.requestResend(suite.TENANT, original.getRecordId())
                && suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class) == resendEvents,
                "repeated manual resend for the same failed version reuses one durable event");
        String outbound = suite.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_SEND' ORDER BY id DESC LIMIT 1", String.class);
        BusinessEventEnvelope event = suite.json.readValue(outbound, BusinessEventEnvelope.class);
        MessageSendRequest resend = MessagePayloadCodec.decode(event, suite.json, suite.cipher);
        suite.check(resend.getResendFromId().equals(original.getRecordId()) && !event.getEventId().equals(original.getOutboxEventId()), "resend preserves source relationship with a new event identity");
        suite.check("cloudflow-auth".equals(event.getSourceModule()), "manual resend preserves the original source module for source revalidation");
        suite.check(!Boolean.TRUE.equals(resend.getForceSend()) && resend.getScheduleTime() == null, "manual resend cannot bypass subscription or retain obsolete schedule");
        suite.outcome = ChannelSendResult::success;
        SysMessageRecord fresh = suite.dispatch.dispatch(event).records().get(0);
        suite.check(!fresh.getRecordId().equals(original.getRecordId()) && "SUCCESS".equals(fresh.getSendStatus()), "verified resend creates a separate successful record");
        suite.check("FAILED".equals(suite.deliveries.getOwned(suite.TENANT, pending.getDeliveryId()).getStatus()), "manual resend does not overwrite the original decision");
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageDelivery accepted = suite.deliveries.findByRecord(suite.TENANT, suite.send("accepted-resolution@example.com").getRecordId());
        String secret = "JBSWY3DPEHPK3PXP";
        suite.jdbc.update("INSERT INTO sys_user_totp(tenant_id,user_id,secret_ciphertext,enabled) VALUES (?,1,?,1)", suite.TENANT, cipher.encrypt(secret));
        MessageDeliveryResolveDTO acceptedRequest = request(accepted, password, "ACCEPTED");
        suite.rejects(() -> resolver.resolve(accepted.getDeliveryId(), acceptedRequest), "enabled second factor cannot be omitted");
        acceptedRequest.setTotpCode("invalid");
        suite.rejects(() -> resolver.resolve(accepted.getDeliveryId(), acceptedRequest), "invalid second factor cannot resolve UNKNOWN");
        String code = code(secret);
        acceptedRequest.setTotpCode(code);
        suite.check(!suite.json.writeValueAsString(acceptedRequest).contains(code) && !acceptedRequest.toString().contains(code), "second factor excluded from serialization and string logs");
        suite.check("SENT".equals(resolver.resolve(accepted.getDeliveryId(), acceptedRequest).getStatus()), "password plus unused real TOTP allows verified acceptance");
        suite.check(!totp.verifyLoginCode(1L, suite.TENANT, code), "resolution consumes TOTP once in the real database");
        suite.check(!suite.deliveries.requestResend(suite.TENANT, accepted.getRecordId()), "verified accepted messages cannot be resent");
        suite.check(suite.deliveries.getOwned(suite.TENANT, accepted.getDeliveryId()).getAcceptedTime() != null, "verified acceptance records its timestamp");
        UserContext.setTenantId(100001L);
        try {
            suite.rejects(() -> resolver.get(accepted.getDeliveryId()), "delivery detail rejects same identifier under another tenant");
            suite.rejects(() -> resolver.resolve(accepted.getDeliveryId(), acceptedRequest), "cross tenant resolver cannot reuse an operator identity");
        } finally { UserContext.setTenantId(suite.TENANT); }
        concurrentResolution(suite);
        outcomeAtomicity(suite);
        auditAtomicity(suite);
        sourceModuleResend(suite);
        retention(suite);
    }

    static MessageDeliveryResolveDTO request(SysMessageDelivery delivery, String password, String conclusion) {
        MessageDeliveryResolveDTO request = new MessageDeliveryResolveDTO();
        request.setVersion(delivery.getVersion());
        request.setConclusion(conclusion);
        request.setEvidence("已核对隔离邮件服务的完整接纳记录并保存查询依据。");
        request.setPassword(password);
        return request;
    }

    static String code(String secret) throws Exception {
        Mac algorithm = Mac.getInstance("HmacSHA1");
        algorithm.init(new SecretKeySpec(cn.hutool.core.codec.Base32.decode(secret), "HmacSHA1"));
        byte[] digest = algorithm.doFinal(ByteBuffer.allocate(8).putLong(Instant.now().getEpochSecond() / 30).array());
        int offset = digest[digest.length - 1] & 15;
        int number = ByteBuffer.wrap(digest, offset, 4).getInt() & 0x7fffffff;
        return String.format(java.util.Locale.ROOT, "%06d", number % 1000000);
    }

    static void concurrentResolution(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageDelivery candidate = suite.deliveries.findByRecord(suite.TENANT, suite.send("race-resolution@example.com").getRecordId());
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        try {
            List<Future<Integer>> futures = List.of("ACCEPTED", "NOT_ACCEPTED").stream().map(conclusion -> executor.submit(() -> {
                UserContext.setTenantId(suite.TENANT);
                UserContext.setUserId(1L);
                try {
                    ready.countDown();
                    if (!ready.await(5, TimeUnit.SECONDS)) throw new IllegalStateException("CHECK_BARRIER_TIMEOUT");
                    try {
                        suite.deliveries.recordResolution(suite.TENANT, candidate.getDeliveryId(), 1L, candidate.getVersion(), conclusion, "并发核验基于同一旧版本的服务商查询依据。");
                        return 1;
                    } catch (com.cloudflow.common.core.exception.ServiceException collision) {
                        if (!Integer.valueOf(409).equals(collision.getCode())) throw collision;
                        return 0;
                    }
                } finally { UserContext.clear(); }
            })).toList();
            suite.check(futures.get(0).get(15, TimeUnit.SECONDS) + futures.get(1).get(15, TimeUnit.SECONDS) == 1, "concurrent conflicting resolutions have exactly one winner");
        } finally { executor.shutdownNow(); }
    }

    static void outcomeAtomicity(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = ChannelSendResult::success;
        SysMessageRecord record = suite.reserve(suite.request("result-failure@example.com"));
        suite.jdbc.execute("CREATE TRIGGER reject_delivery_result BEFORE INSERT ON outbox_event FOR EACH ROW BEGIN IF NEW.event_type='MESSAGE_DELIVERY_RESULT' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RESULT_EVENT_FIXTURE_FAILURE'; END IF; END");
        int before = suite.sends.get();
        try { suite.rejects(() -> suite.deliveries.deliverRecord(suite.TENANT, record.getRecordId()), "real outbox result insertion failure is surfaced"); }
        finally { suite.jdbc.execute("DROP TRIGGER reject_delivery_result"); }
        SysMessageDelivery incomplete = suite.deliveries.findByRecord(suite.TENANT, record.getRecordId());
        suite.check(suite.sends.get() == before + 1 && "SENDING".equals(incomplete.getStatus()), "outcome event failure rolls back delivery status after one real transport attempt");
        suite.check("SENDING".equals(suite.jdbc.queryForObject("SELECT send_status FROM sys_message_record WHERE record_id=?", String.class, record.getRecordId())), "outcome event and ordinary message status share a transaction");
        suite.jdbc.update("UPDATE sys_message_delivery SET claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE delivery_id=?", incomplete.getDeliveryId());
        suite.deliveries.deliverRecord(suite.TENANT, record.getRecordId());
        suite.check(suite.sends.get() == before + 1 && "UNKNOWN".equals(suite.deliveries.getOwned(suite.TENANT, incomplete.getDeliveryId()).getStatus()), "post-failure recovery records UNKNOWN without repeating the side effect");
        String resultJson = suite.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_DELIVERY_RESULT' AND aggregate_id=? ORDER BY id DESC LIMIT 1", String.class, incomplete.getDeliveryId());
        BusinessEventEnvelope envelope = suite.json.readValue(resultJson, BusinessEventEnvelope.class);
        MessageDeliveryResult result = suite.json.readValue(envelope.getPayload(), MessageDeliveryResult.class);
        suite.check(result.deliveryId().equals(incomplete.getDeliveryId()) && result.recordId().equals(record.getRecordId()) && "UNKNOWN".equals(result.status()), "persisted result event binds tenant, delivery, record and actual status");
        int count = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
        new TransactionTemplate(suite.manager).execute(status -> { suite.publisher.send(suite.request("rollback@example.com")); status.setRollbackOnly(); return null; });
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class) == count, "business rollback also rolls back encrypted outgoing event");
    }

    static void retention(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = ChannelSendResult::success;
        SysMessageRecord sent = suite.send("retention-sent@example.com");
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageRecord unknown = suite.send("retention-unknown@example.com");
        SysMessageRecord scheduled = suite.reserve(suite.request("retention-scheduled@example.com"));
        suite.jdbc.update("UPDATE sys_message_delivery SET update_time=DATE_SUB(NOW(),INTERVAL 31 DAY) WHERE record_id IN (?,?,?)", sent.getRecordId(), unknown.getRecordId(), scheduled.getRecordId());
        suite.check(suite.deliveries.expirePayloads(suite.TENANT, 30) == 1, "retention removes exactly the expired terminal payload");
        suite.check(suite.deliveries.findByRecord(suite.TENANT, sent.getRecordId()).getPayloadEncrypted() == null, "expired sent payload erased");
        suite.check(suite.deliveries.findByRecord(suite.TENANT, unknown.getRecordId()).getPayloadEncrypted() != null, "unresolved UNKNOWN keeps evidence payload");
        suite.check(suite.deliveries.findByRecord(suite.TENANT, scheduled.getRecordId()).getPayloadEncrypted() != null, "unfinished scheduled delivery retains its payload");
        suite.check("SENT".equals(suite.deliveries.findByRecord(suite.TENANT, sent.getRecordId()).getStatus()), "retention preserves historical send result");
        suite.rejects(() -> suite.deliveries.expirePayloads(suite.TENANT, 0), "retention rejects zero-day destruction");
    }

    static void auditAtomicity(MessageDeliveryDatabaseChecks suite) throws Exception {
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageDelivery candidate = suite.deliveries.findByRecord(suite.TENANT, suite.send("audit-failure@example.com").getRecordId());
        int events = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event", Integer.class);
        suite.jdbc.execute("CREATE TRIGGER reject_message_audit BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN IF NEW.biz_module='system-message' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='AUDIT_FIXTURE_FAILURE'; END IF; END");
        try {
            suite.rejects(() -> suite.deliveries.recordResolution(suite.TENANT, candidate.getDeliveryId(), 1L, candidate.getVersion(), "ACCEPTED", "已查询接纳结果但审计数据库故障，必须全部回滚。"), "actual audit insert failure blocks manual result resolution");
        } finally { suite.jdbc.execute("DROP TRIGGER reject_message_audit"); }
        SysMessageDelivery rolledBack = suite.deliveries.getOwned(suite.TENANT, candidate.getDeliveryId());
        suite.check("UNKNOWN".equals(rolledBack.getStatus()) && rolledBack.getVersion().equals(candidate.getVersion()) && rolledBack.getResolvedBy() == null, "audit failure rolls back decision, version and operator together");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event", Integer.class) == events, "audit failure also rolls back the corresponding result event");
        suite.deliveries.recordResolution(suite.TENANT, candidate.getDeliveryId(), 1L, candidate.getVersion(), "NOT_ACCEPTED", "审计恢复后重新核验为未接纳，并保存完整查询依据。");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE high_risk=1 AND risk_level='HIGH' AND biz_module='system-message' AND JSON_EXTRACT(after_json,'$.deliveryId')=?", Integer.class, candidate.getDeliveryId()) == 1,
                "successful resolution commits exactly one high-risk audit with delivery identity");
        events = suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class);
        suite.jdbc.execute("CREATE TRIGGER reject_resend_audit BEFORE INSERT ON sys_audit_log FOR EACH ROW BEGIN IF NEW.biz_module='system-message' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='RESEND_AUDIT_FIXTURE_FAILURE'; END IF; END");
        try { suite.rejects(() -> suite.deliveries.requestResend(suite.TENANT, candidate.getRecordId()), "audit failure blocks a new manual resend event"); }
        finally { suite.jdbc.execute("DROP TRIGGER reject_resend_audit"); }
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE event_type='MESSAGE_SEND'", Integer.class) == events, "failed resend audit leaves no untracked outgoing message event");
    }

    static void sourceModuleResend(MessageDeliveryDatabaseChecks suite) throws Exception {
        AtomicInteger validations = new java.util.concurrent.atomic.AtomicInteger();
        MessageDeliverySourceGuard guard = new MessageDeliverySourceGuard() {
            public boolean supports(String sourceModule, String businessType) {
                return "cloudflow-service-oa".equals(sourceModule) && "RESEND_SOURCE_CHECK".equals(businessType);
            }
            public String rejectionCode(MessageDeliveryPayload payload) {
                validations.incrementAndGet();
                return "7221".equals(payload.request().getBizId()) ? null : "SOURCE_INVALID";
            }
        };
        MessageDeliveryService guarded = suite.service(suite.senderFactory, List.of(guard));
        MessageSendRequest request = suite.request("source-resend@example.com").toBuilder().bizType("RESEND_SOURCE_CHECK").bizId("7221").build();
        BusinessEventEnvelope original = suite.envelope(request);
        original.setSourceModule("cloudflow-service-oa");
        MessagePayloadCodec.encode(original, request, suite.json, suite.cipher);
        SysMessageRecord record = new TransactionTemplate(suite.manager).execute(status -> guarded.reserve(original, request,
                com.cloudflow.common.message.constant.MessageChannelType.EMAIL, request.safeReceivers().get(0)));
        suite.outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        suite.check("UNKNOWN".equals(guarded.deliverRecord(suite.TENANT, record.getRecordId()).getSendStatus()), "non-auth business source passes its dedicated source guard before UNKNOWN");
        SysMessageDelivery delivery = guarded.findByRecord(suite.TENANT, record.getRecordId());
        guarded.recordResolution(suite.TENANT, delivery.getDeliveryId(), 1L, delivery.getVersion(), "NOT_ACCEPTED", "已核对服务商真实查询依据，确认原业务邮件未接纳。");
        suite.check(guarded.requestResend(suite.TENANT, record.getRecordId()), "verified non-auth business delivery creates a manual resend event");
        String saved = suite.jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE event_type='MESSAGE_SEND' AND aggregate_id=7221 ORDER BY id DESC LIMIT 1", String.class);
        BusinessEventEnvelope event = suite.json.readValue(saved, BusinessEventEnvelope.class);
        MessageSendRequest resend = MessagePayloadCodec.decode(event, suite.json, suite.cipher);
        suite.check("cloudflow-service-oa".equals(event.getSourceModule()) && "7221".equals(resend.getBizId()), "manual resend retains the actual non-auth origin and business identity");
        int before = validations.get();
        SysMessageRecord next = new TransactionTemplate(suite.manager).execute(status -> guarded.reserve(event, resend,
                com.cloudflow.common.message.constant.MessageChannelType.EMAIL, resend.safeReceivers().get(0)));
        suite.outcome = ChannelSendResult::success;
        suite.check("SUCCESS".equals(guarded.deliverRecord(suite.TENANT, next.getRecordId()).getSendStatus()) && validations.get() > before,
                "manual resend executes the original business source guard again instead of bypassing it");
        suite.check(next.getResendFromId().equals(record.getRecordId()) && !next.getRecordId().equals(record.getRecordId()), "non-auth manual resend preserves both original and new message records");
    }
}

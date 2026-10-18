package com.cloudflow.auth.im;

import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.tenant.TenantContext;
import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import me.chanjar.weixin.common.util.crypto.SHA1;
import me.chanjar.weixin.cp.util.crypto.WxCpCryptUtil;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;

final class ImCallbackDatabaseChecks {
    private static final long TENANT = 992800L;
    private static final long CONFIG = 992801L;
    private static final long MAPPING = 992803L;
    private static final String MEMBER = "callback-member-private";
    private static final String CARD = "k".repeat(43);
    private final AtomicInteger assertions = new AtomicInteger();
    private final JdbcTemplate jdbc;
    private final ImDatabase database;
    private final ImCallbackMapper mapper;
    private final ImConfigRules rules;
    private final ImProperties properties;
    private final SysAuditLogMapper audits;
    private final AtomicBoolean failAudit;
    private final Clock clock = Clock.fixed(Instant.now(), ZoneOffset.UTC);
    private final WeComCredentials credentials = new WeComCredentials(TENANT, CONFIG, 0, "callback-corp", 100001,
            "callback-secret-private", "callbackTokenPrivate", Base64.getEncoder().withoutPadding().encodeToString(new byte[32]));
    private final ImCallbackInbox inbox;
    private final SqlSessionTemplate sessions;

    ImCallbackDatabaseChecks(JdbcTemplate jdbc, ImDatabase database, SqlSessionTemplate sessions, ImConfigRules rules,
            ImProperties properties, SysAuditLogMapper audits, AtomicBoolean failAudit) {
        this.jdbc = jdbc; this.database = database; this.rules = rules; this.properties = properties; this.audits = audits; this.failAudit = failAudit;
        this.sessions = sessions;
        mapper = sessions.getMapper(ImCallbackMapper.class);
        inbox = new ImCallbackInbox(database, mapper, rules, audits, ImTodoDeliveryDatabaseChecks.receipts(jdbc, database, sessions));
    }

    void run() throws Exception {
        protocol();
        fixture();
        persistence();
        System.out.println("G4_IM_CALLBACK_INBOX_DATABASE: assertions=" + assertions.get()
                + "; failed=0; real_mysql=true; real_mybatis=true; real_transactions=true; actual_sdk_crypto=true; persistent_dedup=true; lease_fencing=true; concurrency_groups=2; http=false; redis=false; workflow_action=false; vendor_service=false");
        new ImCallbackActorDatabaseChecks(jdbc, database, sessions, rules, inbox, credentials).run(event(100));
        processor();
        List<ImCardCallback> recoveryEvents = new ArrayList<>();
        for (int index = 150; index < 254; index++) recoveryEvents.add(event(index));
        new ImCallbackRecoveryDatabaseChecks(jdbc, inbox, mapper, rules, properties).run(credentials, recoveryEvents, event(270));
        new ImCallbackHttpChecks(jdbc, properties, credentials, failAudit).run(database, mapper, rules, inbox, audits);
    }

    private void processor() {
        int before = assertions.get();
        com.cloudflow.common.core.context.UserContext.setAuthToken("untrusted-browser-context");
        com.cloudflow.common.core.context.UserContext.setUserId(1L);
        try {
            feign.RequestTemplate request = new feign.RequestTemplate();
            request.uri("/inner/workflow/im-callback/complete"); request.header("Authorization", "forged");
            request.header("Cookie", "forged"); request.header("X-User-Id", "1");
            new com.cloudflow.auth.config.FeignRequestInterceptor("cloudflow-auth").apply(request);
            check(!request.headers().containsKey("Authorization") && !request.headers().containsKey("Cookie")
                    && !request.headers().containsKey("X-User-Id"), "processor request strips browser credentials");
        } finally { com.cloudflow.common.core.context.UserContext.clear(); }
        AtomicInteger calls = new AtomicInteger();
        ImCallbackProcessor processor = new ImCallbackProcessor(inbox, request -> {
            calls.incrementAndGet();
            check(request.tenantId() == TENANT && request.claimUntil() != null, "processor transmits persisted claim only");
            return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.common.security.im.ImTaskCallbacks.Outcome("COMPLETED", "IM_TASK_COMPLETED"));
        }, rules);
        long completed = inbox.receive(credentials, event(120), "127.0.0.1").callbackId();
        check(processor.process(TENANT, completed), "processor persists workflow outcome");
        check("COMPLETED".equals(row(completed).getStatus()) && "IM_TASK_COMPLETED".equals(row(completed).getResultCode()), "workflow completion saved with event");
        check(!processor.process(TENANT, completed) && calls.get() == 1, "completed callback never invokes workflow again");
        long uncertain = inbox.receive(credentials, event(121), "127.0.0.1").callbackId();
        ImCallbackProcessor unavailable = new ImCallbackProcessor(inbox, request -> { throw new IllegalStateException("controlled transport failure"); }, rules);
        check(unavailable.process(TENANT, uncertain) && "RETRYABLE".equals(row(uncertain).getStatus()), "uncertain transport remains retryable");
        check(!processor.process(TENANT, uncertain) && calls.get() == 1, "retry observes existing lease deadline");
        jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE callback_id=?", uncertain);
        check(processor.process(TENANT, uncertain) && "COMPLETED".equals(row(uncertain).getStatus()), "expired uncertainty asks workflow for exact-event recovery");
        long rejected = inbox.receive(credentials, event(122), "127.0.0.1").callbackId();
        ImCallbackProcessor forbidden = new ImCallbackProcessor(inbox, request -> com.cloudflow.common.core.domain.R.ok(
                new com.cloudflow.common.security.im.ImTaskCallbacks.Outcome("REJECTED", "IM_TASK_IDENTITY_CHANGED")), rules);
        check(forbidden.process(TENANT, rejected) && "REJECTED".equals(row(rejected).getStatus()), "workflow business refusal is durable");
        check(!processor.process(TENANT, rejected), "rejected action is not retried");
        long expired = inbox.receive(credentials, event(123), "127.0.0.1").callbackId();
        ImCallbackProcessor superseded = new ImCallbackProcessor(inbox, request -> {
            jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE callback_id=?", expired);
            ImCallbackRow next = inbox.claim(TENANT, expired);
            check(inbox.finish(next, "REJECTED", "IM_TASK_IDENTITY_CHANGED"), "replacement owner records result");
            return com.cloudflow.common.core.domain.R.ok(new com.cloudflow.common.security.im.ImTaskCallbacks.Outcome("COMPLETED", "IM_TASK_COMPLETED"));
        }, rules);
        check(!superseded.process(TENANT, expired) && "REJECTED".equals(row(expired).getStatus()), "old processor cannot overwrite replacement owner result");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=?", Integer.class, TENANT) == 0, "controlled workflow transport does not create real approvals");
        System.out.println("G4_IM_CALLBACK_PROCESSOR_DATABASE: assertions=" + (assertions.get() - before)
                + "; failed=0; real_mysql=true; actual_processor=true; workflow_transport=controlled; workflow_action=false; vendor_service=false");
    }

    private void protocol() {
        ImCardCallback valid = event(0);
        check("APPROVE".equals(valid.action()) && ImCardCallback.hash(CARD).equals(valid.cardKeyHash()), "verified button identity and hashed key");
        check(valid.occurredTime().equals(LocalDateTime.ofInstant(Instant.ofEpochSecond(clock.instant().getEpochSecond()), ZoneId.systemDefault())), "provider epoch stored in database local time");
        check(!valid.toString().contains(MEMBER) && !valid.toString().contains(CARD), "callback string is redacted");
        for (String required : List.of("AgentID", "TaskId", "EventKey", "CreateTime", "FromUserName", "CardType", "MsgType", "Event")) {
            Map<String, String> missing = fields(0); missing.remove(required);
            rejected(() -> decode(missing), "missing callback field rejected");
        }
        for (Map.Entry<String, String> invalid : Map.of("AgentID", "100002", "TaskId", "predictable", "EventKey", "DELEGATE",
                "FromUserName", "@all", "CardType", "text_notice", "MsgType", "text", "Event", "template_card_menu_event",
                "ToUserName", "other-corp").entrySet()) {
            Map<String, String> changed = fields(0); changed.put(invalid.getKey(), invalid.getValue());
            rejected(() -> decode(changed), "unsupported callback shape rejected");
        }
        for (int delta : List.of(-301, 301)) rejected(() -> event(delta), "event creation time outside window rejected");
        check(event(-300) != null && event(300) != null, "event creation boundaries accepted");
        Map<String, String> repeated = fields(0); repeated.put("ResponseCode", "replacement-response-private");
        ImCardCallback changed = decode(repeated);
        check(changed.eventKey().equals(valid.eventKey()) && !changed.payloadHash().equals(valid.payloadHash()), "same stable key with changed payload remains detectable");
    }

    private void fixture() {
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_config WHERE config_id=?", Integer.class, CONFIG) == 0, "owned fixture identifiers unused");
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,deleted) VALUES (?,'callback-owned','回调隔离测试','0',0)", TENANT);
        ImSecretCipher cipher = new ImSecretCipher(properties);
        jdbc.update("INSERT INTO sys_im_config(config_id,tenant_id,im_type,corp_id,agent_id,app_secret_encrypted,token_encrypted,aes_key_encrypted,callback_url,todo_enabled,status,deleted,version) VALUES (?,?,'WECOM',?,?,?,?,?,?,1,'ENABLED',0,0)",
                CONFIG, TENANT, credentials.corpId(), Long.toString(credentials.agentId()),
                cipher.encrypt(TENANT, "WECOM", ImSecretCipher.Field.APP_SECRET, credentials.appSecret()),
                cipher.encrypt(TENANT, "WECOM", ImSecretCipher.Field.TOKEN, credentials.callbackToken()),
                cipher.encrypt(TENANT, "WECOM", ImSecretCipher.Field.AES_KEY, credentials.aesKey()), rules.expectedCallbackUrl(CONFIG));
        jdbc.update("INSERT INTO sys_im_todo_mapping(mapping_id,tenant_id,config_id,task_id,assignment_version,receiver_user_id,im_type,im_todo_id,im_user_id,card_key_hash,status) VALUES (?,?,?,'callback-owned-task',0,1,'WECOM','callback-message',?,?,'SENT')",
                MAPPING, TENANT, CONFIG, MEMBER, ImCardCallback.hash(CARD));
    }

    private void persistence() throws Exception {
        ImCardCallback event = event(0);
        ImCallbackInbox.Receipt saved = inbox.receive(credentials, event, "127.0.0.1");
        check("RECEIVED".equals(saved.status()) && !saved.repeated(), "verified callback persists before processing");
        ImCallbackRow persisted = row(saved.callbackId());
        check(Long.valueOf(MAPPING).equals(persisted.getTaskMappingId()) && MEMBER.equals(persisted.getImUserId()), "actual mapping and verified sender persisted");
        check(persisted.getProcessedTime() == null && persisted.getClaimUntil() == null, "receipt does not claim approval completion");
        ImCallbackInbox restarted = new ImCallbackInbox(database, mapper, rules, audits, ImTodoDeliveryDatabaseChecks.receipts(jdbc, database, sessions));
        ImCallbackInbox.Receipt repeated = restarted.receive(credentials, event, "127.0.0.2");
        check(repeated.repeated() && repeated.callbackId() == saved.callbackId(), "recreated service retains database deduplication");
        check("127.0.0.1".equals(row(saved.callbackId()).getSourceIp()), "duplicate cannot overwrite original source");
        Map<String, String> changed = fields(0); changed.put("ResponseCode", "replacement-response-private");
        ImCallbackInbox.Receipt conflict = inbox.receive(credentials, decode(changed), "127.0.0.2");
        check("IM_CALLBACK_REPLAY_CONFLICT".equals(conflict.resultCode()) && "REJECTED".equals(conflict.status()), "same key different digest rejected");
        check(event.payloadHash().equals(row(saved.callbackId()).getPayloadHash()) && "RECEIVED".equals(row(saved.callbackId()).getStatus()), "conflict preserves accepted event");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_name='IM_CALLBACK_REPLAY_CONFLICT' AND audit_field=?", Integer.class, TENANT, "im_callback:" + saved.callbackId()) == 1,
                "replay conflict audit persisted");
        Map<String, String> unknown = fields(1); unknown.put("TaskId", "x".repeat(43));
        ImCallbackInbox.Receipt rejected = inbox.receive(credentials, decode(unknown), "127.0.0.1");
        check("REJECTED".equals(rejected.status()) && "IM_CARD_UNKNOWN".equals(rejected.resultCode()), "unknown card is durably rejected");
        check(inbox.claim(TENANT, rejected.callbackId()) == null && !inbox.pending(TENANT, 100).contains(rejected.callbackId()), "rejected card cannot enter processing");
        TenantContext.setTenantSkip();
        try {
            check(inbox.claim(990100L, saved.callbackId()) == null, "caller tenant-skip cannot claim another tenant event");
            check(TenantContext.getTenantSkip(), "previous tenant-skip restored");
        } finally { TenantContext.clearTenantSkip(); }
        rejected(() -> inbox.pending(TENANT, 101), "pending batch is bounded");
        long beforeDisabled = count();
        properties.setEnabled(false);
        try { rejected(() -> inbox.receive(credentials, event(2), "127.0.0.1"), "deployment disabled rejects callback receipt"); }
        finally { properties.setEnabled(true); }
        jdbc.update("UPDATE sys_im_config SET todo_enabled=0 WHERE config_id=?", CONFIG);
        try { rejected(() -> inbox.receive(credentials, event(2), "127.0.0.1"), "todo disabled rejects callback receipt"); }
        finally { jdbc.update("UPDATE sys_im_config SET todo_enabled=1 WHERE config_id=?", CONFIG); }
        jdbc.update("UPDATE sys_im_config SET version=1 WHERE config_id=?", CONFIG);
        try { rejected(() -> inbox.receive(credentials, event(2), "127.0.0.1"), "configuration changed after verification rejects receipt"); }
        finally { jdbc.update("UPDATE sys_im_config SET version=0 WHERE config_id=?", CONFIG); }
        check(beforeDisabled == count(), "disabled or changed configuration adds no callback");
        ImCardCallback racing = event(3);
        List<ImCallbackInbox.Receipt> concurrent = race(() -> inbox.receive(credentials, racing, "127.0.0.1"));
        check(concurrent.stream().filter(receipt -> !receipt.repeated()).count() == 1 && concurrent.stream().map(ImCallbackInbox.Receipt::callbackId).distinct().count() == 1,
                "concurrent receipts persist once");
        List<ImCallbackRow> claims = race(() -> inbox.claim(TENANT, saved.callbackId()));
        check(claims.stream().filter(java.util.Objects::nonNull).count() == 1, "only one worker obtains live claim");
        ImCallbackRow claim = claims.stream().filter(java.util.Objects::nonNull).findFirst().orElseThrow();
        check(!inbox.pending(TENANT, 100).contains(saved.callbackId()), "live claim excluded from pending scan");
        jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 60 SECOND) WHERE callback_id=?", saved.callbackId());
        ImCallbackRow expired = row(saved.callbackId());
        check(!inbox.finish(expired, "COMPLETED", "IM_TASK_APPROVED"), "expired worker cannot write outcome");
        ImCallbackRow replacement = inbox.claim(TENANT, saved.callbackId());
        check(replacement != null && replacement.getClaimUntil().isAfter(expired.getClaimUntil()), "expired claim can be recovered with new deadline");
        check(!inbox.finish(expired, "COMPLETED", "IM_TASK_APPROVED"), "previous lease cannot overwrite replacement");
        check(inbox.finish(replacement, "RETRYABLE", "IM_WORKFLOW_UNAVAILABLE"), "temporary failure remains retryable");
        check(inbox.claim(TENANT, saved.callbackId()) == null && !inbox.pending(TENANT, 100).contains(saved.callbackId()), "retry waits for prior lease deadline");
        check(!inbox.finish(replacement, "COMPLETED", "IM_TASK_APPROVED"), "finished lease cannot overwrite retryable outcome");
        jdbc.update("UPDATE sys_im_callback_event SET claim_until=DATE_SUB(NOW(),INTERVAL 60 SECOND) WHERE callback_id=?", saved.callbackId());
        ImCallbackRow recovered = inbox.claim(TENANT, saved.callbackId());
        failAudit.set(true);
        try { fails(() -> inbox.finish(recovered, "COMPLETED", "IM_TASK_APPROVED"), "outcome audit failure rolls transaction back"); }
        finally { failAudit.set(false); }
        check("PROCESSING".equals(row(saved.callbackId()).getStatus()), "audit rollback retains unfinished claim");
        check(inbox.finish(recovered, "COMPLETED", "IM_TASK_APPROVED"), "confirmed outcome commits with audit");
        check(inbox.claim(TENANT, saved.callbackId()) == null && row(saved.callbackId()).getProcessedTime() != null, "completed callback cannot be processed twice");
        check("COMPLETED".equals(restarted.receive(credentials, event, "127.0.0.1").status()), "provider replay reads original completed result");
        long beforeAudit = count();
        failAudit.set(true);
        try { fails(() -> inbox.receive(credentials, event(4), "127.0.0.1"), "receipt audit failure prevents acceptance"); }
        finally { failAudit.set(false); }
        check(beforeAudit == count(), "failed receipt leaves no callback row");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE create_by='im-callback' AND (after_val LIKE ? OR after_val LIKE ?)", Integer.class, "%" + MEMBER + "%", "%" + CARD + "%") == 0,
                "audit excludes raw member identity and card secret");
    }

    private ImCallbackRow row(long callbackId) { return database.read(TENANT, scoped -> mapper.claimed(TENANT, callbackId)); }
    private long count() { return jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE config_id=?", Long.class, CONFIG); }
    private ImCardCallback event(int delta) { return decode(fields(delta)); }
    private Map<String, String> fields(int delta) {
        Map<String, String> result = new LinkedHashMap<>();
        result.put("ToUserName", credentials.corpId()); result.put("FromUserName", MEMBER); result.put("CreateTime", Long.toString(clock.instant().getEpochSecond() + delta));
        result.put("MsgType", "event"); result.put("Event", "template_card_event"); result.put("EventKey", "APPROVE"); result.put("TaskId", CARD);
        result.put("CardType", "button_interaction"); result.put("AgentID", Long.toString(credentials.agentId())); result.put("ResponseCode", "response-private");
        return result;
    }
    private ImCardCallback decode(Map<String, String> fields) {
        StringBuilder plain = new StringBuilder("<xml>");
        fields.forEach((name, value) -> plain.append('<').append(name).append("><![CDATA[").append(value).append("]]></").append(name).append('>'));
        plain.append("</xml>");
        String encrypted = new WxCpCryptUtil(credentials.sdkConfiguration()).encrypt("0123456789abcdef", plain.toString());
        String timestamp = Long.toString(clock.instant().getEpochSecond());
        String nonce = "callbackNonce";
        String signature = SHA1.gen(credentials.callbackToken(), timestamp, nonce, encrypted);
        byte[] envelope = ("<xml><Encrypt><![CDATA[" + encrypted + "]]></Encrypt></xml>").getBytes(StandardCharsets.UTF_8);
        return ImCardCallback.parse(credentials, new WeComCallbackCodec(clock).event(credentials, signature, timestamp, nonce, envelope), clock);
    }
    private <Result> List<Result> race(Callable<Result> operation) throws Exception {
        ExecutorService workers = Executors.newFixedThreadPool(4);
        CountDownLatch ready = new CountDownLatch(4);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<Result>> pending = new ArrayList<>();
            for (int index = 0; index < 4; index++) pending.add(workers.submit(() -> { ready.countDown(); if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("RACE_START_TIMEOUT"); return operation.call(); }));
            check(ready.await(10, TimeUnit.SECONDS), "all competing workers ready");
            start.countDown();
            List<Result> result = new ArrayList<>();
            for (Future<Result> future : pending) result.add(future.get(20, TimeUnit.SECONDS));
            return result;
        } finally { start.countDown(); workers.shutdownNow(); }
    }
    private void check(boolean result, String name) { assertions.incrementAndGet(); if (!result) throw new AssertionError(name); }
    private void rejected(Runnable operation, String name) {
        boolean rejected = false;
        try { operation.run(); } catch (ImFailure failure) { rejected = true; }
        check(rejected, name);
    }
    private void fails(Runnable operation, String name) {
        boolean rejected = false;
        try { operation.run(); } catch (RuntimeException failure) { rejected = true; }
        check(rejected, name);
    }
}

package com.cloudflow.auth.message;

import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.im.ImConfigRules;
import com.cloudflow.auth.im.ImConnectionProbe;
import com.cloudflow.auth.im.ImDatabase;
import com.cloudflow.auth.im.ImMessageChannelSender;
import com.cloudflow.auth.im.ImMessageSender;
import com.cloudflow.auth.im.ImProperties;
import com.cloudflow.auth.im.ImSecretCipher;
import com.cloudflow.auth.im.WeComCredentials;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.ChannelTestContext;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.constant.MessageChannelType;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

final class MessageWeComChecks {
    private static final long USER = 990680L;
    private static final long CONFIG = 990681L;
    private static final long CHANNEL = 990682L;
    private final MessageDeliveryDatabaseChecks suite;
    private final ImProperties properties = new ImProperties();
    private final AtomicInteger calls = new AtomicInteger();
    private final AtomicReference<ChannelSendResult> result = new AtomicReference<>(ChannelSendResult.accepted("accepted-message-id"));
    private final AtomicReference<ImMessageSender.Notice> lastNotice = new AtomicReference<>();
    private final ImMessageChannelSender sender;
    private final MessageDeliveryService worker;

    private MessageWeComChecks(MessageDeliveryDatabaseChecks suite, ValidatorFactory validators) {
        this.suite = suite;
        properties.setEnabled(true);
        properties.setSecretKey("message-im-key-" + "K".repeat(48));
        properties.setPublicUrl("https://cloudflow.example.test");
        ImSecretCipher cipher = new ImSecretCipher(properties);
        ImConfigRules rules = new ImConfigRules(properties, cipher, validators.getValidator(), suite.json);
        ImMessageSender provider = new ImMessageSender() {
            @Override public String providerType() { return "WECOM"; }
            @Override public ChannelSendResult send(WeComCredentials credentials, Notice notice) {
                suite.check(!TransactionSynchronizationManager.isActualTransactionActive(), "IM transport is outside transaction");
                suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_delivery WHERE channel_type='WECOM' AND status='SENDING'", Integer.class) == 1,
                        "IM delivery is committed as SENDING before transport");
                suite.check(credentials.tenantId() == suite.TENANT && credentials.configId() == CONFIG, "IM credentials belong to receiver tenant");
                calls.incrementAndGet();
                lastNotice.set(notice);
                return result.get();
            }
        };
        sender = new ImMessageChannelSender(new ImDatabase(suite.mapper(ImMapper.class), suite.manager),
                suite.mapper(SysMessageChannelMapper.class), rules, properties, new ImConnectionProbe(), List.of(provider), null);
        worker = suite.service(new MessageChannelSenderFactory(List.of(sender)));
        suite.jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted) VALUES (?,?,'im-message-user','消息接收人','0',0)", USER, suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,retry_interval_sec,deleted,version) VALUES (?,?,'WECOM','im-message','企业微信消息','ENABLED',1,10,1,1,0,0)", CHANNEL, suite.TENANT);
        suite.jdbc.update("INSERT INTO sys_im_config(config_id,tenant_id,im_type,corp_id,agent_id,app_secret_encrypted,message_enabled,status,deleted,version) VALUES (?,?,'WECOM','message-corp','100001',?,1,'ENABLED',0,0)",
                CONFIG, suite.TENANT, cipher.encrypt(suite.TENANT, "WECOM", ImSecretCipher.Field.APP_SECRET, "message-app-secret"));
        suite.jdbc.update("INSERT INTO sys_im_user_mapping(mapping_id,tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time,status,version) VALUES (990683,?,?,?,'WECOM','Mapped.Member','AUTO_SYNC',NOW(),'ACTIVE',0)", suite.TENANT, CONFIG, USER);
    }

    static void run(MessageDeliveryDatabaseChecks suite, Path seedPath) throws Exception {
        int before = suite.checks.get();
        try (ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            new MessageWeComChecks(suite, validators).verify(seedPath);
        }
        System.out.println("G4_IM_MESSAGE_DATABASE: assertions=" + (suite.checks.get() - before)
                + "; failed=0; real_mysql=true; real_mybatis=true; real_transactions=true; actual_durable_delivery=true; actual_channel_adapter=true; provider=fixture; redis=false; vendor_service=false");
    }

    private void verify(Path seedPath) throws Exception {
        String privateReceipt = "private-im-response-code-never-log";
        ChannelSendResult accepted = ChannelSendResult.accepted("accepted-message-id");
        accepted.setPrivateReceipt(Map.of("responseCode", privateReceipt));
        result.set(accepted);
        suite.check(!suite.json.writeValueAsString(accepted).contains(privateReceipt) && !accepted.toString().contains(privateReceipt), "provider receipt excluded from ordinary JSON and diagnostics");
        MessageSendRequest request = MessageSendRequest.builder().title("通知标题").content("message-private-content")
                .channelTypes(List.of(MessageChannelType.WECOM)).receivers(List.of(MessageReceiver.ofUser(USER))).build();
        SysMessageRecord reserved = reserve(request);
        suite.check("PENDING".equals(reserved.getSendStatus()), "IM record starts pending");
        SysMessageDelivery saved = worker.findByRecord(suite.TENANT, reserved.getRecordId());
        suite.check(!saved.getPayloadEncrypted().contains("message-private-content") && !reserved.getContent().contains("message-private-content"), "IM content is encrypted at rest");
        suite.check("SUCCESS".equals(worker.deliverRecord(suite.TENANT, reserved.getRecordId()).getSendStatus()), "mapped member is accepted by durable delivery");
        suite.check("Mapped.Member".equals(lastNotice.get().externalUserId()), "recipient comes from stored mapping");
        suite.check("accepted-message-id".equals(worker.findByRecord(suite.TENANT, reserved.getRecordId()).getProviderMessageId()), "provider identity persisted");
        SysMessageDelivery received = worker.findByRecord(suite.TENANT, reserved.getRecordId());
        MessageDeliveryPayload receiptPayload = suite.json.readValue(suite.cipher.decrypt(received.getPayloadEncrypted()), MessageDeliveryPayload.class);
        suite.check(!received.getPayloadEncrypted().contains(privateReceipt) && !suite.json.writeValueAsString(received).contains(privateReceipt), "accepted provider receipt has no plaintext database or API field");
        suite.check(privateReceipt.equals(receiptPayload.attempts().get(0).privateReceipt().get("responseCode")), "provider receipt recovered from real encrypted delivery");
        suite.check(!receiptPayload.attempts().get(0).toString().contains(privateReceipt), "receipt attempt diagnostic is redacted");
        MessageDeliveryPayload.Attempt previousFormat = suite.json.readValue("{\"channelId\":1,\"startedAt\":\"2026-09-30T00:00:00\"}", MessageDeliveryPayload.Attempt.class);
        suite.check(previousFormat.privateReceipt().isEmpty(), "existing persisted attempt remains readable without receipt");
        int acceptedCalls = calls.get();
        worker.deliverRecord(suite.TENANT, reserved.getRecordId());
        suite.check(calls.get() == acceptedCalls, "accepted IM delivery never sent twice");

        for (String status : List.of("DISABLED", "OUT_OF_SCOPE", "ACTIVE")) {
            suite.jdbc.update("UPDATE sys_im_user_mapping SET status=?,version=version+1 WHERE mapping_id=990683", status);
            if ("DISABLED".equals(status)) skipped(request, "NO_IM_MAPPING");
            else suite.check("SUCCESS".equals(send(request).getSendStatus()), "usable existing mapping retains notification ability");
        }
        suite.jdbc.update("UPDATE sys_im_user_mapping SET tenant_id=990999 WHERE mapping_id=990683");
        skipped(request, "NO_IM_MAPPING");
        suite.jdbc.update("UPDATE sys_im_user_mapping SET tenant_id=? WHERE mapping_id=990683", suite.TENANT);
        suite.jdbc.update("UPDATE sys_im_config SET tenant_id=990999 WHERE config_id=?", CONFIG);
        skipped(request, "IM_MESSAGE_DISABLED");
        suite.jdbc.update("UPDATE sys_im_config SET tenant_id=?,message_enabled=0 WHERE config_id=?", suite.TENANT, CONFIG);
        skipped(request, "IM_MESSAGE_DISABLED");
        suite.jdbc.update("UPDATE sys_im_config SET message_enabled=1,status='DISABLED' WHERE config_id=?", CONFIG);
        skipped(request, "IM_MESSAGE_DISABLED");
        suite.jdbc.update("UPDATE sys_im_config SET status='ENABLED' WHERE config_id=?", CONFIG);
        properties.setEnabled(false);
        skipped(request, "IM_DISABLED");
        suite.check(!sender.test(ChannelTestContext.builder().tenantId(suite.TENANT).channelId(CHANNEL).build()).isSuccess(), "disabled channel test reports unavailable");
        properties.setEnabled(true);
        String secretKey = properties.getSecretKey();
        properties.setSecretKey(null);
        skipped(request, "IM_SECRET_UNAVAILABLE");
        properties.setSecretKey(secretKey);
        suite.jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=?", suite.TENANT);
        skipped(request, "IM_MESSAGE_TENANT_UNAVAILABLE");
        suite.jdbc.update("UPDATE sys_tenant SET status='0' WHERE tenant_id=?", suite.TENANT);
        suite.jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", USER);
        skipped(request, "RECEIVER_UNAVAILABLE");
        suite.jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=?", USER);
        skipped(request.toBuilder().receivers(List.of(MessageReceiver.ofUser(990999L))).build(), "RECEIVER_UNAVAILABLE");
        suite.jdbc.update("UPDATE sys_im_user_mapping SET im_user_id='@all' WHERE mapping_id=990683");
        skipped(request, "NO_IM_MAPPING");
        suite.jdbc.update("UPDATE sys_im_user_mapping SET im_user_id='Mapped.Member' WHERE mapping_id=990683");

        result.set(ChannelSendResult.unknown("IM_MESSAGE_OUTCOME_UNKNOWN"));
        SysMessageRecord unknown = send(request);
        suite.check("UNKNOWN".equals(unknown.getSendStatus()), "uncertain IM result persists UNKNOWN");
        int unknownCalls = calls.get();
        worker.deliverRecord(suite.TENANT, unknown.getRecordId());
        suite.check(calls.get() == unknownCalls, "UNKNOWN replay does not contact provider");
        result.set(ChannelSendResult.retryable("IM_MESSAGE_PROVIDER_UNAVAILABLE"));
        SysMessageRecord retryable = send(request);
        suite.check("RETRYABLE".equals(worker.findByRecord(suite.TENANT, retryable.getRecordId()).getStatus()), "explicit refusal remains retryable");
        suite.jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=NOW() WHERE record_id=?", retryable.getRecordId());
        suite.jdbc.update("UPDATE sys_im_user_mapping SET status='DISABLED' WHERE mapping_id=990683");
        int retryCalls = calls.get();
        suite.check("NO_IM_MAPPING".equals(worker.deliverRecord(suite.TENANT, retryable.getRecordId()).getSkipReason()) && calls.get() == retryCalls, "unbind before durable retry prevents new send");
        suite.jdbc.update("UPDATE sys_im_user_mapping SET status='ACTIVE' WHERE mapping_id=990683");
        result.set(ChannelSendResult.accepted("accepted-message-id"));

        String formalSeed = Files.readString(seedPath);
        int start = formalSeed.lastIndexOf("INSERT INTO cloud_flow_db.sys_message_template");
        if (start < 0) throw new IllegalArgumentException("IM_MESSAGE_DEFAULTS_REQUIRED");
        String defaults = formalSeed.substring(start, formalSeed.indexOf(';', start) + 1).replace("cloud_flow_db.", "");
        suite.check(defaults.contains("'IM_NOTICE_TEXT'") && defaults.contains("'IM_NOTICE_DETAIL'"), "formal seed includes both IM templates");
        suite.jdbc.execute(defaults);
        suite.jdbc.execute(defaults);
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_template WHERE tenant_id=? AND template_code IN ('IM_NOTICE_TEXT','IM_NOTICE_DETAIL') AND channel_type='WECOM' AND deleted=0", Integer.class, suite.TENANT) == 2,
                "formal defaults are tenant scoped and idempotent");
        suite.check(suite.jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_template message JOIN sys_tenant tenant ON tenant.tenant_id=message.tenant_id WHERE message.template_code IN ('IM_NOTICE_TEXT','IM_NOTICE_DETAIL') AND (tenant.status<>'0' OR tenant.deleted<>0 OR tenant.tenant_id<=0)", Integer.class) == 0,
                "formal defaults exclude unavailable tenants");
        MessageSendRequest template = request.toBuilder().title(null).content(null).templateCode("IM_NOTICE_DETAIL")
                .params(Map.of("content", "card summary", "title", "card title", "detailPath", "/workflow/tasks?taskId=123")).build();
        SysMessageRecord templated = send(template);
        suite.check("SUCCESS".equals(templated.getSendStatus()), "IM message template sends through durable channel");
        suite.check("https://cloudflow.example.test/workflow/tasks?taskId=123".equals(lastNotice.get().linkUrl()), "template detail link rendered and restricted to own site");
        suite.check("card title".equals(lastNotice.get().title()) && "card summary".equals(lastNotice.get().content()), "template content reused");
        suite.check("SUCCESS".equals(send(template.toBuilder().templateCode("IM_NOTICE_TEXT").params(Map.of("title", "plain title", "content", "plain content")).build()).getSendStatus())
                && lastNotice.get().linkUrl() == null, "formal text template uses text transport");
        int beforeMissing = calls.get();
        suite.check("FAILED".equals(send(template.toBuilder().params(Map.of("title", "title", "content", "body")).build()).getSendStatus())
                && calls.get() == beforeMissing, "missing detail parameter fails before provider call");
        suite.jdbc.update("UPDATE sys_message_template SET title_template='local template',version=version+1 WHERE tenant_id=? AND template_code='IM_NOTICE_TEXT' AND channel_type='WECOM'", suite.TENANT);
        suite.jdbc.execute(defaults);
        suite.check("local template".equals(suite.jdbc.queryForObject("SELECT title_template FROM sys_message_template WHERE tenant_id=? AND template_code='IM_NOTICE_TEXT' AND channel_type='WECOM'", String.class, suite.TENANT)),
                "formal defaults preserve administrator template changes");
        int beforeInvalid = calls.get();
        suite.check("FAILED".equals(send(request.toBuilder().linkUrl("https://evil.test/task").build()).getSendStatus()), "foreign card link is rejected");
        suite.check("FAILED".equals(send(request.toBuilder().content("中".repeat(700)).build()).getSendStatus()), "oversize text fails before vendor send");
        suite.check(calls.get() == beforeInvalid, "invalid content never reaches provider");
        suite.check(!lastNotice.get().toString().contains("card summary"), "prepared message not logged by string conversion");
    }

    private SysMessageRecord reserve(MessageSendRequest request) {
        BusinessEventEnvelope event = suite.envelope(request);
        return new TransactionTemplate(suite.manager).execute(status -> worker.reserve(event, request, MessageChannelType.WECOM, request.safeReceivers().get(0)));
    }
    private SysMessageRecord send(MessageSendRequest request) { return worker.deliverRecord(suite.TENANT, reserve(request).getRecordId()); }
    private void skipped(MessageSendRequest request, String reason) {
        int before = calls.get();
        SysMessageRecord record = send(request);
        suite.check("SKIPPED".equals(record.getSendStatus()) && Objects.equals(reason, record.getSkipReason()), "IM unavailability saves expected skip reason " + reason);
        suite.check(calls.get() == before, "unavailable IM member or config is never sent");
    }
}

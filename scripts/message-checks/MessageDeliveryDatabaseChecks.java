package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.*;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.channel.*;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

public class MessageDeliveryDatabaseChecks {
    static final Long TENANT = 100000L;
    final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
    final MessageSecretCipher cipher = new MessageSecretCipher("message-fixture-encryption-key-at-least-32-characters");
    final JdbcTemplate jdbc;
    final DataSourceTransactionManager manager;
    final SqlSessionTemplate sessions;
    final AtomicInteger checks = new AtomicInteger();
    final AtomicInteger sends = new AtomicInteger();
    volatile Supplier<ChannelSendResult> outcome = ChannelSendResult::success;
    final MessageDeliveryService deliveries;
    final MessageDispatchService dispatch;
    final MessageSender publisher;
    final MessageChannelSenderFactory senderFactory;

    public static void main(String[] arguments) throws Exception {
        MessageDeliveryDatabaseChecks suite = new MessageDeliveryDatabaseChecks(arguments[0], Path.of(arguments[1]));
        try {
            MessageOutboxRecoveryChecks.run(suite);
            suite.identityAndEncryption();
            suite.statesAndBoundaries();
            suite.concurrentDispatch();
            suite.databaseFailure();
            suite.quotasAndSource();
            MessageDeliveryPolicyChecks.run(suite);
            MessageDeliveryResolutionChecks.run(suite);
            MessageRecordManagementChecks.run(suite);
            MessageInternalTransactionChecks.run(suite);
            MessageSensitiveSerializationChecks.run(suite);
            MessageSourcePreparationChecks.run(suite);
            MessageSendBoundaryChecks.run(suite);
            MessageSmsCodeChecks.run(suite);
            MessagePortalInvitationChecks.run(suite);
            MessageSmtpProtocolChecks.run(suite, Path.of(arguments[2]), System.getenv("CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD"));
            MessageWeComChecks.run(suite, Path.of(arguments[3]));
            MessageSmsSubscriptionChecks.run(suite);
            MessageUnimplementedChannelChecks.run(suite);
            System.out.println("MESSAGE_DELIVERY_DATABASE_CHECKS: assertions=" + suite.checks.get()
                    + "; failed=0; mysql=true; tenant_interceptor=true; transactions=true; transport_recorders=true; real_smtp_protocol=true; production_modified=false");
        } finally {
            UserContext.clear();
        }
    }

    MessageDeliveryDatabaseChecks(String url, Path mapperList) throws Exception {
        if (!url.startsWith("jdbc:mysql://127.0.0.1:") || !url.contains("/message_delivery_")) throw new IllegalArgumentException("OWNED_DATABASE_REQUIRED");
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        manager = new DataSourceTransactionManager(source);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        for (Class<?> mapper : List.of(SysMessageDeliveryMapper.class, SysMessageRecordMapper.class, SysMessageChannelMapper.class,
                SysMessageTemplateMapper.class, SysMessageSubscribeMapper.class, SysUserMapper.class, SysUserRoleMapper.class,
                SysDeptMapper.class, SysUserTotpMapper.class, SysPortalUserMapper.class, SysTenantMapper.class,
                OutboxEventMapper.class, SysAuditLogMapper.class, SysSmsCodeMapper.class, com.cloudflow.auth.mapper.ImMapper.class)) configuration.addMapper(mapper);
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setMapperLocations(Files.readAllLines(mapperList).stream().map(file -> (Resource) new FileSystemResource(file)).toArray(Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        UserContext.setTenantId(TENANT);
        UserContext.setUserId(1L);
        UserContext.setUserName("message-check");
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("message-check", Map.of("spring.application.name", "cloudflow-auth",
                "cloudflow.message.secret-key", "message-fixture-encryption-key-at-least-32-characters")));
        OutboxPublisher outbox = new OutboxPublisher(mapper(OutboxEventMapper.class), json);
        publisher = new MessageAutoConfiguration().messageSender(outbox, json, environment);
        MessageChannelSender transport = new MessageChannelSender() {
            public MessageChannelType channelType() { return MessageChannelType.EMAIL; }
            public boolean implemented() { return true; }
            public ChannelSendResult send(ChannelSendContext context) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "provider called outside transaction");
                String status = jdbc.queryForObject("SELECT status FROM sys_message_delivery WHERE delivery_id=?", String.class, context.getDeliveryId());
                check("SENDING".equals(status), "SENDING visible from independent connection before provider call");
                sends.incrementAndGet();
                return outcome.get();
            }
        };
        senderFactory = new MessageChannelSenderFactory(List.of(transport));
        deliveries = service(senderFactory);
        dispatch = new MessageDispatchService(json, mapper(SysMessageChannelMapper.class), mapper(SysMessageTemplateMapper.class),
                mapper(SysMessageRecordMapper.class), mapper(SysMessageSubscribeMapper.class), mapper(SysUserMapper.class),
                mapper(SysUserRoleMapper.class), mapper(SysDeptMapper.class), senderFactory, cipher, publisher, null, deliveries, manager);
        jdbc.update("INSERT INTO sys_message_channel (channel_id,tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,retry_interval_sec,deleted,version) VALUES (100,?,'EMAIL','test-mail','test-mail','ENABLED',1,10,2,1,0,0)", TENANT);
    }

    MessageDeliveryService service(MessageChannelSenderFactory factory) {
        return service(factory, List.of());
    }

    MessageDeliveryService service(MessageChannelSenderFactory factory, List<MessageDeliverySourceGuard> guards) {
        return new MessageDeliveryService(mapper(SysMessageDeliveryMapper.class), mapper(SysMessageRecordMapper.class), mapper(SysMessageChannelMapper.class),
                mapper(SysMessageTemplateMapper.class), mapper(SysMessageSubscribeMapper.class), mapper(SysUserMapper.class), factory,
                cipher, json, manager, guards, new OutboxPublisher(mapper(OutboxEventMapper.class), json), mapper(SysAuditLogMapper.class));
    }

    void identityAndEncryption() throws Exception {
        String sensitive = "token_" + UUID.randomUUID();
        MessageSendRequest request = request("User.Name@EXAMPLE.COM").toBuilder().content("<p>" + sensitive + "</p>")
                .deduplicationKey("same-source").build();
        new TransactionTemplate(manager).execute(status -> { publisher.send(request); return null; });
        String persisted = jdbc.queryForObject("SELECT payload_json FROM outbox_event", String.class);
        check(!persisted.contains(sensitive) && !persisted.contains("User.Name@"), "outbox has no raw recipient or token");
        BusinessEventEnvelope envelope = json.readValue(persisted, BusinessEventEnvelope.class);
        check(MessagePayloadCodec.decode(envelope, json, cipher).getContent().contains(sensitive), "protected event round trip");
        Long sourceTenant = envelope.getTenantId();
        envelope.setTenantId(100001L);
        rejects(() -> MessagePayloadCodec.decode(envelope, json, cipher), "encrypted event tenant binding");
        envelope.setTenantId(sourceTenant);
        rejects(() -> MessagePayloadCodec.decode(envelope, json, new MessageSecretCipher("different-encryption-key-with-at-least-32-characters")), "encrypted event wrong key rejected");
        rejects(() -> MessagePayloadCodec.decode(envelope, json, new MessageSecretCipher("")), "encrypted event missing key rejected");
        new TransactionTemplate(manager).execute(status -> { publisher.send(request); return null; });
        check(jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event", Integer.class) == 1, "stable outbox same payload has one event");
        rejects(() -> new TransactionTemplate(manager).execute(status -> { publisher.send(request.toBuilder().content("different").build()); return null; }), "stable outbox different content rejected");
        SysMessageRecord sent = dispatch.dispatch(envelope).records().get(0);
        check("SUCCESS".equals(sent.getSendStatus()), "explicit acceptance records success");
        String record = jdbc.queryForObject("SELECT content FROM sys_message_record WHERE record_id=?", String.class, sent.getRecordId());
        check(!record.contains(sensitive), "ordinary message body excludes token");
        SysMessageDelivery delivery = deliveries.findByRecord(TENANT, sent.getRecordId());
        check(!delivery.getPayloadEncrypted().contains(sensitive), "delivery payload encrypted");
        check(cipher.decrypt(delivery.getPayloadEncrypted()).contains(sensitive), "delivery payload independently decrypted");
        int before = sends.get();
        dispatch.dispatch(envelope);
        check(before == sends.get(), "redelivery after SENT never calls provider");
        MessageSendRequest changed = request.toBuilder().content("different").build();
        MessagePayloadCodec.encode(envelope, changed, json, cipher);
        rejects(() -> { try { dispatch.dispatch(envelope); } catch (Exception failure) { throw new RuntimeException(failure); } }, "same delivery different content rejected");
        check("User.Name@example.com".equals(MessageEmailAddress.normalize("User.Name@EXAMPLE.COM")), "domain normalized without changing local semantics");
        check(!MessageEmailAddress.normalize("User@example.com").equals(MessageEmailAddress.normalize("user@example.com")), "local part case preserved");
        for (String invalid : List.of("a@example.com\r\nBcc: x@example.com", "a@example.com,b@example.com", "Name <a@example.com>", "a@example.com.")) {
            rejects(() -> MessageEmailAddress.normalize(invalid), "invalid multi-recipient or injected address rejected");
        }
    }

    void statesAndBoundaries() throws Exception {
        outcome = () -> ChannelSendResult.unknown("SMTP_OUTCOME_UNKNOWN");
        SysMessageRecord unknown = send("unknown@example.com");
        check("UNKNOWN".equals(unknown.getSendStatus()), "uncertain response retained UNKNOWN");
        int before = sends.get();
        deliveries.deliverRecord(TENANT, unknown.getRecordId());
        check(before == sends.get(), "UNKNOWN not retried");
        check(!deliveries.requestResend(TENANT, unknown.getRecordId()), "legacy resend rejects UNKNOWN");
        outcome = () -> ChannelSendResult.retryable("SMTP_REJECTED_450");
        SysMessageRecord retry = send("retry@example.com");
        check("RETRYABLE".equals(retry.getSendStatus()), "explicit temporary refusal retryable");
        before = sends.get();
        deliveries.deliverRecord(TENANT, retry.getRecordId());
        check(sends.get() == before, "retry respects next attempt time");
        jdbc.update("UPDATE sys_message_delivery SET next_attempt_time=DATE_SUB(NOW(), INTERVAL 1 SECOND) WHERE record_id=?", retry.getRecordId());
        outcome = ChannelSendResult::success;
        check("SUCCESS".equals(deliveries.deliverRecord(TENANT, retry.getRecordId()).getSendStatus()), "known safe retry can succeed");
        SysMessageRecord pending = reserve(request("claim@example.com"));
        jdbc.update("UPDATE sys_message_delivery SET status='CLAIMED',claim_owner='dead-worker',claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND),send_started_time=NULL WHERE record_id=?", pending.getRecordId());
        check("SUCCESS".equals(deliveries.deliverRecord(TENANT, pending.getRecordId()).getSendStatus()), "expired unsent claim safely recovered");
        SysMessageRecord inFlight = reserve(request("inflight@example.com"));
        jdbc.update("UPDATE sys_message_delivery SET status='SENDING',claim_owner='dead-worker',claim_until=DATE_SUB(NOW(),INTERVAL 1 SECOND),send_started_time=NOW() WHERE record_id=?", inFlight.getRecordId());
        before = sends.get();
        check("UNKNOWN".equals(deliveries.deliverRecord(TENANT, inFlight.getRecordId()).getSendStatus()), "expired SENDING becomes UNKNOWN");
        check(before == sends.get(), "expired SENDING never calls provider again");
        SysMessageRecord cancelled = reserve(request("cancel@example.com"));
        check(deliveries.cancelUnstarted(TENANT, cancelled.getRecordId()), "unstarted cancellation accepted");
        check("CANCELLED".equals(deliveries.deliverRecord(TENANT, cancelled.getRecordId()).getSendStatus()), "cancelled delivery remains cancelled");
        rejects(() -> deliveries.deliverRecord(100001L, cancelled.getRecordId()), "cross tenant context rejected");
        rejects(() -> new TransactionTemplate(manager).execute(status -> deliveries.deliverRecord(TENANT, cancelled.getRecordId())), "active business transaction cannot perform network send");
        SysMessageRecord corrupt = reserve(request("corrupt@example.com"));
        jdbc.update("UPDATE sys_message_delivery SET payload_encrypted='corrupted' WHERE record_id=?", corrupt.getRecordId());
        before = sends.get();
        check("FAILED".equals(deliveries.deliverRecord(TENANT, corrupt.getRecordId()).getSendStatus()), "corrupted payload fails closed");
        check(before == sends.get(), "corrupted payload never calls provider");
    }

    void concurrentDispatch() throws Exception {
        outcome = ChannelSendResult::success;
        BusinessEventEnvelope event = envelope(request("race@example.com"));
        int before = sends.get();
        ExecutorService executor = Executors.newFixedThreadPool(2);
        CountDownLatch ready = new CountDownLatch(2);
        try {
            List<Future<Long>> futures = java.util.stream.IntStream.range(0, 2).mapToObj(index -> executor.submit(() -> {
                UserContext.setTenantId(TENANT);
                try { ready.countDown(); ready.await(5, TimeUnit.SECONDS); return dispatch.dispatch(event).firstRecordId(); }
                finally { UserContext.clear(); }
            })).toList();
            Long first = futures.get(0).get(20, TimeUnit.SECONDS);
            Long second = futures.get(1).get(20, TimeUnit.SECONDS);
            check(first.equals(second), "concurrent same receiver gets same record");
            check(sends.get() == before + 1, "concurrent same receiver sends exactly once");
            check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_message_record WHERE outbox_event_id=?", Integer.class, event.getEventId()) == 1, "concurrent reserve leaves no orphan record");
        } finally { executor.shutdownNow(); }
    }

    void databaseFailure() throws Exception {
        outcome = ChannelSendResult::success;
        SysMessageRecord record = reserve(request("failure@example.com"));
        jdbc.execute("CREATE TRIGGER reject_message_success BEFORE UPDATE ON sys_message_record FOR EACH ROW BEGIN IF NEW.send_status='SUCCESS' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='MESSAGE_FIXTURE_FAILURE'; END IF; END");
        int before = sends.get();
        try { rejects(() -> deliveries.deliverRecord(TENANT, record.getRecordId()), "actual result database failure surfaced"); }
        finally { jdbc.execute("DROP TRIGGER reject_message_success"); }
        check(sends.get() == before + 1, "provider was called before injected final result failure");
        check("SENDING".equals(deliveries.findByRecord(TENANT, record.getRecordId()).getStatus()), "failed result transaction rolls back delivery and record together");
        deliveries.deliverRecord(TENANT, record.getRecordId());
        check(sends.get() == before + 1, "redelivery does not repeat uncertain external side effect");
    }

    void quotasAndSource() throws Exception {
        jdbc.update("UPDATE sys_message_channel SET rate_limit_minute=1,daily_limit=2 WHERE channel_id=100");
        SysMessageRecord quota = send("quota@example.com");
        check("PENDING".equals(quota.getSendStatus()), "database attempts enforce quota without Redis");
        check(deliveries.findByRecord(TENANT, quota.getRecordId()).getAttemptCount() == 0, "quota rejection does not count unsent delivery");
        jdbc.update("UPDATE sys_message_channel SET rate_limit_minute=NULL,daily_limit=NULL WHERE channel_id=100");
        SysMessageRecord missingSource = reserve(request("source@example.com").toBuilder().bizType("RFQ_INVITE").bizId("123").build());
        int before = sends.get();
        check("SKIPPED".equals(deliveries.deliverRecord(TENANT, missingSource.getRecordId()).getSendStatus()), "unavailable source verification disables external business send");
        check(before == sends.get(), "unverified business source never contacts provider");
        SysMessageRecord disabled = reserve(request("disabled@example.com"));
        jdbc.update("UPDATE sys_message_channel SET status='DISABLED' WHERE channel_id=100");
        check("SKIPPED".equals(deliveries.deliverRecord(TENANT, disabled.getRecordId()).getSendStatus()), "channel disabled after reserve prevents send");
        jdbc.update("UPDATE sys_message_channel SET status='ENABLED' WHERE channel_id=100");
    }

    SysMessageRecord send(String address) throws Exception { return dispatch.dispatch(envelope(request(address))).records().get(0); }
    SysMessageRecord reserve(MessageSendRequest request) {
        BusinessEventEnvelope envelope = envelope(request);
        return new TransactionTemplate(manager).execute(status -> deliveries.reserve(envelope, request, MessageChannelType.EMAIL, request.safeReceivers().get(0)));
    }
    BusinessEventEnvelope envelope(MessageSendRequest request) {
        BusinessEventEnvelope envelope = BusinessEventEnvelope.builder().eventId(UUID.randomUUID().toString()).eventType("MESSAGE_SEND")
                .sourceModule("cloudflow-auth").tenantId(TENANT).build();
        MessagePayloadCodec.encode(envelope, request, json, cipher);
        return envelope;
    }
    MessageSendRequest request(String address) { return MessageSendRequest.builder().title("测试邮件").content("<p>测试正文</p>")
            .channelTypes(List.of(MessageChannelType.EMAIL)).receivers(List.of(MessageReceiver.builder().receiverType("EMAIL").receiverAddress(address).build())).build(); }
    <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }
    void check(boolean condition, String description) { if (!condition) throw new AssertionError(description); checks.incrementAndGet(); System.out.println("PASS " + description); }
    void rejects(Runnable operation, String description) { boolean rejected = false; try { operation.run(); } catch (RuntimeException failure) { rejected = true; } check(rejected, description); }
}

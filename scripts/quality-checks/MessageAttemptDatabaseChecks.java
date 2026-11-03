package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.MessageAttemptCounts;
import com.cloudflow.auth.mapper.SysMessageDeliveryMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.function.Supplier;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/** Uses a new loopback-only schema, actual InnoDB tables, production mappers and production transactions. */
public final class MessageAttemptDatabaseChecks {
    private static final long TENANT = 91001L;
    private static final String OWNER = "quality-owner";
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static final MessageSecretCipher CIPHER = new MessageSecretCipher("only-in-process-quality-key-at-least-32-characters");
    private final DriverManagerDataSource source;
    private final JdbcTemplate database;
    private final SysMessageDeliveryMapper deliveries;
    private final MessageDeliveryService service;
    private final Method transaction;
    private final Method begin;
    private final Method release;
    private final Method finish;

    private MessageAttemptDatabaseChecks(DriverManagerDataSource source, Path mapper) throws Exception {
        this.source = source;
        this.database = new JdbcTemplate(source);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(NoLoggingImpl.class);
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        configuration.addMapper(SysMessageRecordMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setMapperLocations(new FileSystemResource(mapper));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        this.deliveries = sessions.getMapper(SysMessageDeliveryMapper.class);
        OutboxPublisher outcomes = new OutboxPublisher(null, JSON) {
            @Override public void publishOnceAt(BusinessEventEnvelope envelope, LocalDateTime nextAttemptAt) {
                check(TransactionSynchronizationManager.isActualTransactionActive(), "outcome remains in state transaction");
            }
        };
        this.service = new MessageDeliveryService(deliveries, sessions.getMapper(SysMessageRecordMapper.class),
                null, null, null, null, null, CIPHER, JSON, new DataSourceTransactionManager(source), List.of(), outcomes, null);
        this.transaction = method("transaction", Supplier.class);
        this.begin = method("beginSending", Long.class, Long.class, String.class);
        this.release = method("finishSendBoundary", Long.class, Long.class, String.class, String.class);
        this.finish = method("finish", Long.class, Long.class, String.class, ChannelSendResult.class);
    }

    public static void main(String[] arguments) throws Exception {
        String url = required("MESSAGE_QUALITY_JDBC_URL");
        Matcher destination = Pattern.compile("^jdbc:mysql://127\\.0\\.0\\.1:(\\d{4,5})/(quality_message_[a-f0-9]{32})(\\?.*)?$").matcher(url);
        if (!destination.matches()) throw new IllegalArgumentException("Only a new quality_message_<UUID> schema on loopback is allowed.");
        int port = Integer.parseInt(destination.group(1));
        if (port < 1025 || port > 65535) throw new IllegalArgumentException("Dedicated local MySQL port required.");
        String schema = destination.group(2);
        String query = destination.group(3) == null ? "" : destination.group(3);
        String user = required("MESSAGE_QUALITY_JDBC_USER");
        String password = System.getenv().getOrDefault("MESSAGE_QUALITY_JDBC_PASSWORD", "");
        DriverManagerDataSource admin = new DriverManagerDataSource("jdbc:mysql://127.0.0.1:" + port + "/" + query, user, password);
        JdbcTemplate administration = new JdbcTemplate(admin);
        if (administration.queryForObject("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?", Long.class, schema) != 0L) {
            throw new IllegalStateException("Refusing to use an existing schema.");
        }
        administration.execute("CREATE DATABASE `" + schema + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        try {
            DriverManagerDataSource source = new DriverManagerDataSource(url, user, password);
            String ddl = Files.readString(Path.of(arguments[0]));
            JdbcTemplate database = new JdbcTemplate(source);
            for (String table : List.of("sys_message_channel", "sys_message_record", "sys_message_delivery", "sys_message_delivery_attempt")) {
                Matcher create = Pattern.compile("(?ms)^CREATE TABLE " + table + "\\s*\\(.*?^\\) ENGINE=.*?;").matcher(ddl);
                if (!create.find()) throw new AssertionError("Missing formal DDL: " + table);
                database.execute(create.group());
            }
            MessageAttemptDatabaseChecks checks = new MessageAttemptDatabaseChecks(source, Path.of(arguments[1]));
            identity(TENANT);
            checks.countBoundaries();
            checks.rollbackTogether();
            checks.concurrentQuota();
            checks.releaseTogether();
            System.out.println("MESSAGE_ATTEMPT_MYSQL_CHECKS: passed=" + CHECKS.get()
                    + "; actual_mysql_transactions=true; actual_mapper_and_tenant_interceptor=true; concurrent_senders=2; external_send=false; outcome_publisher=controlled");
        } finally {
            UserContext.clear(); TenantContext.clear();
            administration.execute("DROP DATABASE `" + schema + "`");
            if (administration.queryForObject("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?", Long.class, schema) != 0L) {
                throw new AssertionError("Owned test schema cleanup failed.");
            }
            System.out.println("MESSAGE_ATTEMPT_MYSQL_SCHEMA_REMOVED=" + schema);
        }
    }

    private void countBoundaries() {
        LocalDateTime day = LocalDateTime.of(2026, 11, 3, 0, 0);
        LocalDateTime minute = day.plusHours(12).plusMinutes(34);
        deliveries.insertAttempt(TENANT, 1L, 1, 71L, day.minusNanos(1000));
        deliveries.insertAttempt(TENANT, 1L, 2, 71L, day);
        deliveries.insertAttempt(TENANT, 1L, 3, 71L, minute.minusNanos(1000));
        deliveries.insertAttempt(TENANT, 1L, 4, 71L, minute);
        deliveries.insertAttempt(TENANT, 2L, 1, 72L, minute);
        identity(TENANT + 1);
        deliveries.insertAttempt(TENANT + 1, 3L, 1, 71L, minute);
        counts(TENANT + 1, 71L, day, minute, 1, 1);
        check(deliveries.deleteAttempt(TENANT + 1, 1L, 4) == 0, "another tenant cannot release its peer's allowance");
        identity(TENANT);
        counts(TENANT, 71L, day, minute, 3, 1);
        counts(TENANT, 72L, day, minute, 1, 1);
        counts(TENANT, 71L, day.plusDays(1), day.plusDays(1), 0, 0);
    }

    private void rollbackTogether() throws Exception {
        channel(100L);
        delivery(1001L, 100L);
        try {
            inTransaction(() -> {
                check(prepare(1001L) != null, "rollback fixture reaches send preparation");
                throw new ForcedRollback();
            });
            throw new AssertionError("Expected transaction failure.");
        } catch (ForcedRollback expected) { }
        check(attempts(1001L) == 0, "failed preparation rolls back the allowance row");
        check("CLAIMED".equals(status(1001L)) && scalar("SELECT attempt_count FROM sys_message_delivery WHERE delivery_id=?", 1001L) == 0,
                "failed preparation rolls back delivery status and attempt count");
        check(scalar("SELECT COUNT(*) FROM sys_message_record WHERE record_id=? AND send_time IS NULL AND send_status='PENDING'", 101001L) == 1,
                "failed preparation rolls back the public message state and send time");
    }

    private void concurrentQuota() throws Exception {
        channel(200L);
        delivery(2001L, 200L); delivery(2002L, 200L);
        CountDownLatch firstPrepared = new CountDownLatch(1);
        CountDownLatch permitCommit = new CountDownLatch(1);
        CountDownLatch secondStarted = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<ChannelSendContext> first = workers.submit(() -> withIdentity(() -> inTransaction(() -> {
                ChannelSendContext context = prepare(2001L);
                check(context != null, "first contender prepares an actual attempt");
                firstPrepared.countDown();
                await(permitCommit);
                return context;
            })));
            check(firstPrepared.await(10, TimeUnit.SECONDS), "first sender holds the uncommitted channel allowance");
            Future<ChannelSendContext> second = workers.submit(() -> withIdentity(() -> inTransaction(() -> {
                secondStarted.countDown();
                return prepare(2002L);
            })));
            check(secondStarted.await(10, TimeUnit.SECONDS), "second sender has entered its own transaction");
            try {
                second.get(200, TimeUnit.MILLISECONDS);
                throw new AssertionError("Second sender bypassed the channel row lock.");
            } catch (TimeoutException expected) {
                check(true, "competing sender waits for the held channel row lock");
            } finally { permitCommit.countDown(); }
            check(first.get(10, TimeUnit.SECONDS) != null && second.get(10, TimeUnit.SECONDS) == null,
                    "daily limit one admits exactly one of two concurrent messages");
        } finally {
            permitCommit.countDown(); workers.shutdownNow();
            if (!workers.awaitTermination(10, TimeUnit.SECONDS)) throw new AssertionError("Concurrent workers did not stop.");
        }
        check(attempts(2001L) == 1 && attempts(2002L) == 0, "only committed actual preparation occupies quota");
        check("SENDING".equals(status(2001L)) && "PENDING".equals(status(2002L)), "excess message remains pending");
        check(scalar("SELECT COUNT(*) FROM sys_message_delivery WHERE delivery_id=? AND last_error_code='CHANNEL_QUOTA' AND next_attempt_time IS NOT NULL", 2002L) == 1,
                "quota rejection records its retry schedule");
        inTransaction(() -> { invoke(finish, service, TENANT, 2001L, OWNER, ChannelSendResult.unknown("PROVIDER_OUTCOME_UNKNOWN")); return null; });
        check("UNKNOWN".equals(status(2001L)) && attempts(2001L) == 1, "unknown provider outcome retains the consumed allowance");
    }

    private void releaseTogether() throws Exception {
        channel(300L); delivery(3001L, 300L);
        inTransaction(() -> prepare(3001L));
        try {
            inTransaction(() -> {
                invoke(release, service, TENANT, 3001L, OWNER, "SOURCE_UNAVAILABLE");
                throw new ForcedRollback();
            });
            throw new AssertionError("Expected release rollback.");
        } catch (ForcedRollback expected) { }
        check("SENDING".equals(status(3001L)) && attempts(3001L) == 1, "failed release preserves both state and its allowance");
        inTransaction(() -> { invoke(release, service, TENANT, 3001L, OWNER, "SOURCE_UNAVAILABLE"); return null; });
        check("PENDING".equals(status(3001L)) && attempts(3001L) == 0, "confirmed pre-send rejection releases state and allowance together");
        check(scalar("SELECT COUNT(*) FROM sys_message_delivery WHERE delivery_id=? AND attempt_count=0 AND send_started_time IS NULL", 3001L) == 1,
                "release resets the latest attempt state");
        check(scalar("SELECT COUNT(*) FROM sys_message_record WHERE record_id=? AND send_time IS NULL", 103001L) == 1,
                "release clears the message send time");
    }

    private void channel(long channelId) {
        database.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,daily_limit,implemented_flag) VALUES (?,?,'EMAIL',?,?,1,1)",
                channelId, TENANT, "quality-" + channelId, "Quality channel");
    }

    private void delivery(long deliveryId, long channelId) throws Exception {
        long recordId = deliveryId + 100000L;
        String eventId = "quality-event-" + deliveryId;
        String hash = MessagePayloadCodec.hash(eventId);
        MessageReceiver receiver = MessageReceiver.builder().receiverType("EMAIL").receiverAddress("quality@example.invalid").build();
        MessageSendRequest request = MessageSendRequest.builder().receivers(List.of(receiver)).channelTypes(List.of(MessageChannelType.EMAIL)).build();
        ChannelSendContext context = ChannelSendContext.builder().recordId(recordId).tenantId(TENANT).channelId(channelId).receiver(receiver).params(Map.of()).build();
        MessageDeliveryPayload payload = new MessageDeliveryPayload(TENANT, eventId, "cloudflow-auth", request, context, hash, null, null, List.of());
        String encrypted = CIPHER.encrypt(JSON.writeValueAsString(MessagePayloadCodec.internalTree(payload, JSON)));
        database.update("INSERT INTO sys_message_record(record_id,tenant_id,channel_type,channel_id,receiver_type) VALUES (?,?,'EMAIL',?,'EMAIL')", recordId, TENANT, channelId);
        database.update("INSERT INTO sys_message_delivery(delivery_id,tenant_id,record_id,outbox_event_id,channel_type,receiver_key,payload_hash,payload_encrypted,status,claim_owner,claim_until) VALUES (?,?,?,?,'EMAIL',?,?,?,'CLAIMED',?,?)",
                deliveryId, TENANT, recordId, eventId, MessagePayloadCodec.hash("EMAIL:quality@example.invalid"), hash, encrypted, OWNER, LocalDateTime.now().plusMinutes(2));
    }

    @SuppressWarnings("unchecked")
    private <Result> Result inTransaction(Supplier<Result> operation) {
        return (Result) invoke(transaction, service, (Supplier<Result>) () -> {
            try {
                check(TransactionSynchronizationManager.isActualTransactionActive()
                        && DataSourceUtils.getConnection(source).getTransactionIsolation() == Connection.TRANSACTION_READ_COMMITTED,
                        "production transaction uses READ_COMMITTED");
            } catch (java.sql.SQLException failure) { throw new IllegalStateException(failure); }
            return operation.get();
        });
    }
    private ChannelSendContext prepare(long deliveryId) { return (ChannelSendContext) invoke(begin, service, TENANT, deliveryId, OWNER); }
    private long attempts(long deliveryId) { return scalar("SELECT COUNT(*) FROM sys_message_delivery_attempt WHERE delivery_id=?", deliveryId); }
    private String status(long deliveryId) { return database.queryForObject("SELECT status FROM sys_message_delivery WHERE delivery_id=?", String.class, deliveryId); }
    private long scalar(String query, long identifier) { return Objects.requireNonNull(database.queryForObject(query, Long.class, identifier)); }
    private void counts(long tenant, long channel, LocalDateTime day, LocalDateTime minute, long daily, long minuteCount) {
        MessageAttemptCounts counts = deliveries.attemptCounts(tenant, channel, day, minute);
        check(counts.getDayCount() == daily && counts.getMinuteCount() == minuteCount, "MySQL counts exact natural period and tenant/channel boundaries");
    }
    private static void identity(long tenant) { UserContext.setTenantId(tenant); UserContext.setUserId(91L); TenantContext.setTenantId(tenant); }
    private static <Result> Result withIdentity(Supplier<Result> operation) { identity(TENANT); try { return operation.get(); } finally { UserContext.clear(); TenantContext.clear(); } }
    private static Method method(String name, Class<?>... types) throws Exception { Method method = MessageDeliveryService.class.getDeclaredMethod(name, types); method.setAccessible(true); return method; }
    private static Object invoke(Method method, Object target, Object... arguments) {
        try { return method.invoke(target, arguments); }
        catch (InvocationTargetException failure) {
            if (failure.getCause() instanceof RuntimeException cause) throw cause;
            if (failure.getCause() instanceof Error cause) throw cause;
            throw new IllegalStateException(failure.getCause());
        } catch (ReflectiveOperationException failure) { throw new IllegalStateException(failure); }
    }
    private static void await(CountDownLatch latch) { try { if (!latch.await(10, TimeUnit.SECONDS)) throw new AssertionError("Timed out coordinating two senders."); } catch (InterruptedException failure) { Thread.currentThread().interrupt(); throw new IllegalStateException(failure); } }
    private static String required(String name) { String value = System.getenv(name); if (value == null || value.isBlank()) throw new IllegalArgumentException("Missing " + name); return value; }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); CHECKS.incrementAndGet(); }
    private static final class ForcedRollback extends RuntimeException { }
}

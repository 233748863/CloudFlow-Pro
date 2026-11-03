package com.cloudflow.auth.message;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.auth.domain.MessageAttemptCounts;
import com.cloudflow.auth.domain.SysMessageChannel;
import com.cloudflow.auth.domain.SysMessageDelivery;
import com.cloudflow.auth.domain.SysMessageRecord;
import com.cloudflow.auth.mapper.SysMessageDeliveryMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.message.api.MessageReceiver;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.ChannelSendContext;
import com.cloudflow.common.message.constant.MessageChannelType;
import com.cloudflow.common.message.security.MessagePayloadCodec;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.ibatis.builder.MapperBuilderAssistant;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.Environment;
import org.apache.ibatis.session.SqlSession;
import org.apache.ibatis.session.SqlSessionFactoryBuilder;
import org.apache.ibatis.transaction.jdbc.JdbcTransactionFactory;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** Executes the actual attempt mapper SQL on temporary H2 MySQL mode, not production MySQL. */
public final class MessageAttemptChecks {
    private static int checks;
    private static final Long TENANT = 91001L;
    private static final Long CHANNEL = 71L;
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();

    public static void main(String[] arguments) throws Exception {
        DriverManagerDataSource data = new DriverManagerDataSource("jdbc:h2:mem:message_attempt_quality;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
        String schema = Files.readString(Path.of(arguments[0]));
        Matcher create = Pattern.compile("(?ms)^CREATE TABLE sys_message_delivery_attempt\\s*\\(.*?^\\) ENGINE=.*?;").matcher(schema);
        check(create.find(), "formal rebuild schema contains the attempt table");
        try (java.sql.Connection connection = data.getConnection(); java.sql.Statement statement = connection.createStatement()) {
            statement.execute(create.group());
        }
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setEnvironment(new Environment("attempt-quality", new JdbcTransactionFactory(), data));
        try (InputStream source = Files.newInputStream(Path.of(arguments[1]))) {
            new XMLMapperBuilder(source, configuration, arguments[1], configuration.getSqlFragments()).parse();
        }
        try (SqlSession session = new SqlSessionFactoryBuilder().build(configuration).openSession(true)) {
            SysMessageDeliveryMapper mapper = session.getMapper(SysMessageDeliveryMapper.class);
            sql(mapper);
            transitions(mapper);
        } finally { UserContext.clear(); }
        System.out.println("MESSAGE_ATTEMPT_CHECKS: passed=" + checks
                + "; actual_mapper_sql=true; actual_schema=true; h2_mysql_mode=true; mysql_server=false; real_delivery_transitions=true; http=false");
    }

    private static void sql(SysMessageDeliveryMapper mapper) {
        LocalDateTime day = LocalDateTime.of(2026, 11, 3, 0, 0);
        LocalDateTime minute = day.plusHours(12).plusMinutes(34);
        counts(mapper, TENANT, CHANNEL, day, minute, 0, 0);
        mapper.insertAttempt(TENANT, 1L, 1, CHANNEL, day.minusNanos(1000));
        mapper.insertAttempt(TENANT, 1L, 2, CHANNEL, day);
        mapper.insertAttempt(TENANT, 1L, 3, CHANNEL, minute.minusNanos(1000));
        mapper.insertAttempt(TENANT, 1L, 4, CHANNEL, minute);
        mapper.insertAttempt(TENANT, 2L, 1, CHANNEL, minute.plusNanos(1000));
        mapper.insertAttempt(TENANT, 3L, 1, 72L, minute);
        mapper.insertAttempt(91002L, 4L, 1, CHANNEL, minute);
        counts(mapper, TENANT, CHANNEL, day, minute, 4, 2);
        counts(mapper, TENANT, 72L, day, minute, 1, 1);
        counts(mapper, 91002L, CHANNEL, day, minute, 1, 1);
        check(mapper.deleteAttempt(TENANT, 2L, 1) == 1, "boundary rejection releases exactly its latest attempt");
        counts(mapper, TENANT, CHANNEL, day, minute, 3, 1);
        check(mapper.deleteAttempt(91002L, 1L, 4) == 0, "foreign tenant cannot release another message's allowance");
        counts(mapper, TENANT, CHANNEL, day.plusDays(1), day.plusDays(1), 0, 0);
    }

    private static void transitions(SysMessageDeliveryMapper realMapper) throws Exception {
        UserContext.setTenantId(TENANT); UserContext.setUserId(91L);
        MapperBuilderAssistant metadata = new MapperBuilderAssistant(new MybatisConfiguration(), "attempt-quality");
        metadata.setCurrentNamespace("attempt"); TableInfoHelper.initTableInfo(metadata, SysMessageRecord.class);
        AtomicInteger encryptedReads = new AtomicInteger();
        MessageSecretCipher cipher = new MessageSecretCipher("only-in-process-quality-key-at-least-32-characters") {
            @Override public String decrypt(String value) { encryptedReads.incrementAndGet(); return super.decrypt(value); }
        };
        SysMessageChannel channel = new SysMessageChannel(); channel.setChannelId(700L); channel.setTenantId(TENANT);
        channel.setChannelType("EMAIL"); channel.setStatus("ENABLED"); channel.setImplementedFlag(1); channel.setDailyLimit(2); channel.setRateLimitMinute(1);
        SysMessageRecord record = new SysMessageRecord(); record.setRecordId(900L); record.setTenantId(TENANT);
        SysMessageDelivery delivery = new SysMessageDelivery(); delivery.setDeliveryId(901L); delivery.setTenantId(TENANT);
        delivery.setRecordId(900L); delivery.setOutboxEventId("delivery-quality"); delivery.setPayloadHash("digest");
        delivery.setReceiverKey(MessagePayloadCodec.hash("EMAIL:quality@example.invalid")); delivery.setChannelType("EMAIL"); delivery.setStatus("CLAIMED");
        delivery.setClaimOwner("owner"); delivery.setClaimUntil(LocalDateTime.now().plusMinutes(1)); delivery.setAttemptCount(0); delivery.setVersion(0);
        MessageReceiver receiver = MessageReceiver.builder().receiverType("EMAIL").receiverAddress("quality@example.invalid").build();
        MessageSendRequest request = MessageSendRequest.builder().receivers(List.of(receiver)).channelTypes(List.of(MessageChannelType.EMAIL)).build();
        ChannelSendContext context = ChannelSendContext.builder().recordId(900L).tenantId(TENANT).channelId(700L)
                .receiver(receiver).params(Map.of()).build();
        MessageDeliveryPayload payload = new MessageDeliveryPayload(TENANT, "delivery-quality", "cloudflow-auth", request, context, "digest", null, null, List.of());
        delivery.setPayloadEncrypted(cipher.encrypt(JSON.writeValueAsString(MessagePayloadCodec.internalTree(payload, JSON))));
        SysMessageDeliveryMapper mapper = (SysMessageDeliveryMapper) Proxy.newProxyInstance(SysMessageDeliveryMapper.class.getClassLoader(),
                new Class<?>[]{SysMessageDeliveryMapper.class}, (object, method, values) -> {
                    return switch (method.getName()) {
                        case "lockDelivery" -> delivery;
                        case "lockChannel" -> channel;
                        case "writeState" -> 1;
                        case "insertAttempt", "deleteAttempt", "attemptCounts" -> method.invoke(realMapper, values);
                        default -> throw new AssertionError("unexpected delivery query: " + method.getName());
                    };
                });
        SysMessageRecordMapper records = (SysMessageRecordMapper) Proxy.newProxyInstance(SysMessageRecordMapper.class.getClassLoader(),
                new Class<?>[]{SysMessageRecordMapper.class}, (object, method, values) -> switch (method.getName()) {
                    case "update" -> 1;
                    case "selectOne" -> record;
                    default -> throw new AssertionError(method.getName());
                });
        MessageDeliveryService service = new MessageDeliveryService(mapper, records, null, null, null, null, null,
                cipher, JSON, null, List.of(), new OutboxPublisher(null, JSON), null);
        Method quota = method("quotaUntil", Long.class, SysMessageChannel.class, LocalDateTime.class);
        Method begin = method("beginSending", Long.class, Long.class, String.class);
        Method release = method("finishSendBoundary", Long.class, Long.class, String.class, String.class);
        LocalDateTime now = LocalDateTime.now(); LocalDateTime day = now.toLocalDate().atStartOfDay(); LocalDateTime minute = now.truncatedTo(ChronoUnit.MINUTES);
        check(invoke(quota, service, TENANT, channel, now) == null && encryptedReads.get() == 0, "quota lookup never decrypts any delivery history");
        check(invoke(begin, service, TENANT, 901L, "owner") instanceof ChannelSendContext, "valid send preparation enters SENDING");
        counts(realMapper, TENANT, 700L, day, minute, 1, 1);
        check(delivery.getAttemptCount() == 1 && "SENDING".equals(delivery.getStatus()), "current attempt occupies quota with delivery state");
        check(invoke(quota, service, TENANT, channel, now).equals(minute.plusMinutes(1)), "minute quota delays to the next natural minute");
        delivery.setStatus("UNKNOWN");
        counts(realMapper, TENANT, 700L, day, minute, 1, 1);
        invoke(release, service, TENANT, 901L, "owner", "SOURCE_UNAVAILABLE");
        counts(realMapper, TENANT, 700L, day, minute, 0, 0);
        check(delivery.getAttemptCount() == 0 && "PENDING".equals(delivery.getStatus()), "confirmed pre-send source rejection restores count and schedules retry");
        realMapper.insertAttempt(TENANT, 902L, 1, 700L, minute.minusMinutes(1));
        realMapper.insertAttempt(TENANT, 903L, 1, 700L, minute.minusMinutes(1));
        check(invoke(quota, service, TENANT, channel, now).equals(day.plusDays(1)), "daily quota delays to next natural day without scanning payloads");
    }

    private static void counts(SysMessageDeliveryMapper mapper, Long tenant, Long channel, LocalDateTime day, LocalDateTime minute, long daily, long perMinute) {
        MessageAttemptCounts result = mapper.attemptCounts(tenant, channel, day, minute);
        check(result.getDayCount() == daily && result.getMinuteCount() == perMinute, "exact daily/minute attempt counts: " + daily + "/" + perMinute);
    }
    private static Method method(String name, Class<?>... types) throws Exception { Method method = MessageDeliveryService.class.getDeclaredMethod(name, types); method.setAccessible(true); return method; }
    private static Object invoke(Method method, Object target, Object... values) throws Exception {
        try { return method.invoke(target, values); }
        catch (InvocationTargetException failure) { if (failure.getCause() instanceof Exception cause) throw cause; throw failure; }
    }
    private static void check(boolean condition, String message) { if (!condition) throw new AssertionError(message); checks++; }
}

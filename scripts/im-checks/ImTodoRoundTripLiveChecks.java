package com.cloudflow.auth.im;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.auth.mapper.ImCallbackMapper;
import com.cloudflow.auth.mapper.ImTodoMapper;
import com.cloudflow.auth.mapper.SysMessageChannelMapper;
import com.cloudflow.auth.mapper.SysMessageDeliveryMapper;
import com.cloudflow.auth.mapper.SysMessageRecordMapper;
import com.cloudflow.auth.mapper.SysMessageSubscribeMapper;
import com.cloudflow.auth.mapper.SysMessageTemplateMapper;
import com.cloudflow.auth.mapper.SysUserMapper;
import com.cloudflow.auth.mapper.SysUserBlacklistMapper;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.auth.service.LoginLockService;
import com.cloudflow.auth.service.impl.SysUserBlacklistServiceImpl;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.channel.ChannelSendResult;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.security.im.ImTaskTodos;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.io.Reader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Properties;
import java.util.UUID;
import java.util.function.BooleanSupplier;
import me.chanjar.weixin.common.util.crypto.SHA1;
import me.chanjar.weixin.cp.util.crypto.WxCpCryptUtil;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.env.PropertiesPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class ImTodoRoundTripLiveChecks {
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule());
    private static final HttpClient HTTP = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private static int assertions;
    private static String stage = "OWNERSHIP";
    private final JsonNode state;
    private final JsonNode fixture;
    private final Path evidence;
    private final long tenant;
    private final long receiver;
    private final JdbcTemplate jdbc;
    private final StandardEnvironment environment;
    private final Map<String, ImTodoProvider.Card> cards = new LinkedHashMap<>();
    private final Map<String, Integer> updates = new LinkedHashMap<>();
    private final List<String> samples = new ArrayList<>();
    private int sends;

    private ImTodoRoundTripLiveChecks(Path statePath, Path evidencePath) throws Exception {
        Path directory = statePath.toRealPath().getParent();
        evidence = evidencePath.toRealPath();
        check(directory.getFileName().toString().matches("[a-f0-9]{32}")
                && directory.getParent().getFileName().toString().equals("batch-g-integration")
                && evidence.getParent().equals(directory) && evidence.getFileName().toString().matches("im-callback-execution-[a-f0-9]{32}"), "OWNED_PATHS");
        state = JSON.readTree(Files.readString(statePath).replace("\uFEFF", ""));
        fixture = JSON.readTree(Files.readString(evidence.resolve("fixture.json")));
        check("RUNNING".equals(state.path("status").asText()) && Path.of(state.path("run").asText()).toRealPath().equals(directory), "OWNED_STATE");
        tenant = fixture.path("tenant").asLong(); receiver = fixture.path("user").asLong();
        check(tenant >= 700000000 && tenant < 900000000 && receiver == tenant + 2 && fixture.path("roundTrips").size() == 2, "OWNED_FIXTURE");
        Properties properties = new Properties();
        try (Reader reader = Files.newBufferedReader(directory.resolve("auth/integration.properties"))) { properties.load(reader); }
        environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new PropertiesPropertySource("owned", properties));
        String url = environment.getRequiredProperty("spring.datasource.url");
        check(url.startsWith("jdbc:mysql://127.0.0.1:" + state.path("mysqlPort").asInt() + "/cloud_flow_db?"), "OWNED_DATABASE_URL");
        jdbc = new JdbcTemplate(new DriverManagerDataSource(url, "root", ""));
        check(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath().equals(directory.resolve("mysql-data").toRealPath()), "OWNED_DATABASE");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_config", Integer.class) == 1
                && jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_config WHERE tenant_id=?", Integer.class, tenant) == 1, "ONLY_FIXTURE_CONFIGURATION");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE handler_name='messageDeliveryRecovery' AND status='PAUSED' AND deleted=0", Integer.class) == 1
                && jdbc.queryForObject("SELECT COUNT(*) FROM sys_job_log WHERE handler_name='messageDeliveryRecovery' AND execute_status='RUNNING'", Integer.class) == 0, "DELIVERY_JOB_QUIESCENT");
        check(jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE handler_name='imTodoRecovery' AND status='ENABLED' AND deleted=0", Integer.class) == 0
                && jdbc.queryForObject("SELECT COUNT(*) FROM sys_job_log WHERE handler_name='imTodoRecovery' AND execute_status='RUNNING'", Integer.class) == 0, "TODO_JOB_QUIESCENT");
    }

    public static void main(String[] arguments) {
        try {
            check(arguments.length == 2, "ARGUMENTS");
            new ImTodoRoundTripLiveChecks(Path.of(arguments[0]), Path.of(arguments[1])).run();
        } catch (Throwable failure) {
            System.out.println("G4_IM_TODO_ROUND_TRIP_FAILURE: stage=" + stage + "; type=" + failure.getClass().getSimpleName());
            System.exit(1);
        } finally { TenantContext.clear(); }
    }

    private void run() throws Exception {
        stage = "WIRING";
        DriverManagerDataSource source = (DriverManagerDataSource) Objects.requireNonNull(jdbc.getDataSource());
        DataSourceTransactionManager transactions = new DataSourceTransactionManager(source);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT); configuration.setDefaultStatementTimeout(10);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig());
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
        for (Class<?> type : List.of(ImMapper.class, ImCallbackMapper.class, ImTodoMapper.class, SysMessageChannelMapper.class,
                SysMessageDeliveryMapper.class, SysMessageRecordMapper.class, SysMessageSubscribeMapper.class, SysMessageTemplateMapper.class,
                SysUserMapper.class, SysUserBlacklistMapper.class, TenantEntitlementMapper.class, SysAuditLogMapper.class, OutboxEventMapper.class)) {
            configuration.addMapper(type);
        }
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source);
        factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setMapperLocations(new Resource[]{new ClassPathResource("mapper/auth/ImMapper.xml"), new ClassPathResource("mapper/auth/ImCallbackMapper.xml"),
                new ClassPathResource("mapper/auth/ImTodoMapper.xml"), new ClassPathResource("mapper/SysMessageDeliveryMapper.xml"),
                new ClassPathResource("mapper/auth/SysUserMapper.xml"), new ClassPathResource("mapper/tenant/TenantEntitlementMapper.xml"),
                new ClassPathResource("mapper/OutboxEventMapper.xml")});
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        ImDatabase database = new ImDatabase(sessions.getMapper(ImMapper.class), transactions);
        ImTodoMapper todos = sessions.getMapper(ImTodoMapper.class);
        ImProperties properties = new ImProperties(); properties.setEnabled(true);
        properties.setSecretKey(environment.getRequiredProperty("cloudflow.im.secret-key"));
        properties.setPublicUrl(environment.getRequiredProperty("cloudflow.im.public-url"));
        RedisStandaloneConfiguration redisConfig = new RedisStandaloneConfiguration("127.0.0.1", state.path("redisPort").asInt());
        check(environment.getRequiredProperty("spring.data.redis.port").equals(Integer.toString(state.path("redisPort").asInt()))
                && "127.0.0.1".equals(environment.getRequiredProperty("spring.data.redis.host")), "OWNED_REDIS");
        redisConfig.setPassword(environment.getRequiredProperty("spring.data.redis.password"));
        LettuceConnectionFactory redisFactory = new LettuceConnectionFactory(redisConfig);
        try (ValidatorFactory validation = Validation.buildDefaultValidatorFactory()) {
            redisFactory.afterPropertiesSet(); redisFactory.start();
            StringRedisTemplate redis = new StringRedisTemplate(redisFactory);
            LoginLockService locks = new LoginLockService();
            java.lang.reflect.Field redisField = LoginLockService.class.getDeclaredField("redisTemplate");
            redisField.setAccessible(true); redisField.set(locks, redis);
            ImConfigRules rules = new ImConfigRules(properties, new ImSecretCipher(properties), validation.getValidator(), JSON);
            ImTodoAccounts accounts = new ImTodoAccounts(database, sessions.getMapper(ImCallbackMapper.class), rules,
                    new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), transactions),
                    new SysUserBlacklistServiceImpl(sessions.getMapper(SysUserBlacklistMapper.class), redis, null), locks);
            WeComCredentials credentials = database.read(tenant, mapper -> rules.credentials(mapper.config(tenant, fixture.path("config").asLong())));
            ImTodoProvider provider = provider(credentials);
            ImTodoSender sender = new ImTodoSender(database, todos, rules, accounts,
                    request -> remote("project", request, ImTaskTodos.Projection.class), List.of(provider));
            ImMessageSender notice = new ImMessageSender() {
                @Override public String providerType() { return "WECOM"; }
                @Override public ChannelSendResult send(WeComCredentials actual, Notice value) { throw new AssertionError("UNEXPECTED_NOTICE"); }
            };
            ImMessageChannelSender channel = new ImMessageChannelSender(database, sessions.getMapper(SysMessageChannelMapper.class), rules,
                    properties, new ImConnectionProbe(), List.of(notice), sender);
            MessageSecretCipher cipher = new MessageSecretCipher(environment.getRequiredProperty("cloudflow.message.secret-key"));
            MessageDeliveryService deliveries = new MessageDeliveryService(sessions.getMapper(SysMessageDeliveryMapper.class), sessions.getMapper(SysMessageRecordMapper.class),
                    sessions.getMapper(SysMessageChannelMapper.class), sessions.getMapper(SysMessageTemplateMapper.class), sessions.getMapper(SysMessageSubscribeMapper.class),
                    sessions.getMapper(SysUserMapper.class), new MessageChannelSenderFactory(List.of(channel)), cipher, JSON, transactions,
                    List.of(new ImTodoSourceGuard(database, todos, accounts)), new OutboxPublisher(sessions.getMapper(OutboxEventMapper.class), JSON), sessions.getMapper(SysAuditLogMapper.class));
            ImTodoRegistration registration = new ImTodoRegistration(database, todos, rules, accounts, deliveries);
            ImTodoReceipts receipts = new ImTodoReceipts(database, deliveries);
            ImTodoReconciler reconciler = new ImTodoReconciler(database, todos, receipts, accounts,
                    request -> remote("status", request, ImTaskTodos.Status.class), rules, List.of(provider));
            ImTodoRecovery recovery = new ImTodoRecovery(properties, todos, database,
                    request -> remote("scan", request, ImTaskTodos.Page.class), registration, deliveries, reconciler);
            jdbc.update("INSERT INTO sys_message_channel(tenant_id,channel_type,channel_code,channel_name,status,implemented_flag,priority,retry_count,retry_interval_sec,deleted,version) VALUES (?,'WECOM','todo-round-trip','待办完整联调','ENABLED',1,1,1,1,0,0)", tenant);
            stage = "SCAN_DELIVERY";
            for (int page = 0; page < 30 && cards.size() < 2; page++) {
                ImTodoRecovery.Sweep sweep = recovery.recoverDue(); check(sweep.failed() == 0, "SCAN_NO_FAILURES");
            }
            check(cards.size() == 2 && sends == 2, "REAL_SCAN_DELIVERED_BOTH_TASKS");
            recovery.recoverDue(); check(sends == 2, "REPEATED_SCAN_NO_SEND");
            for (JsonNode saved : fixture.path("roundTrips")) {
                roundTrip(saved, database, todos, deliveries, cipher, receipts, reconciler, recovery, credentials);
            }
            check(sends == 2 && updates.values().stream().mapToInt(Integer::intValue).sum() == 2, "EXACT_SEND_UPDATE_COUNTS");
            System.out.println("G4_IM_TODO_ROUND_TRIP: assertions=" + assertions + "; failed=0; actual_scan=true; actual_registration=true; actual_delivery=true; actual_auth=true; actual_workflow=true; verified_http_callbacks=2; replayed_callbacks=2; rejected_signatures=2; approvals=2; terminal_updates=2; lost_send_response_recovered=1; provider=controlled; external_sends=0");
        } finally {
            redisFactory.destroy();
            Path sampleFile = evidence.resolve("secret-samples.json");
            List<String> combined = new ArrayList<>();
            for (JsonNode sample : JSON.readTree(Files.readString(sampleFile))) combined.add(sample.asText());
            combined.addAll(samples); Files.writeString(sampleFile, JSON.writeValueAsString(combined));
        }
    }

    private ImTodoProvider provider(WeComCredentials credentials) {
        return new ImTodoProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public ChannelSendResult send(WeComCredentials actual, Card card) {
                check(!TransactionSynchronizationManager.isActualTransactionActive() && credentials.equals(actual), "SEND_OUTSIDE_TRANSACTION");
                String taskId = card.detailUrl().substring("/workflow/task/".length());
                check(card.directAction() && card.fields().isEmpty() && cards.putIfAbsent(taskId, card) == null, "NO_DEFAULT_SUMMARY_SINGLE_SEND");
                samples.add(card.cardKey()); sends++;
                return sends == 1 ? ChannelSendResult.accepted("round-trip-message") : ChannelSendResult.unknown("IM_CARD_OUTCOME_UNKNOWN");
            }
            @Override public ChannelSendResult terminal(WeComCredentials actual, Completion completion) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "TERMINAL_OUTSIDE_TRANSACTION");
                check(credentials.equals(actual), "TERMINAL_CURRENT_CREDENTIALS");
                check("COMPLETED".equals(completion.state()), "TERMINAL_COMPLETED_STATE");
                check(completion.expiresAt().isAfter(Instant.now()), "TERMINAL_UNEXPIRED_RECEIPT");
                check(samples.contains(completion.responseCode()), "CALLBACK_RECEIPT_USED");
                updates.merge(completion.responseCode(), 1, Integer::sum);
                return ChannelSendResult.success();
            }
        };
    }

    private void roundTrip(JsonNode saved, ImDatabase database, ImTodoMapper todos, MessageDeliveryService deliveries,
            MessageSecretCipher cipher, ImTodoReceipts receipts, ImTodoReconciler reconciler, ImTodoRecovery recovery, WeComCredentials credentials) throws Exception {
        String taskId = saved.path("task").asText(); String action = saved.path("action").asText();
        stage = "CALLBACK_" + action;
        long deliveryId = Objects.requireNonNull(jdbc.queryForObject("SELECT delivery_id FROM sys_im_todo_mapping WHERE tenant_id=? AND task_id=?", Long.class, tenant, taskId));
        ImTodoRow todo = database.read(tenant, ignored -> todos.byDelivery(tenant, deliveryId));
        check(List.of("SENT", "UNKNOWN").contains(todo.getStatus()), "DELIVERY_STATE_RETAINED");
        ImTodoProvider.Card card = cards.get(taskId);
        check(todo.getCardKeyHash().equals(ImTodoRegistration.hash(card.cardKey())), "RANDOM_CARD_LINKED_BY_HASH");
        String receipt = "receipt_" + UUID.randomUUID().toString().replace("-", ""); samples.add(receipt);
        String plain = "<xml><ToUserName>" + credentials.corpId() + "</ToUserName><FromUserName>" + card.member()
                + "</FromUserName><CreateTime>" + Instant.now().getEpochSecond() + "</CreateTime><MsgType>event</MsgType><Event>template_card_event</Event><EventKey>"
                + action + "</EventKey><TaskId>" + card.cardKey() + "</TaskId><CardType>button_interaction</CardType><AgentID>" + credentials.agentId()
                + "</AgentID><ResponseCode>" + receipt + "</ResponseCode></xml>";
        String encrypted = new WxCpCryptUtil(credentials.sdkConfiguration()).encrypt("0123456789abcdef", plain);
        String timestamp = Long.toString(Instant.now().getEpochSecond()); String nonce = "roundTripNonce";
        String signature = SHA1.gen(credentials.callbackToken(), timestamp, nonce, encrypted);
        String query = "?timestamp=" + timestamp + "&nonce=" + nonce + "&msg_signature=";
        String body = "<xml><Encrypt><![CDATA[" + encrypted + "]]></Encrypt></xml>";
        HttpResponse<String> rejected = callback(credentials.configId(), query + "0".repeat(40), body);
        check(rejected.statusCode() != 200 && "failed".equals(rejected.body()) && callbackCount(todo) == 0 && historyCount(taskId) == 0, "INVALID_SIGNATURE_NO_SIDE_EFFECT");
        HttpResponse<String> received = callback(credentials.configId(), query + signature, body);
        check(received.statusCode() == 200 && "success".equals(received.body()), "VERIFIED_HTTP_CALLBACK_RECEIVED");
        check("no-store".equals(received.headers().firstValue("cache-control").orElse(null)), "CALLBACK_NOT_CACHED");
        stage = "APPROVAL_" + action;
        await(() -> jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE tenant_id=? AND task_mapping_id=? AND status='COMPLETED'", Integer.class, tenant, todo.getMappingId()) == 1);
        check(historyCount(taskId) == 1 && jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=? AND task_id=? AND operator_id=? AND action=?", Integer.class, tenant, taskId, receiver, action) == 1, "REAL_RECIPIENT_APPROVES_EXACTLY_ONCE");
        String payload = database.read(tenant, ignored -> deliveries.getOwned(tenant, deliveryId).getPayloadEncrypted());
        check(!payload.contains(receipt) && cipher.decrypt(payload).contains(receipt), "ACTUAL_AUTH_RECOVERS_ENCRYPTED_RECEIPT");
        stage = "TERMINAL_" + action;
        check(reconciler.reconcile(tenant, deliveryId), "TERMINAL_RECONCILED");
        check("COMPLETED".equals(database.read(tenant, ignored -> todos.byDelivery(tenant, deliveryId)).getStatus())
                && "APPLIED".equals(receipts.status(todo).outcome()) && updates.get(receipt) == 1, "TERMINAL_PERSISTED_ONCE");
        HttpResponse<String> replay = callback(credentials.configId(), query + signature, body);
        check(replay.statusCode() == 200 && "success".equals(replay.body()) && callbackCount(todo) == 1, "HTTP_REPLAY_DEDUPLICATED");
        recovery.recoverDue(); reconciler.reconcile(tenant, deliveryId);
        check(historyCount(taskId) == 1 && updates.get(receipt) == 1, "REPLAY_RECOVERY_NO_DUPLICATE_APPROVAL_OR_UPDATE");
        System.out.println("G4_IM_TODO_ROUND_TRIP_CASE: action=" + action + "; initial=" + todo.getStatus() + "; callback=COMPLETED; mapping=COMPLETED; history=1; terminal_update=1");
    }

    private <Result> R<Result> remote(String endpoint, Object input, Class<Result> type) {
        try {
            HttpRequest request = HttpRequest.newBuilder(service("workflow").resolve("/inner/workflow/im-todo/" + endpoint)).timeout(Duration.ofSeconds(20))
                    .header("Content-Type", "application/json").header("X-Inner-Call", "true").header("X-From-Service", "cloudflow-auth")
                    .POST(HttpRequest.BodyPublishers.ofString(JSON.writeValueAsString(input))).build();
            HttpResponse<String> response = HTTP.send(request, HttpResponse.BodyHandlers.ofString());
            JsonNode result = JSON.readTree(response.body());
            check(response.statusCode() == 200 && result.path("code").asInt() == 200 && result.hasNonNull("data"), "WORKFLOW_INTERNAL_RESPONSE");
            return R.ok(JSON.treeToValue(result.get("data"), type));
        } catch (Exception failure) { throw new IllegalStateException("ROUND_TRIP_INTERNAL_FAILURE"); }
    }

    private HttpResponse<String> callback(long configId, String query, String body) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(service("auth").resolve("/im/callback/" + configId + query)).timeout(Duration.ofSeconds(20))
                .header("Content-Type", "application/xml").header("X-Forwarded-Proto", "https").header("X-Forwarded-For", "192.0.2.45")
                .header("Authorization", "Bearer forged-account").header("X-User-Id", "1").header("X-Tenant-Id", "100000")
                .POST(HttpRequest.BodyPublishers.ofString(body)).build();
        return HTTP.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private URI service(String name) {
        for (JsonNode service : state.path("services")) {
            if (name.equals(service.path("name").asText())) {
                int port = service.path("port").asInt(); check(port > 1024 && port < 65536, "OWNED_SERVICE_PORT");
                return URI.create("http://127.0.0.1:" + port);
            }
        }
        throw new IllegalStateException("SERVICE_REQUIRED");
    }

    private int callbackCount(ImTodoRow todo) { return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_callback_event WHERE tenant_id=? AND task_mapping_id=?", Integer.class, tenant, todo.getMappingId())); }
    private int historyCount(String task) { return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*) FROM wf_task_history WHERE tenant_id=? AND task_id=?", Integer.class, tenant, task)); }
    private static void await(BooleanSupplier condition) throws Exception {
        long deadline = System.nanoTime() + Duration.ofSeconds(55).toNanos();
        while (System.nanoTime() < deadline) { if (condition.getAsBoolean()) return; Thread.sleep(200); }
        throw new IllegalStateException("CALLBACK_RECOVERY_TIMEOUT");
    }
    private static void check(boolean result, String label) { assertions++; if (!result) { stage = label; throw new AssertionError(label); } }
}

import com.cloudflow.checks.FixtureInspectionSql;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.message.InternalChannelSender;
import com.cloudflow.auth.message.MessageDispatchService;
import com.cloudflow.auth.message.MessageDeliveryService;
import com.cloudflow.common.message.security.MessageSecretCipher;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.config.OutboxProperties;
import com.cloudflow.common.event.core.BusinessEventEnvelope;
import com.cloudflow.common.event.core.DeadLetterPublisher;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.event.outbox.OutboxScheduler;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.api.MessageSendRequest;
import com.cloudflow.common.message.channel.MessageChannelSenderFactory;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.core.RedisStreamUtil;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.workflow.callback.config.WorkflowCallbackProperties;
import com.cloudflow.common.workflow.callback.domain.ApprovalResultDTO;
import com.cloudflow.common.workflow.callback.listener.WorkflowApprovalCallbackStreamConsumer;
import com.cloudflow.common.workflow.callback.service.CallbackIdempotentStore;
import com.cloudflow.common.workflow.callback.service.DefaultWorkflowCallbackDispatcher;
import com.cloudflow.common.workflow.callback.util.WorkflowCallbackMetadata;
import com.cloudflow.oa.domain.SysConsumable;
import com.cloudflow.oa.domain.dto.BusinessRuleDTO;
import com.cloudflow.oa.domain.dto.BusinessRuleHitRecordDTO;
import com.cloudflow.oa.domain.dto.ConsumableCommands;
import com.cloudflow.oa.domain.dto.OaApprovalRequest;
import com.cloudflow.oa.domain.dto.PurchaseReceiptDTO;
import com.cloudflow.oa.domain.vo.ConsumableResults;
import com.cloudflow.oa.mapper.*;
import com.cloudflow.oa.service.impl.*;
import com.cloudflow.oa.service.remote.RemoteConsumableRuleService;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.sql.ResultSet;
import java.sql.Statement;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.env.MapPropertySource;
import org.springframework.core.env.StandardEnvironment;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.data.redis.connection.stream.MapRecord;
import org.springframework.data.redis.connection.stream.RecordId;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.ReflectionUtils;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.time.LocalDateTime;
import java.time.LocalDate;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

public final class OaConsumableDatabaseChecks implements AutoCloseable {
    private static final AtomicInteger ASSERTIONS = new AtomicInteger();
    private static final AtomicInteger ASSERTIONS_PASSED = new AtomicInteger();
    private static final AtomicInteger GROUPS = new AtomicInteger();
    private static final AtomicInteger GROUPS_PASSED = new AtomicInteger();
    private static final AtomicInteger DATABASE_WAITS = new AtomicInteger();
    private static final AtomicInteger RACES = new AtomicInteger();
    private static final AtomicInteger SQL_FAULTS = new AtomicInteger();
    private static final AtomicInteger DEADLOCKS = new AtomicInteger();
    private static final AtomicInteger ZERO_ROW_FAILURES = new AtomicInteger();
    private static final List<String> FAILED_GROUPS = new ArrayList<>();
    private static final Set<String> PERMISSIONS = Set.of("oa:consumable-request:dispatch", "oa:consumable-request:issue",
            "oa:consumable-ledger:cost", "oa:consumable-ledger:list", "oa:purchase:receipt", "oa:consumable-ledger:reverse");
    private final OaDatabaseIsolation isolation;
    private final OaDatabaseIsolation.FixtureDataSource dataSource;
    private final JdbcTemplate jdbc;
    private final SqlSessionTemplate sessions;
    private final DataSourceTransactionManager manager;
    private final OaDatabaseProbe probe = new OaDatabaseProbe();
    private final ObjectMapper json = new ObjectMapper().registerModule(new JavaTimeModule());
    private final ExecutorService workers = Executors.newFixedThreadPool(3, action -> {
        Thread worker = new Thread(action, "oa08-database-check");
        worker.setDaemon(true);
        return worker;
    });
    private final ConsumableLedgerService ledger;
    private final ConsumableLedgerVerifier verifier;
    private final ConsumableTransactions transactions;
    private final ConsumableOperationSupport operations;
    private final ConsumableDispatchService dispatch;
    private final ConsumablePurchaseService purchases;
    private final ConsumableInventoryService inventory;
    private final ConsumableMaintenanceService maintenance;
    private final SysConfigHelper settings;
    private final MessageSender messageSender;
    private final MessageDispatchService messages;
    private final ConsumableRequestService requestService;
    private final ConsumableRequestApprovalHandler approvalHandler;
    private final DefaultWorkflowCallbackDispatcher callbackDispatcher;
    private final int callbackIsolation;
    private final PushEdge push = new PushEdge();
    private int fixtureNumber;

    public static void main(String[] arguments) {
        int exit = 0;
        StpLogic previous = StpUtil.getStpLogic();
        StpUtil.setStpLogic(new StpLogic("oa08-database-check") {
            @Override public boolean hasPermission(String permission) { return PERMISSIONS.contains(permission); }
            @Override public void checkPermission(String permission) {
                if (!hasPermission(permission)) throw new IllegalStateException("FIXTURE_PERMISSION_NOT_ALLOWED");
            }
            @Override public void checkPermissionAnd(String... permissions) { Arrays.stream(permissions).forEach(this::checkPermission); }
        });
        try (OaDatabaseIsolation isolation = new OaDatabaseIsolation()) {
            includeApprovalTables(isolation);
            isolation.initialize();
            try (OaConsumableDatabaseChecks checks = new OaConsumableDatabaseChecks(isolation)) {
                checks.run();
                if (!FAILED_GROUPS.isEmpty()) exit = 1;
            }
        } catch (Throwable failure) {
            exit = 1;
            System.err.println("OA08 HARNESS_FAILURE: " + safeFailure(failure));
        } finally {
            StpUtil.setStpLogic(previous);
            TenantContext.clear();
            UserContext.clear();
            OaDatabaseProbe.ACTOR.remove();
        }
        System.out.println("OA08 RESULT: groups=" + GROUPS_PASSED.get() + "/" + GROUPS.get()
                + "; assertions=" + ASSERTIONS_PASSED.get() + "/" + ASSERTIONS.get()
                + "; real-db-races=" + RACES.get() + "; observed-InnoDB-row-waits=" + DATABASE_WAITS.get()
                + "; actual-MySQL-faults=" + SQL_FAULTS.get() + "; zero-row-write-faults=" + ZERO_ROW_FAILURES.get()
                + "; scanner-deadlock-victims=" + DEADLOCKS.get() + "; failed-groups=" + String.join(",", FAILED_GROUPS) + "; exit=" + exit);
        System.out.println("OA08 BOUNDARY: real MySQL, Spring transactions, current Mapper XML, OA services, OutboxPublisher/OutboxScheduler, MessageDispatchService, sys_message_record, WorkflowApprovalCallbackStreamConsumer, DefaultWorkflowCallbackDispatcher and ConsumableRequestApprovalHandler; login permissions, config-cache lookup and remote rule endpoints are fixture adapters; workflow result payloads and Redis callback leases are isolated fixture edges, every duplicate reaches the real business receiver; no callback is published to running Redis; Redis transport, consumer redelivery timing and WebSocket push are explicit edges; fixture due events are backdated one minute and other test tenants are deferred one day; scanners run without tenant context; no HTTP/UI/workflow approval, online procurement, project-linked accounting, audit aspect or live notification delivery was exercised.");
        System.exit(exit);
    }

    private static void includeApprovalTables(OaDatabaseIsolation isolation) throws SQLException {
        Set<String> expected = Set.of("sys_business_rule", "sys_business_rule_version");
        try (PreparedStatement query = isolation.administration.prepareStatement("SELECT table_name,engine FROM information_schema.tables WHERE table_schema=? AND table_name IN ('sys_business_rule','sys_business_rule_version')")) {
            query.setString(1, isolation.source);
            try (ResultSet rows = query.executeQuery()) {
                while (rows.next()) {
                    OaDatabaseIsolation.require(expected.contains(rows.getString(1)) && "InnoDB".equals(rows.getString(2)), "REAL_APPROVAL_RULE_TABLE_REQUIRED");
                    isolation.tables.add(rows.getString(1));
                }
            }
        }
        OaDatabaseIsolation.require(isolation.tables.equals(expected), "BOTH_REAL_APPROVAL_RULE_TABLES_REQUIRED");
    }

    private OaConsumableDatabaseChecks(OaDatabaseIsolation isolation) throws Exception {
        this.isolation = isolation;
        dataSource = new OaDatabaseIsolation.FixtureDataSource(isolation);
        jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(20);
        manager = new DataSourceTransactionManager(dataSource);
        try (Connection connection = dataSource.getConnection()) { callbackIsolation = connection.getTransactionIsolation(); }
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setDefaultStatementTimeout(20);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMappers("com.cloudflow.oa.mapper");
        configuration.addMappers("com.cloudflow.auth.mapper");
        configuration.addMapper(OutboxEventMapper.class);
        configuration.addMapper(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class);
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        configuration.addInterceptor(probe);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(dataSource);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setMapperLocations(Files.readAllLines(Path.of(OaDatabaseIsolation.environment("OA08_MAPPER_FILES"))).stream()
                .map(path -> (Resource) new FileSystemResource(path)).toArray(Resource[]::new));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        OaDatabaseIsolation.require(GlobalConfigUtils.getGlobalConfig(configuration) == global, "LATEST_REAL_AUTO_FILL_CONFIGURATION_REQUIRED");
        ledger = new ConsumableLedgerService(mapper(SysConsumableMapper.class), mapper(OaConsumableLedgerMapper.class), mapper(SysAssetLogMapper.class), mapper(OaIdentityReferenceMapper.class));
        ConsumableRequestAccess access = new ConsumableRequestAccess(mapper(OaConsumableRequestMapper.class), mapper(OaConsumableRequestItemMapper.class));
        operations = new ConsumableOperationSupport(json, mapper(OaConsumableRequestMapper.class), mapper(OaTraceEventMapper.class));
        transactions = new ConsumableTransactions(manager);
        dispatch = new ConsumableDispatchService(access, mapper(OaConsumableRequestItemMapper.class), mapper(OaConsumableLedgerMapper.class), ledger, transactions, operations);
        OaRfqPurchaseSourceService purchaseSource = new OaRfqPurchaseSourceService(mapper(OaPurchaseRfqMapper.class), mapper(OaPurchaseRfqItemMapper.class),
                mapper(OaSupplierQuotationMapper.class), mapper(OaSupplierQuotationItemMapper.class), mapper(BizPurchaseRequestMapper.class), mapper(BizPurchaseReceiptMapper.class));
        com.cloudflow.oa.service.impl.OaProjectAuditService projectAudit = transactional(new com.cloudflow.oa.service.impl.OaProjectAuditService(
                mapper(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class), json));
        OaProjectAccountingService accounting = transactional(new OaProjectAccountingService(mapper(OaProjectMapper.class), mapper(OaProjectTaskMapper.class),
                mapper(OaContractMapper.class), mapper(OaTimesheetQueryMapper.class), manager, projectAudit));
        purchases = new ConsumablePurchaseService(mapper(BizPurchaseRequestMapper.class), mapper(BizPurchaseReceiptMapper.class), mapper(OaConsumablePurchaseMapper.class),
                mapper(OaConsumableLedgerMapper.class), purchaseSource, accounting, ledger, operations, transactions);
        inventory = new ConsumableInventoryService(ledger, transactions, operations, dispatch, purchases);
        verifier = new ConsumableLedgerVerifier(mapper(OaConsumableLedgerMapper.class), mapper(SysAssetLogMapper.class), mapper(BizPurchaseItemMapper.class),
                mapper(BizPurchaseReceiptMapper.class), mapper(OaConsumableRequestItemMapper.class), mapper(OaConsumableMaintenanceMapper.class), access, ledger);
        settings = new SysConfigHelper() {
            @Override public String getTenantValue(String key) {
                return jdbc.queryForObject("SELECT config_value FROM sys_config WHERE tenant_id=? AND config_key=?", String.class, OaRecordSupport.tenantId(), key);
            }
        };
        OaTraceEventServiceImpl trace = new OaTraceEventServiceImpl(json);
        Field baseMapper = Objects.requireNonNull(ReflectionUtils.findField(OaTraceEventServiceImpl.class, "baseMapper"));
        ReflectionUtils.makeAccessible(baseMapper);
        ReflectionUtils.setField(baseMapper, trace, mapper(OaTraceEventMapper.class));
        OaApprovalOutboxService approvalOutbox = new OaApprovalOutboxService(transactional(new OutboxPublisher(mapper(OutboxEventMapper.class), json)), json, trace, mapper(OaTraceEventMapper.class));
        ConsumableApprovalService approvals = new ConsumableApprovalService(access, mapper(OaConsumableRequestMapper.class), mapper(OaConsumableRequestItemMapper.class),
                mapper(OaConsumableLedgerMapper.class), mapper(OaIdentityReferenceMapper.class), ledger, transactions, operations, approvalOutbox, settings, new ConsumableRuleExecutor(new ApprovalRuleEdge()), json);
        ConsumableReadService reads = new ConsumableReadService(ledger, mapper(OaConsumableLedgerMapper.class), mapper(SysConsumableMapper.class), mapper(SysAssetLogMapper.class), scope -> {
            throw new IllegalStateException("CALLBACK_FIXTURE_DOES_NOT_EXERCISE_DATA_SCOPE_READS");
        });
        requestService = new ConsumableRequestService(mapper(OaConsumableRequestMapper.class), mapper(OaConsumableRequestItemMapper.class), mapper(OaConsumableLedgerMapper.class),
                mapper(OaIdentityReferenceMapper.class), access, ledger, reads, operations, transactions, approvals, dispatch);
        approvalHandler = new ConsumableRequestApprovalHandler(access, approvals);
        DefaultWorkflowCallbackDispatcher dispatcher = new DefaultWorkflowCallbackDispatcher(List.of(approvalHandler));
        dispatcher.init();
        callbackDispatcher = transactional(dispatcher);
        StandardEnvironment environment = new StandardEnvironment();
        environment.getPropertySources().addFirst(new MapPropertySource("oa08-fixture", Map.of("spring.application.name", "cloudflow-oa")));
        messageSender = new MessageAutoConfiguration().messageSender(transactional(new OutboxPublisher(mapper(OutboxEventMapper.class), json)), json, environment);
        maintenance = newMaintenance();
        MessageChannelSenderFactory senders = new MessageChannelSenderFactory(List.of(new InternalChannelSender(push::send)));
        MessageSecretCipher cipher = new MessageSecretCipher("oa08-fixture-only");
        MessageDeliveryService deliveries = new MessageDeliveryService(mapper(com.cloudflow.auth.mapper.SysMessageDeliveryMapper.class),
                mapper(com.cloudflow.auth.mapper.SysMessageRecordMapper.class), mapper(com.cloudflow.auth.mapper.SysMessageChannelMapper.class),
                mapper(com.cloudflow.auth.mapper.SysMessageTemplateMapper.class), mapper(com.cloudflow.auth.mapper.SysMessageSubscribeMapper.class),
                mapper(com.cloudflow.auth.mapper.SysUserMapper.class), senders, cipher, json, manager, List.of(),
                transactional(new OutboxPublisher(mapper(OutboxEventMapper.class), json)), mapper(com.cloudflow.common.audit.mapper.SysAuditLogMapper.class));
        messages = transactional(new MessageDispatchService(json,
                mapper(com.cloudflow.auth.mapper.SysMessageChannelMapper.class), mapper(com.cloudflow.auth.mapper.SysMessageTemplateMapper.class),
                mapper(com.cloudflow.auth.mapper.SysMessageRecordMapper.class), mapper(com.cloudflow.auth.mapper.SysMessageSubscribeMapper.class),
                mapper(com.cloudflow.auth.mapper.SysUserMapper.class), mapper(com.cloudflow.auth.mapper.SysUserRoleMapper.class),
                mapper(com.cloudflow.auth.mapper.SysDeptMapper.class), senders, cipher, messageSender, null, deliveries, manager));
    }

    private ConsumableMaintenanceService newMaintenance() {
        return new ConsumableMaintenanceService(ledger, verifier, transactions, operations, mapper(OaConsumableMaintenanceMapper.class), mapper(SysConsumableMapper.class),
                mapper(OaRiskAlertMapper.class), mapper(OaIdentityReferenceMapper.class), settings, messageSender, json);
    }

    private <Type> Type mapper(Class<Type> type) { return sessions.getMapper(type); }

    @SuppressWarnings("unchecked")
    private <Type> Type transactional(Type service) {
        ProxyFactory proxy = new ProxyFactory(service);
        proxy.setProxyTargetClass(true);
        proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
        return (Type) proxy.getProxy();
    }

    private void run() throws Exception {
        scenario("ISOLATION_AND_CURRENT_COMPONENTS", this::isolationChecks);
        for (String fault : List.of("LEDGER", "LOG", "SOURCE")) scenario("ISSUE_ROLLBACK_" + fault, () -> postingFailure(false, fault));
        scenario("ISSUE_FINAL_ZERO_AFFECTED_ROWS", this::zeroAffectedFinalWrite);
        scenario("ISSUE_SECOND_LINE_STOCK_SHORTAGE", this::secondLineShortage);
        for (String fault : List.of("LEDGER", "LOG", "SOURCE")) scenario("PURCHASE_ROLLBACK_" + fault, () -> postingFailure(true, fault));
        scenario("CACHE_CHECK_REBUILD_IDEMPOTENCY", this::cacheRepair);
        scenario("DAMAGED_LEDGER_PREFIX_REJECTED", this::damagedPrefix);
        scenario("CHECK_AFTER_CONCURRENT_POSTING", () -> recalculateRace("CHECK"));
        scenario("POSTING_AFTER_CONCURRENT_REBUILD", () -> recalculateRace("REBUILD"));
        scenario("TWO_WARNING_SCANNERS", this::warningRace);
        scenario("OUTBOX_FAILURE_RETRY", this::outboxRetry);
        scenario("TWO_OUTBOX_SCANNERS", this::outboxRace);
        scenario("MESSAGE_DATABASE_FAILURE_REDELIVERY", this::messageDatabaseRetry);
        scenario("INTERNAL_NOTIFICATION_FAILURE_RETRY", this::internalNotificationRetry);
        scenario("WARNING_MESSAGE_EVENT_IDENTITY", this::warningMessageIdentity);
        scenario("APPROVAL_CALLBACK_WRONG_TOKEN", this::callbackWrongToken);
        scenario("APPROVAL_CALLBACK_CROSS_TENANT", this::callbackCrossTenant);
        scenario("APPROVAL_CALLBACK_OLD_ROUND", this::callbackOldRound);
        scenario("APPROVAL_CALLBACK_BEFORE_BIND", this::callbackBeforeBind);
        for (String fault : List.of("ITEM", "SOURCE", "TRACE")) scenario("APPROVAL_CALLBACK_ROLLBACK_" + fault, () -> callbackRollback(fault));
        scenario("APPROVAL_BINDING_ROLLBACK_TRACE", this::callbackBindingRollback);
    }

    private void isolationChecks() throws Exception {
        for (TableState state : snapshot().values()) equal(0, state.rows, "CLONED_TABLE_STARTS_EMPTY");
        for (String denied : List.of("SELECT * FROM cloud_flow_db.oa_consumable", "UPDATE cloud_flow_db.oa_consumable SET quantity=0",
                "SELECT * FROM mysql.user", "DELETE FROM other_schema.oa_consumable", "USE cloud_flow_db", "DROP DATABASE cloud_flow_db")) {
            check(caught(() -> dataSource.validateSql(denied)) instanceof IllegalStateException, "SOURCE_AND_CROSS_SCHEMA_ACCESS_REJECTED_BEFORE_EXECUTION");
        }
        try (Connection connection = dataSource.getConnection()) {
            equal(isolation.database, connection.getCatalog(), "JDBC_DEFAULT_SCHEMA_IS_OWNED_FIXTURE");
            check(caught(() -> connection.setCatalog("cloud_flow_db")) instanceof IllegalStateException, "JDBC_SCHEMA_SWITCH_REJECTED");
        }
        Path classes = Path.of(OaDatabaseIsolation.environment("OA08_COMPILED_CLASSES")).toRealPath();
        for (Class<?> component : List.of(ConsumableDispatchService.class, ConsumablePurchaseService.class, ConsumableLedgerService.class,
                ConsumableInventoryService.class, ConsumableMaintenanceService.class, ConsumableLedgerVerifier.class, ConsumableTransactions.class,
                OaRfqPurchaseSourceService.class, OaConsumableLedgerMapper.class, MyMetaObjectHandler.class, MybatisPlusConfig.class,
                OutboxPublisher.class, OutboxScheduler.class, MessageDispatchService.class, MessageDeliveryService.class, InternalChannelSender.class,
                ConsumableRequestService.class, ConsumableApprovalService.class, ConsumableRequestApprovalHandler.class,
                OaApprovalOutboxService.class, OaTraceEventServiceImpl.class, ConsumableRuleExecutor.class,
                WorkflowApprovalCallbackStreamConsumer.class, DefaultWorkflowCallbackDispatcher.class)) {
            equal(classes, Path.of(component.getProtectionDomain().getCodeSource().getLocation().toURI()).toRealPath(), "COMPONENT_LOADED_FROM_CURRENT_TEMPORARY_COMPILATION");
        }
        check(OaDatabaseIsolation.environment("OA08_SOURCE_SHA256").matches("[a-f0-9]{64}"), "SOURCE_FINGERPRINT_RECORDED");
        System.out.println("OA08 COMPONENTS: current OA posting/source/verification/maintenance services; current auth message dispatcher/internal channel; real MyBatis-Plus tenant, optimistic-lock and logical-delete configuration; real MyMetaObjectHandler; DataSourceTransactionManager; complete-row snapshots cover " + isolation.tables.size() + " cloned tables.");
    }

    private void postingFailure(boolean purchaseFlow, String fault) throws Exception {
        CaseData scope = fresh();
        materials(scope, 8, 8);
        if (purchaseFlow) purchase(scope); else request(scope);
        String actor = (purchaseFlow ? "purchase_" : "issue_") + fault;
        String key = actor + "_" + scope.tenant;
        String sourceMapper = purchaseFlow ? "BizPurchaseRequestMapper.updateById" : "OaConsumableRequestMapper.saveState";
        String watched = switch (fault) {
            case "LEDGER" -> "OaConsumableLedgerMapper.insert";
            case "LOG" -> "SysAssetLogMapper.insert";
            default -> sourceMapper;
        };
        String table = switch (fault) {
            case "LEDGER" -> "oa_consumable_ledger";
            case "LOG" -> "oa_asset_log";
            default -> purchaseFlow ? "biz_purchase_request" : "oa_consumable_request";
        };
        String field = switch (fault) {
            case "LEDGER" -> "consumable_id";
            case "LOG" -> "ref_id";
            default -> purchaseFlow ? "id" : "request_id";
        };
        long identifier = fault.equals("SOURCE") ? purchaseFlow ? scope.purchase : scope.request : scope.second;
        int expectedEarlierRows = fault.equals("SOURCE") ? 2 : 1;
        AtomicInteger reached = new AtomicInteger();
        probe.watch(actor, watched, fault.equals("SOURCE") ? 1 : 2, false, connection -> {
            equal((long) expectedEarlierRows, count(connection, "SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=? AND operation_key=?", scope.tenant, key), "PRIOR_LEDGER_ROWS_EXIST_INSIDE_FAILING_TRANSACTION");
            if (purchaseFlow) equal(2L, count(connection, "SELECT COUNT(*) FROM biz_purchase_receipt WHERE tenant_id=? AND purchase_id=?", scope.tenant, scope.purchase), "BOTH_RECEIPTS_EXIST_BEFORE_INJECTED_FAILURE");
            else equal((long) expectedEarlierRows, count(connection, "SELECT COUNT(*) FROM oa_consumable_request_item WHERE tenant_id=? AND request_id=? AND issued_quantity=2", scope.tenant, scope.request), "PRIOR_SOURCE_ITEM_WRITES_EXIST_BEFORE_FAILURE");
            try (Connection independent = dataSource.getConnection()) {
                equal(0L, count(independent, "SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=? AND operation_key=?", scope.tenant, key), "UNCOMMITTED_LEDGER_ROWS_ARE_NOT_VISIBLE_TO_ANOTHER_CONNECTION");
            }
            reached.incrementAndGet();
        });
        Map<String, TableState> before = snapshot();
        String trigger = "oa08_" + actor.toLowerCase(java.util.Locale.ROOT);
        Throwable failure;
        isolation.createFailureTrigger(trigger, fault.equals("SOURCE") ? "UPDATE" : "INSERT", table, field, identifier);
        try {
            failure = caught(() -> as(scope, actor, () -> purchaseFlow ? purchases.receive(scope.purchase, receipt(scope, key)) : dispatch.issue(scope.request, issue(scope, key, 2, 2), null)));
        } finally {
            isolation.dropFailureTrigger(trigger);
        }
        check(sqlFault(failure), "DATABASE_TRIGGER_RAISED_REAL_45000_1644");
        SQL_FAULTS.incrementAndGet();
        equal(1, reached.get(), "FAILURE_OCCURRED_AFTER_PRIOR_REAL_DATABASE_WRITES");
        transactionEvidence(actor);
        unchanged(before, Set.of());
        equal(0L, count("SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=? AND operation_key=?", scope.tenant, key), "FAILED_OPERATION_HAS_NO_LEDGER_ROWS");
        if (purchaseFlow) {
            ConsumableResults.StockPosting successful = as(scope, actor + "_retry", () -> purchases.receive(scope.purchase, receipt(scope, key)));
            equal(2, successful.getLedgerIds().size(), "SAME_PURCHASE_REQUEST_COMMITS_AFTER_FAULT_REMOVAL");
            equal(2L, count("SELECT COUNT(*) FROM biz_purchase_receipt WHERE tenant_id=? AND purchase_id=?", scope.tenant, scope.purchase), "RETRY_COMMITS_BOTH_REAL_RECEIPTS");
            Map<String, TableState> committed = snapshot();
            check(purchases.receive(scope.purchase, receipt(scope, key)).isReplayed(), "PURCHASE_RETRY_RESULT_REPLAYS");
            unchanged(committed, Set.of());
        } else {
            ConsumableResults.IssueResult successful = as(scope, actor + "_retry", () -> dispatch.issue(scope.request, issue(scope, key, 2, 2), null));
            equal(2, successful.getLedgerIds().size(), "SAME_ISSUE_REQUEST_COMMITS_AFTER_FAULT_REMOVAL");
            Map<String, TableState> committed = snapshot();
            check(dispatch.issue(scope.request, issue(scope, key, 2, 2), null).isReplayed(), "ISSUE_RETRY_RESULT_REPLAYS");
            unchanged(committed, Set.of());
        }
        for (long material : List.of(scope.first, scope.second)) {
            SysConsumable current = ledger.material(material);
            equal(current.getQuantity(), verifier.verify(current).quantity(), "RETRY_SOURCE_LOG_LEDGER_AND_CACHE_VERIFY_TOGETHER");
        }
    }

    private void zeroAffectedFinalWrite() throws Exception {
        CaseData scope = fresh();
        materials(scope, 8, 8);
        request(scope);
        String actor = "zero_source";
        String key = actor + scope.tenant;
        Map<String, TableState> before = snapshot();
        probe.watch(actor, "OaConsumableRequestMapper.saveState", 1, false, connection -> {
            equal(2L, count(connection, "SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=? AND operation_key=?", scope.tenant, key), "BOTH_LEDGER_ROWS_PRECEDE_CONDITIONAL_UPDATE_FAILURE");
            try (PreparedStatement update = connection.prepareStatement("UPDATE oa_consumable_request SET version=version+1 WHERE tenant_id=? AND request_id=?")) {
                update.setLong(1, scope.tenant);
                update.setLong(2, scope.request);
                equal(1, update.executeUpdate(), "REAL_DATABASE_VERSION_CHANGE_IN_FAILING_TRANSACTION");
            }
        });
        Throwable failure = caught(() -> as(scope, actor, () -> dispatch.issue(scope.request, issue(scope, key, 2, 2), null)));
        check(failure instanceof IllegalStateException, "ZERO_ROW_FINAL_UPDATE_MUST_THROW");
        check(probe.forActor(actor).stream().anyMatch(call -> call.statement.endsWith("OaConsumableRequestMapper.saveState") && call.completed && call.affected == 0), "REAL_MAPPER_RETURNED_ZERO_WITHOUT_A_MOCK");
        ZERO_ROW_FAILURES.incrementAndGet();
        transactionEvidence(actor);
        unchanged(before, Set.of());
        equal(2, dispatch.issue(scope.request, issue(scope, key, 2, 2), null).getLedgerIds().size(), "ZERO_ROW_FAILURE_ROLLBACK_PERMITS_ORIGINAL_RETRY");
    }

    private void secondLineShortage() throws Exception {
        CaseData scope = fresh();
        materials(scope, 8, 1);
        request(scope);
        String actor = "shortage";
        Map<String, TableState> before = snapshot();
        Throwable failure = caught(() -> as(scope, actor, () -> dispatch.issue(scope.request, issue(scope, "shortage_" + scope.tenant, 2, 2), null)));
        check(failure instanceof IllegalArgumentException && failure.getMessage().startsWith("STOCK_NOT_ENOUGH"), "SECOND_LINE_INSUFFICIENT_STOCK_REJECTED");
        List<OaDatabaseProbe.Call> locks = probe.forActor(actor).stream().filter(call -> call.statement.endsWith("SysConsumableMapper.selectForUpdate")).toList();
        equal(2, locks.size(), "BOTH_REAL_MATERIALS_LOCKED_BEFORE_MULTI_LINE_VALIDATION");
        check(locks.stream().allMatch(call -> call.transaction && !call.autoCommit), "SHORTAGE_VALIDATION_USES_DATABASE_TRANSACTION");
        equal(0L, probe.forActor(actor).stream().filter(call -> call.write).count(), "ALL_LINES_VALIDATED_BEFORE_FIRST_WRITE");
        unchanged(before, Set.of());
        inventory.inbound(scope.second, stock("recover_" + scope.tenant, 2));
        equal(2, dispatch.issue(scope.request, issue(scope, "shortage_" + scope.tenant, 2, 2), null).getLedgerIds().size(), "ORIGINAL_REQUEST_WORKS_WITH_SUFFICIENT_REAL_STOCK");
    }

    private void cacheRepair() throws Exception {
        CaseData scope = fresh();
        materials(scope, 5, 5);
        purchase(scope);
        purchases.receive(scope.purchase, receipt(scope, "cache_receipt_" + scope.tenant));
        SysConsumable original = ledger.material(scope.first);
        int version = original.getVersion();
        jdbc.update("UPDATE oa_consumable SET quantity=quantity+1,stock_amount=stock_amount+3,avg_cost=9.00,last_purchase_price=8.00,last_calc_time='2000-01-01 00:00:00' WHERE consumable_id=? AND tenant_id=?", scope.first, scope.tenant);
        Map<String, TableState> corrupted = snapshot();
        ConsumableResults.Recalculation checked = as(scope, "cache_check", () -> maintenance.recalculate(scope.first, recalculation("check_" + scope.tenant, "CHECK", version)));
        check(!checked.isConsistent() && !checked.isChanged(), "CHECK_REPORTS_CACHE_DRIFT_WITHOUT_REPAIR");
        equal(7, checked.getExpected().getQuantity(), "CHECK_REPLAYS_REAL_MANUAL_AND_PURCHASE_LEDGER");
        equal("14.00", checked.getExpected().getStockAmount(), "CHECK_EXPECTED_AMOUNT_MATCHES_VALID_LEDGER");
        equal("2.00", checked.getExpected().getLastPurchasePrice(), "CHECK_USES_LATEST_REAL_PURCHASE_PRICE");
        equal(0L, probe.forActor("cache_check").stream().filter(call -> call.write).count(), "CHECK_ISSUES_NO_DATABASE_WRITES");
        unchanged(corrupted, Set.of());
        ConsumableCommands.Recalculate rebuild = recalculation("rebuild_" + scope.tenant, "REBUILD", version);
        ConsumableResults.Recalculation repaired = as(scope, "cache_rebuild", () -> maintenance.recalculate(scope.first, rebuild));
        check(repaired.isChanged(), "REBUILD_RESTORES_VALID_LEDGER_BALANCE");
        SysConsumable material = ledger.material(scope.first);
        equal(7, material.getQuantity(), "REBUILD_RESTORES_QUANTITY");
        equal(new BigDecimal("14.00"), material.getStockAmount(), "REBUILD_RESTORES_AMOUNT");
        equal(new BigDecimal("2.00"), material.getAvgCost(), "REBUILD_RESTORES_AVERAGE");
        equal(new BigDecimal("2.00"), material.getLastPurchasePrice(), "REBUILD_RESTORES_LAST_PURCHASE_PRICE");
        equal(version + 1, material.getVersion(), "REBUILD_INCREMENTS_VERSION_ONCE");
        check(material.getLastCalcTime().isAfter(LocalDateTime.of(2000, 1, 1, 0, 0)), "REBUILD_RECORDS_RECALCULATION_TIME");
        unchanged(corrupted, Set.of("oa_consumable", "oa_trace_event"));
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND event_type='CONSUMABLE_REBUILT'", scope.tenant), "REBUILD_CREATES_ONE_REAL_CORRECTION_TRACE");
        Map<String, TableState> committed = snapshot();
        check(!maintenance.recalculate(scope.first, rebuild).isChanged(), "SAME_REBUILD_REQUEST_IS_IDEMPOTENT");
        unchanged(committed, Set.of());
        check(!maintenance.recalculate(scope.first, recalculation("second_rebuild_" + scope.tenant, "REBUILD", version + 1)).isChanged(), "NEW_REQUEST_ON_CONSISTENT_CACHE_MAKES_NO_CORRECTION");
        equal(version + 1, ledger.material(scope.first).getVersion(), "IDEMPOTENT_REBUILD_DOES_NOT_ADVANCE_VERSION");
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND event_type='CONSUMABLE_REBUILT'", scope.tenant), "IDEMPOTENT_REBUILD_DOES_NOT_DUPLICATE_CORRECTION_TRACE");
        unchanged(committed, Set.of("oa_trace_event"));
        transactionEvidence("cache_rebuild");
    }

    private void damagedPrefix() throws Exception {
        CaseData scope = fresh();
        materials(scope, 5, 5);
        inventory.inbound(scope.first, stock("prefix_second_" + scope.tenant, 3));
        long earliest = count("SELECT MIN(ledger_id) FROM oa_consumable_ledger WHERE tenant_id=? AND consumable_id=?", scope.tenant, scope.first);
        long latest = count("SELECT MAX(ledger_id) FROM oa_consumable_ledger WHERE tenant_id=? AND consumable_id=?", scope.tenant, scope.first);
        check(earliest < latest, "CORRUPTION_TARGETS_A_NON_TAIL_LEDGER_PREFIX");
        jdbc.update("UPDATE oa_consumable_ledger SET balance_after=balance_after+1 WHERE tenant_id=? AND ledger_id=?", scope.tenant, earliest);
        equal(8L, count("SELECT balance_after FROM oa_consumable_ledger WHERE ledger_id=?", latest), "TAIL_BALANCE_REMAINS_VALID_TO_EXERCISE_FULL_PREFIX_CHECK");
        Map<String, TableState> before = snapshot();
        for (String mode : List.of("CHECK", "REBUILD")) {
            int version = ledger.material(scope.first).getVersion();
            Throwable failure = caught(() -> maintenance.recalculate(scope.first, recalculation("damaged_" + mode + scope.tenant, mode, version)));
            check(failure instanceof IllegalStateException && failure.getMessage().startsWith("LEDGER_CHAIN_INVALID"), "DAMAGED_PREFIX_MUST_REJECT_" + mode);
            unchanged(before, Set.of());
        }
        equal(2L, count("SELECT COUNT(*) FROM oa_consumable_ledger WHERE tenant_id=? AND consumable_id=?", scope.tenant, scope.first), "NO_INVENTED_BALANCING_LEDGER_ROWS");
        equal(0L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=?", scope.tenant), "INVALID_LEDGER_HAS_NO_REBUILD_SUCCESS_TRACE");
    }

    private void recalculateRace(String mode) throws Exception {
        CaseData scope = fresh();
        materials(scope, 8, 8);
        int version = ledger.material(scope.first).getVersion();
        String holderActor = "recalculate_holder_" + mode;
        String waitingActor = "recalculate_waiter_" + mode;
        if (mode.equals("REBUILD")) jdbc.update("UPDATE oa_consumable SET quantity=quantity+1 WHERE tenant_id=? AND consumable_id=?", scope.tenant, scope.first);
        Map<String, TableState> before = snapshot();
        try (OaDatabaseProbe.Gate gate = probe.gate(holderActor, mode.equals("CHECK") ? "SysConsumableMapper.updateBalance" : "SysConsumableMapper.selectForUpdate", 1, true)) {
            Future<?> holder = async(scope, holderActor, () -> mode.equals("CHECK")
                    ? inventory.inbound(scope.first, stock("concurrent_post_" + scope.tenant, 1))
                    : maintenance.recalculate(scope.first, recalculation("concurrent_rebuild_" + scope.tenant, mode, version)));
            gate.awaitEntered();
            Future<?> waiting = async(scope, waitingActor, () -> mode.equals("CHECK")
                    ? maintenance.recalculate(scope.first, recalculation("concurrent_check_" + scope.tenant, mode, version + 1))
                    : inventory.inbound(scope.first, stock("post_after_rebuild_" + scope.tenant, 1)));
            try {
                OaDatabaseProbe.Call call = probe.awaitCall(waitingActor, "SysConsumableMapper.selectForUpdate");
                awaitRowWait("oa_consumable", call.connectionId, gate.connectionId);
                check(!waiting.isDone(), "RECALCULATION_AND_POSTING_ARE_BLOCKED_ON_REAL_INNODB_LOCK");
                RACES.incrementAndGet();
            } finally {
                gate.close();
            }
            Object holderResult = holder.get(25, TimeUnit.SECONDS);
            Object waitingResult = waiting.get(25, TimeUnit.SECONDS);
            ConsumableResults.Recalculation calculation = (com.cloudflow.oa.domain.vo.ConsumableResults.Recalculation) (mode.equals("CHECK") ? waitingResult : holderResult);
            check(mode.equals("CHECK") ? calculation.isConsistent() && !calculation.isChanged() : calculation.isChanged(), "SERIALIZED_CALCULATION_RETURNS_CORRECT_COMMITTED_RESULT");
        }
        SysConsumable material = ledger.material(scope.first);
        equal(9, material.getQuantity(), "CONCURRENT_POST_IS_NOT_LOST_BY_RECALCULATION");
        equal(new BigDecimal("18.00"), material.getStockAmount(), "CONCURRENT_POST_AMOUNT_IS_NOT_OVERWRITTEN");
        equal(version + (mode.equals("CHECK") ? 1 : 2), material.getVersion(), "CONCURRENT_OPERATIONS_ADVANCE_EXPECTED_VERSIONS");
        equal(9, verifier.verify(material).quantity(), "CONCURRENT_RESULT_PASSES_REAL_COMPLETE_LEDGER_VERIFICATION");
        if (mode.equals("CHECK")) equal(0L, probe.forActor(waitingActor).stream().filter(call -> call.write).count(), "CONCURRENT_CHECK_STAYS_READ_ONLY");
        unchanged(before, Set.of("oa_consumable", "oa_consumable_ledger", "oa_asset_log", "oa_trace_event"));
    }

    private void warningRace() throws Exception {
        CaseData scope = fresh();
        materials(scope, 1, 8);
        warningConfiguration(scope);
        ConsumableMaintenanceService firstScanner = newMaintenance();
        ConsumableMaintenanceService secondScanner = newMaintenance();
        String firstActor = "warning_first";
        String secondActor = "warning_second";
        try (OaDatabaseProbe.Gate gate = probe.gate(firstActor, "SysConsumableMapper.selectForUpdate", 1, true)) {
            Future<?> first = async(scope, firstActor, () -> { firstScanner.scanWarnings(); return null; });
            gate.awaitEntered();
            Future<?> second = async(scope, secondActor, () -> { secondScanner.scanWarnings(); return null; });
            try {
                OaDatabaseProbe.Call call = probe.awaitCall(secondActor, "SysConsumableMapper.selectForUpdate");
                awaitRowWait("oa_consumable", call.connectionId, gate.connectionId);
                RACES.incrementAndGet();
            } finally {
                gate.close();
            }
            first.get(25, TimeUnit.SECONDS);
            second.get(25, TimeUnit.SECONDS);
        }
        equal(1L, count("SELECT COUNT(*) FROM oa_risk_alert WHERE tenant_id=? AND business_id=?", scope.tenant, scope.first), "CONCURRENT_SCANNERS_CREATE_ONE_RISK");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND event_type='MESSAGE_SEND'", scope.tenant), "CONCURRENT_SCANNERS_CREATE_ONE_PERSISTED_MESSAGE_EVENT");
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND event_type='CONSUMABLE_LOW_STOCK'", scope.tenant), "CONCURRENT_SCANNERS_CREATE_ONE_RISK_TRACE");
        List<OaDatabaseProbe.Call> writes = probe.forActor(firstActor).stream().filter(call -> call.statement.endsWith("OaRiskAlertMapper.insert")
                || call.statement.endsWith("OutboxEventMapper.insert") || call.statement.endsWith("OaTraceEventMapper.insert")).toList();
        equal(3, writes.size(), "REAL_RISK_OUTBOX_AND_TRACE_WRITES_OBSERVED");
        check(writes.stream().allMatch(call -> call.transaction && !call.autoCommit), "RISK_AND_MESSAGE_EVENT_SHARE_SPRING_TRANSACTION");
        equal(1L, writes.stream().map(call -> call.connectionId).distinct().count(), "RISK_AND_MESSAGE_EVENT_SHARE_MYSQL_CONNECTION");
        jdbc.update("UPDATE oa_risk_alert SET risk_status='IGNORED' WHERE tenant_id=? AND business_id=?", scope.tenant, scope.first);
        Map<String, TableState> ignored = snapshot();
        firstScanner.scanWarnings();
        secondScanner.scanWarnings();
        unchanged(ignored, Set.of());
        inventory.inbound(scope.first, stock("warning_recovered_" + scope.tenant, 2));
        equal(1L, count("SELECT COUNT(*) FROM oa_risk_alert WHERE tenant_id=? AND risk_status='CLOSED'", scope.tenant), "REAL_INVENTORY_RECOVERY_CLOSES_IGNORED_RISK");
        ConsumableCommands.Stock scrap = stock("warning_again_" + scope.tenant, 2);
        scrap.setUnitPrice(null);
        inventory.scrap(scope.first, scrap);
        firstScanner.scanWarnings();
        equal(1L, count("SELECT COUNT(*) FROM oa_risk_alert WHERE tenant_id=? AND risk_status='OPEN'", scope.tenant), "LATER_REAL_STOCK_DECREASE_STARTS_NEW_WARNING_ROUND");
        equal(2L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=?", scope.tenant), "EACH_WARNING_ROUND_HAS_ONE_MESSAGE_EVENT");
    }

    private void awaitRowWait(String table, long waiting, long blocking) throws Exception {
        check(waiting != blocking, "COMPETITORS_USE_DIFFERENT_REAL_MYSQL_CONNECTIONS");
        long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
        while (System.nanoTime() < deadline) {
            if (isolation.hasRowWait(table, waiting, blocking)) {
                check(true, "PERFORMANCE_SCHEMA_CONFIRMS_OWNED_FIXTURE_ROW_LOCK_WAIT");
                DATABASE_WAITS.incrementAndGet();
                return;
            }
            Thread.sleep(20);
        }
        throw new AssertionError("ACTUAL_INNODB_ROW_LOCK_WAIT_NOT_OBSERVED");
    }

    private CaseData warningFixture() {
        CaseData scope = fresh();
        materials(scope, 1, 8);
        warningConfiguration(scope);
        maintenance.scanWarnings();
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND status='PENDING'", scope.tenant), "REAL_WARNING_CREATES_PENDING_OUTBOX_EVENT");
        jdbc.update("UPDATE outbox_event SET next_retry_at=DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 1 DAY) WHERE tenant_id<>? AND status IN ('PENDING','FAILED')", scope.tenant);
        retryDue(scope);
        return scope;
    }

    private OutboxScheduler scheduler(TransportEdge transport) {
        OutboxProperties properties = new OutboxProperties();
        properties.setOwner("oa08-fixture");
        properties.setStreamKey("oa08:fixture:events");
        properties.setStreamMaxLen(0);
        properties.setBatchSize(1);
        properties.setMaxRetry(3);
        properties.setRetryBaseSeconds(5);
        return new OutboxScheduler(mapper(OutboxEventMapper.class), transport, properties, json, new DeadLetterPublisher(transport, "oa08:fixture:dlq"));
    }

    private void retryDue(CaseData scope) {
        jdbc.update("UPDATE outbox_event SET next_retry_at=DATE_SUB(CURRENT_TIMESTAMP,INTERVAL 1 MINUTE) WHERE tenant_id=? AND status IN ('PENDING','FAILED')", scope.tenant);
    }

    private static void scanGlobal(CaseData scope, OutboxScheduler scanner) {
        TenantContext.clear();
        UserContext.clear();
        try { scanner.scanAndPublish(); }
        finally { identity(scope); }
    }

    private void outboxRetry() throws Exception {
        CaseData scope = warningFixture();
        Map<String, TableState> before = snapshot();
        TransportEdge transport = new TransportEdge();
        transport.failures.set(1);
        OutboxScheduler scanner = scheduler(transport);
        scanGlobal(scope, scanner);
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND status='FAILED' AND retry_count=1 AND locked_by IS NULL AND locked_until IS NULL", scope.tenant), "TRANSPORT_FAILURE_PERSISTS_RETRY_STATE_AND_RELEASES_CLAIM");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND next_retry_at>CURRENT_TIMESTAMP", scope.tenant), "FAILED_OUTBOX_RETRY_IS_DELAYED");
        equal(0, transport.published.size(), "FAILED_TRANSPORT_HAS_NO_DELIVERED_EVENT");
        unchanged(before, Set.of("outbox_event"));
        scanGlobal(scope, scanner);
        equal(1, transport.attempts.get(), "EARLY_SCAN_DOES_NOT_IGNORE_DATABASE_RETRY_TIME");
        retryDue(scope);
        scanGlobal(scope, scanner);
        equal(1, transport.published.size(), "DUE_OUTBOX_RETRY_PUBLISHES_ONCE");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND status='PUBLISHED' AND retry_count=1 AND locked_by IS NULL AND last_error IS NULL", scope.tenant), "OUTBOX_RETRY_PERSISTS_PUBLISHED_STATE");
        BusinessEventEnvelope envelope = transport.onlyEnvelope();
        check(messages.dispatch(envelope).success(), "REAL_MESSAGE_DISPATCH_SUCCEEDS_AFTER_OUTBOX_RETRY");
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND send_status='SUCCESS'", scope.tenant), "RETRIED_MESSAGE_HAS_REAL_SUCCESS_RECORD");
        scanGlobal(scope, scanner);
        equal(2, transport.attempts.get(), "COMPLETED_OUTBOX_IS_NOT_REPUBLISHED");
        unchanged(before, Set.of("outbox_event", "sys_message_record"));
    }

    private void outboxRace() throws Exception {
        CaseData scope = warningFixture();
        TransportEdge transport = new TransportEdge();
        OutboxScheduler firstScanner = scheduler(transport);
        OutboxScheduler secondScanner = scheduler(transport);
        String firstActor = "outbox_first";
        String secondActor = "outbox_second";
        Map<String, TableState> before = snapshot();
        try (Connection blocker = dataSource.getConnection()) {
            blocker.setAutoCommit(false);
            count(blocker, "SELECT id FROM outbox_event WHERE tenant_id=? FOR UPDATE", scope.tenant);
            long blockingConnection = OaDatabaseProbe.connectionId(blocker);
            Future<?> first = async(scope, firstActor, () -> { scanGlobal(scope, firstScanner); return null; });
            Future<?> second = async(scope, secondActor, () -> { scanGlobal(scope, secondScanner); return null; });
            try {
                OaDatabaseProbe.Call firstCall = probe.awaitCall(firstActor, "OutboxEventMapper.claimBatch");
                OaDatabaseProbe.Call secondCall = probe.awaitCall(secondActor, "OutboxEventMapper.claimBatch");
                awaitRowWait("outbox_event", firstCall.connectionId, blockingConnection);
                awaitRowWait("outbox_event", secondCall.connectionId, blockingConnection);
                check(firstCall.connectionId != secondCall.connectionId, "TWO_SCANNERS_HAVE_DISTINCT_MYSQL_SESSIONS");
                RACES.incrementAndGet();
            } finally {
                blocker.commit();
            }
            Throwable firstFailure = caught(() -> first.get(25, TimeUnit.SECONDS));
            Throwable secondFailure = caught(() -> second.get(25, TimeUnit.SECONDS));
            check(firstFailure == null || deadlock(firstFailure), "FIRST_SCANNER_CAN_ONLY_LOSE_WITH_A_REAL_DEADLOCK");
            check(secondFailure == null || deadlock(secondFailure), "SECOND_SCANNER_CAN_ONLY_LOSE_WITH_A_REAL_DEADLOCK");
            check(firstFailure == null || secondFailure == null, "AT_LEAST_ONE_REAL_SCANNER_WINS");
            if (firstFailure != null) { DEADLOCKS.incrementAndGet(); scanGlobal(scope, firstScanner); }
            if (secondFailure != null) { DEADLOCKS.incrementAndGet(); scanGlobal(scope, secondScanner); }
        }
        equal(1, transport.attempts.get(), "TWO_SCANNERS_SEND_ONE_EVENT");
        equal(1, transport.published.size(), "TWO_SCANNERS_PUBLISH_ONE_ENVELOPE");
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND status='PUBLISHED' AND locked_by IS NULL AND locked_until IS NULL", scope.tenant), "ONE_FINAL_PUBLISHED_STATE_WITH_NO_STALE_CLAIM");
        check(messages.dispatch(transport.onlyEnvelope()).success(), "WINNING_EVENT_PERSISTS_REAL_MESSAGE_RECORD");
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND send_status='SUCCESS'", scope.tenant), "CONCURRENT_SCAN_RESULT_DELIVERS_ONE_REAL_MESSAGE");
        unchanged(before, Set.of("outbox_event", "sys_message_record"));
    }

    private void messageDatabaseRetry() throws Exception {
        CaseData scope = warningFixture();
        TransportEdge transport = new TransportEdge();
        scanGlobal(scope, scheduler(transport));
        BusinessEventEnvelope envelope = transport.onlyEnvelope();
        Map<String, TableState> before = snapshot();
        int pushesBefore = push.successes.get();
        isolation.createFailureTrigger("oa08_message_record", "INSERT", "sys_message_record", "receiver_id", scope.user);
        Throwable failure;
        try {
            failure = caught(() -> as(scope, "message_database", () -> messages.dispatch(envelope)));
        } finally {
            isolation.dropFailureTrigger("oa08_message_record");
        }
        check(sqlFault(failure), "REAL_MESSAGE_RECORD_INSERT_FAILURE_PROPAGATES");
        SQL_FAULTS.incrementAndGet();
        check(probe.forActor("message_database").stream().anyMatch(call -> call.statement.endsWith("SysMessageRecordMapper.insert")
                && call.transaction && !call.autoCommit && sqlFault(call.failure)), "FAILED_MESSAGE_RECORD_USES_REAL_SPRING_DATABASE_TRANSACTION");
        unchanged(before, Set.of());
        equal(pushesBefore, push.successes.get(), "MESSAGE_RECORD_FAILURE_DOES_NOT_PUSH_OR_CHANGE_COMMITTED_INVENTORY");
        check(messages.dispatch(envelope).success(), "SAME_EVENT_REDELIVERY_RECOVERS_AFTER_DATABASE_FAULT");
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND send_status='SUCCESS'", scope.tenant), "REDELIVERY_COMMITS_ONE_REAL_SUCCESS_RECORD");
        Map<String, TableState> committed = snapshot();
        check(messages.dispatch(envelope).success(), "SAME_EVENT_REDELIVERY_IS_IDEMPOTENT");
        equal(pushesBefore + 1, push.successes.get(), "IDEMPOTENT_REDELIVERY_DOES_NOT_PUSH_AGAIN");
        unchanged(committed, Set.of());
        unchanged(before, Set.of("sys_message_record"));
    }

    private void internalNotificationRetry() throws Exception {
        CaseData scope = warningFixture();
        TransportEdge transport = new TransportEdge();
        OutboxScheduler scanner = scheduler(transport);
        scanGlobal(scope, scanner);
        Map<String, TableState> before = snapshot();
        int attemptsBefore = push.attempts.get();
        int successesBefore = push.successes.get();
        push.failures.set(1);
        MessageDispatchService.DispatchResult failed = messages.dispatch(transport.onlyEnvelope());
        check(!failed.success(), "INTERNAL_CHANNEL_FAILURE_IS_RECORDED_AS_FAILURE");
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND channel_type='INTERNAL' AND send_status='FAILED'", scope.tenant), "FAILED_INTERNAL_MESSAGE_PERSISTS_REAL_STATUS");
        equal(attemptsBefore + 1, push.attempts.get(), "REAL_INTERNAL_CHANNEL_REACHES_ONLY_THE_PUSH_EDGE");
        unchanged(before, Set.of("outbox_event", "sys_message_record"));
        long pending = count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND status IN ('PENDING','FAILED')", scope.tenant);
        Map<String, TableState> afterFailure = snapshot();
        maintenance.scanWarnings();
        unchanged(afterFailure, Set.of());
        check(failed.delayed() && pending == 1, "INTERNAL_FAILURE_MUST_SCHEDULE_ONE_RETRY");
        retryDue(scope);
        scanGlobal(scope, scanner);
        equal(2, transport.published.size(), "INTERNAL_RETRY_PUBLISHES_SECOND_ATTEMPT");
        BusinessEventEnvelope retry = transport.envelopes().get(1);
        check(messages.dispatch(retry).success(), "INTERNAL_RETRY_RECOVERS_TO_SUCCESS");
        equal(1L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND channel_type='INTERNAL' AND send_status='SUCCESS'", scope.tenant), "ONE_SUCCESSFUL_MESSAGE_AFTER_RETRY");
        equal(successesBefore + 1, push.successes.get(), "ONLY_ONE_SUCCESSFUL_NOTIFICATION_DELIVERY");
        Map<String, TableState> committed = snapshot();
        check(messages.dispatch(retry).success(), "SUCCESSFUL_RETRY_EVENT_REPLAYS");
        unchanged(committed, Set.of());
        unchanged(before, Set.of("outbox_event", "sys_message_record"));
    }

    private void warningMessageIdentity() throws Exception {
        CaseData scope = warningFixture();
        TransportEdge transport = new TransportEdge();
        OutboxScheduler scanner = scheduler(transport);
        scanGlobal(scope, scanner);
        BusinessEventEnvelope first = transport.onlyEnvelope();
        MessageSendRequest firstRequest = json.readValue(first.getPayload(), MessageSendRequest.class);
        check(firstRequest.getDeduplicationKey().contains("consumable-low-stock:"), "REAL_WARNING_PUBLISHER_SUPPLIES_EVENT_IDENTITY");
        int attemptsBefore = push.attempts.get();
        check(messages.dispatch(first).success(), "FIRST_WARNING_ROUND_IS_DELIVERED_WITH_ACTIVE_DEDUPE_WINDOW");
        check(messages.dispatch(first).success(), "REPEATING_THE_SAME_WARNING_EVENT_REUSES_ITS_RECORD");
        equal(attemptsBefore + 1, push.attempts.get(), "SAME_WARNING_EVENT_DOES_NOT_DELIVER_TWICE");
        inventory.inbound(scope.first, stock("message_recovered_" + scope.tenant, 2));
        ConsumableCommands.Stock scrap = stock("message_again_" + scope.tenant, 2);
        scrap.setUnitPrice(null);
        inventory.scrap(scope.first, scrap);
        maintenance.scanWarnings();
        retryDue(scope);
        scanGlobal(scope, scanner);
        equal(2, transport.published.size(), "TWO_REAL_WARNING_ROUNDS_PUBLISH_TWO_EVENTS");
        BusinessEventEnvelope second = transport.envelopes().get(1);
        MessageSendRequest secondRequest = json.readValue(second.getPayload(), MessageSendRequest.class);
        equal(firstRequest.getBizId(), secondRequest.getBizId(), "NEW_WARNING_ROUND_RETAINS_MATERIAL_BUSINESS_ID");
        check(!firstRequest.getDeduplicationKey().equals(secondRequest.getDeduplicationKey()), "NEW_WARNING_ROUND_HAS_DISTINCT_CALLER_IDENTITY");
        check(!first.getEventId().equals(second.getEventId()), "REAL_PUBLISHER_BINDS_EACH_WARNING_ROUND_TO_A_DISTINCT_EVENT");
        check(messages.dispatch(second).success(), "NEW_WARNING_ROUND_IS_NOT_SUPPRESSED_BY_PREVIOUS_ROUND");
        equal(attemptsBefore + 2, push.attempts.get(), "EACH_WARNING_ROUND_DELIVERS_ONCE");
        check(messages.dispatch(second).success(), "NEW_WARNING_EVENT_REPLAY_REUSES_ITS_SUCCESS_RECORD");
        equal(attemptsBefore + 2, push.attempts.get(), "NEW_WARNING_EVENT_REPLAY_DOES_NOT_PUSH_AGAIN");
        equal(2L, count("SELECT COUNT(*) FROM sys_message_record WHERE tenant_id=? AND send_status='SUCCESS'", scope.tenant), "BOTH_WARNING_ROUNDS_HAVE_DISTINCT_SUCCESSFUL_RECORDS");
        for (String key : java.util.Arrays.asList(null, "", "unbound-event-identity")) {
            MessageSendRequest request = secondRequest.toBuilder().deduplicationKey(key).build();
            MessageDispatchService.DispatchResult suppressed = messages.dispatch(messageEnvelope(second, request));
            check(!suppressed.success(), "LEGACY_OR_UNBOUND_EVENT_REMAINS_SUBJECT_TO_TEMPLATE_WINDOW");
            equal("DEDUPED", suppressed.records().get(0).getSkipReason(), "WINDOW_SUPPRESSION_IS_RECORDED_EXPLICITLY");
        }
        equal(attemptsBefore + 2, push.attempts.get(), "UNBOUND_IDENTITIES_CANNOT_BYPASS_TEMPLATE_WINDOW");
        MessageSendRequest forced = secondRequest.toBuilder().forceSend(true).build();
        check(messages.dispatch(messageEnvelope(second, forced)).success(), "EXPLICIT_FORCE_SEND_RETAINS_EXISTING_BEHAVIOR");
        equal(attemptsBefore + 3, push.attempts.get(), "FORCED_SEND_ADDS_ONLY_ITS_AUTHORIZED_DELIVERY");
    }

    private BusinessEventEnvelope messageEnvelope(BusinessEventEnvelope source, MessageSendRequest request) throws Exception {
        return BusinessEventEnvelope.builder().eventId(java.util.UUID.randomUUID().toString())
                .eventType(source.getEventType()).tenantId(source.getTenantId()).sourceModule(source.getSourceModule())
                .sourceId(source.getSourceId()).payload(json.writeValueAsString(request)).build();
    }

    private void callbackWrongToken() throws Exception {
        ApprovalFixture fixture = approvalFixture();
        String instance = "oa08-callback-" + fixture.requestId;
        approvalHandler.bindInstance(fixture.submission, instance);
        Map<String, String> wrong = callbackBody(fixture, instance, "APPROVED");
        String wrongToken = "F:" + java.util.UUID.randomUUID();
        check(!wrongToken.equals(fixture.submission.getReservation()), "WRONG_TOKEN_IS_DIFFERENT_FROM_REAL_SUBMISSION_RESERVATION");
        equal(wrongToken, WorkflowCallbackMetadata.variables(ConsumableOperationSupport.BUSINESS_TYPE,
                Map.of("oaRequestToken", wrongToken)).get("oaRequestToken"), "WRONG_TOKEN_HAS_VALID_PRODUCTION_METADATA_FORMAT");
        wrong.put("oaRequestToken", json.writeValueAsString(wrongToken));
        rejectedCallback(fixture.scope, wrong, "WRONG_TOKEN", "审批提交令牌不一致");
        Map<String, String> missing = callbackBody(fixture, instance, "APPROVED");
        missing.remove("oaRequestToken");
        malformedCallback(fixture.scope, missing, "MISSING_TOKEN");
        Map<String, String> malformed = callbackBody(fixture, instance, "APPROVED");
        malformed.put("oaRequestToken", json.writeValueAsString("F:isolated-wrong-token"));
        malformedCallback(fixture.scope, malformed, "MALFORMED_TOKEN");
        approveOnce(fixture, callbackBody(fixture, instance, "APPROVED"));
    }

    private void callbackCrossTenant() throws Exception {
        ApprovalFixture owner = approvalFixture();
        ApprovalFixture other = approvalFixture();
        String instance = "oa08-callback-" + owner.requestId;
        identity(owner.scope);
        approvalHandler.bindInstance(owner.submission, instance);
        Map<String, TableState> before = snapshot();
        ApprovalResultDTO mismatch = new ApprovalResultDTO();
        mismatch.setTenantId(other.scope.tenant);
        mismatch.setBusinessId(owner.requestId);
        mismatch.setBusinessType(ConsumableOperationSupport.BUSINESS_TYPE);
        mismatch.setProcessInstanceId(instance);
        mismatch.setApprovalResult("APPROVED");
        mismatch.setApproverId(owner.approver);
        mismatch.setVariables(Map.of("oaRequestToken", owner.submission.getReservation()));
        Throwable direct = caught(() -> approvalHandler.handleApproved(mismatch));
        check(direct instanceof IllegalArgumentException && direct.getMessage().contains("审批回调租户不一致"), "DIRECT_OA_RECEIVER_REJECTS_CONTEXT_DTO_TENANT_MISMATCH");
        unchanged(before, Set.of());
        Map<String, String> cross = callbackBody(owner, instance, "APPROVED");
        cross.put("tenantId", Long.toString(other.scope.tenant));
        rejectedCallback(owner.scope, cross, "CROSS_TENANT_BODY", "记录不存在或无权访问");
        Map<String, String> foreignRequest = callbackBody(owner, instance, "APPROVED");
        foreignRequest.put("businessId", Long.toString(other.requestId));
        rejectedCallback(other.scope, foreignRequest, "CROSS_TENANT_BUSINESS", "记录不存在或无权访问");
        identity(owner.scope);
        approveOnce(owner, callbackBody(owner, instance, "APPROVED"));
        equal(1L, count("SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status='APPROVING'", other.scope.tenant, other.requestId), "OTHER_TENANT_APPROVAL_IS_UNTOUCHED");
    }

    private void callbackOldRound() throws Exception {
        ApprovalFixture first = approvalFixture();
        String oldInstance = "oa08-callback-" + first.requestId + "-old";
        approvalHandler.bindInstance(first.submission, oldInstance);
        Map<String, String> rejectedRound = callbackBody(first, oldInstance, "REJECTED");
        Map<String, TableState> beforeRejected = snapshot();
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            String actor = "callback_first_rejection_" + first.scope.tenant;
            check(as(first.scope, actor, () -> receiver.deliver(rejectedRound)) == null, "FIRST_ROUND_REJECTED_BY_REAL_RECEIVER");
            callbackTransactionEvidence(actor);
            equal(1, receiver.leases.completed, "FIRST_ROUND_REJECTION_COMMITS_BEFORE_ACK");
        }
        equal(1L, count("SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status='REJECTED'", first.scope.tenant, first.requestId), "REJECTED_STATE_COMES_FROM_REAL_CALLBACK_SERVICE");
        unchanged(beforeRejected, Set.of("oa_consumable_request", "oa_consumable_request_item", "oa_trace_event"));
        ConsumableCommands.EditRequest edit = new ConsumableCommands.EditRequest();
        approvalRequestData(first.scope, edit);
        edit.setVersion(requestVersion(first.requestId, first.scope.tenant));
        equal("DRAFT", requestService.edit(first.requestId, edit).getStatus(), "REJECTED_ROUND_REOPENS_ONLY_THROUGH_REAL_EDIT_SERVICE");
        ApprovalFixture second = new ApprovalFixture(first.scope, first.requestId, first.approver, submitFixture(first.scope, first.requestId, 2));
        check(!first.submission.getReservation().equals(second.submission.getReservation()), "NEW_LEGAL_SUBMISSION_HAS_A_DIFFERENT_RESERVATION");
        Map<String, TableState> beforeOldBinding = snapshot();
        approvalHandler.bindInstance(first.submission, oldInstance);
        unchanged(beforeOldBinding, Set.of());
        String newInstance = "oa08-callback-" + first.requestId + "-new";
        approvalHandler.bindInstance(second.submission, newInstance);
        Map<String, TableState> beforeOldCallback = snapshot();
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            check(receiver.deliver(rejectedRound) == null, "OLD_ROUND_IS_SAFELY_ACKNOWLEDGED_AS_NO_OP");
            equal(1, receiver.leases.completed, "OLD_ROUND_DOES_NOT_REMAIN_AN_INFINITE_RETRY");
        }
        unchanged(beforeOldCallback, Set.of());
        equal(1L, count("SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status='APPROVING' AND instance_id=?", first.scope.tenant, first.requestId, newInstance), "OLD_ROUND_CANNOT_REJECT_OR_REBIND_THE_NEW_ROUND");
        approveOnce(second, callbackBody(second, newInstance, "APPROVED"));
        equal(2L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='CONSUMABLE_DECISION'", first.scope.tenant, first.requestId), "ONLY_ONE_REAL_DECISION_PER_LEGAL_ROUND");
    }

    private void callbackBeforeBind() throws Exception {
        ApprovalFixture fixture = approvalFixture();
        String instance = "oa08-callback-" + fixture.requestId;
        Map<String, String> body = callbackBody(fixture, instance, "APPROVED");
        rejectedCallback(fixture.scope, body, "BEFORE_BIND", "审批实例正在绑定，请重试回调");
        String actor = "callback_bind_" + fixture.scope.tenant;
        as(fixture.scope, actor, () -> { approvalHandler.bindInstance(fixture.submission, instance); return null; });
        transactionEvidence(actor);
        approveOnce(fixture, body);
        equal(1L, count("SELECT COUNT(*) FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_F_APPROVAL_SUBMITTED'", fixture.scope.tenant, fixture.requestId), "FAST_CALLBACK_RETRY_DOES_NOT_RESUBMIT_OR_CREATE_NEW_APPROVAL");
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='APPROVAL_BOUND'", fixture.scope.tenant, fixture.requestId), "FAST_CALLBACK_RETRY_USES_EXACTLY_ONE_REAL_BINDING");
    }

    private void callbackRollback(String fault) throws Exception {
        ApprovalFixture fixture = approvalFixture();
        String instance = "oa08-callback-" + fixture.requestId;
        approvalHandler.bindInstance(fixture.submission, instance);
        String actor = "callback_fault_" + fixture.scope.tenant + "_" + fault;
        String statement = switch (fault) {
            case "ITEM" -> "OaConsumableRequestItemMapper.saveState";
            case "SOURCE" -> "OaConsumableRequestMapper.saveState";
            default -> "OaTraceEventMapper.insert";
        };
        String table = switch (fault) {
            case "ITEM" -> "oa_consumable_request_item";
            case "SOURCE" -> "oa_consumable_request";
            default -> "oa_trace_event";
        };
        String field = switch (fault) {
            case "ITEM" -> "consumable_id";
            case "SOURCE" -> "request_id";
            default -> "id";
        };
        long identifier = "ITEM".equals(fault) ? fixture.scope.second : "SOURCE".equals(fault) ? fixture.requestId : nextTraceIdentifier();
        AtomicInteger reached = new AtomicInteger();
        probe.watch(actor, statement, "ITEM".equals(fault) ? 2 : 1, false, connection -> {
            equal("ITEM".equals(fault) ? 1L : 2L, count(connection, "SELECT COUNT(*) FROM oa_consumable_request_item WHERE tenant_id=? AND request_id=? AND approved_quantity=apply_quantity", fixture.scope.tenant, fixture.requestId), "CALLBACK_PRIOR_APPROVED_LINES_EXIST_INSIDE_FAILING_TRANSACTION");
            String status = "TRACE".equals(fault) ? "APPROVED" : "APPROVING";
            equal(1L, count(connection, "SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status=?", fixture.scope.tenant, fixture.requestId, status), "CALLBACK_MASTER_POSITION_IS_OBSERVED_BEFORE_REAL_SQL_FAILURE");
            try (Connection independent = dataSource.getConnection()) {
                equal(0L, count(independent, "SELECT COUNT(*) FROM oa_consumable_request_item WHERE tenant_id=? AND request_id=? AND approved_quantity>0", fixture.scope.tenant, fixture.requestId), "UNCOMMITTED_CALLBACK_APPROVALS_ARE_INVISIBLE_TO_ANOTHER_CONNECTION");
                equal(1L, count(independent, "SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status='APPROVING'", fixture.scope.tenant, fixture.requestId), "INDEPENDENT_CONNECTION_STILL_SEES_UNDECIDED_REQUEST");
            }
            reached.incrementAndGet();
        });
        Map<String, TableState> before = snapshot();
        String trigger = "oa08_callback_" + fault.toLowerCase(java.util.Locale.ROOT);
        Map<String, String> body = callbackBody(fixture, instance, "APPROVED");
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            Throwable failure;
            isolation.createFailureTrigger(trigger, "TRACE".equals(fault) ? "INSERT" : "UPDATE", table, field, identifier);
            try { failure = as(fixture.scope, actor, () -> receiver.deliver(body)); }
            finally { isolation.dropFailureTrigger(trigger); }
            check(sqlFault(failure), "CALLBACK_ACTUAL_MYSQL_TRIGGER_FAILURE_IS_PROPAGATED");
            SQL_FAULTS.incrementAndGet();
            equal(1, reached.get(), "CALLBACK_FAULT_FOLLOWS_EARLIER_REAL_WRITES");
            equal(0, receiver.leases.completed, "ROLLED_BACK_CALLBACK_IS_NOT_MARKED_DONE");
            equal(0, receiver.leases.acknowledged, "ROLLED_BACK_CALLBACK_REMAINS_ELIGIBLE_FOR_REDELIVERY");
            equal(1, receiver.leases.released, "ROLLED_BACK_CALLBACK_RELEASES_ITS_LEASE");
            equal(0, receiver.deadLetters, "ISOLATED_SQL_FAILURE_DOES_NOT_INVENT_A_DEAD_LETTER");
        }
        callbackTransactionEvidence(actor);
        unchanged(before, Set.of());
        approveOnce(fixture, body);
    }

    private void callbackBindingRollback() throws Exception {
        ApprovalFixture fixture = approvalFixture();
        String instance = "oa08-callback-" + fixture.requestId;
        String actor = "callback_binding_fault_" + fixture.scope.tenant;
        AtomicInteger reached = new AtomicInteger();
        probe.watch(actor, "OaTraceEventMapper.insert", 1, false, connection -> {
            equal(1L, count(connection, "SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND instance_id=?", fixture.scope.tenant, fixture.requestId, instance), "BINDING_MASTER_WRITE_EXISTS_BEFORE_TRACE_FAILURE");
            try (Connection independent = dataSource.getConnection()) {
                equal(1L, count(independent, "SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND instance_id=?", fixture.scope.tenant, fixture.requestId, fixture.submission.getReservation()), "UNCOMMITTED_BINDING_IS_INVISIBLE_TO_ANOTHER_CONNECTION");
            }
            reached.incrementAndGet();
        });
        Map<String, TableState> before = snapshot();
        String trigger = "oa08_callback_binding_trace";
        Throwable failure;
        isolation.createFailureTrigger(trigger, "INSERT", "oa_trace_event", "id", nextTraceIdentifier());
        try {
            failure = caught(() -> as(fixture.scope, actor, () -> {
                approvalHandler.bindInstance(fixture.submission, instance);
                return null;
            }));
        } finally { isolation.dropFailureTrigger(trigger); }
        check(sqlFault(failure), "BINDING_TRACE_FAILURE_IS_A_REAL_MYSQL_ERROR");
        SQL_FAULTS.incrementAndGet();
        equal(1, reached.get(), "BINDING_FAILURE_FOLLOWS_REAL_MASTER_WRITE");
        transactionEvidence(actor);
        unchanged(before, Set.of());
        approvalHandler.bindInstance(fixture.submission, instance);
        equal(1L, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='APPROVAL_BOUND'", fixture.scope.tenant, fixture.requestId), "BINDING_RETRY_COMMITS_ONE_FROZEN_SNAPSHOT");
        approveOnce(fixture, callbackBody(fixture, instance, "APPROVED"));
    }

    private long nextTraceIdentifier() throws SQLException {
        try (Statement session = isolation.administration.createStatement()) { session.execute("SET SESSION information_schema_stats_expiry=0"); }
        try (PreparedStatement query = isolation.administration.prepareStatement("SELECT AUTO_INCREMENT FROM information_schema.tables WHERE table_schema=? AND table_name='oa_trace_event'")) {
            query.setString(1, isolation.database);
            try (ResultSet rows = query.executeQuery()) {
                check(rows.next() && rows.getLong(1) > 0, "NEXT_TRACE_ID_IS_READ_FROM_OWNED_ISOLATED_TABLE_METADATA");
                return rows.getLong(1);
            }
        }
    }

    private void rejectedCallback(CaseData caller, Map<String, String> body, String name, String expectedMessage) throws Exception {
        Map<String, TableState> before = snapshot();
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            String actor = "callback_rejected_" + caller.tenant + "_" + name;
            Throwable failure = as(caller, actor, () -> receiver.deliver(body));
            check(failure instanceof RuntimeException && failure.getMessage().contains(expectedMessage), "CALLBACK_REJECTED_FOR_EXPECTED_BUSINESS_REASON_" + name);
            equal(1, receiver.dispatchAttempts, "BUSINESS_REJECTION_REACHES_REAL_CALLBACK_DISPATCHER");
            equal(1, receiver.leases.acquired, "BUSINESS_REJECTION_PASSES_METADATA_AND_ACQUIRES_PROCESSING_LEASE");
            if ("WRONG_TOKEN".equals(name)) {
                equal(WorkflowCallbackMetadata.decodeStreamValue(body.get("oaRequestToken")), receiver.lastResult.getVariables().get("oaRequestToken"), "FORMATTED_WRONG_TOKEN_REACHES_OA_RECEIVER_UNCHANGED");
                check(Arrays.stream(failure.getStackTrace()).anyMatch(frame -> frame.getClassName().equals(ConsumableApprovalService.class.getName())
                        && frame.getMethodName().contains("decision")), "TOKEN_REJECTION_ORIGINATES_IN_REAL_OA_DECISION_SERVICE");
                for (String read : List.of("OaConsumableRequestMapper.lock", "OaTraceEventMapper.selectList", "OaConsumableRequestMapper.approverAllowed")) {
                    check(probe.forActor(actor).stream().anyMatch(call -> call.statement.endsWith(read)), "WRONG_TOKEN_REJECTION_FOLLOWS_REAL_FROZEN_SNAPSHOT_AND_APPROVER_CHECKS");
                }
            }
            equal(0, receiver.leases.completed, "REJECTED_CALLBACK_IS_NOT_MARKED_DONE");
            equal(0, receiver.leases.acknowledged, "REJECTED_CALLBACK_IS_NOT_ACKNOWLEDGED");
            equal(1, receiver.leases.released, "REJECTED_CALLBACK_RELEASES_ONLY_ITS_FIXTURE_LEASE");
            equal(0, receiver.deadLetters, "FIRST_REJECTION_DOES_NOT_FABRICATE_DEAD_LETTER");
            check(probe.forActor(actor).stream().noneMatch(call -> call.write), "REJECTED_CALLBACK_HAS_NO_BUSINESS_WRITE_STATEMENT");
        }
        unchanged(before, Set.of());
    }

    private void malformedCallback(CaseData caller, Map<String, String> body, String name) throws Exception {
        Map<String, TableState> before = snapshot();
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            Method parser = Objects.requireNonNull(ReflectionUtils.findMethod(WorkflowApprovalCallbackStreamConsumer.class, "buildDto", Map.class));
            ReflectionUtils.makeAccessible(parser);
            Throwable invalid = caught(() -> ReflectionUtils.invokeMethod(parser, receiver.consumer, body));
            check(invalid instanceof IllegalArgumentException && "审批提交令牌缺失或格式无效".equals(invalid.getMessage()), "PRODUCTION_CALLBACK_PARSER_REJECTS_" + name);
            String actor = "callback_format_" + caller.tenant + "_" + name;
            check(as(caller, actor, () -> receiver.deliver(body)) == null, "MALFORMED_MESSAGE_DOES_NOT_ENTER_BUSINESS_DISPATCH");
            equal(0, receiver.dispatchAttempts, "MALFORMED_CALLBACK_STOPS_BEFORE_BUSINESS_RECEIVER");
            equal(0, receiver.leases.acquired, "MALFORMED_CALLBACK_DOES_NOT_ACQUIRE_BUSINESS_LEASE");
            equal(0, receiver.leases.completed, "MALFORMED_CALLBACK_IS_NOT_MARKED_DONE");
            equal(0, receiver.leases.acknowledged, "MALFORMED_CALLBACK_IS_NOT_ACKNOWLEDGED");
            equal(0, receiver.leases.released, "MALFORMED_CALLBACK_HAS_NO_LEASE_TO_RELEASE");
            equal(1, receiver.retryInspections, "MALFORMED_CALLBACK_FOLLOWS_PRODUCTION_RETRY_PATH");
            equal(0, receiver.deadLetters, "MALFORMED_CALLBACK_DOES_NOT_FABRICATE_FIRST_ATTEMPT_DEAD_LETTER");
            check(probe.forActor(actor).isEmpty(), "MALFORMED_CALLBACK_EXECUTES_NO_BUSINESS_SQL");
        }
        unchanged(before, Set.of());
    }

    private void approveOnce(ApprovalFixture fixture, Map<String, String> body) throws Exception {
        Map<String, TableState> before = snapshot();
        int version = requestVersion(fixture.requestId, fixture.scope.tenant);
        long decisions = count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='CONSUMABLE_DECISION'", fixture.scope.tenant, fixture.requestId);
        try (CallbackReceiver receiver = new CallbackReceiver()) {
            String actor = "callback_approved_" + fixture.scope.tenant;
            check(as(fixture.scope, actor, () -> receiver.deliver(body)) == null, "VALID_CALLBACK_REACHES_REAL_OA_BUSINESS_COMMIT");
            callbackTransactionEvidence(actor);
            equal(1, receiver.leases.completed, "VALID_CALLBACK_COMPLETION_IS_RECORDED_ONCE");
            equal(1, receiver.leases.acknowledged, "VALID_CALLBACK_ACK_FOLLOWS_DATABASE_COMMIT");
            equal(1L, count("SELECT COUNT(*) FROM oa_consumable_request WHERE tenant_id=? AND request_id=? AND status='APPROVED' AND version=?", fixture.scope.tenant, fixture.requestId, version + 1), "VALID_CALLBACK_UPDATES_MASTER_ONCE");
            equal(2L, count("SELECT COUNT(*) FROM oa_consumable_request_item WHERE tenant_id=? AND request_id=? AND approved_quantity=apply_quantity AND issued_quantity=0 AND returned_quantity=0", fixture.scope.tenant, fixture.requestId), "VALID_CALLBACK_APPROVES_ALL_LINES_WITHOUT_ANY_STOCK_MOVEMENT");
            equal(decisions + 1, count("SELECT COUNT(*) FROM oa_trace_event WHERE tenant_id=? AND business_id=? AND event_type='CONSUMABLE_DECISION'", fixture.scope.tenant, fixture.requestId), "VALID_CALLBACK_APPENDS_EXACTLY_ONE_REAL_DECISION_TRACE");
            unchanged(before, Set.of("oa_consumable_request", "oa_consumable_request_item", "oa_trace_event"));
            Map<String, TableState> committed = snapshot();
            String duplicate = actor + "_duplicate";
            check(as(fixture.scope, duplicate, () -> receiver.deliver(body)) == null, "VALID_CALLBACK_REDELIVERY_IS_ACCEPTED");
            check(probe.forActor(duplicate).stream().anyMatch(call -> call.statement.endsWith("OaConsumableRequestMapper.lock")), "DUPLICATE_REACHES_BUSINESS_GUARD_INSTEAD_OF_FIXTURE_LEASE_SHORTCUT");
            unchanged(committed, Set.of());
        }
    }

    private final class ApprovalRuleEdge implements RemoteConsumableRuleService {
        @Override
        public R<BusinessRuleDTO> getEffectiveRule(String code) {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "FIXTURE_RULE_READ_STAYS_OUTSIDE_BUSINESS_TRANSACTION");
            equal("oa.consumable.request.limit", code, "FIXTURE_RULE_CODE_IS_EXACT");
            Map<String, Object> revision = mapper(OaConsumableRequestMapper.class).ruleVersion(OaRecordSupport.tenantId(), code);
            check(revision != null, "REAL_ISOLATED_RULE_VERSION_IS_REQUIRED");
            BusinessRuleDTO rule = new BusinessRuleDTO();
            rule.setRuleCode(code);
            rule.setThresholdValue(new BigDecimal(revision.get("thresholdValue").toString()));
            rule.setEffect(revision.get("effect").toString());
            rule.setEnabled(1);
            return R.ok(rule);
        }

        @Override
        public R<Void> recordHit(BusinessRuleHitRecordDTO record) {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "FIXTURE_RULE_HIT_STAYS_OUTSIDE_BUSINESS_TRANSACTION");
            equal(OaRecordSupport.tenantId(), record.getTenantId(), "FIXTURE_RULE_HIT_RETAINS_TENANT");
            equal(ConsumableOperationSupport.BUSINESS_TYPE, record.getBusinessType(), "FIXTURE_RULE_HIT_RETAINS_BUSINESS_TYPE");
            check(record.getBusinessId() != null && "PASS".equals(record.getEffect()), "FIXTURE_ALWAYS_POLICY_STILL_REQUIRES_APPROVAL");
            return R.ok();
        }
    }

    private final class CallbackReceiver implements AutoCloseable {
        final CallbackLeaseEdge leases = new CallbackLeaseEdge();
        final WorkflowApprovalCallbackStreamConsumer consumer;
        Throwable failure;
        ApprovalResultDTO lastResult;
        int dispatchAttempts;
        int retryInspections;
        int deadLetters;

        CallbackReceiver() {
            WorkflowCallbackProperties properties = new WorkflowCallbackProperties();
            properties.setStreamKey("oa08:fixture:callback");
            properties.setGroup("oa08:fixture:callback-group");
            RedisStreamUtil transport = new RedisStreamUtil() {
                @Override public long pendingDeliveryCountGlobal(String streamKey, String group, String messageId) {
                    equal(properties.getStreamKey(), streamKey, "CALLBACK_RETRY_ONLY_USES_ISOLATED_TRANSPORT_EDGE");
                    retryInspections++;
                    return 1L;
                }
            };
            consumer = new WorkflowApprovalCallbackStreamConsumer(result -> {
                dispatchAttempts++;
                lastResult = result;
                try { callbackDispatcher.handleApprovalResult(result); }
                catch (RuntimeException rejected) { failure = rejected; throw rejected; }
            }, transport, properties, leases, (stream, instance, payload, attempts, error) -> deadLetters++);
        }

        Throwable deliver(Map<String, String> body) {
            failure = null;
            Long tenantBefore = TenantContext.getTenantId();
            Long userTenantBefore = UserContext.getTenantId();
            Long userBefore = UserContext.getUserId();
            consumer.onMessage(MapRecord.create("oa08:fixture:callback", body).withId(RecordId.of("1-0")));
            equal(tenantBefore, TenantContext.getTenantId(), "CALLBACK_RESTORES_ORIGINAL_TENANT_CONTEXT");
            equal(userTenantBefore, UserContext.getTenantId(), "CALLBACK_RESTORES_ORIGINAL_USER_TENANT_CONTEXT");
            equal(userBefore, UserContext.getUserId(), "CALLBACK_DOES_NOT_REPLACE_CALLER_IDENTITY");
            return failure;
        }

        @Override public void close() { leases.close(); }
    }

    private static final class CallbackLeaseEdge extends CallbackIdempotentStore {
        int completed;
        int acknowledged;
        int released;
        int acquired;

        CallbackLeaseEdge() { super(new StringRedisTemplate(), "oa08:fixture:callback-lease:"); }
        @Override public Lease acquire(Long tenantId, String instanceId, Duration ttl) {
            acquired++;
            return new Lease(State.ACQUIRED, "oa08:fixture:" + tenantId + ":" + instanceId, "isolated-owner");
        }
        @Override public ScheduledFuture<?> keepAlive(Lease lease, Duration ttl) { return null; }
        @Override public boolean renew(Lease lease, Duration ttl) { return true; }
        @Override public boolean complete(Lease lease, Duration ttl) {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "CALLBACK_COMPLETION_FOLLOWS_REAL_TRANSACTION_COMMIT");
            completed++;
            return true;
        }
        @Override public boolean acknowledgeDone(Lease lease, String streamKey, String group, String messageId) { acknowledged++; return true; }
        @Override public boolean release(Lease lease) { released++; return true; }
    }

    private ApprovalFixture approvalFixture() throws Exception {
        CaseData scope = fresh();
        materials(scope, 8, 8);
        long approver = scope.user + 80;
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status) VALUES(?,?,?,?,'OA08 approver','0')", approver, scope.tenant, scope.dept, "oa08_approver_" + scope.tenant);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status) VALUES(?,?,'OA08 approver','OA08_APPROVER',1,'0')", approver, scope.tenant);
        jdbc.update("INSERT INTO sys_menu(menu_id,menu_name,menu_type,status,perms) VALUES(?,'OA08 approver','F','0','workflow:task:complete')", approver);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", approver, approver, scope.tenant);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES(?,?,?)", approver, approver, scope.tenant);
        Map<String, String> policy = Map.of("approvalMode", "ALWAYS", "limitMetric", "QUANTITY", "approverUserId", Long.toString(approver));
        for (Map.Entry<String, String> setting : policy.entrySet()) {
            jdbc.update("INSERT INTO sys_config(tenant_id,config_name,config_key,config_value) VALUES(?,'OA08 fixture',?,?)", scope.tenant, "sys.oa.consumable." + setting.getKey(), setting.getValue());
        }
        jdbc.update("INSERT INTO sys_business_rule(id,tenant_id,rule_code,rule_name,module,threshold_value,effect,enabled) VALUES(?,?,'oa.consumable.request.limit','OA08 fixture','OA',100.00,'PASS',1)", approver, scope.tenant);
        jdbc.update("INSERT INTO sys_business_rule_version(id,tenant_id,rule_id,rule_code,version_no,threshold_value,effect,enabled,status) VALUES(?,?,?,'oa.consumable.request.limit',1,100.00,'PASS',1,'PUBLISHED')", approver, scope.tenant, approver);
        ConsumableCommands.CreateRequest command = new ConsumableCommands.CreateRequest();
        approvalRequestData(scope, command);
        command.setOperationKey("callback_create_" + scope.tenant);
        ConsumableResults.RequestResult created = as(scope, command.getOperationKey(), () -> requestService.create(command));
        equal("DRAFT", created.getStatus(), "CALLBACK_FIXTURE_CREATES_DRAFT_THROUGH_REAL_BUSINESS_SERVICE");
        transactionEvidence(command.getOperationKey());
        long requestId = Long.parseLong(created.getRequestId());
        return new ApprovalFixture(scope, requestId, approver, submitFixture(scope, requestId, 1));
    }

    private void approvalRequestData(CaseData scope, ConsumableCommands.RequestData command) {
        command.setPurpose("OA08 isolated callback fixture");
        command.setApplyDate(LocalDate.now());
        command.setItems(List.of(scope.first, scope.second).stream().map(material -> {
            ConsumableCommands.RequestLine line = new ConsumableCommands.RequestLine();
            line.setConsumableId(material);
            line.setApplyQuantity(3);
            return line;
        }).toList());
    }

    private OaApprovalRequest submitFixture(CaseData scope, long requestId, int round) throws Exception {
        ConsumableCommands.Submit command = new ConsumableCommands.Submit();
        command.setVersion(requestVersion(requestId, scope.tenant));
        command.setOperationKey("callback_submit_" + scope.tenant + "_" + round);
        ConsumableResults.RequestResult submitted = as(scope, command.getOperationKey(), () -> requestService.submit(requestId, command));
        equal("APPROVING", submitted.getStatus(), "REAL_ALWAYS_SUBMISSION_IS_NOT_FABRICATED_AS_APPROVED");
        check(submitted.isApprovalPending(), "REAL_SUBMISSION_WAITS_FOR_INSTANCE_BINDING");
        transactionEvidence(command.getOperationKey());
        String payload = jdbc.queryForObject("SELECT payload_json FROM outbox_event WHERE tenant_id=? AND aggregate_id=? AND event_type='OA_F_APPROVAL_SUBMITTED' ORDER BY id DESC LIMIT 1", String.class, scope.tenant, requestId);
        BusinessEventEnvelope envelope = json.readValue(payload, BusinessEventEnvelope.class);
        OaApprovalRequest submission = json.readValue(envelope.getPayload(), OaApprovalRequest.class);
        equal(scope.tenant, submission.getTenantId(), "REAL_SUBMISSION_OUTBOX_RETAINS_TENANT");
        equal(requestId, submission.getBusinessId(), "REAL_SUBMISSION_OUTBOX_RETAINS_REQUEST");
        equal(scope.user, submission.getStartUserId(), "REAL_SUBMISSION_OUTBOX_RETAINS_APPLICANT");
        equal(submission.getReservation(), jdbc.queryForObject("SELECT instance_id FROM oa_consumable_request WHERE tenant_id=? AND request_id=?", String.class, scope.tenant, requestId), "REAL_OUTBOX_RESERVATION_IS_SAME_AS_SAVED_REQUEST");
        equal(2L, count("SELECT COUNT(*) FROM oa_consumable_request_item WHERE tenant_id=? AND request_id=? AND approved_quantity=0 AND issued_quantity=0", scope.tenant, requestId), "SUBMISSION_DOES_NOT_APPROVE_OR_ISSUE_ANY_LINE");
        return submission;
    }

    private int requestVersion(long requestId, long tenantId) {
        return Objects.requireNonNull(jdbc.queryForObject("SELECT version FROM oa_consumable_request WHERE tenant_id=? AND request_id=?", Integer.class, tenantId, requestId));
    }

    private Map<String, String> callbackBody(ApprovalFixture fixture, String instance, String result) throws Exception {
        Map<String, String> body = new LinkedHashMap<>();
        body.put("tenantId", Long.toString(fixture.scope.tenant));
        body.put("businessId", Long.toString(fixture.requestId));
        body.put("businessType", ConsumableOperationSupport.BUSINESS_TYPE);
        body.put("businessNo", fixture.submission.getBusinessNo());
        body.put("processInstanceId", instance);
        body.put("approvalResult", result);
        body.put("approverId", Long.toString(fixture.approver));
        body.put("oaRequestToken", json.writeValueAsString(fixture.submission.getReservation()));
        return body;
    }

    private void callbackTransactionEvidence(String actor) {
        List<OaDatabaseProbe.Call> writes = probe.forActor(actor).stream().filter(call -> call.write).toList();
        check(!writes.isEmpty(), "CALLBACK_REAL_MYSQL_WRITES_OBSERVED");
        check(writes.stream().allMatch(call -> call.transaction && !call.autoCommit && call.isolation == callbackIsolation), "CALLBACK_WRITES_JOIN_PRODUCTION_DISPATCHER_TRANSACTION");
        equal(1L, writes.stream().map(call -> call.connectionId).distinct().count(), "CALLBACK_WRITES_SHARE_ONE_MYSQL_TRANSACTION");
        check(!TransactionSynchronizationManager.isActualTransactionActive(), "CALLBACK_REAL_TRANSACTION_FINISHES_BEFORE_TRANSPORT_COMPLETION");
    }

    private record ApprovalFixture(CaseData scope, long requestId, long approver, OaApprovalRequest submission) { }

    private final class TransportEdge extends RedisStreamUtil {
        final AtomicInteger failures = new AtomicInteger();
        final AtomicInteger attempts = new AtomicInteger();
        final List<String> published = new java.util.concurrent.CopyOnWriteArrayList<>();

        @Override
        public String publishGlobal(String key, Map<String, Object> content) {
            OaDatabaseIsolation.require("oa08:fixture:events".equals(key), "UNEXPECTED_TRANSPORT_DESTINATION");
            int attempt = attempts.incrementAndGet();
            if (failures.getAndUpdate(value -> Math.max(0, value - 1)) > 0) throw new IllegalStateException("OA08_TRANSPORT_EDGE_FAILURE");
            OaDatabaseIsolation.require(content.get("payload") instanceof String, "REAL_OUTBOX_ENVELOPE_REQUIRED");
            published.add((String) content.get("payload"));
            return attempt + "-0";
        }

        List<BusinessEventEnvelope> envelopes() throws Exception {
            List<BusinessEventEnvelope> result = new ArrayList<>();
            for (String payload : published) result.add(json.readValue(payload, BusinessEventEnvelope.class));
            return result;
        }

        BusinessEventEnvelope onlyEnvelope() throws Exception {
            equal(1, published.size(), "EXACTLY_ONE_REAL_OUTBOX_ENVELOPE_REQUIRED");
            return envelopes().get(0);
        }
    }

    private static final class PushEdge {
        final AtomicInteger failures = new AtomicInteger();
        final AtomicInteger attempts = new AtomicInteger();
        final AtomicInteger successes = new AtomicInteger();

        void send(Long userId, Map<String, Object> message) {
            attempts.incrementAndGet();
            if (failures.getAndUpdate(value -> Math.max(0, value - 1)) > 0) throw new IllegalStateException("OA08_PUSH_EDGE_FAILURE");
            OaDatabaseIsolation.require(userId != null && "NOTICE".equals(message.get("type")), "REAL_INTERNAL_CHANNEL_MESSAGE_REQUIRED");
            successes.incrementAndGet();
        }
    }

    private CaseData fresh() {
        long tenant = 928000L + ++fixtureNumber;
        long base = tenant * 100;
        CaseData scope = new CaseData(tenant, base + 1, base + 2, base + 11, base + 12, base + 21, base + 22, base + 23, base + 31, base + 32, base + 33);
        identity(scope);
        jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,dept_name,status) VALUES(?,?,0,'OA08 fixture','0')", scope.dept, tenant);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status) VALUES(?,?,?,?,'OA08 fixture','0')", scope.user, tenant, scope.dept, "oa08_" + tenant);
        return scope;
    }

    private void materials(CaseData scope, int firstQuantity, int secondQuantity) {
        for (long material : List.of(scope.first, scope.second)) {
            jdbc.update("INSERT INTO oa_consumable(consumable_id,tenant_id,name,model,unit,quantity,stock_amount,avg_cost,low_stock_threshold,warn_enabled,status,deleted,version) VALUES(?,?,?,'FIXTURE','unit',0,0.00,0.00,1,1,'ACTIVE',0,0)", material, scope.tenant, "OA08-" + material);
        }
        if (firstQuantity > 0) inventory.inbound(scope.first, stock("seed_" + scope.first, firstQuantity));
        if (secondQuantity > 0) inventory.inbound(scope.second, stock("seed_" + scope.second, secondQuantity));
    }

    private void request(CaseData scope) {
        jdbc.update("INSERT INTO oa_consumable_request(request_id,tenant_id,request_no,applicant_id,applicant_name,dept_id,dept_name,purpose,apply_date,status,create_key,create_hash,total_amount) VALUES(?,?,?,?,'OA08 fixture',?,'OA08 fixture','OA08 fixture',CURRENT_DATE,'APPROVED',?,?,12.00)",
                scope.request, scope.tenant, "OA08-" + scope.request, scope.user, scope.dept, "fixture_" + scope.request, "0".repeat(64));
        for (int index = 0; index < 2; index++) {
            long item = index == 0 ? scope.firstItem : scope.secondItem;
            long material = index == 0 ? scope.first : scope.second;
            jdbc.update("INSERT INTO oa_consumable_request_item(item_id,tenant_id,request_id,consumable_id,consumable_name,unit,apply_quantity,approved_quantity,unit_price,amount,sort_no) VALUES(?,?,?,?,?,'unit',3,3,2.00,6.00,?)",
                    item, scope.tenant, scope.request, material, "OA08-" + material, index + 1);
        }
    }

    private void purchase(CaseData scope) {
        jdbc.update("INSERT INTO oa_supplier(supplier_id,tenant_id,supplier_name,status) VALUES(?,?,'OA08 fixture','ACTIVE')", scope.purchase, scope.tenant);
        jdbc.update("INSERT INTO biz_purchase_request(id,tenant_id,user_id,user_name,purchase_no,supplier_id,total_amount,reason,status,payment_status,dept_id) VALUES(?,?,?,'OA08 fixture',?,?,16.00,'OA08 fixture','APPROVED','NONE',?)",
                scope.purchase, scope.tenant, scope.user, "OA08-" + scope.purchase, scope.purchase, scope.dept);
        for (int index = 0; index < 2; index++) {
            long item = index == 0 ? scope.firstPurchaseItem : scope.secondPurchaseItem;
            long material = index == 0 ? scope.first : scope.second;
            jdbc.update("INSERT INTO biz_purchase_item(id,tenant_id,purchase_id,consumable_id,consumable_name,unit,quantity,unit_price,amount,received_quantity) VALUES(?,?,?,?,?,'unit',4,2.00,8.00,0)",
                    item, scope.tenant, scope.purchase, material, "OA08-" + material);
        }
    }

    private void warningConfiguration(CaseData scope) {
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status) VALUES(?,?,'OA08 fixture','OA08_FIXTURE',1,'0')", scope.dept, scope.tenant);
        jdbc.update("INSERT INTO sys_menu(menu_id,menu_name,menu_type,status,perms) VALUES(?,'OA08 fixture','F','0','oa:consumable-ledger:list')", scope.dept);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES(?,?,?)", scope.user, scope.dept, scope.tenant);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES(?,?,?)", scope.dept, scope.dept, scope.tenant);
        jdbc.update("INSERT INTO sys_config(config_id,tenant_id,config_name,config_key,config_value) VALUES(?,?,'OA08 fixture','sys.oa.consumable.stockManagerUserId',?)", scope.dept, scope.tenant, Long.toString(scope.user));
        jdbc.update("INSERT INTO sys_message_channel(channel_id,tenant_id,channel_type,channel_code,channel_name,priority,rate_limit_minute,daily_limit,retry_count,retry_interval_sec,implemented_flag,status) VALUES(?,?,'INTERNAL','OA08_FIXTURE','OA08 fixture',1,0,0,2,1,1,'ENABLED')", scope.dept, scope.tenant);
        jdbc.update("INSERT INTO sys_message_template(template_id,tenant_id,template_code,template_name,channel_type,biz_module,message_category,title_template,content_template,force_send_flag,dedupe_window_sec,status) VALUES(?,?,'OA_CONSUMABLE_LOW_STOCK','OA08 fixture','INTERNAL','OA','BIZ_REMINDER','OA08 fixture','OA08 fixture',0,600,'ENABLED')", scope.dept, scope.tenant);
    }

    private static ConsumableCommands.Stock stock(String key, int quantity) {
        ConsumableCommands.Stock command = new ConsumableCommands.Stock();
        command.setOperationKey(key);
        command.setQuantity(quantity);
        command.setUnitPrice(new BigDecimal("2.00"));
        command.setRemark("OA08 fixture");
        return command;
    }

    private static ConsumableCommands.Issue issue(CaseData scope, String key, int firstQuantity, int secondQuantity) {
        ConsumableCommands.Issue command = new ConsumableCommands.Issue();
        command.setOperationKey(key);
        command.setVersion(0);
        command.setAllowPartial(false);
        command.setRemark("OA08 fixture");
        ConsumableCommands.IssueLine first = new ConsumableCommands.IssueLine();
        first.setItemId(scope.firstItem);
        first.setQuantity(firstQuantity);
        ConsumableCommands.IssueLine second = new ConsumableCommands.IssueLine();
        second.setItemId(scope.secondItem);
        second.setQuantity(secondQuantity);
        command.setItems(List.of(first, second));
        return command;
    }

    private static PurchaseReceiptDTO receipt(CaseData scope, String key) {
        PurchaseReceiptDTO command = new PurchaseReceiptDTO();
        command.setOperationKey(key);
        command.setPurchaseVersion(0);
        command.setRemark("OA08 fixture");
        PurchaseReceiptDTO.PurchaseReceiptItemDTO first = new PurchaseReceiptDTO.PurchaseReceiptItemDTO();
        first.setItemId(scope.firstPurchaseItem);
        first.setQuantity(2);
        PurchaseReceiptDTO.PurchaseReceiptItemDTO second = new PurchaseReceiptDTO.PurchaseReceiptItemDTO();
        second.setItemId(scope.secondPurchaseItem);
        second.setQuantity(2);
        command.setItems(List.of(first, second));
        return command;
    }

    private static ConsumableCommands.Recalculate recalculation(String key, String mode, int version) {
        ConsumableCommands.Recalculate command = new ConsumableCommands.Recalculate();
        command.setOperationKey(key);
        command.setMode(mode);
        command.setVersion(version);
        command.setRemark("OA08 fixture");
        return command;
    }

    private Map<String, TableState> snapshot() throws Exception {
        Map<String, TableState> result = new LinkedHashMap<>();
        try (Connection connection = dataSource.getConnection()) {
            for (String table : isolation.tables) result.put(table, tableState(connection, table));
        }
        return result;
    }

    private TableState tableState(Connection connection, String table) throws Exception {
        OaDatabaseIsolation.require(isolation.tables.contains(table), "SNAPSHOT_TABLE_MUST_BE_CLONED");
        List<String> records = new ArrayList<>();
        try (Statement statement = connection.createStatement(); ResultSet rows = statement.executeQuery(FixtureInspectionSql.query("allRows", table))) {
            while (rows.next()) {
                StringBuilder record = new StringBuilder();
                for (int column = 1; column <= rows.getMetaData().getColumnCount(); column++) {
                    String value = rows.getString(column);
                    record.append(value == null ? "N;" : value.length() + ":" + value + ";");
                }
                records.add(record.toString());
            }
        }
        records.sort(String::compareTo);
        String digest = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(String.join("\n", records).getBytes(StandardCharsets.UTF_8)));
        return new TableState(records.size(), digest);
    }

    private void unchanged(Map<String, TableState> before, Set<String> allowedChanges) throws Exception {
        Map<String, TableState> after = snapshot();
        equal(before.keySet(), after.keySet(), "SNAPSHOT_COVERS_ALL_CLONED_TABLES");
        for (String table : before.keySet()) {
            if (!allowedChanges.contains(table)) equal(before.get(table), after.get(table), "ALL_ROWS_UNCHANGED_" + table.toUpperCase(java.util.Locale.ROOT));
        }
    }

    private long count(String sql, Object... values) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, values)); }

    private static long count(Connection connection, String sql, Object... values) throws SQLException {
        try (PreparedStatement statement = connection.prepareStatement(sql)) {
            for (int index = 0; index < values.length; index++) statement.setObject(index + 1, values[index]);
            try (ResultSet rows = statement.executeQuery()) {
                if (!rows.next()) throw new SQLException("COUNT_RESULT_MISSING");
                return rows.getLong(1);
            }
        }
    }

    private <Result> Result as(CaseData scope, String actor, Callable<Result> action) throws Exception {
        identity(scope);
        String prior = OaDatabaseProbe.ACTOR.get();
        OaDatabaseProbe.ACTOR.set(actor);
        try { return action.call(); }
        finally {
            if (prior == null) OaDatabaseProbe.ACTOR.remove();
            else OaDatabaseProbe.ACTOR.set(prior);
        }
    }

    private <Result> Future<Result> async(CaseData scope, String actor, Callable<Result> action) {
        return workers.submit(() -> {
            try { return as(scope, actor, action); }
            finally { OaDatabaseProbe.ACTOR.remove(); TenantContext.clear(); UserContext.clear(); }
        });
    }

    private static void identity(CaseData scope) {
        TenantContext.clear();
        TenantContext.setTenantId(scope.tenant);
        UserContext.clear();
        UserContext.setTenantId(scope.tenant);
        UserContext.setUserId(scope.user);
        UserContext.setUserName("oa08-fixture");
        UserContext.setDeptId(scope.dept);
        UserContext.setDsType(0);
        UserContext.setRoles(Set.of("oa"));
    }

    private static Throwable caught(CheckedAction action) {
        try { action.run(); return null; }
        catch (Throwable failure) { return failure; }
    }

    private static boolean sqlFault(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && "45000".equals(sql.getSQLState()) && sql.getErrorCode() == 1644) return true;
        }
        return false;
    }

    private static boolean deadlock(Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && "40001".equals(sql.getSQLState()) && sql.getErrorCode() == 1213) return true;
        }
        return false;
    }

    private void transactionEvidence(String actor) {
        List<OaDatabaseProbe.Call> writes = probe.forActor(actor).stream().filter(call -> call.write).toList();
        check(!writes.isEmpty(), "REAL_SQL_WRITES_OBSERVED");
        check(writes.stream().allMatch(call -> call.transaction && !call.autoCommit && call.isolation == Connection.TRANSACTION_READ_COMMITTED), "ALL_WRITES_USE_REAL_READ_COMMITTED_SPRING_TRANSACTION");
        equal(1L, writes.stream().map(call -> call.connectionId).distinct().count(), "ALL_BUSINESS_WRITES_SHARE_ONE_MYSQL_TRANSACTION");
        check(!TransactionSynchronizationManager.isActualTransactionActive(), "SERVICE_OWNS_TRANSACTION_NO_OUTER_ROLLBACK_WRAPPER");
    }

    private record CaseData(long tenant, long user, long dept, long first, long second, long request, long firstItem,
                            long secondItem, long purchase, long firstPurchaseItem, long secondPurchaseItem) { }
    private record TableState(int rows, String sha256) { }

    private void scenario(String name, CheckedAction action) {
        GROUPS.incrementAndGet();
        int before = ASSERTIONS.get();
        try {
            action.run();
            GROUPS_PASSED.incrementAndGet();
            System.out.println("OA08 GROUP: " + name + " PASS; assertions=" + (ASSERTIONS.get() - before));
        } catch (Throwable failure) {
            FAILED_GROUPS.add(name);
            System.err.println("OA08 GROUP: " + name + " FAIL; assertions=" + (ASSERTIONS.get() - before) + "; " + safeFailure(failure));
        } finally {
            probe.clearWatches();
            OaDatabaseProbe.ACTOR.remove();
            TenantContext.clear();
            UserContext.clear();
        }
    }

    private static void check(boolean condition, String label) {
        ASSERTIONS.incrementAndGet();
        if (!condition) throw new AssertionError(label);
        ASSERTIONS_PASSED.incrementAndGet();
    }

    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }

    private static String safeFailure(Throwable failure) {
        String label = (failure instanceof AssertionError || failure instanceof IllegalStateException) && failure.getMessage() != null
                && failure.getMessage().matches("[A-Z0-9_:-]+") ? failure.getMessage() : failure.getClass().getSimpleName();
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql) label += "; SQLState=" + sql.getSQLState() + "; MySQL=" + sql.getErrorCode();
        }
        for (StackTraceElement frame : failure.getStackTrace()) {
            if (frame.getClassName().startsWith("com.cloudflow.") || frame.getClassName().startsWith("Oa")) {
                label += "; at=" + frame.getClassName() + ":" + frame.getLineNumber();
                break;
            }
        }
        return label;
    }

    @Override
    public void close() throws InterruptedException {
        workers.shutdown();
        if (!workers.awaitTermination(25, TimeUnit.SECONDS)) {
            workers.shutdownNow();
            if (!workers.awaitTermination(20, TimeUnit.SECONDS)) throw new IllegalStateException("DATABASE_WORKERS_NOT_STOPPED");
        }
    }

    @FunctionalInterface
    private interface CheckedAction { void run() throws Exception; }
}

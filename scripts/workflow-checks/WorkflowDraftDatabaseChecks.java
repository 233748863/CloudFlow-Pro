import com.cloudflow.checks.FixtureInspectionSql;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.event.outbox.OutboxEventMapper;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.config.properties.WorkflowProperties;
import com.cloudflow.workflow.domain.WfFormDraft;
import com.cloudflow.workflow.domain.dto.DraftSaveRequest;
import com.cloudflow.workflow.domain.system.SysUser;
import com.cloudflow.workflow.domain.vo.DraftSaveResult;
import com.cloudflow.workflow.domain.vo.UserBriefVO;
import com.cloudflow.workflow.event.WorkflowEventPublisher;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.handler.NodeHandlerFactory;
import com.cloudflow.workflow.job.WorkflowDraftCleanupJob;
import com.cloudflow.workflow.listener.GlobalListenerDispatcher;
import com.cloudflow.workflow.mapper.*;
import com.cloudflow.workflow.mapper.system.*;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.*;
import com.cloudflow.workflow.service.impl.NodeExecutionServiceImpl;
import com.cloudflow.workflow.service.impl.WfInstanceServiceImpl;
import com.cloudflow.workflow.service.monitor.impl.PerformanceStatsRefreshService;
import com.cloudflow.workflow.service.monitor.impl.ProcessMonitorServiceImpl;
import com.cloudflow.workflow.strategy.AssignUserStrategyFactory;
import com.cloudflow.workflow.strategy.impl.DeptManagerAssignStrategy;
import com.cloudflow.workflow.strategy.impl.InitiatorSelectedAssignStrategy;
import com.cloudflow.workflow.strategy.impl.UserAssignStrategy;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.sql.ResultSet;
import java.util.regex.Matcher;
import java.util.stream.Stream;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.session.LocalCacheScope;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Field;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.SQLException;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.function.Consumer;

public final class WorkflowDraftDatabaseChecks {
    private static final long TENANT = 911001L;
    private static final long OTHER_TENANT = 911002L;
    private static final long APPROVER = 91100001L;
    private static final AtomicInteger CHECKS = new AtomicInteger();
    private static final AtomicInteger SCENARIOS = new AtomicInteger();
    private static final ThreadLocal<String> ACTOR = new ThreadLocal<>();

    public static void main(String[] args) {
        try (Isolation isolation = new Isolation()) {
            isolation.initialize();
            try (Fixture fixture = new Fixture(isolation)) {
                fixture.run();
            }
            System.out.println("CLOCK: artificial last_save_time/expire_time backdating; no 30-day wait; races cross only a 3-second expiry boundary.");
            System.out.println("BOUNDARY: real draft/engine/approval-node/monitor/outbox Mappers and Spring transactions; local Redis edge and database-backed user-directory adapter; no HTTP, online approval, scheduler, Redis worker or external callback execution.");
        } catch (Throwable failure) {
            System.err.println("FAIL WF11 database scenarios=" + SCENARIOS.get() + " checks=" + CHECKS.get());
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                String detail = cause instanceof SQLException sql ? " SQLState=" + sql.getSQLState() + " code=" + sql.getErrorCode()
                        : cause instanceof AssertionError || cause instanceof IllegalArgumentException ? " " + cause.getMessage() : "";
                System.err.println(cause.getClass().getName() + detail);
                if (cause instanceof WorkflowException workflow) System.err.println("workflowCode=" + workflow.getCode());
                java.util.Arrays.stream(cause.getStackTrace()).filter(frame -> frame.getClassName().startsWith("com.cloudflow.")
                        || frame.getClassName().startsWith("WorkflowDraftDatabaseChecks")).limit(6).forEach(frame -> System.err.println("  at " + frame));
            }
            System.exit(1);
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
        System.out.println("PASS WF11 database scenarios=" + SCENARIOS.get() + " checks=" + CHECKS.get());
    }

    private static final class Isolation implements AutoCloseable {
        final String source = environment("WF11_DB_SOURCE");
        final String database = environment("WF11_DB_TARGET");
        final String owner = environment("WF11_DB_OWNER");
        final String username = environment("WF11_DB_USERNAME");
        final String password = System.getenv("WF11_DB_PASSWORD") == null ? "" : System.getenv("WF11_DB_PASSWORD");
        final List<String> tables = new ArrayList<>();
        final Connection management;
        final String url;
        boolean created;
        boolean owned;

        Isolation() throws Exception {
            String host = environment("WF11_DB_HOST");
            String port = environment("WF11_DB_PORT");
            String ownedData = System.getenv("WF11_OWNED_DATA");
            boolean loopback = "127.0.0.1".equals(host) && port.matches("[0-9]{4,5}")
                    && Integer.parseInt(port) > 1024 && Integer.parseInt(port) < 65536 && ownedData != null;
            guard((loopback || "192.168.1.173".equals(host) && "3306".equals(port) && !password.isBlank())
                    && "cloud_flow_db".equals(source), "Unexpected source connection");
            guard(database.matches("wf11_draft_verify_[a-f0-9]{32}") && !database.equals(source)
                    && owner.matches("[a-f0-9]{32}"), "Unsafe database ownership target");
            String base = "jdbc:mysql://" + host + ":" + port + "/";
            String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
                    + "&connectTimeout=10000&socketTimeout=45000&allowMultiQueries=false&sessionVariables=innodb_lock_wait_timeout=15";
            management = DriverManager.getConnection(base + options, username, password);
            guard(management.getCatalog() == null || management.getCatalog().isEmpty(), "Management connection must have no default database");
            if (loopback) {
                Path expected = Path.of(ownedData).toRealPath();
                guard(expected.getFileName().toString().equals("mysql-data")
                        && expected.getParent().getFileName().toString().matches("[a-f0-9]{32}")
                        && expected.getParent().getParent().getFileName().toString().equals("batch-g-integration"), "Owned MySQL directory must belong to a named integration run");
                try (PreparedStatement query = management.prepareStatement("SELECT @@datadir"); ResultSet result = query.executeQuery()) {
                    guard(result.next() && expected.equals(Path.of(result.getString(1)).toRealPath()), "Refusing a different local database server");
                }
            }
            url = base + database + options;
        }

        void initialize() throws Exception {
            try (PreparedStatement query = management.prepareStatement("SELECT table_name, engine FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE' AND (LEFT(table_name,3)='wf_' OR table_name IN ('sys_user','sys_role','sys_user_role','sys_dept','sys_config','sys_audit_log','outbox_event')) ORDER BY table_name")) {
                query.setString(1, source);
                try (ResultSet rows = query.executeQuery()) {
                    while (rows.next()) {
                        String table = rows.getString(1);
                        guard(table.matches("[a-z][a-z0-9_]+") && "InnoDB".equals(rows.getString(2)), "Only real InnoDB fixture tables are allowed");
                        tables.add(table);
                    }
                }
            }
            guard(tables.containsAll(List.of("wf_form_draft", "wf_process_definition", "wf_form_definition", "wf_form_field_permission",
                    "wf_process_instance", "wf_task", "wf_task_candidate", "wf_process_monitor", "wf_task_monitor", "wf_performance_stats",
                    "outbox_event", "sys_user", "sys_dept", "sys_role", "sys_user_role")), "Required real source tables are missing; no replacement schemas will be synthesized");
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
                created = true;
            }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE TABLE " + database + ".wf11_fixture_owner (owner_token CHAR(32) NOT NULL PRIMARY KEY) ENGINE=InnoDB");
                try (PreparedStatement insert = management.prepareStatement("INSERT INTO wf11_fixture_owner VALUES (?)")) {
                    insert.setString(1, owner);
                    guard(insert.executeUpdate() == 1, "Fixture ownership recorded");
                }
                owned = true;
                for (String table : tables) {
                    statement.execute("CREATE TABLE " + database + "." + table + " LIKE " + source + "." + table);
                }
                try (ResultSet rows = statement.executeQuery("SELECT VERSION()")) {
                    rows.next();
                    System.out.println("ISOLATION: database=" + database + " MySQL=" + rows.getString(1) + " cloned-empty-tables=" + tables.size()
                            + "; source metadata only; no source rows copied or changed.");
                }
            }
        }

        void requireOwnership() throws SQLException {
            guard(owned && database.matches("wf11_draft_verify_[a-f0-9]{32}") && !source.equals(database), "Fixture ownership required");
            guard(database.equals(management.getCatalog()), "Fixture management catalog must remain isolated");
            try (Statement query = management.createStatement(); ResultSet rows = query.executeQuery("SELECT owner_token FROM wf11_fixture_owner")) {
                guard(rows.next() && owner.equals(rows.getString(1)) && !rows.next(), "Fixture ownership marker mismatch");
            }
        }

        void trigger(String name, String timing, String event, String table, String condition, String marker) throws SQLException {
            requireOwnership();
            guard(name.matches("wf11_[a-z_]+") && tables.contains(table) && Set.of("AFTER", "BEFORE").contains(timing)
                    && Set.of("INSERT", "DELETE").contains(event) && marker.matches("WF11_[A-Z_]+")
                    && condition.matches("(?:OLD|NEW)\\.[a-z_]+ = '[a-zA-Z0-9-]+'"), "Unsafe fixture trigger");
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE TRIGGER " + database + "." + name + " " + timing + " " + event + " ON " + database + "." + table
                        + " FOR EACH ROW BEGIN IF " + condition + " THEN SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1644, MESSAGE_TEXT='"
                        + marker + "'; END IF; END");
            }
        }

        void dropTrigger(String name) throws SQLException {
            requireOwnership();
            guard(name.matches("wf11_[a-z_]+"), "Unsafe trigger removal");
            try (Statement statement = management.createStatement()) {
                statement.execute("DROP TRIGGER " + database + "." + name);
            }
        }

        @Override
        public void close() throws SQLException {
            try {
                if (owned) {
                    requireOwnership();
                    try (Statement statement = management.createStatement()) {
                        statement.execute("DROP DATABASE " + database);
                    }
                    System.out.println("ISOLATION: owned verification database dropped; runtime business/policy/approval/log data untouched.");
                } else if (created) {
                    System.err.println("ISOLATION: ownership marker was not established; refusing automatic removal of " + database);
                }
            } finally {
                management.close();
            }
        }
    }

    private static final class FixtureDataSource extends DriverManagerDataSource {
        private final String database;
        private final Set<String> tables;

        FixtureDataSource(Isolation isolation) {
            super(isolation.url, isolation.username, isolation.password);
            database = isolation.database;
            tables = Set.copyOf(isolation.tables);
        }

        @Override
        public Connection getConnection() throws SQLException {
            Connection connection = super.getConnection();
            if (!database.equals(connection.getCatalog())) {
                connection.close();
                throw new SQLException("Refusing a non-fixture connection");
            }
            return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, arguments) -> {
                if (Set.of("setCatalog", "setSchema").contains(method.getName())) guard(database.equals(arguments[0]), "Cannot switch fixture database");
                if (arguments != null && arguments.length > 0 && arguments[0] instanceof String sql
                        && Set.of("prepareStatement", "prepareCall", "nativeSQL").contains(method.getName())) validateSql(sql);
                try {
                    Object result = method.invoke(connection, arguments);
                    if (method.getName().equals("createStatement")) {
                        Statement statement = (Statement) result;
                        return Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[]{Statement.class}, (statementProxy, operation, values) -> {
                            if (values != null && values.length > 0 && values[0] instanceof String sql) validateSql(sql);
                            try { return operation.invoke(statement, values); }
                            catch (InvocationTargetException failure) { throw failure.getCause(); }
                        });
                    }
                    return result;
                } catch (InvocationTargetException failure) {
                    throw failure.getCause();
                }
            });
        }

        private void validateSql(String sql) {
            String normalized = sql.stripLeading().toUpperCase(java.util.Locale.ROOT);
            guard(!normalized.contains("CLOUD_FLOW_DB") && !normalized.matches("(?s).*(?:MYSQL|SYS)\\s*\\..*"), "Source/system schema access refused");
            guard(normalized.matches("(?s)(SELECT|INSERT|UPDATE|DELETE|WITH|EXPLAIN)\\b.*"), "DDL/session changes refused on application connections");
            if (normalized.matches("(?s)(INSERT|UPDATE|DELETE)\\b.*")) {
                Matcher destination = java.util.regex.Pattern.compile("(?is)^\\s*(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM)\\s+([a-z0-9_\\x60.]+)").matcher(sql);
                guard(destination.find(), "Unrecognized fixture write target");
                String[] identifier = destination.group(1).replace(Character.toString((char) 96), "").toLowerCase(java.util.Locale.ROOT).split("\\.");
                guard(identifier.length == 1 || identifier.length == 2 && database.equals(identifier[0]), "Cross-schema fixture writes refused");
                guard(tables.contains(identifier[identifier.length - 1]), "Writes require a cloned fixture table");
            }
        }
    }

    private static final class Fixture implements AutoCloseable {
        final Isolation isolation;
        final JdbcTemplate jdbc;
        final SqlSessionTemplate sessions;
        final DataSourceTransactionManager manager;
        final TransactionTemplate transactions;
        final MapperObserver observer = new MapperObserver();
        final ExecutorService workers = Executors.newFixedThreadPool(2);
        final StaticApplicationContext application = new StaticApplicationContext();
        final ObjectMapper json = new ObjectMapper().findAndRegisterModules();
        final WfFormDraftMapper draftMapper;
        final WorkflowLaunchContextService contexts;
        final WfFormDraftService drafts;
        final AtomicLong users = new AtomicLong(91100100L);

        Fixture(Isolation isolation) throws Exception {
            this.isolation = isolation;
            FixtureDataSource source = new FixtureDataSource(isolation);
            jdbc = new JdbcTemplate(source);
            jdbc.setQueryTimeout(20);
            manager = new DataSourceTransactionManager(source);
            transactions = new TransactionTemplate(manager);
            transactions.setTimeout(20);
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.setCacheEnabled(false);
            configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
            configuration.setDefaultStatementTimeout(20);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setBanner(false);
            global.setDbConfig(new GlobalConfig.DbConfig());
            global.setMetaObjectHandler(new MyMetaObjectHandler());
            com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMappers("com.cloudflow.workflow.mapper");
            configuration.addMapper(OutboxEventMapper.class);
            configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            configuration.addInterceptor(observer);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source);
            factory.setConfiguration(configuration);
            factory.setGlobalConfig(global);
            List<Path> mapperFiles = new ArrayList<>();
            String[] mapperRoots = environment("WF11_MAPPER_ROOTS").split(java.util.regex.Pattern.quote(System.getProperty("path.separator")));
            for (String mapperRoot : mapperRoots) {
                try (Stream<Path> paths = Files.walk(Path.of(mapperRoot))) {
                    paths.filter(path -> path.toString().endsWith(".xml")).forEach(mapperFiles::add);
                }
            }
            mapperFiles.sort(Comparator.comparingInt((Path path) -> path.getFileName().toString().equals("ReportSqlMapper.xml") ? 0 : 1)
                    .thenComparing(Path::toString));
            factory.setMapperLocations(mapperFiles.stream()
                    .map(path -> (Resource) new FileSystemResource(path)).toArray(Resource[]::new));
            sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            guard(com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.getGlobalConfig(configuration) == global
                    && com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.getMetaObjectHandler(configuration).isPresent(), "Real MyBatis auto-fill must be registered before Mapper metadata initialization");
            draftMapper = mapper(WfFormDraftMapper.class);
            application.refresh();
            WorkflowGraphModelResolver graphs = new WorkflowGraphModelResolver();
            WorkflowDraftJson draftJson = new WorkflowDraftJson(json);
            WorkflowPermissionService permissions = new WorkflowPermissionService();
            inject(permissions, "sysUserMapper", mapper(SysUserMapper.class));
            inject(permissions, "sysRoleMapper", mapper(SysRoleMapper.class));
            inject(permissions, "sysUserRoleMapper", mapper(SysUserRoleMapper.class));
            InitiatorSelectionService selections = new InitiatorSelectionService(mapper(WfTaskCandidateMapper.class),
                    mapper(SysUserMapper.class), mapper(SysUserRoleMapper.class), graphs);
            WorkflowConfigurationLockService locks = transactional(new WorkflowConfigurationLockService(mapper(WorkflowConfigurationLockMapper.class)));
            WorkflowDefinitionConfigService configurations = new WorkflowDefinitionConfigService(mapper(WfProcessDefinitionMapper.class),
                    locks, mapper(WfFormFieldPermissionMapper.class), graphs, permissions, selections, json);
            contexts = transactional(new WorkflowLaunchContextService(draftMapper, permissions, configurations, draftJson));
            WorkflowFormInputService forms = new WorkflowFormInputService(mapper(WorkflowFormReferenceMapper.class), draftJson,
                    new com.cloudflow.workflow.validator.JsonSchemaValidator());
            WorkflowNodePolicy nodePolicy = new WorkflowNodePolicy(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), graphs);
            WorkflowHParticipantPolicy participants = new WorkflowHParticipantPolicy(mapper(WfProcessInstanceMapper.class),
                    mapper(SysUserMapper.class), nodePolicy, mapper(WfProcessDefinitionMapper.class), mapper(SysRoleMapper.class),
                    mapper(SysUserRoleMapper.class), mapper(WfTaskHistoryMapper.class));
            PerformanceStatsRefreshService statistics = transactional(new PerformanceStatsRefreshService(mapper(PerformanceStatsMapper.class),
                    mapper(ProcessMonitorMapper.class), mapper(TaskMonitorMapper.class)));
            ProcessMonitorServiceImpl monitor = transactional(new ProcessMonitorServiceImpl(mapper(ProcessMonitorMapper.class), statistics));
            OutboxPublisher outbox = transactional(new OutboxPublisher(mapper(OutboxEventMapper.class), json));
            MessageSender messages = new MessageAutoConfiguration().messageSender(outbox, json, application.getEnvironment());
            GlobalListenerDispatcher listeners = new GlobalListenerDispatcher();
            listeners.init();
            WorkflowEventPublisher events = new WorkflowEventPublisher(application);
            LocalRedisEdge redis = new LocalRedisEdge();
            SysConfigHelper settings = new SysConfigHelper();
            inject(settings, "redisCache", redis);
            RateLimiterService limiter = new RateLimiterService();
            inject(limiter, "redisCache", redis);
            inject(limiter, "runtimeSysConfigService", new RuntimeSysConfigService(settings));
            WorkflowAuditService audit = new WorkflowAuditService();
            inject(audit, "redisCache", redis);
            inject(audit, "sysConfigHelper", settings);
            UserAssignStrategy specifiedUser = new UserAssignStrategy();
            inject(specifiedUser, "sysUserMapper", mapper(SysUserMapper.class));
            AssignUserStrategyFactory assignment = new AssignUserStrategyFactory();
            inject(assignment, "strategies", List.of(new InitiatorSelectedAssignStrategy(mapper(WfTaskCandidateMapper.class)), specifiedUser));
            DeptManagerAssignStrategy departmentManager = new DeptManagerAssignStrategy();
            inject(departmentManager, "sysUserMapper", mapper(SysUserMapper.class));
            inject(departmentManager, "sysDeptMapper", mapper(SysDeptMapper.class));
            inject(departmentManager, "sysUserRoleMapper", mapper(SysUserRoleMapper.class));
            inject(departmentManager, "sysRoleMapper", mapper(SysRoleMapper.class));
            WorkflowAgentService agents = transactional(new WorkflowAgentService(mapper(WfAgentSettingMapper.class),
                    mapper(WfTaskMapper.class), mapper(WfTaskDelegationMapper.class), mapper(WfTaskHistoryMapper.class),
                    mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class), mapper(SysUserMapper.class),
                    nodePolicy, participants, new WorkflowSecurityUtils(), json));
            NodeExecutionServiceImpl nodes = new NodeExecutionServiceImpl();
            inject(nodes, "workflowProperties", new WorkflowProperties());
            inject(nodes, "workflowGraphModelResolver", graphs);
            inject(nodes, "hParticipantPolicy", participants);
            inject(nodes, "agents", agents);
            inject(nodes, "globalListenerDispatcher", listeners);
            inject(nodes, "workflowEventPublisher", events);
            inject(nodes, "nodeHandlerFactory", new NodeHandlerFactory(List.of()));
            inject(nodes, "assignUserStrategyFactory", assignment);
            inject(nodes, "selfApprovalPolicy", new SelfApprovalPolicy(departmentManager));
            inject(nodes, "taskMapper", mapper(WfTaskMapper.class));
            inject(nodes, "taskHistoryMapper", mapper(WfTaskHistoryMapper.class));
            inject(nodes, "taskMonitorMapper", mapper(TaskMonitorMapper.class));
            inject(nodes, "nodeRecordMapper", mapper(WfNodeRecordMapper.class));
            inject(nodes, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
            inject(nodes, "sysUserMapper", mapper(SysUserMapper.class));
            inject(nodes, "processMonitorService", monitor);
            inject(nodes, "sysNoticeService", messages);
            WfInstanceServiceImpl engine = new WfInstanceServiceImpl();
            inject(engine, "processInstanceMapper", mapper(WfProcessInstanceMapper.class));
            inject(engine, "processDefinitionMapper", mapper(WfProcessDefinitionMapper.class));
            inject(engine, "formDefinitionMapper", mapper(WfFormDefinitionMapper.class));
            inject(engine, "formDraftMapper", draftMapper);
            inject(engine, "launchContexts", contexts);
            inject(engine, "formInputs", forms);
            WorkflowFormAccessService formAccess = new WorkflowFormAccessService(mapper(WfProcessInstanceMapper.class), mapper(WfProcessDefinitionMapper.class),
                    mapper(WfFormDefinitionMapper.class), mapper(WfTaskMapper.class), mapper(WfTaskHistoryMapper.class), mapper(WfProcessCopyMapper.class),
                    permissions, new WorkflowFieldPermissionCache(mapper(WfFormFieldPermissionMapper.class)), graphs, draftJson, forms, null, null);
            inject(engine, "formFiles", new WorkflowFormFileService(formAccess, mapper(WorkflowFormFileMapper.class),
                    mapper(WfTaskMapper.class), null, new com.cloudflow.workflow.validator.JsonSchemaValidator(), draftJson));
            inject(engine, "permissionService", permissions);
            inject(engine, "rateLimiterService", limiter);
            inject(engine, "processNumbers", new WorkflowProcessNumberService(mapper(WfProcessInstanceMapper.class), redis.numbering(), manager));
            inject(engine, "auditService", audit);
            inject(engine, "securityUtils", new WorkflowSecurityUtils());
            inject(engine, "initiatorSelectionService", selections);
            inject(engine, "nodeExecutionService", nodes);
            inject(engine, "workflowGraphModelResolver", graphs);
            inject(engine, "workflowEventPublisher", events);
            inject(engine, "globalListenerDispatcher", listeners);
            inject(engine, "processMonitorService", monitor);
            inject(engine, "sysNoticeService", messages);
            inject(engine, "hParticipantPolicy", participants);
            inject(engine, "transactionTemplate", transactions);
            IWorkflowCacheService directory = (IWorkflowCacheService) Proxy.newProxyInstance(IWorkflowCacheService.class.getClassLoader(),
                    new Class<?>[]{IWorkflowCacheService.class}, (proxy, method, arguments) -> {
                        guard("getUser".equals(method.getName()), "Unexpected external cache/directory operation");
                        SysUser user = mapper(SysUserMapper.class).selectById((Long) arguments[0]);
                        if (user == null) return null;
                        UserBriefVO brief = new UserBriefVO();
                        brief.setUserId(user.getUserId());
                        brief.setUsername(user.getUserName());
                        brief.setNickName(user.getNickName());
                        brief.setDeptId(user.getDeptId());
                        return brief;
                    });
            inject(engine, "workflowCacheService", directory);
            drafts = transactional(new WfFormDraftService(draftMapper, contexts, forms, draftJson, transactional(engine)));
            for (String table : isolation.tables) guard(count(table) == 0L, "Cloned table must be empty: " + table);
            check(capture(() -> {
                try (Connection connection = source.getConnection(); PreparedStatement ignored = connection.prepareStatement("DELETE FROM cloud_flow_db.wf_form_draft")) { return null; }
            }) instanceof AssertionError, "Runtime database SQL is rejected before statement preparation");
            check(capture(() -> {
                try (Connection connection = source.getConnection()) { connection.setCatalog(isolation.source); return null; }
            }) instanceof AssertionError, "Application connection cannot switch to the runtime database");
            check(capture(() -> {
                try (Connection connection = source.getConnection(); PreparedStatement ignored = connection.prepareStatement("DELETE FROM unrelated_schema.wf_form_draft")) { return null; }
            }) instanceof AssertionError, "Application writes cannot target any other schema");
            jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,parent_id,dept_name,status) VALUES(91101,?,0,'wf11 approvers','0')", TENANT);
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status) VALUES(?,?,91101,'wf11_approver','wf11 approver','0')", APPROVER, TENANT);
            identity(TENANT, APPROVER);
            equal(Connection.TRANSACTION_REPEATABLE_READ, transactions.execute(status -> {
                try { return Objects.requireNonNull(org.springframework.jdbc.datasource.DataSourceUtils.getConnection(source)).getTransactionIsolation(); }
                catch (SQLException failure) { throw new IllegalStateException(failure); }
            }), "Real MySQL REPEATABLE_READ isolation");
            check(org.springframework.aop.support.AopUtils.isAopProxy(drafts), "Draft service uses Spring annotation transaction advice");
            check(org.springframework.aop.support.AopUtils.isAopProxy(contexts), "Launch context uses Spring annotation transaction advice");
            System.out.println("COMPONENTS: current WfFormDraftService, WfInstanceServiceImpl, NodeExecutionServiceImpl, WorkflowDraftCleanupJob, MybatisPlusConfig tenant/optimistic/pagination plugins, real Mapper XML, DataSourceTransactionManager, process/task/performance monitors, MessageAutoConfiguration and OutboxPublisher.");
        }

        <Service> Service transactional(Service target) {
            ProxyFactory proxy = new ProxyFactory(target);
            proxy.setProxyTargetClass(true);
            proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
            @SuppressWarnings("unchecked") Service result = (Service) proxy.getProxy();
            return result;
        }

        <Mapper> Mapper mapper(Class<Mapper> type) {
            return sessions.getMapper(type);
        }

        DraftCase create(String label, boolean invalidAssignee) throws Exception {
            return create(label, invalidAssignee, TENANT);
        }

        DraftCase create(String label, boolean invalidAssignee, long tenant) throws Exception {
            long user = users.incrementAndGet();
            identity(tenant, user);
            String definition = UUID.randomUUID().toString();
            String form = UUID.randomUUID().toString();
            String key = "wf11_" + user;
            jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status) VALUES(?,?,?,?,'0')", user, tenant, "wf11_" + user, "wf11 starter");
            jdbc.update("INSERT INTO wf_form_definition(form_id,tenant_id,form_name,form_key,fields_json,status,version) VALUES(?,?,?,?,?,'ACTIVE',1)",
                    form, tenant, "wf11 form", key, "[{\"id\":\"reason\",\"type\":\"TEXT\",\"label\":\"Reason\",\"required\":true}]");
            Map<String, Object> approval = new LinkedHashMap<>();
            approval.put("id", "wf11-review");
            approval.put("type", "APPROVAL");
            approval.put("title", "wf11 review");
            approval.put("approverType", invalidAssignee ? "USER" : "INITIATOR_SELECTED");
            if (!invalidAssignee) approval.put("selectableScope", Map.of("deptIds", List.of(91101L)));
            String model = json.writeValueAsString(Map.of("nodes", List.of(Map.of("id", "start", "type", "START", "title", "start"),
                    approval, Map.of("id", "end", "type", "END", "title", "end")),
                    "edges", List.of(Map.of("source", "start", "target", "wf11-review"), Map.of("source", "wf11-review", "target", "end"))));
            jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,version,form_id,model_json,status,start_permission_type,start_permission_value) VALUES(?,?,?,?,1,?,?,'PUBLISHED','ALL','[]')",
                    definition, tenant, "wf11 " + label, key, form, model);
            String hash = contexts.context(definition).contextHash();
            Map<String, List<Long>> selections = invalidAssignee ? Map.of() : Map.of("wf11-review", List.of(APPROVER));
            DraftSaveResult saved = drafts.save(new DraftSaveRequest(null, definition, 0, hash, "wf11 " + label, Map.of("reason", "fixture"), selections));
            return new DraftCase(tenant, user, definition, hash, selections, saved);
        }

        void run() throws Exception {
            scenario("save-window-noop-and-expired-rejection", this::saveWindow);
            scenario("exact-expiry-version-tenant-delete-guards", this::expiryGuards);
            scenario("real-cleanup-job-501-rows-and-tenant-isolation", this::cleanupBatches);
            scenario("save-extends-while-cleanup-waits-on-mysql-row-lock", () -> mutationWins(false));
            scenario("submit-commits-while-cleanup-waits-on-mysql-row-lock", () -> mutationWins(true));
            scenario("cleanup-commits-before-expired-save", () -> cleanupWins(false));
            scenario("cleanup-commits-before-expired-submit", () -> cleanupWins(true));
            scenario("natural-first-approval-node-failure-rolls-back", this::naturalNodeFailure);
            scenario("mysql-first-task-insert-failure-rolls-back", () -> databaseFailure(false));
            scenario("mysql-draft-delete-failure-rolls-back", () -> databaseFailure(true));
            equal(4, observer.waits.get(), "All four orderings observed actual InnoDB row-lock waits");
            System.out.println("EVIDENCE: actual-row-lock-waits=" + observer.waits.get() + " observed-service-sql=" + observer.calls.size()
                    + " injected-database-failures=" + observer.failures.stream().filter(failure -> failure.state().equals("45000") && failure.code() == 1644).count());
        }

        void scenario(String label, CheckedAction action) throws Exception {
            int before = CHECKS.get();
            action.run();
            SCENARIOS.incrementAndGet();
            System.out.println("PASS " + label + " checks=" + (CHECKS.get() - before));
        }

        void saveWindow() throws Exception {
            Map<String, List<String>> before = runtimeSnapshot();
            DraftCase fixture = create("save-window", false);
            equal(Duration.ofDays(30), Duration.between(fixture.saved().lastSaveTime(), fixture.saved().expireTime()), "Server save grants exactly 30 days");
            equal(before, runtimeSnapshot(), "Saving creates no runtime, monitoring, candidate or outbox rows");
            expiresAt(fixture, LocalDateTime.now().withNano(0).plusDays(2));
            List<Map<String, Object>> unchanged = draftRow(fixture);
            DraftSaveResult noop = as(fixture, "no-op-save", () -> drafts.save(fixture.update("wf11 save-window")));
            check(!noop.changed(), "Identical content is reported unchanged");
            equal(fixture.saved().lockVersion(), noop.lockVersion(), "No-op save preserves the version");
            equal(unchanged, draftRow(fixture), "No-op save preserves all timestamps and draft content");
            expiresAt(fixture, LocalDateTime.now().withNano(0).minusDays(1));
            List<Map<String, Object>> expired = draftRow(fixture);
            expectCode("DRAFT_EXPIRED", capture(() -> as(fixture, "expired-detail", () -> drafts.detail(fixture.saved().draftId()))));
            expectCode("DRAFT_EXPIRED", capture(() -> as(fixture, "expired-save", () -> drafts.save(fixture.update("changed")))));
            expectCode("DRAFT_EXPIRED", capture(() -> as(fixture, "expired-submit", () -> drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion()))));
            equal(expired, draftRow(fixture), "Expired read/save/submit rejection preserves the draft");
            equal(1, as(fixture, "expired-cleanup", drafts::cleanup), "Cleanup removes the expired fixture");
            equal(List.of(), draftRow(fixture), "Expired fixture is deleted after cleanup commits");
            equal(before, runtimeSnapshot(), "Expired operations and cleanup cause no process side effects");
        }

        void expiryGuards() throws Exception {
            DraftCase fixture = create("expiry-guards", false);
            LocalDateTime cutoff = LocalDateTime.now().withNano(0).minusDays(1);
            expiresAt(fixture, cutoff);
            Map<String, List<String>> before = runtimeSnapshot();
            as(fixture, "expiry-guards", () -> transactions.execute(status -> {
                check(draftMapper.findExpired(TENANT, cutoff).stream().anyMatch(row -> row.getDraftId().equals(fixture.saved().draftId())), "Exact expire_time equality is a cleanup candidate");
                equal(0, draftMapper.deleteExpired(TENANT, fixture.saved().draftId(), 0, cutoff), "Stale cleanup version cannot delete the row");
                equal(0, draftMapper.deleteExpired(TENANT, fixture.saved().draftId(), 1, cutoff.minusSeconds(1)), "Delete rechecks expiry even when the version matches");
                equal(0, draftMapper.deleteExpired(OTHER_TENANT, fixture.saved().draftId(), 1, cutoff), "Cleanup cannot delete another tenant's row");
                equal(1, draftMapper.deleteExpired(TENANT, fixture.saved().draftId(), 1, cutoff), "Matching version and exact cutoff delete one row");
                return null;
            }));
            equal(List.of(), draftRow(fixture), "Guarded Mapper delete commits to MySQL");
            equal(before, runtimeSnapshot(), "Guard checks do not create runtime records");
            singleConnection("expiry-guards");
        }

        void cleanupBatches() throws Exception {
            DraftCase current = create("cleanup-batches", false);
            DraftCase foreign = create("foreign-expired", true, OTHER_TENANT);
            LocalDateTime expiry = LocalDateTime.now().withNano(0).minusDays(1);
            expiresAt(foreign, expiry);
            List<Map<String, Object>> foreignBefore = draftRow(foreign);
            List<Object[]> usersToInsert = new ArrayList<>();
            List<Object[]> draftsToInsert = new ArrayList<>();
            for (int index = 0; index < 501; index++) {
                long user = users.incrementAndGet();
                usersToInsert.add(new Object[]{user, TENANT, "wf11_" + user, "wf11 cleanup owner"});
                draftsToInsert.add(new Object[]{UUID.randomUUID().toString(), user, Timestamp.valueOf(expiry.minusDays(30)),
                        Timestamp.valueOf(expiry), current.saved().draftId()});
            }
            jdbc.batchUpdate("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status) VALUES(?,?,?,?,'0')", usersToInsert);
            jdbc.batchUpdate("INSERT INTO wf_form_draft(draft_id,tenant_id,definition_id,definition_name,form_id,user_id,title,form_data,node_assignees,definition_snapshot_hash,lock_version,last_save_time,expire_time,create_by,update_by) SELECT ?,tenant_id,definition_id,definition_name,form_id,?,title,form_data,node_assignees,definition_snapshot_hash,1,?,?,create_by,update_by FROM wf_form_draft WHERE draft_id=?", draftsToInsert);
            equal(501L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=? AND expire_time<=?", Long.class, TENANT, Timestamp.valueOf(expiry)), "Fixture contains exactly 501 expired tenant drafts");
            Map<String, List<String>> before = runtimeSnapshot();
            as(current, "cleanup-job", () -> { new WorkflowDraftCleanupJob(drafts).cleanup(); return null; });
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_form_draft WHERE tenant_id=? AND expire_time<=?", Long.class, TENANT, Timestamp.valueOf(expiry)), "Real cleanup job drains both batches");
            equal(2L, observer.calls.stream().filter(call -> call.actor().equals("cleanup-job") && call.statement().endsWith(".findExpired")).count(), "Real cleanup job performs 500-row and 1-row batches");
            equal(501, observer.calls.stream().filter(call -> call.actor().equals("cleanup-job") && call.statement().endsWith(".deleteExpired")).mapToInt(SqlCall::affected).sum(), "Actual guarded SQL deletes total 501 rows");
            equal(foreignBefore, draftRow(foreign), "Other tenant's expired draft remains byte-for-byte unchanged");
            equal(1, draftRow(current).size(), "Unexpired draft survives cleanup");
            equal(before, runtimeSnapshot(), "Job cleanup has no workflow/outbox side effects");
        }

        void mutationWins(boolean submit) throws Exception {
            String actor = submit ? "submit-first" : "save-first";
            String cleaner = actor + "-cleanup";
            DraftCase fixture = create(actor, false);
            LocalDateTime expiry = LocalDateTime.now().withNano(0).plusSeconds(3);
            expiresAt(fixture, expiry);
            Map<String, List<String>> before = runtimeSnapshot();
            Gate writerGate = observer.pause(actor, submit ? ".OutboxEventMapper.insert" : ".WfFormDraftMapper.updateOwned");
            Gate candidateGate = observer.pause(cleaner, ".WfFormDraftMapper.findExpired");
            Future<?> writer = async(fixture, actor, () -> submit
                    ? drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion())
                    : drafts.save(fixture.update("wf11 extended")));
            Future<Integer> cleanup = null;
            try {
                writerGate.await(writer);
                equal(before, runtimeSnapshot(), "Uncommitted mutation is invisible to independent database reads");
                waitForExpiry(expiry);
                cleanup = async(fixture, cleaner, drafts::cleanup);
                candidateGate.await(cleanup);
                candidate(candidateGate, fixture);
                candidateGate.release.countDown();
                waitForRowLock(writer, cleanup);
            } finally {
                candidateGate.release.countDown();
                writerGate.release.countDown();
            }
            Object mutation = writer.get(25, TimeUnit.SECONDS);
            guard(cleanup != null, "Cleanup worker was not started");
            equal(0, cleanup.get(25, TimeUnit.SECONDS), "Cleanup rechecks the committed row and deletes nothing");
            if (submit) {
                String instance = assertStarted(fixture, (R<?>) mutation, before.get("outbox_event").size() + 1L);
                R<?> retry = as(fixture, "submit-first-retry", () -> drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion()));
                equal(instance, instanceId(retry), "Retry after cleanup race returns the committed instance");
                equal(1L, processCount(fixture), "Concurrent cleanup and retry leave exactly one instance");
                equal(before.get("outbox_event").size() + 1L, count("outbox_event"), "Retry emits no second notification event");
            } else {
                DraftSaveResult saved = (DraftSaveResult) mutation;
                equal(2, saved.lockVersion(), "Real save increments the draft version");
                check(saved.changed(), "Real save reports the content change");
                equal(Duration.ofDays(30), Duration.between(saved.lastSaveTime(), saved.expireTime()), "Winning save renews exactly 30 days");
                equal(saved.expireTime(), jdbc.queryForObject("SELECT expire_time FROM wf_form_draft WHERE draft_id=?", LocalDateTime.class, fixture.saved().draftId()), "Renewed expiry survives stale cleanup candidate");
                equal(2, jdbc.queryForObject("SELECT lock_version FROM wf_form_draft WHERE draft_id=?", Integer.class, fixture.saved().draftId()), "Renewed version is committed and retained");
                equal(before, runtimeSnapshot(), "Save/cleanup race creates no runtime artifacts");
            }
            singleConnection(actor);
            singleConnection(cleaner);
        }

        void cleanupWins(boolean submit) throws Exception {
            String actor = submit ? "cleanup-first-submit" : "cleanup-first-save";
            String cleaner = actor + "-cleanup";
            DraftCase fixture = create(actor, false);
            expiresAt(fixture, LocalDateTime.now().withNano(0).minusDays(1));
            List<Map<String, Object>> original = draftRow(fixture);
            Map<String, List<String>> before = runtimeSnapshot();
            Gate cleanupGate = observer.pause(cleaner, ".WfFormDraftMapper.deleteExpired");
            Future<Integer> cleanup = async(fixture, cleaner, drafts::cleanup);
            Future<Throwable> mutation = null;
            try {
                cleanupGate.await(cleanup);
                equal(1, cleanupGate.result, "Cleanup deleted the row inside its still-open transaction");
                equal(original, draftRow(fixture), "Uncommitted cleanup is invisible outside its transaction");
                mutation = async(fixture, actor, () -> capture(() -> submit
                        ? drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion())
                        : drafts.save(fixture.update("wf11 too late"))));
                waitForRowLock(cleanup, mutation);
            } finally {
                cleanupGate.release.countDown();
            }
            equal(1, cleanup.get(25, TimeUnit.SECONDS), "Winning cleanup commits one deletion");
            guard(mutation != null, "Mutation worker was not started");
            expectCode("DRAFT_NOT_FOUND", mutation.get(25, TimeUnit.SECONDS));
            equal(List.of(), draftRow(fixture), "Losing mutation cannot resurrect the removed draft");
            equal(before, runtimeSnapshot(), "Losing save/submit creates no process, task, monitor or outbox artifacts");
            singleConnection(actor);
            singleConnection(cleaner);
        }

        void candidate(Gate gate, DraftCase fixture) {
            guard(gate.result instanceof List<?>, "Cleanup candidate must come from the actual Mapper query");
            WfFormDraft candidate = ((List<?>) gate.result).stream().map(WfFormDraft.class::cast)
                    .filter(row -> fixture.saved().draftId().equals(row.getDraftId())).findFirst()
                    .orElseThrow(() -> new AssertionError("Cleanup must observe the originally expired draft"));
            equal(fixture.saved().lockVersion(), candidate.getLockVersion(), "Cleanup reads the old committed draft version");
            check(!candidate.getExpireTime().isAfter(LocalDateTime.now()), "Cleanup reads an actually expired committed row");
        }

        void waitForExpiry(LocalDateTime expiry) throws InterruptedException {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(8);
            while (LocalDateTime.now().withNano(0).isBefore(expiry) && System.nanoTime() < deadline) Thread.sleep(10);
            check(!LocalDateTime.now().withNano(0).isBefore(expiry), "Artificial 3-second boundary reached without waiting 30 days");
        }

        void waitForRowLock(Future<?> owner, Future<?> waiter) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(12);
            while (System.nanoTime() < deadline) {
                Long waiting = jdbc.queryForObject("SELECT COUNT(*) FROM performance_schema.data_lock_waits waiting JOIN performance_schema.data_locks requested ON requested.ENGINE=waiting.ENGINE AND requested.ENGINE_LOCK_ID=waiting.REQUESTING_ENGINE_LOCK_ID JOIN performance_schema.data_locks blocking ON blocking.ENGINE=waiting.ENGINE AND blocking.ENGINE_LOCK_ID=waiting.BLOCKING_ENGINE_LOCK_ID WHERE requested.OBJECT_SCHEMA=? AND blocking.OBJECT_SCHEMA=? AND requested.OBJECT_NAME='wf_form_draft' AND blocking.OBJECT_NAME='wf_form_draft'",
                        Long.class, isolation.database, isolation.database);
                if (waiting != null && waiting > 0) {
                    check(!owner.isDone() && !waiter.isDone(), "Both real transactions overlap during an observed InnoDB row-lock wait");
                    observer.waits.incrementAndGet();
                    return;
                }
                if (owner.isDone()) owner.get();
                if (waiter.isDone()) waiter.get();
                Thread.sleep(20);
            }
            throw new AssertionError("Expected an actual performance_schema InnoDB row-lock wait in the dedicated database");
        }

        void naturalNodeFailure() throws Exception {
            DraftCase fixture = create("unresolved-assignee", true);
            List<Map<String, Object>> original = draftRow(fixture);
            Map<String, List<String>> before = runtimeSnapshot();
            Throwable failure = capture(() -> as(fixture, "natural-node-failure", () -> drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion())));
            expectCode("INVALID_REQUEST", failure);
            check(failure.getMessage() != null && failure.getMessage().contains("无法解析到审批人"), "Failure originates in the real first approval node");
            check(observer.calls.stream().anyMatch(call -> call.actor().equals("natural-node-failure") && call.statement().endsWith(".WfProcessInstanceMapper.insert") && call.affected() == 1), "Instance was actually inserted before natural first-node failure");
            check(observer.calls.stream().anyMatch(call -> call.actor().equals("natural-node-failure") && call.statement().endsWith(".ProcessMonitorMapper.insert") && call.affected() == 1), "Process monitor was actually inserted before natural first-node failure");
            equal(original, draftRow(fixture), "Natural first-node failure restores the complete original draft");
            equal(before, runtimeSnapshot(), "Natural first-node failure rolls back every cloned runtime table");
            singleConnection("natural-node-failure");
        }

        void databaseFailure(boolean draftDeletion) throws Exception {
            String actor = draftDeletion ? "draft-delete-sql-failure" : "first-node-sql-failure";
            String trigger = draftDeletion ? "wf11_draft_delete_failure" : "wf11_first_node_failure";
            String marker = draftDeletion ? "WF11_DRAFT_DELETE_SQL_FAILURE" : "WF11_FIRST_NODE_SQL_FAILURE";
            DraftCase fixture = create(actor, false);
            List<Map<String, Object>> original = draftRow(fixture);
            Map<String, List<String>> before = runtimeSnapshot();
            AtomicInteger reached = new AtomicInteger();
            observer.watch(actor, draftDeletion ? ".WfFormDraftMapper.deleteOwned" : ".WfTaskMapper.insert", parameters -> {
                equal(1L, processCount(fixture), "Real process insert is visible inside the failing transaction");
                equal(1L, linkedCount("wf_process_monitor", fixture), "Real monitor insert is visible inside the failing transaction");
                equal(1L, linkedCount("wf_task_candidate", fixture), "Real selected-approver snapshot exists before failure");
                equal(draftDeletion ? 1L : 0L, linkedCount("wf_task", fixture), "Actual task state at the selected database failure boundary");
                if (draftDeletion) {
                    equal(1L, linkedCount("wf_task_monitor", fixture), "Task monitor exists before failing draft deletion");
                    equal(before.get("outbox_event").size() + 1L, count("outbox_event"), "Notification outbox insert exists before failing draft deletion");
                }
                reached.incrementAndGet();
            });
            isolation.trigger(trigger, "AFTER", draftDeletion ? "DELETE" : "INSERT", draftDeletion ? "wf_form_draft" : "wf_task",
                    draftDeletion ? "OLD.draft_id = '" + fixture.saved().draftId() + "'" : "NEW.node_key = 'wf11-review'", marker);
            try {
                Throwable failure = capture(() -> as(fixture, actor, () -> drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion())));
                if (draftDeletion) {
                    check(hasSqlState(failure, "45000", 1644), "Draft deletion surfaces the injected real MySQL SIGNAL failure");
                } else {
                    expectCode("START_FAILED", failure);
                }
                equal(1, reached.get(), "Actual database failure boundary is reached exactly once");
                equal(1L, observer.failures.stream().filter(error -> error.actor().equals(actor) && error.state().equals("45000") && error.code() == 1644 && error.marker().equals(marker)).count(), "Real Mapper received SQLState 45000 / MySQL 1644 with the intended marker");
                equal(original, draftRow(fixture), "Injected SQL failure restores draft contents, ownership, version and timestamps");
                equal(before, runtimeSnapshot(), "Injected SQL failure restores complete runtime/monitor/performance/candidate/outbox snapshots");
                singleConnection(actor);
                System.out.println("FAULT: " + marker + " SQLState=45000 MySQL=1644; runtime row snapshots restored after Spring rollback.");
            } finally {
                isolation.dropTrigger(trigger);
            }
            R<?> retry = as(fixture, actor + "-retry", () -> drafts.submit(fixture.saved().draftId(), fixture.saved().lockVersion()));
            assertStarted(fixture, retry, before.get("outbox_event").size() + 1L);
            singleConnection(actor + "-retry");
        }

        long processCount(DraftCase fixture) {
            return Objects.requireNonNull(jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=? AND business_key=?",
                    Long.class, fixture.tenant(), "WF_DRAFT:" + fixture.saved().draftId()));
        }

        long linkedCount(String table, DraftCase fixture) {
            guard(Set.of("wf_task", "wf_task_candidate", "wf_process_monitor", "wf_task_monitor").contains(table), "Unsupported linked fixture table");
            return Objects.requireNonNull(jdbc.queryForObject(FixtureInspectionSql.query("workflowArtifacts", table),
                    Long.class, fixture.tenant(), "WF_DRAFT:" + fixture.saved().draftId()));
        }

        String assertStarted(DraftCase fixture, R<?> result, long expectedOutbox) {
            String instance = instanceId(result);
            equal(1L, processCount(fixture), "Successful submission commits exactly one workflow instance");
            equal(1L, linkedCount("wf_task", fixture), "Successful submission commits the real first approval task");
            equal(1L, linkedCount("wf_task_candidate", fixture), "Successful submission commits the selected approver snapshot");
            equal(1L, linkedCount("wf_process_monitor", fixture), "Successful submission commits process monitoring");
            equal(1L, linkedCount("wf_task_monitor", fixture), "Successful submission commits task monitoring");
            equal(expectedOutbox, count("outbox_event"), "Successful submission commits one notification outbox event");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM outbox_event WHERE status <> 'PENDING'", Long.class), "No fixture outbox event is dispatched externally");
            equal(List.of(), draftRow(fixture), "Successful submission consumes only the submitted draft");
            equal("RUNNING", jdbc.queryForObject("SELECT status FROM wf_process_instance WHERE instance_id=?", String.class, instance), "Fixture stops at pending approval without executing online approval");
            return instance;
        }

        <Value> Value as(DraftCase fixture, String actor, Callable<Value> action) throws Exception {
            Long previousTenant = UserContext.getTenantId();
            Long previousUser = UserContext.getUserId();
            String previousActor = ACTOR.get();
            identity(fixture.tenant(), fixture.user());
            ACTOR.set(actor);
            try {
                return action.call();
            } finally {
                UserContext.clear();
                TenantContext.clear();
                ACTOR.remove();
                if (previousTenant != null && previousUser != null) identity(previousTenant, previousUser);
                if (previousActor != null) ACTOR.set(previousActor);
            }
        }

        <Value> Future<Value> async(DraftCase fixture, String actor, Callable<Value> action) {
            return workers.submit(() -> as(fixture, actor, action));
        }

        void singleConnection(String actor) {
            List<WorkflowDraftDatabaseChecks.SqlCall> businessCalls = observer.calls.stream().filter(call -> call.actor().equals(actor)
                    && !call.statement().endsWith(".selectLatestProcessNumber")).toList();
            equal(1L, businessCalls.stream().map(SqlCall::connection).distinct().count(), "Entire business write transaction uses one actual MySQL connection: " + actor);
            for (SqlCall numberRead : observer.calls.stream().filter(call -> call.actor().equals(actor)
                    && call.statement().endsWith(".selectLatestProcessNumber")).toList()) {
                check(businessCalls.stream().noneMatch(call -> call.connection() == numberRead.connection()),
                        "Number recovery reads committed history outside the business transaction snapshot: " + actor);
            }
        }

        long count(String table) {
            guard(isolation.tables.contains(table), "Unknown fixture table");
            return Objects.requireNonNull(jdbc.queryForObject(FixtureInspectionSql.query("count", table), Long.class));
        }

        List<Map<String, Object>> draftRow(DraftCase fixture) {
            return jdbc.queryForList("SELECT * FROM wf_form_draft WHERE draft_id=?", fixture.saved().draftId());
        }

        Map<String, List<String>> runtimeSnapshot() throws Exception {
            Map<String, List<String>> result = new LinkedHashMap<>();
            for (String table : isolation.tables) {
                if ((!table.startsWith("wf_") && !table.equals("outbox_event"))
                        || Set.of("wf_form_draft", "wf_process_definition", "wf_form_definition", "wf_form_field_permission").contains(table)) continue;
                List<String> rows = new ArrayList<>();
                for (Map<String, Object> row : jdbc.queryForList(FixtureInspectionSql.query("allRows", table))) rows.add(json.writeValueAsString(row));
                Collections.sort(rows);
                result.put(table, rows);
            }
            return result;
        }

        void expiresAt(DraftCase fixture, LocalDateTime expiry) {
            equal(1, jdbc.update("UPDATE wf_form_draft SET last_save_time=?,expire_time=?,update_time=? WHERE draft_id=?",
                    Timestamp.valueOf(expiry.minusDays(30)), Timestamp.valueOf(expiry), Timestamp.valueOf(expiry.minusDays(30)), fixture.saved().draftId()), "Artificial expiry updates exactly one fixture draft");
        }

        @Override
        public void close() throws Exception {
            observer.releaseAll();
            workers.shutdownNow();
            guard(workers.awaitTermination(45, TimeUnit.SECONDS), "Fixture workers must finish before database removal");
            if (SCENARIOS.get() < 10) {
                observer.calls.stream().skip(Math.max(0, observer.calls.size() - 8)).forEach(call ->
                        System.err.println("LAST_SQL: actor=" + call.actor() + " statement=" + call.statement() + " affected=" + call.affected()));
                observer.failures.forEach(failure -> System.err.println("SQL_FAILURE: actor=" + failure.actor()
                        + " state=" + failure.state() + " code=" + failure.code() + " marker=" + failure.marker()));
            }
            application.close();
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private record DraftCase(long tenant, long user, String definition, String hash,
                             Map<String, List<Long>> selections, DraftSaveResult saved) {
        DraftSaveRequest update(String title) {
            return new DraftSaveRequest(saved.draftId(), definition, saved.lockVersion(), hash, title, Map.of("reason", "fixture"), selections);
        }
    }

    @Intercepts({
            @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class}),
            @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
    })
    public static final class MapperObserver implements Interceptor {
        final Map<String, Gate> gates = new ConcurrentHashMap<>();
        final Map<String, Watch> watches = new ConcurrentHashMap<>();
        final List<SqlCall> calls = new CopyOnWriteArrayList<>();
        final List<SqlFailure> failures = new CopyOnWriteArrayList<>();
        final AtomicInteger waits = new AtomicInteger();

        @Override
        public Object intercept(Invocation invocation) throws Throwable {
            String actor = ACTOR.get();
            if (actor == null) return invocation.proceed();
            String statement = ((MappedStatement) invocation.getArgs()[0]).getId();
            Connection connection = ((Executor) invocation.getTarget()).getTransaction().getConnection();
            guard(TransactionSynchronizationManager.isActualTransactionActive() && !connection.getAutoCommit(), "Observed service SQL must participate in an actual JDBC transaction: " + actor);
            long connectionId;
            try (Statement query = connection.createStatement(); ResultSet rows = query.executeQuery("SELECT CONNECTION_ID()")) {
                rows.next();
                connectionId = rows.getLong(1);
            }
            Watch watch = watches.get(actor);
            if (watch != null && statement.endsWith(watch.suffix())) watch.action().accept(invocation.getArgs()[1]);
            Gate gate = gates.get(actor);
            if (gate != null) gate.hit(statement, false, null);
            try {
                Object result = invocation.proceed();
                calls.add(new SqlCall(actor, statement, connectionId, result instanceof Integer affected ? affected : -1));
                if (gate != null) gate.hit(statement, true, result);
                return result;
            } catch (Throwable failure) {
                for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                    if (cause instanceof SQLException sql) {
                        String marker = List.of("WF11_FIRST_NODE_SQL_FAILURE", "WF11_DRAFT_DELETE_SQL_FAILURE").stream()
                                .filter(value -> sql.getMessage() != null && sql.getMessage().contains(value)).findFirst().orElse("UNEXPECTED_SQL_FAILURE");
                        failures.add(new SqlFailure(actor, sql.getSQLState(), sql.getErrorCode(), marker));
                        break;
                    }
                }
                throw failure;
            }
        }

        Gate pause(String actor, String suffix) {
            Gate gate = new Gate(suffix, true);
            gates.put(actor, gate);
            return gate;
        }

        void watch(String actor, String suffix, Consumer<Object> action) {
            watches.put(actor, new Watch(suffix, action));
        }

        void releaseAll() {
            gates.values().forEach(gate -> gate.release.countDown());
        }
    }

    private record Watch(String suffix, Consumer<Object> action) {
    }

    private record SqlCall(String actor, String statement, long connection, int affected) {
    }

    private record SqlFailure(String actor, String state, int code, String marker) {
    }

    private static final class Gate {
        final String suffix;
        final boolean after;
        final CountDownLatch entered = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        volatile Object result;

        Gate(String suffix, boolean after) {
            this.suffix = suffix;
            this.after = after;
        }

        void hit(String statement, boolean afterExecution, Object value) throws InterruptedException {
            if (after != afterExecution || !statement.endsWith(suffix) || entered.getCount() == 0) return;
            result = value;
            entered.countDown();
            guard(release.await(20, TimeUnit.SECONDS), "Timed out releasing real Mapper statement: " + suffix);
        }

        void await(Future<?> worker) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (!entered.await(50, TimeUnit.MILLISECONDS)) {
                if (worker.isDone()) {
                    worker.get();
                    throw new AssertionError("Worker completed without reaching the real Mapper statement: " + suffix);
                }
                guard(System.nanoTime() < deadline, "Expected real Mapper statement was not reached: " + suffix);
            }
        }
    }

    private static final class LocalRedisEdge extends RedisCache {
        private final Map<String, AtomicLong> counters = new ConcurrentHashMap<>();
        private final Map<String, Object> values = new ConcurrentHashMap<>();
        private final Map<String, Map<Object, Double>> sorted = new ConcurrentHashMap<>();

        org.springframework.data.redis.core.StringRedisTemplate numbering() {
            return new org.springframework.data.redis.core.StringRedisTemplate() {
                @Override
                public <Result> Result execute(org.springframework.data.redis.core.script.RedisScript<Result> script,
                                               List<String> keys, Object... arguments) {
                    guard(keys.size() == 1 && arguments.length == 2, "Numbering fixture requires the real allocator contract");
                    long minimum = Long.parseLong(arguments[0].toString());
                    long next = counters.computeIfAbsent(keys.get(0), ignored -> new AtomicLong())
                            .updateAndGet(current -> Math.addExact(Math.max(current, minimum), 1));
                    return script.getResultType().cast(Long.toString(next));
                }
            };
        }

        @Override
        public long increment(String key) {
            return counters.computeIfAbsent(key, ignored -> new AtomicLong()).incrementAndGet();
        }

        @Override
        public boolean expire(String key, long timeout, TimeUnit unit) {
            return true;
        }

        @Override
        public <Value> Value getCacheObject(String key) {
            @SuppressWarnings("unchecked") Value value = (Value) values.get(key);
            return value;
        }

        @Override
        public <Value> void setCacheObject(String key, Value value) {
            values.put(key, value);
        }

        @Override
        public boolean setCacheZSet(String key, Object value, double score) {
            sorted.computeIfAbsent(key, ignored -> new ConcurrentHashMap<>()).put(value, score);
            return true;
        }

        @Override
        public long getCacheZSetSize(String key) {
            return sorted.getOrDefault(key, Map.of()).size();
        }

        @Override
        public long removeRangeByScore(String key, double minimum, double maximum) {
            Map<Object, Double> entries = sorted.get(key);
            if (entries == null) return 0;
            int before = entries.size();
            entries.entrySet().removeIf(entry -> entry.getValue() >= minimum && entry.getValue() <= maximum);
            return before - entries.size();
        }
    }

    @FunctionalInterface
    private interface CheckedAction {
        void run() throws Exception;
    }

    private static Throwable capture(Callable<?> action) {
        try {
            action.call();
            return null;
        } catch (Throwable failure) {
            return failure;
        }
    }

    private static void expectCode(String code, Throwable failure) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof WorkflowException workflow) {
                equal(code, workflow.getCode(), "Expected workflow rejection: " + code);
                return;
            }
        }
        throw new AssertionError("Expected workflow rejection " + code + "; actual=" + (failure == null ? "success" : failure.getClass().getName()));
    }

    private static boolean hasSqlState(Throwable failure, String state, int code) {
        for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
            if (cause instanceof SQLException sql && state.equals(sql.getSQLState()) && sql.getErrorCode() == code) return true;
        }
        return false;
    }

    private static String instanceId(R<?> result) {
        check(result != null && Integer.valueOf(200).equals(result.getCode()), "Real workflow submission returns success");
        guard(result.getData() instanceof Map<?, ?>, "Submission must return instance identifiers");
        Object identifier = ((Map<?, ?>) result.getData()).get("instanceId");
        check(identifier instanceof String && !((String) identifier).isBlank(), "Submission returns an actual instance identifier");
        return (String) identifier;
    }

    private static String environment(String name) {
        String value = System.getenv(name);
        guard(value != null && !value.isBlank(), "Required verification environment is missing: " + name);
        return value;
    }

    private static void guard(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
    }

    private static void check(boolean condition, String label) {
        guard(condition, label);
        CHECKS.incrementAndGet();
    }

    private static void equal(Object expected, Object actual, String label) {
        check(Objects.equals(expected, actual), label);
    }

    private static void identity(long tenant, long user) {
        TenantContext.setTenantId(tenant);
        UserContext.setTenantId(tenant);
        UserContext.setUserId(user);
        UserContext.setUserName("wf11-database-fixture");
    }

    private static void inject(Object target, String name, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(name);
        field.setAccessible(true);
        field.set(target, value);
    }
}

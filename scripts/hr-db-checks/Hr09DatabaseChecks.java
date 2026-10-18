package com.cloudflow.hr.service;

import com.cloudflow.checks.FixtureInspectionSql;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.encrypt.interceptor.MybatisDecryptInterceptor;
import com.cloudflow.common.encrypt.interceptor.MybatisEncryptInterceptor;
import com.cloudflow.common.encrypt.properties.EncryptorProperties;
import com.cloudflow.common.event.outbox.OutboxPublisher;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.holiday.api.HolidayCalendarService;
import com.cloudflow.common.holiday.mapper.*;
import com.cloudflow.common.holiday.service.HolidayCalendarServiceImpl;
import com.cloudflow.common.message.api.MessageSender;
import com.cloudflow.common.message.config.MessageAutoConfiguration;
import com.cloudflow.common.redis.config.RuntimeSysConfigService;
import com.cloudflow.common.redis.core.RedisCache;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.hr.client.BusinessRuleClient;
import com.cloudflow.hr.client.WorkflowServiceClient;
import com.cloudflow.hr.domain.dto.*;
import com.cloudflow.hr.domain.entity.*;
import com.cloudflow.hr.exception.HrBusinessException;
import com.cloudflow.hr.mapper.*;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;
import java.util.regex.Matcher;
import java.util.stream.Stream;
import org.apache.ibatis.executor.Executor;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.plugin.*;
import org.apache.ibatis.session.LocalCacheScope;
import org.apache.ibatis.session.ResultHandler;
import org.apache.ibatis.session.RowBounds;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.ApplicationContext;
import org.springframework.context.support.StaticApplicationContext;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.beans.Introspector;
import java.io.File;
import java.lang.reflect.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.sql.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.locks.ReentrantLock;

public final class Hr09DatabaseChecks {
    private static final ObjectMapper JSON = new ObjectMapper().registerModule(new JavaTimeModule())
            .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    private static final AtomicInteger ASSERTIONS = new AtomicInteger();
    private static final ThreadLocal<String> ACTOR = new ThreadLocal<>();
    private static final ThreadLocal<String> LOCK_DOMAIN = new ThreadLocal<>();
    private static final List<Map<String, Object>> GROUPS = new ArrayList<>();
    private static final List<Map<String, Object>> RACES = new ArrayList<>();
    private static final Map<String, Object> REPORT = new LinkedHashMap<>();
    private static final List<String> BOUNDARIES = List.of(
            "Exercised business Mappers, HR services, tenant/optimistic-lock/encryption plugins, Spring transactions, audit and message Outbox inserts are real current-source code.",
            "Approved requests, schedules, policies and encrypted synthetic compensation are fixtures created only in the isolated database; online approval/pricing/payroll correction is not executed.",
            "Redis cache/config transport uses a local edge; concurrent consumers use separate local lock domains deliberately, so database row locks must independently prevent duplicate results. Real Redis coordination is not certified.",
            "Remote workflow/business-rule clients fail closed if invoked. Message Outbox rows are real; external delivery and background workers are not run.");

    public static void main(String[] arguments) {
        boolean passed = false;
        REPORT.put("sourceSha256", environment("HR09_SOURCE_SHA256"));
        REPORT.put("compiledJavaSourceCount", Integer.parseInt(environment("HR09_SOURCE_COUNT")));
        REPORT.put("boundaries", BOUNDARIES);
        REPORT.put("startedAt", Instant.now().toString());
        try (Isolation isolation = new Isolation()) {
            isolation.initialize();
            try (Harness harness = new Harness(isolation)) {
                harness.run();
                REPORT.put("holidayCacheProtocol", Map.of("transport", "local-fixture", "operations", harness.cache.epochOperations,
                        "committedInvalidations", harness.cache.invalidations.get()));
            }
            passed = GROUPS.stream().allMatch(group -> Boolean.TRUE.equals(group.get("passed")));
        } catch (Throwable failure) {
            REPORT.put("infrastructureFailure", safeFailure(failure));
            System.err.println("HR09 infrastructure failure: " + safeFailure(failure));
        } finally {
            UserContext.clear();
            TenantContext.clear();
            passed = passed && Boolean.TRUE.equals(REPORT.get("databaseDropped"))
                    && !REPORT.containsKey("infrastructureFailure");
            REPORT.put("passed", passed);
            REPORT.put("groups", GROUPS);
            REPORT.put("groupCount", GROUPS.size());
            REPORT.put("assertionCount", ASSERTIONS.get());
            int businessAssertions = GROUPS.stream().mapToInt(group -> ((Number) group.get("assertions")).intValue()).sum();
            REPORT.put("businessAssertionCount", businessAssertions);
            REPORT.put("isolationAndWiringAssertionCount", ASSERTIONS.get() - businessAssertions);
            REPORT.put("realDatabaseRaces", RACES);
            REPORT.put("realDatabaseRaceCount", RACES.size());
            REPORT.put("finishedAt", Instant.now().toString());
            try {
                Path report = Path.of(environment("HR09_REPORT")).toAbsolutePath().normalize();
                guard(report.getFileName().toString().equals("database-report.json")
                        && report.getParent().getFileName().toString().matches("hr09-db-[a-f0-9]{32}"), "Unsafe report location");
                Files.writeString(report, JSON.writerWithDefaultPrettyPrinter().writeValueAsString(REPORT), StandardCharsets.UTF_8);
            } catch (Throwable failure) {
                passed = false;
                System.err.println("HR09 report persistence failed: " + failure.getClass().getName());
            }
        }
        System.out.println((passed ? "PASS" : "FAIL") + " HR09 groups=" + GROUPS.size()
                + " assertions=" + ASSERTIONS.get() + " real-db-races=" + RACES.size()
                + " database-dropped=" + REPORT.getOrDefault("databaseDropped", false));
        if (!passed) System.exit(1);
    }

    private static final class Isolation implements AutoCloseable {
        final String source = environment("HR09_DB_SOURCE");
        final String database = environment("HR09_DB_TARGET");
        final String owner = environment("HR09_DB_OWNER");
        final String username = environment("HR09_DB_USERNAME");
        final String password = System.getenv().getOrDefault("HR09_DB_PASSWORD", "");
        final List<String> tables = new ArrayList<>();
        final Connection management;
        final String url;
        String sourceFingerprint;
        boolean created;
        boolean owned;

        Isolation() throws Exception {
            String host = environment("HR09_DB_HOST");
            int port = Integer.parseInt(environment("HR09_DB_PORT"));
            boolean loopback = "127.0.0.1".equals(host);
            guard("cloud_flow_db".equals(source) && "root".equals(username)
                    && (loopback ? port > 1024 && port < 65536 && password.isEmpty()
                            : "192.168.1.173".equals(host) && port == 3306 && !password.isEmpty()),
                    "Approved database host or owned scratch loopback required");
            guard(database.matches("hr09_verify_[a-f0-9]{32}") && !source.equals(database)
                    && owner.matches("[a-f0-9]{32}"), "Unsafe isolated database identity");
            String base = "jdbc:mysql://" + host + ":" + port + "/";
            String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
                    + "&connectTimeout=10000&socketTimeout=45000&allowMultiQueries=false&sessionVariables=innodb_lock_wait_timeout=20";
            management = DriverManager.getConnection(base + options, username, password);
            if (loopback) {
                try (Statement statement = management.createStatement(); ResultSet data = statement.executeQuery("SELECT @@datadir")) {
                    guard(data.next() && Path.of(data.getString(1)).toRealPath().equals(Path.of(environment("HR09_DB_DATA_DIRECTORY")).toRealPath()),
                            "Owned scratch database directory differs");
                } catch (Exception failure) { management.close(); throw failure; }
            }
            guard(management.getCatalog() == null || management.getCatalog().isEmpty(), "Management connection must not select a runtime catalog");
            url = base + database + options;
            REPORT.put("database", database);
            REPORT.put("databaseDropped", false);
        }

        void initialize() throws Exception {
            equal(374L, metadataCount("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'", source), "Current approved source has exactly 374 tables");
            REPORT.put("runtimeTableCountBefore", 374);
            sourceFingerprint = schemaFingerprint();
            REPORT.put("runtimeSchemaBeforeSha256", sourceFingerprint);
            try (PreparedStatement query = management.prepareStatement("SELECT table_name,engine FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE' AND (LEFT(table_name,3)='hr_' OR table_name IN ('sys_user','sys_dept','sys_config','sys_holiday_calendar','sys_holiday_date','sys_role','sys_user_role','sys_role_menu','sys_menu','wf_process_definition','wf_callback_side_effect','outbox_event')) ORDER BY table_name")) {
                query.setString(1, source);
                try (ResultSet rows = query.executeQuery()) {
                    while (rows.next()) {
                        guard(rows.getString(1).matches("[a-z][a-z0-9_]+") && "InnoDB".equals(rows.getString(2)), "Fixture tables must use original InnoDB schemas");
                        tables.add(rows.getString(1));
                    }
                }
            }
            guard(tables.containsAll(List.of("hr_shift_request", "hr_overtime_request", "hr_schedule_assignment", "hr_leave_ledger", "hr_leave_quota", "hr_comp_change", "outbox_event")), "Required production schemas are absent");
            try (PreparedStatement query = management.prepareStatement("SELECT table_name FROM information_schema.referential_constraints WHERE constraint_schema=?")) {
                query.setString(1, source);
                try (ResultSet rows = query.executeQuery()) {
                    while (rows.next()) guard(!tables.contains(rows.getString(1)), "CREATE TABLE LIKE must not silently omit a production foreign key");
                }
            }
            REPORT.put("cloneHasNoOmittedForeignKeys", true);
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci");
                created = true;
            }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE TABLE " + database + ".hr09_fixture_owner (owner_token CHAR(32) NOT NULL PRIMARY KEY) ENGINE=InnoDB");
                try (PreparedStatement insert = management.prepareStatement("INSERT INTO hr09_fixture_owner VALUES (?)")) {
                    insert.setString(1, owner);
                    insert.executeUpdate();
                }
                owned = true;
                for (String table : tables) {
                    equal(0L, metadataCount("SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=? AND event_object_table=?", source, table), "No runtime trigger is silently omitted from a clone");
                    statement.execute("CREATE TABLE " + database + "." + table + " LIKE " + source + "." + table);
                    try (ResultSet empty = statement.executeQuery(FixtureInspectionSql.query("count", table))) {
                        empty.next();
                        equal(0L, empty.getLong(1), "Every cloned fixture table starts empty");
                    }
                }
                try (ResultSet version = statement.executeQuery("SELECT VERSION()")) {
                    version.next();
                    REPORT.put("mysqlVersion", version.getString(1));
                }
            }
            REPORT.put("clonedEmptyTableCount", tables.size());
            REPORT.put("clonedTables", List.copyOf(tables));
            System.out.println("ISOLATION database=" + database + " cloned-empty-tables=" + tables.size() + "; runtime metadata only, no runtime rows read/copied/written.");
        }

        long metadataCount(String sql, String... values) throws SQLException {
            try (PreparedStatement query = management.prepareStatement(sql)) {
                for (int index = 0; index < values.length; index++) query.setString(index + 1, values[index]);
                try (ResultSet rows = query.executeQuery()) { rows.next(); return rows.getLong(1); }
            }
        }

        String schemaFingerprint() throws Exception {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            for (String sql : List.of(
                    "SELECT table_name,engine,table_collation FROM information_schema.tables WHERE table_schema=? ORDER BY table_name",
                    "SELECT table_name,column_name,column_type,is_nullable,column_default,extra,collation_name,generation_expression FROM information_schema.columns WHERE table_schema=? ORDER BY table_name,ordinal_position",
                    "SELECT table_name,index_name,non_unique,seq_in_index,column_name,sub_part,index_type FROM information_schema.statistics WHERE table_schema=? ORDER BY table_name,index_name,seq_in_index",
                    "SELECT constraint_name,check_clause FROM information_schema.check_constraints WHERE constraint_schema=? ORDER BY constraint_name")) {
                try (PreparedStatement query = management.prepareStatement(sql)) {
                    query.setString(1, source);
                    try (ResultSet rows = query.executeQuery()) { digestRows(digest, rows); }
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        }

        void requireOwnership() throws SQLException {
            guard(owned && database.matches("hr09_verify_[a-f0-9]{32}") && !source.equals(database), "Verified fixture ownership is required");
            guard(database.equals(management.getCatalog()), "Fixture management catalog must remain isolated");
            try (Statement statement = management.createStatement(); ResultSet rows = statement.executeQuery("SELECT owner_token FROM hr09_fixture_owner")) {
                guard(rows.next() && owner.equals(rows.getString(1)) && !rows.next(), "Fixture ownership marker mismatch");
            }
        }

        void trigger(String table, String operation, String condition, String actor) throws SQLException {
            requireOwnership();
            guard(tables.contains(table) && Set.of("INSERT", "UPDATE").contains(operation)
                    && condition.matches("NEW\\.[a-z_]+ = [0-9]+(?: AND NEW\\.[a-z_]+ = '[A-Z_]+')?")
                    && actor.matches("[a-z0-9-]+"), "Unsafe fault trigger definition");
            try (Statement statement = management.createStatement()) {
                statement.execute("CREATE TRIGGER " + database + ".hr09_fault AFTER " + operation + " ON " + database + "." + table
                        + " FOR EACH ROW BEGIN IF " + condition + " AND @hr09_actor = '" + actor
                        + "' THEN SIGNAL SQLSTATE '45000' SET MYSQL_ERRNO=1644, MESSAGE_TEXT='HR09_INJECTED_WRITE_FAILURE'; END IF; END");
            }
        }

        void dropTrigger() throws SQLException {
            requireOwnership();
            try (Statement statement = management.createStatement()) { statement.execute("DROP TRIGGER IF EXISTS " + database + ".hr09_fault"); }
        }

        @Override
        public void close() throws Exception {
            try {
                if (owned) {
                    requireOwnership();
                    try (Statement statement = management.createStatement()) { statement.execute("DROP DATABASE " + database); }
                    long schemas = metadataCount("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?", database);
                    long remainingTables = metadataCount("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=?", database);
                    long triggers = metadataCount("SELECT COUNT(*) FROM information_schema.triggers WHERE trigger_schema=?", database);
                    REPORT.put("cleanup", Map.of("schemas", schemas, "tables", remainingTables, "triggers", triggers, "ownershipVerified", true));
                    equal(0L, schemas + remainingTables + triggers, "Read-only metadata proves the owned database and triggers were removed");
                    REPORT.put("databaseDropped", true);
                    long sourceTables = metadataCount("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=? AND table_type='BASE TABLE'", source);
                    REPORT.put("runtimeTableCountAfter", sourceTables);
                    equal(374L, sourceTables, "Source table count remains exactly 374");
                    String after = schemaFingerprint();
                    REPORT.put("runtimeSchemaAfterSha256", after);
                    equal(sourceFingerprint, after, "Runtime schema metadata is unchanged");
                    System.out.println("CLEANUP database=" + database + " schemas=0 tables=0 triggers=0; runtime-tables=374 schema-sha256-unchanged=true.");
                } else if (created) {
                    throw new AssertionError("Ownership marker was not established; isolated database requires verified cleanup");
                }
            } finally { management.close(); }
        }
    }

    private static final class FixtureDataSource extends DriverManagerDataSource {
        final String database;
        final Set<String> committedActors = ConcurrentHashMap.newKeySet();

        FixtureDataSource(Isolation isolation) {
            super(isolation.url, isolation.username, isolation.password);
            database = isolation.database;
        }

        @Override
        public Connection getConnection() throws SQLException {
            Connection connection = super.getConnection();
            try {
                guard(database.equals(connection.getCatalog()), "Application connection escaped the isolated catalog");
                try (PreparedStatement session = connection.prepareStatement("SET @hr09_actor = ?")) {
                    session.setString(1, ACTOR.get());
                    session.execute();
                }
                return (Connection) Proxy.newProxyInstance(Connection.class.getClassLoader(), new Class<?>[]{Connection.class}, (proxy, method, values) -> {
                    if (Set.of("setCatalog", "setSchema").contains(method.getName())) guard(database.equals(values[0]), "Cannot switch fixture catalog");
                    if (Set.of("unwrap", "isWrapperFor").contains(method.getName())) {
                        if (method.getName().equals("isWrapperFor")) return false;
                        throw new SQLException("Unwrapping fixture connections is forbidden");
                    }
                    if (values != null && values.length > 0 && values[0] instanceof String sql
                            && Set.of("prepareStatement", "prepareCall", "nativeSQL").contains(method.getName())) validateSql(sql);
                    try {
                        Object result = method.invoke(connection, values);
                        if (method.getName().equals("commit") && ACTOR.get() != null) committedActors.add(ACTOR.get());
                        if (method.getName().equals("createStatement")) {
                            Statement statement = (Statement) result;
                            return Proxy.newProxyInstance(Statement.class.getClassLoader(), new Class<?>[]{Statement.class}, (statementProxy, operation, arguments) -> {
                                if (arguments != null && arguments.length > 0 && arguments[0] instanceof String sql) validateSql(sql);
                                try { return operation.invoke(statement, arguments); }
                                catch (InvocationTargetException failure) { throw failure.getCause(); }
                            });
                        }
                        return result;
                    } catch (InvocationTargetException failure) { throw failure.getCause(); }
                });
            } catch (Throwable failure) {
                connection.close();
                throw failure;
            }
        }

        void validateSql(String sql) {
            String normalized = sql.stripLeading().toUpperCase(Locale.ROOT);
            guard(normalized.matches("(?s)(SELECT|INSERT|UPDATE|DELETE|WITH|EXPLAIN)\\b.*") && !normalized.contains(";")
                    && !normalized.contains("CLOUD_FLOW_DB")
                    && !normalized.matches("(?s).*(?:INFORMATION_SCHEMA|PERFORMANCE_SCHEMA|MYSQL|SYS)\\s*\\..*"), "Application SQL may only access fixture business tables");
            guard(!normalized.matches("(?s).*(?:FROM|JOIN|UPDATE|INTO)\\s+`?[A-Z_][A-Z0-9_]*`?\\s*\\..*"), "Qualified cross-schema application SQL is forbidden");
        }
    }

    private record SqlTrace(String actor, String statement, long connection, String stage, int affected, boolean transaction) {}
    private record SqlFault(String actor, String statement, long connection, String state, int code, boolean intended) {}

    @Intercepts({
            @Signature(type = Executor.class, method = "update", args = {MappedStatement.class, Object.class}),
            @Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class})
    })
    public static final class Observer implements Interceptor {
        final List<SqlTrace> traces = new CopyOnWriteArrayList<>();
        final List<SqlFault> faults = new CopyOnWriteArrayList<>();
        final List<Gate> gates = new CopyOnWriteArrayList<>();

        @Override
        public Object intercept(Invocation invocation) throws Throwable {
            String actor = ACTOR.get();
            if (actor == null) return invocation.proceed();
            String statement = ((MappedStatement) invocation.getArgs()[0]).getId();
            Connection connection = ((Executor) invocation.getTarget()).getTransaction().getConnection();
            long connectionId;
            try (Statement query = connection.createStatement(); ResultSet rows = query.executeQuery("SELECT CONNECTION_ID()")) {
                rows.next(); connectionId = rows.getLong(1);
            }
            boolean transaction = TransactionSynchronizationManager.isActualTransactionActive() && !connection.getAutoCommit();
            if (invocation.getMethod().getName().equals("update") || statement.endsWith("Locked") || statement.endsWith(".lockEmployees")) {
                guard(transaction, "Service writes and locking reads must use an actual Spring JDBC transaction");
            }
            traces.add(new SqlTrace(actor, statement, connectionId, "before", -1, transaction));
            hit(actor, statement, false, connectionId);
            try {
                Object result = invocation.proceed();
                int affected = result instanceof Number number ? number.intValue() : result instanceof List<?> rows ? rows.size() : -1;
                traces.add(new SqlTrace(actor, statement, connectionId, "after", affected, transaction));
                hit(actor, statement, true, connectionId);
                return result;
            } catch (Throwable failure) {
                for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                    if (cause instanceof SQLException sql) {
                        faults.add(new SqlFault(actor, statement, connectionId, sql.getSQLState(), sql.getErrorCode(),
                                sql.getMessage() != null && sql.getMessage().contains("HR09_INJECTED_WRITE_FAILURE")));
                        break;
                    }
                }
                throw failure;
            }
        }

        void hit(String actor, String statement, boolean after, long connection) throws InterruptedException {
            for (Gate gate : gates) {
                if (gate.actor.equals(actor) && statement.endsWith(gate.suffix) && gate.after == after
                        && (!gate.afterFault || faults.stream().anyMatch(fault -> fault.actor().equals(actor) && fault.intended()))
                        && gate.hits.compareAndSet(0, 1)) gate.hit(connection);
            }
        }

        Gate gate(String actor, String suffix, boolean after, boolean afterFault) {
            Gate gate = new Gate(actor, suffix, after, afterFault);
            gates.add(gate);
            return gate;
        }

        long writes(String actor, String suffix) {
            return traces.stream().filter(trace -> trace.actor().equals(actor) && trace.statement().endsWith(suffix)
                    && trace.stage().equals("after") && trace.affected() == 1).count();
        }

        void intendedFault(String actor) {
            equal(1L, faults.stream().filter(fault -> fault.actor().equals(actor) && fault.intended()
                    && "45000".equals(fault.state()) && fault.code() == 1644).count(), "Actual Mapper receives exactly one intended MySQL 1644 / SQLState 45000 failure");
            check(faults.stream().filter(fault -> fault.actor().equals(actor)).allMatch(SqlFault::intended), "No unrelated SQL failure is accepted as injected rollback evidence");
        }

        void releaseAll() { gates.forEach(gate -> gate.release.countDown()); }
    }

    private static final class Gate {
        final String actor;
        final String suffix;
        final boolean after;
        final boolean afterFault;
        final AtomicInteger hits = new AtomicInteger();
        final CountDownLatch arrived = new CountDownLatch(1);
        final CountDownLatch release = new CountDownLatch(1);
        volatile long connection;

        Gate(String actor, String suffix, boolean after, boolean afterFault) {
            this.actor = actor; this.suffix = suffix; this.after = after; this.afterFault = afterFault;
        }

        void hit(long connection) throws InterruptedException {
            this.connection = connection;
            arrived.countDown();
            guard(release.await(25, TimeUnit.SECONDS), "Timed out releasing an actual Mapper statement gate");
        }

        void await(Future<?> worker) throws Exception {
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(20);
            while (!arrived.await(25, TimeUnit.MILLISECONDS)) {
                if (worker.isDone()) { worker.get(); throw new AssertionError("Consumer finished before the expected Mapper gate"); }
                guard(System.nanoTime() < deadline, "Expected actual Mapper gate was not reached");
            }
            check(connection > 0, "Gate observes a physical MySQL connection ID");
        }
    }

    private static final class Harness implements AutoCloseable {
        final Isolation isolation;
        final FixtureDataSource dataSource;
        final JdbcTemplate jdbc;
        final Observer observer = new Observer();
        final StaticApplicationContext context = new StaticApplicationContext();
        final Map<Class<?>, Object> beans = new HashMap<>();
        final ValidatorFactory validators = Validation.buildDefaultValidatorFactory();
        final ExecutorService workers = Executors.newFixedThreadPool(2);
        final SqlSessionTemplate sessions;
        final LocalCache cache;
        final AtomicLong nextId = new AtomicLong(90900000L);
        final int rounds = Integer.parseInt(environment("HR09_RACE_ROUNDS"));
        final HrShiftRequestService shifts;
        final HrOvertimeSettlementService settlements;
        final HrHSupport helper;
        final HrHCipherService cipher;

        Harness(Isolation isolation) throws Exception {
            this.isolation = isolation;
            dataSource = new FixtureDataSource(isolation);
            jdbc = new JdbcTemplate(dataSource);
            EncryptorProperties encryption = new EncryptorProperties();
            encryption.setEnabled(true);
            encryption.setAesKey(UUID.randomUUID().toString().replace("-", ""));
            encryption.validate();
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
            configuration.addMappers("com.cloudflow.hr.mapper");
            configuration.addMappers("com.cloudflow.common.holiday.mapper");
            configuration.addMappers("com.cloudflow.common.event.outbox");
            List<Resource> mapperResources = new ArrayList<>();
            for (String root : environment("HR09_MAPPER_ROOTS").split(java.util.regex.Pattern.quote(File.pathSeparator))) {
                try (Stream<Path> paths = Files.walk(Path.of(root))) {
                    paths.filter(path -> path.toString().endsWith(".xml")).sorted().forEach(path -> mapperResources.add(new FileSystemResource(path)));
                }
            }
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(dataSource);
            factory.setConfiguration(configuration);
            factory.setGlobalConfig(global);
            factory.setMapperLocations(mapperResources.toArray(Resource[]::new));
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor(),
                    new MybatisEncryptInterceptor(encryption), new MybatisDecryptInterceptor(encryption), observer);
            sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            guard(com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.getGlobalConfig(configuration) == global
                    && com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.getMetaObjectHandler(configuration).isPresent(), "Real auto-fill must precede Mapper metadata initialization");
            for (Class<?> mapper : configuration.getMapperRegistry().getMappers()) put(mapper, sessions.getMapper(mapper));
            context.refresh();
            put(ApplicationContext.class, context);
            put(ObjectMapper.class, JSON);
            put(PlatformTransactionManager.class, new DataSourceTransactionManager(dataSource));
            put(EncryptorProperties.class, encryption);
            put(Validator.class, validators.getValidator());
            put(RedissonClient.class, localLocks());
            cache = new LocalCache(this);
            put(RedisCache.class, cache);
            SysConfigHelper settings = new SysConfigHelper();
            Field redis = SysConfigHelper.class.getDeclaredField("redisCache");
            redis.setAccessible(true);
            redis.set(settings, cache);
            put(SysConfigHelper.class, settings);
            put(RuntimeSysConfigService.class, new RuntimeSysConfigService(settings));
            put(WorkflowServiceClient.class, closedEdge(WorkflowServiceClient.class));
            put(BusinessRuleClient.class, closedEdge(BusinessRuleClient.class));
            register(HrRuleSupport.class);
            register(HrTypedCrudService.class);
            OutboxPublisher publisher = register(OutboxPublisher.class);
            put(MessageSender.class, new MessageAutoConfiguration().messageSender(publisher, JSON, context.getEnvironment()));
            put(HolidayCalendarService.class, new HolidayCalendarServiceImpl(mapper(HolidayCalendarMapper.class),
                    mapper(HolidayDateMapper.class), mapper(HolidayResolverMapper.class), cache));
            register(HrLeaveDayCalculator.class);
            helper = register(HrHSupport.class);
            cipher = register(HrHCipherService.class);
            register(HrRuleWorkflowService.class);
            register(HrHEventService.class);
            register(HrOvertimeTypeService.class);
            register(HrPayrollConfigurationService.class);
            register(HrPayrollCalculationService.class);
            register(HrLeaveBusinessService.class);
            register(HrHConfigurationGuard.class);
            register(HrAttendanceBusinessService.class);
            shifts = register(HrShiftRequestService.class);
            settlements = register(HrOvertimeSettlementService.class);
            guard(rounds >= 1 && rounds <= 10, "Race round count must be explicitly bounded");
            REPORT.put("raceRoundsPerGroup", rounds);
            REPORT.put("expectedGroupCount", 16);
            REPORT.put("expectedRealDatabaseRaceCount", 6 * rounds);
            Path compiledRoot = Path.of(Hr09DatabaseChecks.class.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath().normalize();
            guard(compiledRoot.getFileName().toString().equals("classes") && compiledRoot.getParent().getFileName().toString().matches("hr09-db-[a-f0-9]{32}"), "Verifier must run from its independent compilation directory");
            List<Class<?>> currentClasses = List.of(HrShiftRequestService.class, HrOvertimeSettlementService.class, HrHSupport.class,
                    HrRuleSupport.class, HrLeaveBusinessService.class, HrPayrollCalculationService.class, HrOvertimeTypeService.class,
                    HrHConfigurationGuard.class, HrHCipherService.class, HrHMapper.class, HrScheduleAssignmentMapper.class,
                    HrLeaveLedgerMapper.class, HrCompChangeMapper.class, MybatisPlusConfig.class, MyMetaObjectHandler.class,
                    MybatisEncryptInterceptor.class, MybatisDecryptInterceptor.class, OutboxPublisher.class, MessageAutoConfiguration.class);
            for (Class<?> currentClass : currentClasses) equal(compiledRoot, Path.of(currentClass.getProtectionDomain().getCodeSource().getLocation().toURI()).toAbsolutePath().normalize(), "Exercised HR and shared classes load freshly compiled bytecode rather than target or internal JARs");
            REPORT.put("verifiedCurrentSourceClasses", currentClasses.stream().map(Class::getName).toList());
            System.out.println("COMPONENTS real HR services/MyBatis XML/Spring transactions/encryption/audit/message-Outbox; isolated local Redis edge, no online workflow or delivery.");
        }

        void put(Class<?> type, Object value) {
            beans.put(type, value);
            context.getBeanFactory().registerSingleton(Introspector.decapitalize(type.getSimpleName()), value);
        }

        <Value> Value bean(Class<Value> type) { return type.cast(Objects.requireNonNull(beans.get(type), type.getSimpleName())); }
        <Value> Value mapper(Class<Value> type) { return sessions.getMapper(type); }

        <Value> Value register(Class<Value> type) throws Exception {
            Constructor<?> constructor = type.getConstructors()[0];
            Class<?>[] parameterTypes = constructor.getParameterTypes();
            Object[] arguments = new Object[parameterTypes.length];
            for (int index = 0; index < arguments.length; index++) {
                Class<?> parameter = parameterTypes[index];
                if (parameter == ObjectProvider.class) {
                    Class<?> provided = (Class<?>) ((ParameterizedType) constructor.getGenericParameterTypes()[index]).getActualTypeArguments()[0];
                    arguments[index] = context.getBeanFactory().getBeanProvider(provided);
                } else arguments[index] = beans.get(parameter);
                if (parameter.getSimpleName().endsWith("Mapper")) guard(arguments[index] != null, "Every business Mapper must be real and registered");
            }
            Object instance = constructor.newInstance(arguments);
            ProxyFactory proxy = new ProxyFactory(instance);
            proxy.setProxyTargetClass(true);
            proxy.addAdvice(new TransactionInterceptor(bean(PlatformTransactionManager.class), new AnnotationTransactionAttributeSource()));
            Value result = type.cast(proxy.getProxy());
            put(type, result);
            return result;
        }

        List<Map<String, Object>> read(String sql, Object... arguments) throws SQLException {
            try (Connection connection = dataSource.getConnection()) {
                connection.setReadOnly(true);
                try (PreparedStatement query = connection.prepareStatement(sql)) {
                    for (int index = 0; index < arguments.length; index++) query.setObject(index + 1, arguments[index]);
                    try (ResultSet rows = query.executeQuery()) {
                        List<Map<String, Object>> result = new ArrayList<>();
                        while (rows.next()) {
                            Map<String, Object> row = new LinkedHashMap<>();
                            for (int index = 1; index <= rows.getMetaData().getColumnCount(); index++) row.put(rows.getMetaData().getColumnLabel(index), rows.getObject(index));
                            result.add(row);
                        }
                        return result;
                    }
                }
            }
        }

        long count(String sql, Object... arguments) throws SQLException {
            return ((Number) read(sql, arguments).get(0).values().iterator().next()).longValue();
        }

        String snapshot(Case fixture) throws Exception {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            try (Connection connection = dataSource.getConnection()) {
                connection.setReadOnly(true);
                for (String table : List.of("hr_schedule_assignment", "hr_leave_ledger", "hr_leave_quota", "hr_comp_change", "hr_salary_slip", "hr_payroll_correction")) {
                    digest.update((table + "\n").getBytes(StandardCharsets.UTF_8));
                    try (PreparedStatement query = connection.prepareStatement(FixtureInspectionSql.query("tenantRows", table))) {
                        query.setLong(1, fixture.tenant());
                        try (ResultSet rows = query.executeQuery()) { digestRows(digest, rows); }
                    }
                }
            }
            return HexFormat.of().formatHex(digest.digest());
        }

        void run() {
            group("SWAP second assignment insert rollback", () -> rollback("SWAP", "second"));
            group("SWAP final parent update rollback", () -> rollback("SWAP", "finish"));
            group("COMPENSATORY ledger insert rollback", () -> rollback("COMPENSATORY", "ledger"));
            group("COMPENSATORY quota update rollback", () -> rollback("COMPENSATORY", "quota"));
            group("COMPENSATORY final parent update rollback", () -> rollback("COMPENSATORY", "finish"));
            group("PAY change insert rollback", () -> rollback("PAY", "change"));
            group("PAY final parent update rollback", () -> rollback("PAY", "finish"));
            for (String mode : List.of("SWAP", "COMPENSATORY", "PAY")) {
                group(mode + " duplicate consumers", () -> { for (int round = 1; round <= rounds; round++) duplicate(mode, round); });
                group(mode + " stale failure cannot overwrite success", () -> { for (int round = 1; round <= rounds; round++) staleFailure(mode, round); });
            }
            group("H schedule and configuration source protection", this::scheduleProtection);
            group("H compensatory ledger source protection", this::ledgerProtection);
            group("H payroll change source protection", this::payProtection);
            equal(16, GROUPS.size(), "All required verification groups execute");
            equal(6 * rounds, RACES.size(), "Every configured competition round observes an actual database lock wait");
            check(RACES.stream().allMatch(race -> Boolean.TRUE.equals(race.get("passed"))), "All observed database competitions satisfy their result assertions");
        }

        void group(String label, CheckedAction action) {
            int before = ASSERTIONS.get();
            int racesBefore = RACES.size();
            Map<String, Object> result = new LinkedHashMap<>();
            result.put("name", label);
            try {
                action.run();
                result.put("passed", true);
            } catch (Throwable failure) {
                result.put("passed", false);
                result.put("failure", safeFailure(failure));
                System.err.println("FAIL GROUP " + label + ": " + safeFailure(failure));
            } finally {
                observer.releaseAll();
                ACTOR.remove(); LOCK_DOMAIN.remove(); UserContext.clear(); TenantContext.clear();
                result.put("assertions", ASSERTIONS.get() - before);
                result.put("realDatabaseRaces", RACES.size() - racesBefore);
                GROUPS.add(result);
                System.out.println("GROUP " + label + " passed=" + result.get("passed") + " assertions=" + result.get("assertions") + " real-db-races=" + result.get("realDatabaseRaces"));
            }
        }

        void fault(Request request, String stage, String actor) throws SQLException {
            String table;
            String operation = "INSERT";
            String condition = "NEW.tenant_id = " + request.fixture().tenant();
            if (stage.equals("finish")) {
                table = request.table();
                operation = "UPDATE";
                condition = "NEW.request_id = " + request.id() + " AND NEW." + request.stateColumn()
                        + " = '" + (request.mode().equals("SWAP") ? "APPLIED" : "SETTLED") + "'";
            } else if (stage.equals("second")) {
                table = "hr_schedule_assignment";
                condition = "NEW.target_id = " + request.fixture().peer();
            } else if (stage.equals("quota")) {
                table = "hr_leave_quota";
                operation = "UPDATE";
            } else table = stage.equals("ledger") ? "hr_leave_ledger" : "hr_comp_change";
            isolation.trigger(table, operation, condition, actor);
        }

        void rollback(String mode, String stage) throws Exception {
            Case fixture = seed();
            Request previous = null;
            String previousParent = null;
            if (!mode.equals("SWAP")) {
                previous = request(fixture, mode);
                LocalDate priorWork = fixture.date().minusMonths(2).minusDays(1);
                jdbc.update("UPDATE hr_overtime_request SET work_date=?,attendance_date=?,start_time=?,end_time=? WHERE request_id=?", priorWork, priorWork, priorWork.atTime(18, 0), priorWork.atTime(19, 0), previous.id());
                execute(previous, "previous-" + previous.id(), false);
                assertSuccess(previous);
                previousParent = JSON.writeValueAsString(parent(previous));
            }
            Request request = request(fixture, mode);
            String actor = "fault-" + request.id();
            String before = snapshot(fixture);
            Map<String, Object> parentBefore = parent(request);
            int invalidations = cache.invalidations.get();
            fault(request, stage, actor);
            try {
                execute(request, actor, false);
                observer.intendedFault(actor);
                Map<String, Object> row = parent(request);
                equal("FAILED", row.get(request.stateColumn()), "Failed transaction records an explanatory failure rather than a false success");
                equal("APPROVED", row.get("status"), "Write failure preserves the approval decision");
                equal(1, ((Number) row.get("version")).intValue(), "Failure recording commits a single version increment after rollback");
                equal(mode.equals("SWAP") ? "SHIFT_APPLY_FAILED" : "SETTLEMENT_FAILED", row.get("last_error_code"), "Only the safe business failure code is persisted");
                equal(before, snapshot(fixture), "All existing schedules, ledgers, quotas, payroll changes, slips and corrections survive unchanged");
                equal(parentBefore.get(mode.equals("SWAP") ? "schedule_snapshot" : "calculation_snapshot"), row.get(mode.equals("SWAP") ? "schedule_snapshot" : "calculation_snapshot"), "Failed transaction does not partially replace frozen calculation or schedule evidence");
                equal(invalidations, cache.invalidations.get(), "Rolled-back assignment work does not invalidate the cache");
                if (mode.equals("SWAP")) {
                    equal(0L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE source_shift_request_id=?", request.id()), "SWAP failure leaves no one-sided exchange");
                    check(row.get("applied_time") == null, "Failed SWAP does not acquire an applied timestamp");
                    equal(stage.equals("second") ? 1L : 2L, observer.writes(actor, ".HrScheduleAssignmentMapper.insert"), "Actual first assignment insert succeeds before the injected later failure");
                    identity(fixture);
                    equal(fixture.shift(), helper.slot(fixture.employee(), fixture.date()).shift().getId(), "Applicant retains the original effective shift after rollback");
                    equal(fixture.peerShift(), helper.slot(fixture.peer(), fixture.date()).shift().getId(), "Peer retains the original effective shift after rollback");
                } else {
                    equal(0, integer(row.get("settled_flag")), "Failed accounting does not set settled_flag");
                    check(row.get("settle_time") == null && row.get("leave_ledger_id") == null && row.get("comp_change_id") == null && row.get("payroll_correction_id") == null, "Failed accounting leaves no timestamp or partial result pointers");
                    equal(0L, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE source_event_key=?", request.eventKey()), "Failed request leaves no partial compensatory source");
                    equal(0L, count("SELECT COUNT(*) FROM hr_comp_change WHERE source_biz_type='HR_OVERTIME' AND source_biz_id=?", Long.toString(request.id())), "Failed request leaves no partial PAY source");
                    if (!stage.equals("ledger") && mode.equals("COMPENSATORY")) equal(1L, observer.writes(actor, ".HrLeaveLedgerMapper.insert"), "Real ledger insert precedes the quota or parent failure");
                    if (stage.equals("finish") && mode.equals("COMPENSATORY")) equal(1L, observer.writes(actor, ".HrLeaveQuotaMapper.updateById"), "Real quota update precedes the final parent failure");
                    if (stage.equals("finish") && mode.equals("PAY")) equal(1L, observer.writes(actor, ".HrHMapper.insertOvertimeChange"), "Real encrypted PAY insert precedes the final parent failure");
                    equal(previousParent, JSON.writeValueAsString(parent(previous)), "A previously settled request remains byte-for-byte unchanged");
                }
                equal(0L, count("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_id=? AND operation_type IN ('SETTLED','APPLIED','LEAVE_CREDIT')", fixture.tenant(), request.id()), "Success-side audit writes roll back with the failed business transaction");
                equal(1L, count("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_id=? AND operation_type=?", fixture.tenant(), request.id(), mode.equals("SWAP") ? "APPLICATION_FAILED" : "SETTLEMENT_FAILURE"), "Separate guarded failure transaction commits one failure audit");
                SqlFault injected = observer.faults.stream().filter(error -> error.actor().equals(actor) && error.intended()).findFirst().orElseThrow();
                check(observer.traces.stream().filter(trace -> trace.actor().equals(actor) && trace.stage().equals("after")
                        && (trace.statement().endsWith(".HrScheduleAssignmentMapper.insert") || trace.statement().endsWith(".HrLeaveLedgerMapper.insert")
                        || trace.statement().endsWith(".HrLeaveQuotaMapper.updateById") || trace.statement().endsWith(".HrHMapper.insertOvertimeChange")))
                        .allMatch(trace -> trace.transaction() && trace.connection() == injected.connection()), "Every successful result write and the SQL fault share one physical transaction");
            } finally { isolation.dropTrigger(); }
        }

        Future<?> consumer(Request request, String actor) {
            return workers.submit(() -> { execute(request, actor, true); return null; });
        }

        void duplicate(String mode, int round) throws Exception {
            Request request = request(seed(), mode);
            String owner = "duplicate-owner-" + request.id();
            String waiter = "duplicate-waiter-" + request.id();
            Gate ownerGate = observer.gate(owner, request.lockStatement(), true, false);
            String firstLock = mode.equals("SWAP") ? ".HrHMapper.lockEmployees"
                    : mode.equals("PAY") ? ".HrHMapper.payrollPeriodLocked" : ".HrLeavePeriodMapper.selectLocked";
            String table = mode.equals("SWAP") ? "hr_employee" : mode.equals("PAY") ? "hr_payroll_period" : "hr_leave_period";
            Gate waiterGate = observer.gate(waiter, firstLock, false, false);
            Future<?> ownerWork = consumer(request, owner);
            Future<?> waiterWork = null;
            Map<String, Object> evidence = null;
            try {
                ownerGate.await(ownerWork);
                waiterWork = consumer(request, waiter);
                waiterGate.await(waiterWork);
                waiterGate.release.countDown();
                evidence = waitForDatabaseLock(mode + " duplicate", round, table, ownerGate, waiterGate, ownerWork, waiterWork);
                equal("PENDING", parent(request).get(request.stateColumn()), "Separate read-only connection sees no uncommitted success while consumers overlap");
                ownerGate.release.countDown();
                ownerWork.get(40, TimeUnit.SECONDS);
                waiterWork.get(40, TimeUnit.SECONDS);
                assertSuccess(request);
                equal(0L, observer.faults.stream().filter(error -> error.actor().equals(owner) || error.actor().equals(waiter)).count(), "Duplicate consumers complete without SQL errors");
                String insert = mode.equals("SWAP") ? ".HrScheduleAssignmentMapper.insert" : mode.equals("PAY") ? ".HrHMapper.insertOvertimeChange" : ".HrLeaveLedgerMapper.insert";
                equal(mode.equals("SWAP") ? 2L : 1L, observer.writes(owner, insert) + observer.writes(waiter, insert), "Concurrent consumers perform exactly the unique required result writes");
                equal(0L, observer.writes(waiter, insert), "Second connection rereads the committed result without reapplying it");
                evidence.put("passed", true);
            } finally {
                observer.releaseAll();
                finishWorkers(ownerWork, waiterWork);
            }
        }

        void staleFailure(String mode, int round) throws Exception {
            Request request = request(seed(), mode);
            String failing = "stale-failure-" + request.id();
            String winner = "stale-winner-" + request.id();
            Gate staleGate = observer.gate(failing, request.lockStatement(), false, true);
            Gate winnerGate = observer.gate(winner, request.lockStatement(), true, false);
            fault(request, mode.equals("SWAP") ? "second" : mode.equals("PAY") ? "change" : "ledger", failing);
            Future<?> failedWork = consumer(request, failing);
            Future<?> winnerWork = null;
            try {
                staleGate.await(failedWork);
                observer.intendedFault(failing);
                equal("PENDING", parent(request).get(request.stateColumn()), "Rolled-back failure has not yet changed the committed pending request");
                winnerWork = consumer(request, winner);
                winnerGate.await(winnerWork);
                staleGate.release.countDown();
                Map<String, Object> evidence = waitForDatabaseLock(mode + " stale failure", round, request.table(), winnerGate, staleGate, winnerWork, failedWork);
                winnerGate.release.countDown();
                winnerWork.get(40, TimeUnit.SECONDS);
                failedWork.get(40, TimeUnit.SECONDS);
                assertSuccess(request);
                equal(0L, observer.writes(failing, mode.equals("SWAP") ? ".HrShiftRequestMapper.updateById" : ".HrOvertimeRequestMapper.updateById"), "Expired failure handler performs no parent update after the winning commit");
                equal(0L, count("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_id=? AND operation_type IN ('APPLICATION_FAILED','SETTLEMENT_FAILURE')", request.fixture().tenant(), request.id()), "Expired failure cannot add a false failure audit");
                check(observer.traces.stream().anyMatch(trace -> trace.actor().equals(failing) && trace.connection() == staleGate.connection && trace.statement().endsWith(request.lockStatement()) && trace.stage().equals("after")), "Stale handler actually rereads the locked database row after waiting");
                evidence.put("passed", true);
            } finally {
                observer.releaseAll();
                try { finishWorkers(failedWork, winnerWork); }
                finally { isolation.dropTrigger(); }
            }
        }

        Map<String, Object> waitForDatabaseLock(String name, int round, String table, Gate owner, Gate waiter, Future<?> ownerWork, Future<?> waiterWork) throws Exception {
            check(owner.connection > 0 && waiter.connection > 0 && owner.connection != waiter.connection, "Competition uses two distinct physical MySQL connections");
            String sql = "SELECT COUNT(*) FROM performance_schema.data_lock_waits waits "
                    + "JOIN performance_schema.data_locks requested ON requested.ENGINE=waits.ENGINE AND requested.ENGINE_LOCK_ID=waits.REQUESTING_ENGINE_LOCK_ID "
                    + "JOIN performance_schema.data_locks blocking ON blocking.ENGINE=waits.ENGINE AND blocking.ENGINE_LOCK_ID=waits.BLOCKING_ENGINE_LOCK_ID "
                    + "JOIN performance_schema.threads requester ON requester.THREAD_ID=requested.THREAD_ID "
                    + "JOIN performance_schema.threads holder ON holder.THREAD_ID=blocking.THREAD_ID "
                    + "WHERE requested.OBJECT_SCHEMA=? AND blocking.OBJECT_SCHEMA=? AND requested.OBJECT_NAME=? AND requester.PROCESSLIST_ID=? AND holder.PROCESSLIST_ID=?";
            long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(15);
            while (System.nanoTime() < deadline) {
                try (PreparedStatement query = isolation.management.prepareStatement(sql)) {
                    query.setString(1, isolation.database); query.setString(2, isolation.database); query.setString(3, table);
                    query.setLong(4, waiter.connection); query.setLong(5, owner.connection);
                    try (ResultSet rows = query.executeQuery()) {
                        rows.next();
                        if (rows.getLong(1) > 0) {
                            check(!ownerWork.isDone() && !waiterWork.isDone(), "Both real transactions overlap during a directly observed InnoDB row-lock wait");
                            Map<String, Object> evidence = new LinkedHashMap<>();
                            evidence.put("name", name); evidence.put("round", round); evidence.put("table", table);
                            evidence.put("ownerConnection", owner.connection); evidence.put("waiterConnection", waiter.connection);
                            evidence.put("observedInPerformanceSchema", true); evidence.put("passed", false);
                            RACES.add(evidence);
                            return evidence;
                        }
                    }
                }
                if (ownerWork.isDone()) { ownerWork.get(); throw new AssertionError("Owner committed before real database contention was observed"); }
                if (waiterWork.isDone()) { waiterWork.get(); throw new AssertionError("Waiter completed without the required real database row-lock wait"); }
                Thread.sleep(25);
            }
            throw new AssertionError("No actual InnoDB row-lock wait was observed; concurrent Java scheduling alone does not count");
        }

        void finishWorkers(Future<?> first, Future<?> second) throws Exception {
            Throwable failure = null;
            for (Future<?> worker : Arrays.asList(first, second)) {
                if (worker != null) try { worker.get(45, TimeUnit.SECONDS); }
                catch (Throwable error) { if (failure == null) failure = error; }
            }
            if (failure != null) throw new AssertionError("A database consumer failed or did not terminate", failure);
        }

        void scheduleProtection() throws Exception {
            Case fixture = seed();
            Request request = request(fixture, "SWAP");
            execute(request, "protected-swap-" + request.id(), false);
            assertSuccess(request);
            identity(fixture);
            HrScheduleAssignment source = mapper(HrHMapper.class).sourceAssignments(fixture.tenant(), request.id()).get(0);
            HrAttendanceBusinessService attendance = bean(HrAttendanceBusinessService.class);
            String before = snapshot(fixture);
            as(fixture, "protect-schedule-" + request.id(), false, () -> {
                HrScheduleAssignmentPayload payload = JSON.convertValue(source, HrScheduleAssignmentPayload.class);
                payload.setSourceShiftRequestId(null);
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.saveSchedule(source.getId(), payload));
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.deleteConfiguration("schedule", source.getId()));
                HrShiftPayload shift = JSON.convertValue(mapper(HrShiftMapper.class).selectById(source.getShiftId()), HrShiftPayload.class);
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.saveShift(source.getShiftId(), shift));
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.deleteConfiguration("shift", source.getShiftId()));
                HrAttendanceRulePayload rule = JSON.convertValue(mapper(HrAttendanceRuleMapper.class).selectById(source.getRuleId()), HrAttendanceRulePayload.class);
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.saveRule(source.getRuleId(), rule));
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.deleteConfiguration("rule", source.getRuleId()));
                payload.setId(null);
                expectCode("H_SCHEDULE_IMMUTABLE", () -> attendance.saveSchedule(null, payload));
                payload.setSourceShiftRequestId(request.id());
                expectCode("H_SOURCE_SERVER_ONLY", () -> attendance.saveSchedule(null, payload));
            });
            equal(before, snapshot(fixture), "Generic writes cannot mutate or cover generated H assignments and their configuration");
            equal(1L, observer.writes("protect-schedule-" + request.id(), ".HrScheduleAssignmentMapper.insert"), "Generic covering insert actually reaches MySQL and is rolled back by source validation");
            Case reserved = seed();
            Request pending = request(reserved, "SWAP");
            as(reserved, "protect-pending-" + pending.id(), false, () -> {
                HrScheduleAssignmentPayload existing = JSON.convertValue(mapper(HrScheduleAssignmentMapper.class).selectById(reserved.peerAssignment()), HrScheduleAssignmentPayload.class);
                expectCode("H_CONFIGURATION_RESERVED", () -> attendance.saveSchedule(reserved.peerAssignment(), existing));
                expectCode("H_CONFIGURATION_RESERVED", () -> attendance.deleteConfiguration("schedule", reserved.peerAssignment()));
            });
            equal("PENDING", parent(pending).get("application_status"), "Pending snapshot remains reserved without pretending it was applied");
            Case ordinary = seed();
            long[] ordinaryId = new long[1];
            as(ordinary, "ordinary-schedule-" + ordinary.tenant(), false, () -> {
                HrScheduleAssignmentPayload payload = new HrScheduleAssignmentPayload();
                payload.setTargetType("EMPLOYEE"); payload.setTargetId(ordinary.employee()); payload.setShiftId(ordinary.shift()); payload.setRuleId(ordinary.rule());
                payload.setScheduleDate(ordinary.date().plusMonths(2)); payload.setEffectiveStart(ordinary.date().plusMonths(2)); payload.setEffectiveEnd(ordinary.date().plusMonths(2)); payload.setStatus("PUBLISHED");
                ordinaryId[0] = attendance.saveSchedule(null, payload);
                payload.setTargetName("HR09 ordinary update");
                attendance.saveSchedule(ordinaryId[0], payload);
                equal(1L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE tenant_id=? AND id=? AND source_shift_request_id IS NULL", ordinary.tenant(), ordinaryId[0]), "Ordinary no-H schedule create and update still persist");
                attendance.deleteConfiguration("schedule", ordinaryId[0]);
            });
            equal(0L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE id=?", ordinaryId[0]), "Ordinary no-H schedule deletion still works");
        }

        void ledgerProtection() throws Exception {
            Case fixture = seed();
            Request request = request(fixture, "COMPENSATORY");
            execute(request, "protected-credit-" + request.id(), false);
            assertSuccess(request);
            long ledger = ((Number) parent(request).get("leave_ledger_id")).longValue();
            String before = snapshot(fixture);
            as(fixture, "protect-ledger-" + request.id(), false,
                    () -> expectCode("OVERTIME_SOURCE_IMMUTABLE", () -> bean(HrLeaveBusinessService.class).reverseLedger(ledger, "HR09 rejected manual reversal")));
            equal(before, snapshot(fixture), "Generic reversal cannot change H ledger or quota");
            equal(0L, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE reversal_of_id=?", ledger), "Protected H credit has no manual reversal row");
            execute(request, "protected-credit-replay-" + request.id(), false);
            assertSuccess(request);
        }

        void payProtection() throws Exception {
            Case fixture = seed();
            Request request = request(fixture, "PAY");
            execute(request, "protected-pay-" + request.id(), false);
            assertSuccess(request);
            long change = ((Number) parent(request).get("comp_change_id")).longValue();
            String before = snapshot(fixture);
            HrTypedCrudService crud = bean(HrTypedCrudService.class);
            as(fixture, "protect-pay-" + request.id(), false, () -> {
                expectCode("OVERTIME_SOURCE_IMMUTABLE", () -> crud.update(HrCompChange.class, change, Map.of("reason", "HR09 rejected manual change")));
                expectCode("OVERTIME_SOURCE_IMMUTABLE", () -> crud.updateProperties(HrCompChange.class, change, Map.of("status", "CANCELLED")));
                expectCode("OVERTIME_SOURCE_IMMUTABLE", () -> crud.delete(HrCompChange.class, change));
                expectCode("OVERTIME_SOURCE_IMMUTABLE", () -> crud.create(HrCompChange.class, Map.of("sourceBizType", "HR_OVERTIME", "sourceBizId", Long.toString(request.id()))));
            });
            equal(before, snapshot(fixture), "Generic create/update/status/delete cannot tamper with H PAY results");
            execute(request, "protected-pay-replay-" + request.id(), false);
            assertSuccess(request);
        }

        Case seed() throws Exception {
            long base = nextId.addAndGet(1000);
            LocalDate date = HrHSupport.today().plusDays(14);
            while (date.getDayOfWeek().getValue() > 5) date = date.plusDays(1);
            Case fixture = new Case(base, base + 1, base + 2, base + 3, base + 4, base + 5, base + 6,
                    base + 7, base + 8, base + 9, base + 10, base + 11, base + 12, base + 13, base + 14, base + 19, date);
            identity(fixture);
            jdbc.update("INSERT INTO sys_config(tenant_id,config_name,config_key,config_value) VALUES(?,?,?,?)", base, "HR09 fixture rest policy", "sys.hr.shift.minimumRestMinutes", "0");
            jdbc.update("INSERT INTO sys_holiday_calendar(calendar_id,tenant_id,calendar_code,calendar_name,default_flag,weekly_rest_days,status) VALUES(?,?,?, ?,1,'6,7','ENABLED')",
                    fixture.calendar(), base, "HR09-" + base, "HR09 fixture calendar");
            jdbc.update("INSERT INTO sys_dept(dept_id,tenant_id,dept_name,holiday_calendar_id) VALUES(?,?,?,?)", fixture.department(), base, "HR09 fixture department", fixture.calendar());
            for (long employee : List.of(fixture.employee(), fixture.peer())) {
                jdbc.update("INSERT INTO sys_user(user_id,tenant_id,dept_id,user_name,nick_name,status,deleted) VALUES(?,?,?,?,?,'0',0)", employee, base, fixture.department(), "hr09-" + employee, "HR09 fixture user");
                jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender,employee_status,hire_date,user_id,dept_id) VALUES(?,?,?,?,?,'ACTIVE',?,?,?)",
                        employee, base, "HR09-" + employee, "HR09 fixture employee", "MALE", date.minusYears(1), employee, fixture.department());
            }
            for (int index = 0; index < 2; index++) {
                long shift = index == 0 ? fixture.shift() : fixture.peerShift();
                long rule = index == 0 ? fixture.rule() : fixture.peerRule();
                long employee = index == 0 ? fixture.employee() : fixture.peer();
                long assignment = index == 0 ? fixture.assignment() : fixture.peerAssignment();
                jdbc.update("INSERT INTO hr_shift(id,tenant_id,shift_code,shift_name,start_time,end_time,break_minutes,work_minutes,holiday_calendar_id) VALUES(?,?,?,?,?,?,0,480,?)",
                        shift, base, "HR09-" + shift, "HR09 fixture shift", LocalTime.of(9 + index, 0), LocalTime.of(17 + index, 0), fixture.calendar());
                jdbc.update("INSERT INTO hr_attendance_rule(id,tenant_id,rule_code,rule_name,shift_id,config_json) VALUES(?,?,?,?,?,'{}')", rule, base, "HR09-" + rule, "HR09 fixture rule", shift);
                jdbc.update("INSERT INTO hr_schedule_assignment(id,tenant_id,target_type,target_id,shift_id,rule_id,effective_start,effective_end,status) VALUES(?,?,'EMPLOYEE',?,?,?,?,?,'PUBLISHED')",
                        assignment, base, employee, shift, rule, date.minusDays(30), date.plusDays(30));
            }
            LocalDate workDate = date.minusMonths(2);
            jdbc.update("INSERT INTO hr_leave_type(id,tenant_id,leave_code,leave_name,need_quota,unit,compensatory_flag,allow_over_allocation_flag,status) VALUES(?,?,?, ?,1,'HOUR',1,1,1)", fixture.leaveType(), base, "HR09-" + base, "HR09 fixture compensatory leave");
            jdbc.update("INSERT INTO hr_leave_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,?,?,'OPEN')", fixture.leavePeriod(), base, "HR09 fixture leave period", workDate.withDayOfYear(1), workDate.withDayOfYear(1).plusYears(1).minusDays(1));
            jdbc.update("INSERT INTO hr_leave_quota(id,tenant_id,employee_id,leave_type_id,period_id) VALUES(?,?,?,?,?)", base + 18, base, fixture.employee(), fixture.leaveType(), fixture.leavePeriod());
            LocalDate payStart = workDate.plusMonths(1).withDayOfMonth(1);
            jdbc.update("INSERT INTO hr_payroll_period(period_id,tenant_id,period_name,start_date,end_date,status) VALUES(?,?,?,?,?,'OPEN')", fixture.payPeriod(), base, "HR09 fixture payroll period", payStart, payStart.plusMonths(1).minusDays(1));
            jdbc.update("INSERT INTO hr_comp_component(id,tenant_id,component_code,component_name,component_type,taxable,status) VALUES(?,?,'OVERTIME',?,'VARIABLE',1,1)", fixture.component(), base, "HR09 fixture overtime component");
            jdbc.update("INSERT INTO hr_comp_structure(id,tenant_id,structure_code,structure_name,status) VALUES(?,?,?,?,1)", base + 15, base, "HR09-" + base, "HR09 synthetic structure");
            String synthetic = cipher.legacyAmount(BigDecimal.TEN.toPlainString());
            jdbc.update("INSERT INTO hr_comp_grade(id,tenant_id,grade_code,grade_name,min_salary,mid_salary,max_salary,currency,status) VALUES(?,?,?,?,?,?,?,'CNY',1)", base + 16, base, "HR09-" + base, "HR09 synthetic grade", synthetic, synthetic, synthetic);
            jdbc.update("INSERT INTO hr_employee_comp(id,tenant_id,employee_id,structure_id,grade_id,total_salary,effective_date,status) VALUES(?,?,?,?,?,?,?,'ACTIVE')", base + 17, base, fixture.employee(), base + 15, base + 16, synthetic, workDate.minusMonths(1));
            jdbc.update("INSERT INTO hr_overtime_type(type_id,tenant_id,type_code,type_name,applicable_day_type,rate_multiplier,salary_component_id,compensatory_flag,compensatory_ratio,compensatory_leave_type_id,max_hours_per_day,max_hours_per_month,need_approval_flag,status) VALUES(?,?,?,?, 'WORKDAY',1,?,1,1,?,8,80,1,1)", fixture.overtimeType(), base, "HR09-" + base, "HR09 fixture overtime type", fixture.component(), fixture.leaveType());
            return fixture;
        }

        Request request(Case fixture, String mode) throws Exception {
            identity(fixture);
            long id = nextId.incrementAndGet();
            if (mode.equals("SWAP")) {
                HrShiftRequest row = new HrShiftRequest();
                row.setRequestId(id); row.setTenantId(fixture.tenant()); row.setRequestNo("HR09-S-" + id);
                row.setEmployeeId(fixture.employee()); row.setDeptId(fixture.department()); row.setSwapEmployeeId(fixture.peer());
                row.setRequestMode("SWAP"); row.setFromDate(fixture.date()); row.setToDate(fixture.date());
                row.setFromShiftId(fixture.shift()); row.setToShiftId(fixture.peerShift());
                row.setStatus("APPROVED"); row.setApplicationStatus("PENDING"); row.setPeerAcceptanceStatus("ACCEPTED");
                row.setPeerRespondedBy(fixture.peer()); row.setPeerRespondedTime(HrHSupport.now());
                row.setReason("HR09 isolated approved fixture"); row.setDeleted(0); row.setVersion(0);
                row.setIdempotencyKey("hr09-" + id); row.setRequestDigest("0".repeat(64));
                Object target = ((org.springframework.aop.framework.Advised) shifts).getTargetSource().getTarget();
                Method plan = HrShiftRequestService.class.getDeclaredMethod("plan", HrShiftRequest.class);
                plan.setAccessible(true);
                Object calculated;
                try { calculated = plan.invoke(target, row); }
                catch (InvocationTargetException failure) { throw new AssertionError("Actual shift planner rejected the isolated fixture", failure.getCause()); }
                Method freeze = HrShiftRequestService.class.getDeclaredMethod("setPlan", HrShiftRequest.class, calculated.getClass());
                freeze.setAccessible(true); freeze.invoke(target, row, calculated);
                mapper(HrShiftRequestMapper.class).insert(row);
            } else {
                HrOvertimeRequest row = new HrOvertimeRequest();
                LocalDate work = fixture.date().minusMonths(2);
                row.setRequestId(id); row.setTenantId(fixture.tenant()); row.setRequestNo("HR09-O-" + id);
                row.setEmployeeId(fixture.employee()); row.setDeptId(fixture.department());
                row.setWorkDate(work); row.setAttendanceDate(work); row.setStartTime(work.atTime(18, 0)); row.setEndTime(work.atTime(19, 0));
                row.setShiftId(fixture.shift()); row.setRuleId(fixture.rule()); row.setCalendarId(fixture.calendar()); row.setDateType("WORKDAY");
                row.setRequestedMinutes(60); row.setActualMinutes(60); row.setActualHours(BigDecimal.ONE); row.setApprovedMinutes(60); row.setApprovedHours(BigDecimal.ONE);
                row.setOvertimeTypeId(fixture.overtimeType()); row.setSettleMode(mode); row.setRateMultiplier(BigDecimal.ONE); row.setCompensatoryRatio(BigDecimal.ONE);
                row.setStatus("APPROVED"); row.setSettlementStatus("PENDING"); row.setSettledFlag(0); row.setTriplePayFlag(0);
                row.setCalculationSnapshot("{}"); row.setPolicySnapshot(helper.json(Map.of("applicantUserId", Long.toString(fixture.employee()))));
                row.setReason("HR09 isolated approved fixture"); row.setDeleted(0); row.setVersion(0);
                row.setIdempotencyKey("hr09-" + id); row.setRequestDigest("0".repeat(64));
                if (mode.equals("PAY")) {
                    row.setSalaryComponentId(fixture.component()); row.setPayrollPeriodId(fixture.payPeriod()); row.setCurrency("CNY");
                    row.setHourlyRateCipher(cipher.seal(BigDecimal.TEN.toPlainString()));
                    row.setSettlementAmountCipher(cipher.seal(BigDecimal.TEN.toPlainString()));
                } else {
                    row.setLeaveTypeId(fixture.leaveType()); row.setLeavePeriodId(fixture.leavePeriod());
                }
                mapper(HrOvertimeRequestMapper.class).insert(row);
            }
            return new Request(fixture, id, mode);
        }

        void execute(Request request, String actor, boolean independentLockDomain) throws Exception {
            as(request.fixture(), actor, independentLockDomain, () -> {
                if (request.mode().equals("SWAP")) shifts.apply(request.id(), 0);
                else settlements.settle(request.id(), 0);
            });
        }

        Map<String, Object> parent(Request request) throws SQLException {
            return read(FixtureInspectionSql.query("requestRow", request.table()), request.fixture().tenant(), request.id()).get(0);
        }

        void assertSuccess(Request request) throws Exception {
            Map<String, Object> row = parent(request);
            equal("APPROVED", row.get("status"), "Execution retains the approved business decision");
            equal(request.mode().equals("SWAP") ? "APPLIED" : "SETTLED", row.get(request.stateColumn()), "Parent reports the committed execution result");
            equal(1, ((Number) row.get("version")).intValue(), "Exactly one successful parent version transition commits");
            check(row.get("last_error_code") == null && row.get("last_error_message") == null, "Successful result contains no stale failure marker");
            Case fixture = request.fixture();
            if (request.mode().equals("SWAP")) {
                equal(2L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE tenant_id=? AND source_shift_request_id=?", fixture.tenant(), request.id()), "SWAP commits exactly two source-linked assignments");
                equal(1L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE source_shift_request_id=? AND target_id=? AND shift_id=? AND rule_id=? AND schedule_date=? AND status='PUBLISHED'", request.id(), fixture.employee(), fixture.peerShift(), fixture.peerRule(), fixture.date()), "Applicant gets the peer shift and matching rule");
                equal(1L, count("SELECT COUNT(*) FROM hr_schedule_assignment WHERE source_shift_request_id=? AND target_id=? AND shift_id=? AND rule_id=? AND schedule_date=? AND status='PUBLISHED'", request.id(), fixture.peer(), fixture.shift(), fixture.rule(), fixture.date()), "Peer gets the applicant shift and matching rule");
                identity(fixture);
                equal(fixture.peerShift(), helper.slot(fixture.employee(), fixture.date()).shift().getId(), "Real assignment resolver selects the applicant override");
                equal(fixture.shift(), helper.slot(fixture.peer(), fixture.date()).shift().getId(), "Real assignment resolver selects the peer override");
                check(row.get("applied_time") != null, "Applied timestamp accompanies both assignments");
            } else {
                equal(1, integer(row.get("settled_flag")), "Settled flag is committed with the result");
                check(row.get("settle_time") != null, "Settlement timestamp is committed with the result");
                if (request.mode().equals("PAY")) {
                    equal(1L, count("SELECT COUNT(*) FROM hr_comp_change WHERE tenant_id=? AND source_biz_type='HR_OVERTIME' AND source_biz_id=? AND id=? AND status='APPROVED' AND deleted=0", fixture.tenant(), Long.toString(request.id()), row.get("comp_change_id")), "PAY has one approved source-linked result and matching parent pointer");
                    check(row.get("leave_ledger_id") == null && row.get("payroll_correction_id") == null, "PAY does not mix settlement result types");
                    Map<String, Object> change = read("SELECT change_amount,after_total FROM hr_comp_change WHERE id=?", row.get("comp_change_id")).get(0);
                    javax.crypto.Cipher verifier = javax.crypto.Cipher.getInstance("AES/ECB/PKCS5Padding");
                    verifier.init(javax.crypto.Cipher.DECRYPT_MODE, new javax.crypto.spec.SecretKeySpec(bean(EncryptorProperties.class).getAesKey().getBytes(StandardCharsets.UTF_8), "AES"));
                    String stored = (String) change.get("change_amount");
                    BigDecimal verified = new BigDecimal(new String(verifier.doFinal(Base64.getDecoder().decode(stored)), StandardCharsets.UTF_8));
                    check(verified.compareTo(BigDecimal.TEN) == 0 && stored.equals(change.get("after_total")), "Independent decryption proves the stored synthetic amount is ciphertext without logging it");
                    identity(fixture);
                    HrCompChange actual = mapper(HrHMapper.class).changeSource(fixture.tenant(), Long.toString(request.id()));
                    check(actual.getChangeAmount() != null && actual.getChangeAmount().compareTo(BigDecimal.TEN) == 0, "Real decryption plugin verifies the original amount without logging it");
                } else {
                    equal(1L, count("SELECT COUNT(*) FROM hr_leave_ledger WHERE tenant_id=? AND source_event_key=? AND ledger_id=? AND transaction_type='COMPENSATORY' AND quantity_unit='HOUR'", fixture.tenant(), request.eventKey(), row.get("leave_ledger_id")), "Compensatory settlement has one unique source ledger and matching pointer");
                    check(row.get("comp_change_id") == null && row.get("payroll_correction_id") == null, "Compensatory settlement does not mix result types");
                    equal(0L, count("SELECT COUNT(*) FROM hr_leave_quota quota WHERE quota.tenant_id=? AND (quota.total_quota<>(SELECT COALESCE(SUM(ledger.leave_days),0) FROM hr_leave_ledger ledger WHERE ledger.tenant_id=quota.tenant_id AND ledger.employee_id=quota.employee_id AND ledger.leave_type_id=quota.leave_type_id AND ledger.leave_period_id=quota.period_id) OR quota.total_quota<>quota.available_quota OR quota.used_quota<>0 OR quota.frozen_quota<>0)", fixture.tenant()), "Committed quota exactly matches the committed real ledger");
                }
            }
            equal(1L, count("SELECT COUNT(*) FROM hr_audit_log WHERE tenant_id=? AND business_id=? AND operation_type=?", fixture.tenant(), request.id(), request.mode().equals("SWAP") ? "APPLIED" : "SETTLED"), "Exactly one success audit is committed");
        }

        @Override
        public void close() throws Exception {
            observer.releaseAll();
            workers.shutdown();
            if (!workers.awaitTermination(30, TimeUnit.SECONDS)) {
                workers.shutdownNow();
                guard(workers.awaitTermination(30, TimeUnit.SECONDS), "Database workers did not stop before cleanup");
            }
            REPORT.put("observedSqlFaults", List.copyOf(observer.faults));
            REPORT.put("observedInjectedWriteFailures", observer.faults.stream().filter(SqlFault::intended).count());
            REPORT.put("observedMapperCalls", observer.traces.stream().filter(trace -> trace.stage().equals("before")).count());
            REPORT.put("observedMapperTraceEvents", observer.traces.size());
            validators.close();
            context.close();
        }
    }

    private record Case(long tenant, long employee, long peer, long department, long calendar, long shift,
                        long peerShift, long rule, long peerRule, long assignment, long peerAssignment,
                        long leaveType, long leavePeriod, long payPeriod, long component, long overtimeType, LocalDate date) {}

    private record Request(Case fixture, long id, String mode) {
        String table() { return mode.equals("SWAP") ? "hr_shift_request" : "hr_overtime_request"; }
        String stateColumn() { return mode.equals("SWAP") ? "application_status" : "settlement_status"; }
        String lockStatement() { return mode.equals("SWAP") ? ".HrHMapper.shiftLocked" : ".HrHMapper.overtimeLocked"; }
        String eventKey() { return "HR_OVERTIME:" + id + ":COMPENSATORY"; }
    }

    private static final class LocalCache extends RedisCache {
        final Harness harness;
        final Map<String, Object> values = new ConcurrentHashMap<>();
        final AtomicInteger invalidations = new AtomicInteger();
        final Map<String, Integer> epochOperations = new ConcurrentHashMap<>();

        LocalCache(Harness harness) {
            this.harness = harness;
            redisTemplate = new org.springframework.data.redis.core.RedisTemplate<>() {
                private final Map<String, Map<String, String>> epochs = new HashMap<>();

                @Override
                @SuppressWarnings("unchecked")
                public synchronized <Value> Value execute(org.springframework.data.redis.core.script.RedisScript<Value> script,
                        org.springframework.data.redis.serializer.RedisSerializer<?> argumentSerializer,
                        org.springframework.data.redis.serializer.RedisSerializer<Value> resultSerializer,
                        List<String> keys, Object... arguments) {
                    guard(script.getResultType() == String.class && arguments.length == 3, "Expected current holiday epoch protocol");
                    guard(keys.stream().allMatch(key -> key.startsWith(UserContext.getTenantId() + ":holiday:epoch:v2:")), "Epoch fixture keys retain tenant scope");
                    String operation = String.valueOf(arguments[0]);
                    String marker = "pending:" + arguments[1];
                    String revision = String.valueOf(arguments[2]);
                    guard(Set.of("READ", "BEGIN", "END").contains(operation), "Unsupported holiday epoch operation");
                    epochOperations.merge(operation, 1, Integer::sum);
                    if (operation.equals("READ")) {
                        List<String> revisions = new ArrayList<>();
                        for (String key : keys) {
                            Map<String, String> epoch = epochs.computeIfAbsent(key, ignored -> new HashMap<>());
                            if (epoch.size() > 1) return (Value) "";
                            revisions.add(epoch.computeIfAbsent("revision", ignored -> revision));
                        }
                        return (Value) String.join(":", revisions);
                    }
                    if (operation.equals("BEGIN")) {
                        guard(TransactionSynchronizationManager.isActualTransactionActive(), "Assignment invalidation begins inside the real database transaction");
                    }
                    for (String key : keys) {
                        Map<String, String> epoch = epochs.computeIfAbsent(key, ignored -> new HashMap<>());
                        epoch.put("revision", revision);
                        if (operation.equals("BEGIN")) epoch.put(marker, "1");
                        else epoch.remove(marker);
                    }
                    if (operation.equals("END") && harness.dataSource.committedActors.contains(ACTOR.get())) invalidations.incrementAndGet();
                    return (Value) "OK";
                }
            };
        }

        @Override
        @SuppressWarnings("unchecked")
        public <Value> Value getCacheObject(String key) {
            if (key.startsWith("sys:config:tenant:") || key.startsWith("sys:config:global:")) {
                try {
                    String configKey = key.substring(key.lastIndexOf(':') + 1);
                    List<Map<String, Object>> rows = harness.read("SELECT config_value FROM sys_config WHERE tenant_id=? AND config_key=?", UserContext.getTenantId(), configKey);
                    return rows.isEmpty() ? null : (Value) rows.get(0).get("config_value");
                } catch (SQLException failure) { throw new IllegalStateException("Fixture config edge failed", failure); }
            }
            return (Value) values.get(UserContext.getTenantId() + ":" + key);
        }

        @Override
        public <Value> void setCacheObject(String key, Value value) {
            values.put(UserContext.getTenantId() + ":" + key, value);
        }

        @Override
        public <Value> void setCacheObject(String key, Value value, long timeout, TimeUnit unit) { setCacheObject(key, value); }

        @Override
        public Collection<String> keys(String pattern) { return List.of(); }
    }

    @FunctionalInterface
    private interface CheckedAction { void run() throws Exception; }

    private static void identity(Case fixture) {
        UserContext.setTenantId(fixture.tenant()); UserContext.setUserId(fixture.employee());
        UserContext.setUserName("hr09-fixture-verifier"); UserContext.setRoles(Set.of("hr_admin")); UserContext.setDsType(0);
        TenantContext.setTenantId(fixture.tenant());
    }

    private static void as(Case fixture, String actor, boolean independentLockDomain, CheckedAction action) throws Exception {
        identity(fixture);
        ACTOR.set(actor);
        if (independentLockDomain) LOCK_DOMAIN.set(actor);
        try { action.run(); }
        finally { ACTOR.remove(); LOCK_DOMAIN.remove(); UserContext.clear(); TenantContext.clear(); }
    }

    private static RedissonClient localLocks() {
        Map<String, ReentrantLock> locks = new ConcurrentHashMap<>();
        return proxy(RedissonClient.class, (method, values) -> {
            guard(method.equals("getLock"), "Unexpected Redis operation outside the explicit lock edge");
            String key = Objects.toString(LOCK_DOMAIN.get(), "shared") + ":" + values[0];
            ReentrantLock lock = locks.computeIfAbsent(key, ignored -> new ReentrantLock());
            return proxy(RLock.class, (operation, arguments) -> switch (operation) {
                case "tryLock" -> lock.tryLock(((Number) arguments[0]).longValue(), (TimeUnit) arguments[arguments.length - 1]);
                case "isHeldByCurrentThread" -> lock.isHeldByCurrentThread();
                case "unlock" -> { lock.unlock(); yield null; }
                default -> throw new AssertionError("Unexpected remote lock method");
            });
        });
    }

    @FunctionalInterface
    private interface InvocationAction { Object invoke(String method, Object[] arguments) throws Throwable; }

    @SuppressWarnings("unchecked")
    private static <Value> Value proxy(Class<Value> type, InvocationAction action) {
        return (Value) Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, (instance, method, arguments) -> {
            if (method.getDeclaringClass() == Object.class) return switch (method.getName()) {
                case "toString" -> "HR09 explicit external edge " + type.getSimpleName();
                case "hashCode" -> System.identityHashCode(instance);
                case "equals" -> instance == arguments[0];
                default -> null;
            };
            return action.invoke(method.getName(), arguments);
        });
    }

    private static <Value> Value closedEdge(Class<Value> type) {
        return proxy(type, (method, arguments) -> { throw new AssertionError("Unexecuted remote edge was unexpectedly invoked: " + type.getSimpleName() + "." + method); });
    }

    private static int integer(Object value) { return value instanceof Boolean flag ? flag ? 1 : 0 : ((Number) value).intValue(); }

    private static void expectCode(String code, CheckedAction action) throws Exception {
        try { action.run(); }
        catch (HrHException failure) { equal(code, failure.getCode(), "Protected source rejects mutation with the expected business code"); return; }
        catch (HrBusinessException failure) { equal(code, failure.getCode(), "Protected source rejects mutation with the expected business code"); return; }
        throw new AssertionError("Protected source mutation unexpectedly succeeded");
    }

    private static String environment(String key) {
        String value = System.getenv(key);
        guard(value != null && !value.isBlank(), "Missing required verification environment: " + key);
        return value;
    }

    private static void digestRows(MessageDigest digest, ResultSet rows) throws SQLException {
        int columns = rows.getMetaData().getColumnCount();
        while (rows.next()) {
            for (int index = 1; index <= columns; index++) {
                String value = rows.getString(index);
                digest.update((value == null ? "-1:" : value.length() + ":" + value).getBytes(StandardCharsets.UTF_8));
            }
            digest.update((byte) '\n');
        }
    }

    private static void guard(boolean condition, String label) { if (!condition) throw new AssertionError(label); }
    private static void check(boolean condition, String label) { ASSERTIONS.incrementAndGet(); guard(condition, label); }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }

    private static String safeFailure(Throwable failure) {
        List<String> details = new ArrayList<>();
        Set<Throwable> seen = Collections.newSetFromMap(new IdentityHashMap<>());
        for (Throwable cause = failure; cause != null && seen.add(cause); cause = cause.getCause()) {
            String detail = cause.getClass().getSimpleName();
            if (cause instanceof SQLException sql) {
                detail += " SQLState=" + sql.getSQLState() + " code=" + sql.getErrorCode();
                Matcher column = java.util.regex.Pattern.compile("Column '([a-zA-Z_][a-zA-Z0-9_]{0,63})' cannot be null").matcher(Objects.toString(sql.getMessage(), ""));
                if (sql.getErrorCode() == 1048 && column.find()) detail += " column=" + column.group(1);
            }
            if (cause instanceof AssertionError) detail += " " + cause.getMessage();
            if (cause instanceof HrHException business) detail += " code=" + business.getCode();
            if (cause instanceof HrBusinessException business) detail += " code=" + business.getCode();
            details.add(detail);
            Arrays.stream(cause.getStackTrace()).filter(frame -> frame.getClassName().startsWith("com.cloudflow.hr."))
                    .limit(2).forEach(frame -> details.add(frame.toString()));
        }
        return String.join(" | ", details);
    }
}

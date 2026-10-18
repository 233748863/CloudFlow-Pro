package com.cloudflow.workflow.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.common.tenant.TenantBroker;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfTransactionMessage;
import com.cloudflow.workflow.mapper.WfTransactionMessageMapper;
import com.zaxxer.hikari.HikariConfig;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.Field;
import java.lang.reflect.InvocationHandler;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.redisson.api.RLock;
import org.redisson.api.RedissonClient;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** Actual service, mapper, tenant plugin and InnoDB transactions; Redis lock is controlled. */
public final class TransactionConsistencyDatabaseChecks {
    private static int checks;
    private static JdbcTemplate jdbc;
    private static SqlSessionTemplate sessions;
    private static TransactionConsistencyService service;
    private static TransactionTemplate transactions;
    private static final LocalDateTime NOW = LocalDateTime.now().withNano(0);

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !args[0].startsWith("jdbc:mysql://127.0.0.1:") || !args[0].contains("/cloud_flow_db?")) throw new IllegalArgumentException("Owned database required");
        String schema = "a3_txn_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        HikariDataSource pool = null;
        boolean created = false;
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned database directory");
            }
            try {
                statement.execute("CREATE DATABASE %s CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci".formatted(schema)); created = true;
                HikariConfig config = new HikariConfig();
                config.setJdbcUrl(args[0].replace("/cloud_flow_db?", "/" + schema + "?")); config.setUsername("root"); config.setPassword("");
                config.setMaximumPoolSize(4); config.setMinimumIdle(1); config.setConnectionTimeout(10000); config.setPoolName("owned-transaction-checks");
                pool = new HikariDataSource(config); jdbc = new JdbcTemplate(pool); jdbc.setQueryTimeout(15);
                jdbc.execute("CREATE TABLE wf_transaction_message LIKE cloud_flow_db.wf_transaction_message");
                setup(pool, Path.of(args[2]));
                queryBoundaries(); retryAndRollback(); cleanupAndRollback(); concurrentRetry();
                check(TenantContext.getTenantId() == null && UserContext.getTenantId() == null, "contexts restored");
                System.out.println("TXN_CONSISTENCY_DATABASE: checks=" + checks + "; failed=0; real_mysql=true; real_redis=false; http=false");
            } finally {
                TenantContext.clear(); UserContext.clear();
                if (pool != null) pool.close();
                if (created) {
                    if (!schema.matches("a3_txn_[a-f0-9]{12}")) throw new IllegalStateException("Owned schema required");
                    statement.execute("DROP DATABASE %s".formatted(schema));
                    try (ResultSet result = statement.executeQuery("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='%s'".formatted(schema))) {
                        check(result.next() && result.getInt(1) == 0, "temporary schema removed");
                    }
                }
                System.out.println("TXN_CONSISTENCY_DATABASE_RESTORED: original_schema_untouched=true; temporary_schema_removed=true");
            }
        }
        System.out.println("TXN_CONSISTENCY_DATABASE_FINAL: checks=" + checks + "; failed=0");
    }

    private static void setup(HikariDataSource pool, Path root) throws Exception {
        transactions = new TransactionTemplate(new DataSourceTransactionManager(pool)); transactions.setTimeout(15);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true); configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT); configuration.setDefaultStatementTimeout(15);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        configuration.addMapper(WfTransactionMessageMapper.class);
        GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(pool); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow/WfTransactionMessageMapper.xml")));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        service = new TransactionConsistencyService();
        set("messageMapper", sessions.getMapper(WfTransactionMessageMapper.class)); set("transactions", transactions);
        set("sysConfigHelper", new SysConfigHelper() { @Override public int getConfigInt(String key, int fallback) { return fallback; } });
        RLock lock = proxy(RLock.class, (target, method, values) -> {
            if (method.getName().equals("tryLock") || method.getName().equals("isHeldByCurrentThread")) return true;
            if (method.getName().equals("unlock")) return null;
            throw new AssertionError("Unexpected lock method");
        });
        set("redissonClient", proxy(RedissonClient.class, (target, method, values) -> lock));
    }

    private static void queryBoundaries() {
        reset();
        for (int index = 0; index < 201; index++) seed("p%03d".formatted(index), index % 2 == 0 ? 10 : 20, "PENDING", NOW);
        seed("future", 10, "PENDING", NOW);
        jdbc.update("UPDATE wf_transaction_message SET next_retry_time=? WHERE message_id='future'", NOW.plusHours(1));
        seed("created-later", 10, "PENDING", NOW);
        jdbc.update("UPDATE wf_transaction_message SET create_time=? WHERE message_id='created-later'", NOW.plusHours(1));
        seed("not-due", 10, "PENDING", NOW);
        jdbc.update("UPDATE wf_transaction_message SET next_retry_time=NULL WHERE message_id='not-due'");
        seed("failed", 10, "FAILED", NOW);
        WfTransactionMessageMapper mapper = sessions.getMapper(WfTransactionMessageMapper.class);
        List<WfTransactionMessage> first = TenantBroker.applyWithoutTenant(ignored -> mapper.selectRetryCandidates("", NOW, 100));
        List<WfTransactionMessage> second = TenantBroker.applyWithoutTenant(ignored -> mapper.selectRetryCandidates(first.get(99).getMessageId(), NOW, 100));
        List<WfTransactionMessage> third = TenantBroker.applyWithoutTenant(ignored -> mapper.selectRetryCandidates(second.get(99).getMessageId(), NOW, 100));
        check(first.size() == 100 && second.size() == 100 && third.size() == 1, "real SQL pages and excludes future/null/terminal");
        check(first.get(0).getMessageId().equals("p000") && third.get(0).getMessageId().equals("p200"), "stable cursor order");
        check(first.stream().map(WfTransactionMessage::getTenantId).distinct().count() == 2, "platform discovers both tenants");
        WfTransactionMessage foreign = TenantBroker.applyAs(10L, ignored -> transactions.execute(status -> mapper.selectForRetry(20L, "p001")));
        check(foreign == null, "tenant interceptor blocks foreign locked query");
        WfTransactionMessage local = TenantBroker.applyAs(20L, ignored -> transactions.execute(status -> mapper.selectForRetry(20L, "p001")));
        check(local != null && local.getTenantId().equals(20L), "owned locked query works with actual tenant parser");
        System.out.println("TXN_CONSISTENCY_DATABASE_CASE: query_boundaries=PASS");
    }

    private static void retryAndRollback() {
        reset(); seed("a-fail", 10, "PENDING", NOW); seed("b-later", 10, "PENDING", NOW); seed("c-foreign", 20, "PENDING", NOW);
        jdbc.execute("CREATE TRIGGER own_txn_failure BEFORE UPDATE ON wf_transaction_message FOR EACH ROW BEGIN IF NEW.message_id='a-fail' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_TXN_FAILURE'; END IF; END");
        try {
            failed(service::retryPendingMessages);
            check(scalar("SELECT retry_count FROM wf_transaction_message WHERE message_id='a-fail'") == 0, "failed update rolls back attempt");
            check(scalar("SELECT COUNT(*) FROM wf_transaction_message WHERE message_id<>'a-fail' AND retry_count=1 AND version=1 AND status='PENDING'") == 2, "other messages and tenants persist retry scheduling");
        } finally { jdbc.execute("DROP TRIGGER own_txn_failure"); }
        failed(service::retryPendingMessages);
        check(scalar("SELECT COUNT(*) FROM wf_transaction_message WHERE retry_count=1 AND status='PENDING'") == 3, "recovery only changes failed record");
        check(service.retryPendingMessages().getAffectedRows() == 0, "scheduled retries remain deferred");
        seed("d-limit", 10, "PENDING", NOW);
        jdbc.update("UPDATE wf_transaction_message SET retry_count=2,max_retry_count=3 WHERE message_id='d-limit'");
        failed(service::retryPendingMessages);
        check(scalar("SELECT COUNT(*) FROM wf_transaction_message WHERE message_id='d-limit' AND retry_count=3 AND status='FAILED'") == 1, "row-specific retry limit enforced");
        WfTransactionMessage stale = new WfTransactionMessage(); stale.setMessageId("c-foreign"); stale.setTenantId(10L); stale.setBusinessType("NOTIFICATION");
        service.retryMessage(stale);
        check(scalar("SELECT retry_count FROM wf_transaction_message WHERE message_id='c-foreign'") == 1, "forged stale tenant cannot update foreign message");
        System.out.println("TXN_CONSISTENCY_DATABASE_CASE: retry_rollback_recovery=PASS");
    }

    private static void cleanupAndRollback() {
        reset();
        seed("a-old", 10, "SUCCESS", NOW.minusDays(8)); seed("b-old", 20, "SUCCESS", NOW.minusDays(8));
        seed("recent", 10, "SUCCESS", NOW.minusDays(6));
        seed("pending", 10, "PENDING", NOW.minusDays(8)); seed("processing", 20, "PROCESSING", NOW.minusDays(8)); seed("failed", 20, "FAILED", NOW.minusDays(8));
        jdbc.execute("CREATE TRIGGER own_txn_delete_failure BEFORE DELETE ON wf_transaction_message FOR EACH ROW BEGIN IF OLD.message_id='b-old' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='OWNED_DELETE_FAILURE'; END IF; END");
        try {
            failed(service::cleanupSuccessMessages);
            check(scalar("SELECT COUNT(*) FROM wf_transaction_message") == 6, "failed delete leaves both old success records");
        } finally { jdbc.execute("DROP TRIGGER own_txn_delete_failure"); }
        check(service.cleanupSuccessMessages().getAffectedRows() == 2, "cleanup actual deletion count");
        check(scalar("SELECT COUNT(*) FROM wf_transaction_message") == 4, "recent and all unsuccessful records retained");
        check(service.cleanupSuccessMessages().getAffectedRows() == 0, "repeated cleanup zero");
        System.out.println("TXN_CONSISTENCY_DATABASE_CASE: cleanup_rollback_recovery=PASS");
    }

    private static void concurrentRetry() throws Exception {
        reset(); seed("concurrent", 10, "PENDING", NOW);
        WfTransactionMessage pointer = new WfTransactionMessage(); pointer.setMessageId("concurrent"); pointer.setTenantId(10L); pointer.setBusinessType("NOTIFICATION");
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            java.util.concurrent.Callable<Boolean> action = () -> {
                if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Start latch timed out");
                try { service.retryMessage(pointer); return false; } catch (IllegalStateException expected) { return true; }
            };
            Future<Boolean> first = workers.submit(action); Future<Boolean> second = workers.submit(action); start.countDown();
            boolean firstChanged = first.get(20, TimeUnit.SECONDS), secondChanged = second.get(20, TimeUnit.SECONDS);
            check(firstChanged != secondChanged, "one concurrent attempt changes state");
            check(scalar("SELECT COUNT(*) FROM wf_transaction_message WHERE message_id='concurrent' AND retry_count=1 AND version=1 AND status='PENDING'") == 1, "database row lock prevents duplicate retry");
        } finally {
            workers.shutdownNow();
            if (!workers.awaitTermination(10, TimeUnit.SECONDS)) throw new IllegalStateException("Workers still running");
        }
        System.out.println("TXN_CONSISTENCY_DATABASE_CASE: concurrent_retry=PASS");
    }

    private static void reset() { jdbc.execute("DELETE FROM wf_transaction_message"); }
    private static void seed(String id, long tenant, String status, LocalDateTime updated) {
        jdbc.update("INSERT INTO wf_transaction_message(message_id,tenant_id,business_type,business_id,content,status,retry_count,max_retry_count,next_retry_time,create_time,update_time) VALUES (?,?,'NOTIFICATION',?,'{}',?,0,5,?,?,?)",
                id, tenant, id, status, NOW.minusMinutes(1), NOW.minusDays(10), updated);
    }
    private static long scalar(String query, Object... args) { return Objects.requireNonNull(jdbc.queryForObject(query, Long.class, args)); }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
    private static RuntimeException failed(Runnable action) {
        try { action.run(); } catch (RuntimeException failure) { return failure; }
        throw new AssertionError("Expected a visible failure");
    }
    private static void set(String name, Object value) throws Exception { Field field = TransactionConsistencyService.class.getDeclaredField(name); field.setAccessible(true); field.set(service, value); }
    private static <T> T proxy(Class<T> type, InvocationHandler handler) { return type.cast(Proxy.newProxyInstance(type.getClassLoader(), new Class<?>[]{type}, handler)); }
}

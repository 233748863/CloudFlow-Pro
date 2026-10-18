import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.mapper.WfProcessInstanceMapper;
import com.cloudflow.workflow.service.WorkflowProcessNumberService;
import com.zaxxer.hikari.HikariDataSource;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Locale;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.data.redis.connection.RedisPassword;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

public final class WorkflowProcessNumberDatabaseChecks implements AutoCloseable {
    private static final long TENANT = 991971L;
    private static final long OTHER = 991972L;
    private static int checks;
    private final HikariDataSource source = new HikariDataSource();
    private final LettuceConnectionFactory connection;
    private final StringRedisTemplate redis;
    private final JdbcTemplate jdbc;
    private final WorkflowProcessNumberService numbers;
    private final WfProcessInstanceMapper instances;
    private final TransactionTemplate transaction;
    private final String date = LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE);
    private final java.util.Set<String> keys = new HashSet<>();
    private boolean owned;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !arguments[0].startsWith("jdbc:mysql://127.0.0.1:")) {
            throw new IllegalArgumentException("Owned loopback database and Redis required");
        }
        try (WorkflowProcessNumberDatabaseChecks fixture = new WorkflowProcessNumberDatabaseChecks(arguments)) {
            fixture.scopeAndHistory();
            fixture.committedSnapshot();
            fixture.concurrentRecovery();
            fixture.largeSequences();
            fixture.invalidInputs();
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
        System.out.println("WORKFLOW_NUMBER_DATABASE: assertions=" + checks
                + "; failed=0; real_mysql=true; real_redis=true; real_lua=true; concurrent_allocations=8; stale_snapshot=true; http=false; production_modified=false");
    }

    private WorkflowProcessNumberDatabaseChecks(String[] arguments) throws Exception {
        identity(TENANT);
        source.setJdbcUrl(arguments[0]);
        source.setUsername("root");
        source.setPassword("");
        source.setMaximumPoolSize(20);
        source.setMinimumIdle(1);
        jdbc = new JdbcTemplate(source);
        jdbc.setQueryTimeout(10);
        equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "numbering database belongs to the isolated application");
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id IN (?,?)", Long.class, TENANT, OTHER), "numbering fixture tenants have no existing instances");
        RedisStandaloneConfiguration redisConfig = new RedisStandaloneConfiguration("127.0.0.1", Integer.parseInt(arguments[2]));
        redisConfig.setPassword(RedisPassword.of(Objects.requireNonNull(System.getenv("CLOUDFLOW_OWNED_REDIS_PASSWORD"))));
        connection = new LettuceConnectionFactory(redisConfig);
        connection.afterPropertiesSet();
        redis = new StringRedisTemplate(connection);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setDefaultStatementTimeout(10);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig());
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(WfProcessInstanceMapper.class);
        configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setMapperLocations(new ClassPathResource("mapper/workflow/WfProcessInstanceMapper.xml"));
        instances = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject())).getMapper(WfProcessInstanceMapper.class);
        DataSourceTransactionManager manager = new DataSourceTransactionManager(source);
        transaction = new TransactionTemplate(manager);
        transaction.setTimeout(20);
        numbers = new WorkflowProcessNumberService(instances, redis, manager);
        owned = true;
    }

    private void scopeAndHistory() {
        String counter = key(TENANT, "NUMBER");
        equal("NUMBER" + date + "000001", numbers.next(TENANT, "number_one"), "empty history starts at one");
        persist(TENANT, "NUMBER" + date + "000001", 0);
        equal("NUMBER" + date + "000002", numbers.next(TENANT, "number_two"), "definitions sharing six characters share the same sequence");
        long ttl = Objects.requireNonNull(redis.getExpire(counter));
        yes(ttl > 0 && ttl <= 172800, "counter expiry remains within 48 hours");
        persist(TENANT, "NUMBER" + date + "000500", 1);
        persist(TENANT, "NUMBER" + LocalDate.now().minusDays(1).format(DateTimeFormatter.BASIC_ISO_DATE) + "999999", 0);
        persist(TENANT, "OTHERX" + date + "999999", 0);
        persist(OTHER, "NUMBER" + date + "999999", 0);
        redis.delete(counter);
        equal("NUMBER" + date + "000501", numbers.next(TENANT, "number_one"), "deleted history restores the counter without borrowing another tenant, prefix or day");
        persist(TENANT, "NUMBER" + date + "000501", 0);
        redis.opsForValue().set(counter, "1");
        equal("NUMBER" + date + "000502", numbers.next(TENANT, "number_one"), "a stale counter also catches up to committed history");
        key(OTHER, "NUMBER");
        identity(OTHER);
        equal("NUMBER" + date + "1000000", numbers.next(OTHER, "number_one"), "other tenant retains its independent larger sequence");
        identity(TENANT);
        equal("NUMBER" + date + "000503", numbers.next(TENANT, "number_one"), "uncommitted reservations are not reused while cache remains");
        equal("NUMBER" + date + "000501", instances.selectLatestProcessNumber(TENANT, "NUMBER" + date), "source maximum includes only committed numbers for this tenant and date");
        yes(instances.findProcessNumberCurrent(TENANT, "NUMBER" + date + "000500") != null, "collision lookup includes logically deleted history");
        yes(instances.findProcessNumberCurrent(TENANT, "NUMBER" + date + "999999") == null, "current collision lookup remains tenant scoped");
    }

    private void committedSnapshot() {
        String counter = key(TENANT, "SNAPSH");
        String pattern = "SNAPSH" + date + "%";
        transaction.executeWithoutResult(status -> {
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=? AND process_no LIKE ?", Long.class, TENANT, pattern), "outer transaction establishes an empty old snapshot");
            TransactionTemplate fresh = new TransactionTemplate(transaction.getTransactionManager());
            fresh.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            fresh.executeWithoutResult(inner -> persist(TENANT, "SNAPSH" + date + "000777", 0));
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=? AND process_no LIKE ?", Long.class, TENANT, pattern), "outer repeatable-read snapshot stays old");
            redis.delete(counter);
            Long before = jdbc.queryForObject("SELECT CONNECTION_ID()", Long.class);
            String restored = numbers.next(TENANT, "snapshot_case");
            equal("SNAPSH" + date + "000778", restored, "recovery sees a concurrent commit despite the parent snapshot");
            equal(before, jdbc.queryForObject("SELECT CONNECTION_ID()", Long.class), "the parent business connection is resumed unchanged");
            persist(TENANT, restored, 0);
        });
        equal(2L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=? AND process_no LIKE ?", Long.class, TENANT, pattern), "both history and the resumed business write commit");
    }

    private void concurrentRecovery() throws Exception {
        String counter = key(TENANT, "RACEWF");
        String pattern = "RACEWF" + date + "%";
        persist(TENANT, "RACEWF" + date + "000300", 0);
        redis.delete(counter);
        ExecutorService workers = Executors.newFixedThreadPool(8);
        CountDownLatch ready = new CountDownLatch(8);
        CountDownLatch start = new CountDownLatch(1);
        ArrayList<Future<String>> futures = new ArrayList<java.util.concurrent.Future<String>>();
        try {
            for (int index = 0; index < 8; index++) {
                futures.add(workers.submit(() -> {
                    identity(TENANT);
                    try {
                        ready.countDown();
                        if (!start.await(10, TimeUnit.SECONDS)) throw new AssertionError("numbering race start timed out");
                        return transaction.execute(status -> {
                            String number = numbers.next(TENANT, "racewf_approval");
                            persist(TENANT, number, 0);
                            return number;
                        });
                    } finally {
                        UserContext.clear();
                        TenantContext.clear();
                    }
                }));
            }
            yes(ready.await(10, TimeUnit.SECONDS), "eight real concurrent allocations reach the cold-cache boundary");
            start.countDown();
            HashSet<String> actual = new HashSet<String>();
            for (Future<String> future : futures) actual.add(future.get(25, TimeUnit.SECONDS));
            HashSet<String> expected = new HashSet<String>();
            for (int sequence = 301; sequence <= 308; sequence++) expected.add("RACEWF" + date + String.format(Locale.ROOT, "%06d", sequence));
            equal(expected, actual, "atomic recovery commits eight distinct consecutive process numbers");
            equal(9L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id=? AND process_no LIKE ?", Long.class, TENANT, pattern), "all eight concurrent rows and original history persist");
        } finally {
            start.countDown();
            workers.shutdownNow();
            workers.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    private void largeSequences() {
        key(TENANT, "BIGSEQ");
        persist(TENANT, "BIGSEQ" + date + "9007199254740992", 0);
        equal("BIGSEQ" + date + "9007199254740993", numbers.next(TENANT, "bigseq"), "Lua never rounds integers above the exact floating-point range");
        equal("BIGSEQ" + date + "9007199254740994", numbers.next(TENANT, "bigseq"), "large integer reservations remain distinct");
        key(TENANT, "MAXSEQ");
        persist(TENANT, "MAXSEQ" + date + "9223372036854775806", 0);
        equal("MAXSEQ" + date + "9223372036854775807", numbers.next(TENANT, "maxseq"), "last signed 64-bit number is exact");
        fails(() -> numbers.next(TENANT, "maxseq"), "counter overflow rejects the operation");
    }

    private void invalidInputs() {
        String counter = key(TENANT, "BROKEN");
        redis.opsForValue().set(counter, "not-an-integer");
        fails(() -> numbers.next(TENANT, "broken"), "corrupt counters fail explicitly");
        fails(() -> numbers.next(OTHER, "number"), "a caller cannot choose another tenant");
        fails(() -> numbers.next(null, "number"), "missing tenant is rejected");
        fails(() -> numbers.next(TENANT, ""), "empty process key is rejected");
        fails(() -> numbers.next(TENANT, "x".repeat(101)), "oversized process key is rejected");
        Locale previous = Locale.getDefault();
        try {
            key(TENANT, "INVOIC");
            Locale.setDefault(Locale.forLanguageTag("tr-TR"));
            equal("INVOIC" + date + "000001", numbers.next(TENANT, "invoice"), "number prefix does not depend on operating-system language");
        } finally {
            Locale.setDefault(previous);
        }
    }

    private String key(long tenant, String prefix) {
        String key = tenant + ":sys:wf:pno:" + prefix + ":" + date;
        if (!keys.contains(key)) {
            if (Boolean.TRUE.equals(redis.hasKey(key))) throw new AssertionError("An existing numbering test key was found; left untouched");
            keys.add(key);
        }
        return key;
    }

    private void persist(long tenant, String number, int deleted) {
        String identifier = "H4_NUMBER_" + UUID.randomUUID();
        jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,business_key,start_user_id,process_no,deleted) VALUES(?,?,?,?,?,?,?)",
                identifier, tenant, "numbering_fixture", identifier, 1L, number, deleted);
    }

    private static void identity(long tenant) {
        UserContext.setTenantId(tenant);
        UserContext.setUserId(1L);
        TenantContext.setTenantId(tenant);
    }

    private static void equal(Object expected, Object actual, String label) {
        yes(Objects.equals(expected, actual), label + "; expected=" + expected + "; actual=" + actual);
    }

    private static void yes(boolean condition, String label) {
        if (!condition) throw new AssertionError(label);
        checks++;
        System.out.println("PASS " + label);
    }

    private static void fails(Runnable action, String label) {
        try {
            action.run();
        } catch (RuntimeException expected) {
            yes(true, label);
            return;
        }
        throw new AssertionError(label);
    }

    @Override
    public void close() {
        try {
            if (owned) {
                jdbc.update("DELETE FROM wf_process_instance WHERE tenant_id IN (?,?) AND instance_id LIKE 'H4_NUMBER_%'", TENANT, OTHER);
                redis.delete(keys);
                equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM wf_process_instance WHERE tenant_id IN (?,?)", Long.class, TENANT, OTHER), "only isolated numbering fixture rows were removed");
            }
        } finally {
            connection.destroy();
            source.close();
        }
    }
}

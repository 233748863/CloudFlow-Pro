import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.redis.core.SysConfigHelper;
import com.cloudflow.workflow.config.CacheConfig;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import com.cloudflow.workflow.service.WorkflowFieldPermissionCache;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
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
import org.springframework.aop.support.AopUtils;
import org.springframework.cache.Cache;
import org.springframework.cache.CacheManager;
import org.springframework.cache.annotation.EnableCaching;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.cache.RedisCacheManager;
import org.springframework.data.redis.connection.RedisStandaloneConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceClientConfiguration;
import org.springframework.data.redis.connection.lettuce.LettuceConnectionFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

public final class C3OwnedPermissionCache {
    private static final ObjectMapper JSON = new ObjectMapper();
    @Configuration @EnableCaching
    public static class Caching { }

    @Intercepts(@Signature(type = Executor.class, method = "query", args = {MappedStatement.class, Object.class, RowBounds.class, ResultHandler.class}))
    public static final class Queries implements Interceptor {
        private final AtomicInteger count = new AtomicInteger();
        @Override public Object intercept(Invocation invocation) throws Throwable { count.incrementAndGet(); return invocation.proceed(); }
    }

    public static void main(String[] arguments) throws Exception {
        try { execute(arguments); }
        catch (Exception | AssertionError failure) {
            System.err.println("C3_OWNED_CACHE_FAILED: type=" + failure.getClass().getSimpleName());
            throw new IllegalStateException("Owned cache verification failed; credentials and private state omitted");
        }
    }

    private static void execute(String[] arguments) throws Exception {
        require(arguments.length == 4, "Expected state, definition, process key and read mode");
        Path root = Path.of("D:\\CloudFlowPro").toRealPath();
        Path stateFile = Path.of(arguments[0]).toRealPath(), run = stateFile.getParent();
        require(run.getParent().equals(root.resolve(".cloudflow-runtime/batch-g-integration").toRealPath())
                && run.getFileName().toString().matches("[a-f0-9]{32}") && stateFile.getFileName().toString().equals("state.json"), "Owned isolated state required");
        String definitionId = arguments[1], processKey = arguments[2], mode = arguments[3];
        require(definitionId.matches("[a-f0-9-]{36}") && processKey.matches("C-LIVE-[a-f0-9]{8}-cache-[ab]") && Set.of("warm", "peek").contains(mode), "Owned permission cache fixture required");
        JsonNode state = JSON.readTree(Files.readString(stateFile).replaceFirst("^\\uFEFF", ""));
        require("RUNNING".equals(state.path("status").asText()) && Path.of(state.path("run").asText()).toRealPath().equals(run), "Running owned state required");
        int mysqlPort = state.path("mysqlPort").asInt(), redisPort = state.path("redisPort").asInt();
        require(mysqlPort > 1024 && mysqlPort < 65536 && redisPort > 1024 && redisPort < 65536, "Owned ports required");
        DriverManagerDataSource source = new DriverManagerDataSource("jdbc:mysql://127.0.0.1:" + mysqlPort + "/cloud_flow_db?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&connectTimeout=10000&socketTimeout=20000", "root", "");
        JdbcTemplate jdbc = new JdbcTemplate(source); jdbc.setQueryTimeout(20);
        require(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath().equals(run.resolve("mysql-data").toRealPath()), "Owned MySQL data directory required");
        Map<String, Object> definition = jdbc.queryForMap("SELECT process_key, tenant_id FROM wf_process_definition WHERE definition_id=?", definitionId);
        require(processKey.equals(definition.get("process_key")) && ((Number) definition.get("tenant_id")).longValue() == 100000L, "Only current fixture definitions may populate caches");
        Path redisConfig = null;
        for (JsonNode process : state.path("processes")) if (process.path("name").asText().equals("redis")) redisConfig = run.resolve(process.path("marker").asText()).toRealPath();
        require(redisConfig != null && redisConfig.getParent().equals(run), "Owned Redis configuration required");
        String redisText = Files.readString(redisConfig);
        require(Pattern.compile("(?m)^bind 127\\.0\\.0\\.1\\r?$").matcher(redisText).find()
                && Pattern.compile("(?m)^port " + redisPort + "\\r?$").matcher(redisText).find(), "Loopback Redis required");
        Matcher password = Pattern.compile("(?m)^requirepass (.+)\\r?$").matcher(redisText); require(password.find(), "Redis authentication required");
        RedisStandaloneConfiguration redisConfiguration = new RedisStandaloneConfiguration("127.0.0.1", redisPort); redisConfiguration.setPassword(password.group(1).trim());
        LettuceConnectionFactory connection = new LettuceConnectionFactory(redisConfiguration, LettuceClientConfiguration.builder().commandTimeout(Duration.ofSeconds(10)).shutdownTimeout(Duration.ofSeconds(1)).build());
        connection.afterPropertiesSet(); connection.start();
        try (AnnotationConfigApplicationContext context = new AnnotationConfigApplicationContext()) {
            CacheConfig configuration = new CacheConfig();
            Field helper = CacheConfig.class.getDeclaredField("sysConfigHelper"); helper.setAccessible(true);
            helper.set(configuration, new SysConfigHelper() {
                @Override public long getConfigLong(String key, long fallback) {
                    List<String> values = jdbc.queryForList("SELECT config_value FROM sys_config WHERE config_scope='0' AND config_key=?", String.class, key);
                    return values.isEmpty() ? fallback : Long.parseLong(values.get(0));
                }
            });
            RedisCacheManager manager = (RedisCacheManager) configuration.cacheManager(connection); manager.afterPropertiesSet();
            MybatisConfiguration mybatis = new MybatisConfiguration(); mybatis.setMapUnderscoreToCamelCase(true); mybatis.setLocalCacheScope(LocalCacheScope.STATEMENT);
            GlobalConfig global = new GlobalConfig().setBanner(false).setDbConfig(new GlobalConfig.DbConfig()); GlobalConfigUtils.setGlobalConfig(mybatis, global);
            Queries queries = new Queries(); mybatis.addInterceptor(queries); mybatis.addMapper(WfFormFieldPermissionMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(mybatis); factory.setGlobalConfig(global);
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            context.register(Caching.class); context.registerBean(CacheManager.class, () -> manager);
            context.registerBean(WorkflowFieldPermissionCache.class, () -> new WorkflowFieldPermissionCache(sessions.getMapper(WfFormFieldPermissionMapper.class)));
            context.refresh();
            WorkflowFieldPermissionCache service = context.getBean(WorkflowFieldPermissionCache.class);
            require(AopUtils.isAopProxy(service), "Actual cache annotation must be intercepted");
            Cache cache = Objects.requireNonNull(manager.getCache("workflowFormPermissions"));
            if (mode.equals("peek")) {
                Cache.ValueWrapper value = cache.get("100000:" + definitionId);
                System.out.println("C3_OWNED_CACHE_RESULT=" + JSON.writeValueAsString(Map.of("present", value != null, "selects", queries.count.get(), "databaseWrites", 0, "cacheWrites", 0)));
            } else {
                List<FieldPermissionVO> first = service.get(100000L, definitionId); int firstReads = queries.count.get();
                List<FieldPermissionVO> second = service.get(100000L, definitionId);
                require(first.equals(second) && queries.count.get() == firstReads && cache.get("100000:" + definitionId) != null, "Second read must use real Redis cache");
                System.out.println("C3_OWNED_CACHE_RESULT=" + JSON.writeValueAsString(Map.of("present", true, "rules", first, "selects", firstReads, "secondSelects", queries.count.get() - firstReads, "databaseWrites", 0, "actualCacheAnnotation", true, "actualMapper", true)));
            }
        } finally { connection.destroy(); }
    }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); }
}

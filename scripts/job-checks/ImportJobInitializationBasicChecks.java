package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.mapper.SysJobLogMapper;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.job.model.BusinessJobStartRequest;
import com.cloudflow.common.job.model.JobExecuteDTO;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/** One disposable schema; production service, mapper, tenant interceptor and MySQL. */
public final class ImportJobInitializationBasicChecks {
    private static int checks;

    public static void main(String[] args) throws Exception {
        if (args.length != 3 || !args[0].matches("jdbc:mysql://127[.]0[.]0[.]1:[0-9]+/cloud_flow_db[?].*")) {
            throw new IllegalArgumentException("Owned loopback JDBC, datadir and workspace required");
        }
        String schema = "g2_import_job_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12);
        try (Connection owner = DriverManager.getConnection(args[0], "root", ""); Statement statement = owner.createStatement()) {
            try (ResultSet result = statement.executeQuery("SELECT @@datadir")) {
                check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(args[1]).toRealPath()), "owned datadir");
            }
            statement.execute("CREATE DATABASE " + schema + " CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            try (HikariDataSource source = new HikariDataSource()) {
                source.setJdbcUrl(args[0].replace("/cloud_flow_db?", "/" + schema + "?"));
                source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(4); source.setMinimumIdle(1);
                JdbcTemplate jdbc = new JdbcTemplate(source);
                String formal = Files.readString(Path.of(args[2], "cloudflow-backend/DB/01.cloudflow-common.sql"));
                for (String table : List.of("sys_tenant", "sys_job", "sys_job_log")) {
                    Matcher ddl = Pattern.compile("(?s)CREATE TABLE " + table + " [(].*?ENGINE=InnoDB.*?;").matcher(formal);
                    check(ddl.find(), "formal table " + table); jdbc.execute(ddl.group());
                }
                MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
                configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
                GlobalConfig global = new GlobalConfig();
                global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
                GlobalConfigUtils.setGlobalConfig(configuration, global);
                configuration.addMapper(SysJobMapper.class); configuration.addMapper(SysJobLogMapper.class);
                MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
                factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
                factory.setMapperLocations(new FileSystemResource(Path.of(args[2], "cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/SysJobMapper.xml")));
                factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
                SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
                SysJobMapper jobs = sessions.getMapper(SysJobMapper.class);
                SysJobLogMapper logs = sessions.getMapper(SysJobLogMapper.class);
                JobPlatformService service = service(jobs, logs);
                TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
                jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status) VALUES (10,'t10','t10','0'),(20,'t20','t20','0'),(30,'t30','t30','1'),(40,'t40','t40','0'),(50,'t50','t50','0')");
                jdbc.update("UPDATE sys_tenant SET expire_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE tenant_id=40");
                context(10L);
                for (String name : List.of("auth", "hr", "oa", "crm")) {
                    JobExecuteDTO first = transaction.execute(status -> service.registerBusinessJob(request("batchImport"), name));
                    check(first != null && first.getJobId() != null && first.getJobLogId() != null
                            && first.getTimeoutSeconds() == 600 && first.getLockTimeSeconds() == 600 && first.getConcurrentFlag() == 1, "first use defaults " + name);
                    JobExecuteDTO again = transaction.execute(status -> service.registerBusinessJob(request("batchImport"),
                            "auth".equals(name) ? "cloudflow-auth" : "cloudflow-service-" + name));
                    check(again != null && first.getJobId().equals(again.getJobId()) && !first.getJobLogId().equals(again.getJobLogId()), "repeat and alias reuse " + name);
                }
                check(count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=10 AND status='PAUSED' AND handler_param IS NULL") == 4, "four manual configs stay paused");
                context(20L);
                jdbc.update("INSERT INTO sys_job(tenant_id,job_name,service_name,handler_name,handler_param) VALUES (20,'fixed','oa','batchImport','fixed')");
                JobExecuteDTO separate = transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "oa"));
                check(separate != null && count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=20") == 2
                        && count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=20 AND handler_param='fixed' AND status='ENABLED'") == 1, "tenant and fixed schedule preserved");
                jdbc.update("INSERT INTO sys_job(tenant_id,job_name,service_name,handler_name) VALUES (20,'duplicate','oa','batchImport')");
                rejected(() -> transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "oa")), "ambiguous config rejected");
                rejected(() -> transaction.execute(status -> service.registerBusinessJob(request("other"), "oa")), "unapproved handler rejected");
                rejected(() -> transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "workflow")), "unapproved service rejected");
                rejected(() -> transaction.execute(status -> service.registerBusinessJob(request("hrPayrollBatchCalculate"), "hr")), "non-import missing config remains explicit");
                for (Long tenant : List.of(30L, 40L, 99L)) {
                    context(tenant);
                    rejected(() -> transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "crm")), "inactive expired or absent tenant " + tenant);
                }
                check(count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id IN (30,40,99)") == 0, "denied tenants create no config");
                context(50L);
                transaction.executeWithoutResult(status -> { service.registerBusinessJob(request("batchImport"), "auth"); status.setRollbackOnly(); });
                check(count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=50") == 0
                        && count(jdbc, "SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=50") == 0, "config and execution roll back together");
                concurrent(jobs, logs, jdbc, transaction);
                System.out.println("IMPORT_JOB_INITIALIZATION_BASIC: checks=" + checks + "; failed=0; real_service_mapper_mysql=true; full_http_browser=false");
            } finally {
                UserContext.clear(); TenantContext.clear();
                if (!schema.matches("g2_import_job_[a-f0-9]{12}")) throw new IllegalStateException("Schema boundary");
                statement.execute("DROP DATABASE " + schema);
                System.out.println("IMPORT_JOB_INITIALIZATION_CLEANUP: disposable_schema_removed=true; original_schema_untouched=true");
            }
        }
    }

    private static void concurrent(SysJobMapper jobs, SysJobLogMapper logs, JdbcTemplate jdbc, TransactionTemplate transaction) throws Exception {
        CyclicBarrier firstReads = new CyclicBarrier(2);
        ThreadLocal<Boolean> initial = ThreadLocal.withInitial(() -> true);
        SysJobMapper observed = (SysJobMapper) Proxy.newProxyInstance(SysJobMapper.class.getClassLoader(), new Class<?>[]{SysJobMapper.class}, (proxy, method, values) -> {
            try {
                Object result = method.invoke(jobs, values);
                if (method.getName().equals("selectList") && initial.get()) {
                    initial.set(false); firstReads.await(10, TimeUnit.SECONDS);
                }
                return result;
            } catch (InvocationTargetException exception) { throw exception.getCause(); }
        });
        JobPlatformService service = service(observed, logs);
        ExecutorService executor = Executors.newFixedThreadPool(2);
        try {
            Future<JobExecuteDTO> left = executor.submit(() -> {
                context(50L); try { return transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "hr")); }
                finally { UserContext.clear(); TenantContext.clear(); initial.remove(); }
            });
            Future<JobExecuteDTO> right = executor.submit(() -> {
                context(50L); try { return transaction.execute(status -> service.registerBusinessJob(request("batchImport"), "hr")); }
                finally { UserContext.clear(); TenantContext.clear(); initial.remove(); }
            });
            JobExecuteDTO first = left.get(20, TimeUnit.SECONDS); JobExecuteDTO second = right.get(20, TimeUnit.SECONDS);
            check(first.getJobId().equals(second.getJobId()) && !first.getJobLogId().equals(second.getJobLogId())
                    && count(jdbc, "SELECT COUNT(*) FROM sys_job WHERE tenant_id=50") == 1
                    && count(jdbc, "SELECT COUNT(*) FROM sys_job_log WHERE tenant_id=50") == 2, "concurrent first use reuses one config under repeatable read");
        } finally { executor.shutdownNow(); executor.awaitTermination(5, TimeUnit.SECONDS); }
    }
    private static JobPlatformService service(SysJobMapper jobs, SysJobLogMapper logs) {
        return new JobPlatformService(jobs, logs, null, null, null, null, null, null, new ObjectMapper(), null, null);
    }
    private static BusinessJobStartRequest request(String handler) {
        BusinessJobStartRequest request = new BusinessJobStartRequest();
        request.setExecuteNo(UUID.randomUUID().toString()); request.setHandlerName(handler); request.setHandlerParam("{}"); request.setOperatorName("basic-check");
        return request;
    }
    private static void context(Long tenant) { UserContext.setTenantId(tenant); TenantContext.setTenantId(tenant); }
    private static long count(JdbcTemplate jdbc, String sql) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class)); }
    private static void rejected(Runnable action, String label) {
        try { action.run(); throw new AssertionError(label); } catch (ServiceException expected) { checks++; }
    }
    private static void check(boolean passed, String label) { if (!passed) throw new AssertionError(label); checks++; }
}

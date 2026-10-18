package com.cloudflow.auth.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.Wrapper;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysJob;
import com.cloudflow.auth.mapper.SysJobMapper;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicBoolean;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class JobDeletionDatabaseChecks {
    private static final long TENANT = 982092809L;
    private static int checks;
    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 2 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.*")) throw new IllegalArgumentException("Owned database required");
        try (HikariDataSource source = new HikariDataSource()) {
            source.setJdbcUrl(arguments[0]); source.setUsername("root"); source.setPassword(""); source.setMaximumPoolSize(2);
            JdbcTemplate jdbc = new JdbcTemplate(source);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(jdbc.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned data directory");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE tenant_id=?", Long.class, TENANT), "fixture tenant unused");
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
            GlobalConfigUtils.setGlobalConfig(configuration, global);
            configuration.addMapper(SysJobMapper.class); configuration.addMapper(SysAuditLogMapper.class);
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
            SysJobMapper actual = sessions.getMapper(SysJobMapper.class); AtomicBoolean stale = new AtomicBoolean();
            SysJobMapper observed = (SysJobMapper) Proxy.newProxyInstance(SysJobMapper.class.getClassLoader(), new Class<?>[]{SysJobMapper.class}, (proxy, method, values) -> {
                if ((method.getName().equals("update") || method.getName().equals("updateById")) && stale.compareAndSet(true, false)) {
                    equal(1, jdbc.update("UPDATE sys_job SET version=version+1 WHERE tenant_id=? AND job_name='job-delete-stale'", TENANT), "concurrent version advance");
                }
                try { return method.invoke(actual, values); } catch (InvocationTargetException error) { throw error.getCause(); }
            });
            JobPlatformService service = new JobPlatformService(observed, null, null, null, null, null, null, null, new ObjectMapper().findAndRegisterModules(), null, sessions.getMapper(SysAuditLogMapper.class));
            UserContext.setTenantId(TENANT); TenantContext.setTenantId(TENANT); UserContext.setUserName("job-delete-check");
            TransactionTemplate transaction = new TransactionTemplate(new DataSourceTransactionManager(source));
            transaction.executeWithoutResult(status -> {
                try {
                    long own = insert(jdbc, TENANT, "job-delete-own", 0), foreign = insert(jdbc, TENANT + 1, "job-delete-foreign", 0);
                    denied(() -> service.remove(List.of(foreign), false), "foreign task rejected");
                    equal(0, jdbc.queryForObject("SELECT deleted FROM sys_job WHERE job_id=?", Integer.class, foreign), "foreign task preserved");
                    service.remove(List.of(own), false);
                    equal("1:PAUSED:1:job-delete-check", jdbc.queryForObject("SELECT CONCAT(deleted,':',status,':',version,':',update_by) FROM sys_job WHERE job_id=?", String.class, own), "deletion persisted with actor and version");
                    equal(null, actual.selectById(own), "deleted task hidden by real mapper");
                    equal(1L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_field=? AND after_val='DELETED'", Long.class, TENANT, "job:" + own), "one deletion audit");
                    denied(() -> service.remove(List.of(own), false), "repeated delete rejected");
                    long critical = insert(jdbc, TENANT, "job-delete-critical", 1);
                    denied(() -> service.remove(List.of(critical), false), "critical confirmation required");
                    equal(0, jdbc.queryForObject("SELECT deleted FROM sys_job WHERE job_id=?", Integer.class, critical), "critical task preserved");
                    service.remove(List.of(critical), true);
                    equal(1, jdbc.queryForObject("SELECT deleted FROM sys_job WHERE job_id=?", Integer.class, critical), "confirmed critical task deleted");
                    long changed = insert(jdbc, TENANT, "job-delete-stale", 0); stale.set(true);
                    denied(() -> service.remove(List.of(changed), false), "stale deletion rejected");
                    equal(0, jdbc.queryForObject("SELECT deleted FROM sys_job WHERE job_id=?", Integer.class, changed), "stale task remains live");
                    equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=? AND audit_field=?", Long.class, TENANT, "job:" + changed), "stale deletion not audited as success");
                } finally { status.setRollbackOnly(); }
            });
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE tenant_id IN (?,?)", Long.class, TENANT, TENANT + 1), "task fixtures rolled back");
            equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE tenant_id=?", Long.class, TENANT), "audit fixtures rolled back");
            System.out.println("JOB_DELETE_DATABASE: checks=" + checks + "; real_mapper=true; real_service=true; tenant_isolation=true; stale_write_rejected=true; fixtures_rolled_back=true; production_modified=false");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }
    private static long insert(JdbcTemplate jdbc, long tenant, String name, int critical) {
        jdbc.update("INSERT INTO sys_job(tenant_id,job_name,job_group,service_name,handler_name,trigger_type,cron_expression,status,critical_flag,deleted,version) VALUES(?,?,'HR','hr','hrPayrollBatchCalculate','CRON','0 0 0 1 1 ?','PAUSED',?,0,0)", tenant, name, critical);
        return Objects.requireNonNull(jdbc.queryForObject("SELECT LAST_INSERT_ID()", Long.class));
    }
    private static void denied(Runnable action, String label) { try { action.run(); throw new AssertionError(label); } catch (ServiceException expected) { checks++; } }
    private static void equal(Object expected, Object actual, String label) { if (!Objects.equals(expected, actual)) throw new AssertionError(label + ": expected=" + expected + "; actual=" + actual); checks++; }
}

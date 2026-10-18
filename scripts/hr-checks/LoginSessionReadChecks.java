package com.cloudflow.hr.checks;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.parser.JsqlParserGlobal;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.session.LoginSessionPolicyService;
import com.cloudflow.common.tenant.session.mapper.LoginSessionMapper;
import com.cloudflow.hr.mapper.HrEmployeeMapper;
import java.nio.file.Path;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

/** Actual identity SQL and production tenant interception; no cached or simulated query results. */
public final class LoginSessionReadChecks {
    private static final long OWNER = 995901L, TARGET = 995902L, USER = 995903L, ROLE = 995904L, SYNC = 995905L;
    private static int checks;
    private final JdbcTemplate jdbc;
    private final LoginSessionPolicyService policy;
    private final LoginSessionMapper mapper;
    private final HrEmployeeMapper employees;
    private final DataSourceTransactionManager transactions;
    private final AtomicInteger parses = new AtomicInteger();

    public static void main(String[] args) throws Exception {
        if (args.length != 2 || !args[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/h2_settlement_foundation_[a-f0-9]{32}\\?.*")) {
            throw new IllegalArgumentException("Owned scratch database required");
        }
        try {
            LoginSessionReadChecks fixture = new LoginSessionReadChecks(args);
            fixture.seed();
            fixture.identity();
            fixture.switching();
            fixture.syncFence();
            fixture.committedRevision();
            fixture.tenantIsolation();
            fixture.unavailable();
            System.out.println("LOGIN_SESSION_READ: checks=" + checks + "; actual_mysql=true; actual_service=true; production_tenant_interceptor=true; session_parses=0; normal_queries_filtered=true; committed_revision=true");
        } finally {
            TenantContext.clear();
            JsqlParserGlobal.setParserSingleFunc(sql -> CCJSqlParserUtil.parse(sql, JsqlParserGlobal.executorService, null));
        }
    }

    private LoginSessionReadChecks(String[] args) throws Exception {
        DriverManagerDataSource data = new DriverManagerDataSource(args[0], "root", "");
        jdbc = new JdbcTemplate(data);
        require(Path.of(args[1]).toRealPath().equals(Path.of(Objects.requireNonNull(jdbc.queryForObject("SELECT @@datadir", String.class))).toRealPath()), "owned data directory");
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig());
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(LoginSessionMapper.class);
        configuration.addMapper(HrEmployeeMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(data); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new ClassPathResource("mapper/tenant/LoginSessionMapper.xml"));
        SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        mapper = sessions.getMapper(LoginSessionMapper.class);
        employees = sessions.getMapper(HrEmployeeMapper.class);
        transactions = new DataSourceTransactionManager(data);
        policy = new LoginSessionPolicyService(mapper, transactions);
        JsqlParserGlobal.setParserSingleFunc(sql -> {
            parses.incrementAndGet();
            return CCJSqlParserUtil.parse(sql, JsqlParserGlobal.executorService, null);
        });
    }

    private void seed() {
        jdbc.update("INSERT INTO sys_tenant(tenant_id,tenant_code,tenant_name,status,deleted) VALUES (?,'session-read-owner','Session owner','0',0),(?,'session-read-target','Session target','0',0)", OWNER, TARGET);
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,status,deleted,version) VALUES (?,?,'session-read-user','Session user','0',0,7)", USER, OWNER);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (?,?,'Session role','employee',1,'0',0)", ROLE, OWNER);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,?,?)", USER, ROLE, OWNER);
        jdbc.update("INSERT INTO hr_employee(id,tenant_id,employee_no,name,gender) VALUES (?,?,'session-read-owner','Owner employee','MALE'),(?,?,'session-read-target','Target employee','MALE')", OWNER, OWNER, TARGET, TARGET);
        jdbc.update("INSERT INTO sys_im_sync_run(sync_run_id,tenant_id,config_id,config_version,mode,snapshot_hash,result_summary,status,requested_by) VALUES (?,?,?,0,'APPLY',REPEAT('a',64),JSON_OBJECT('effectsPending',false),'RUNNING',?)", SYNC, OWNER, SYNC, USER);
    }

    private void accepts(boolean expected, long owner, long tenant, long user, int revision, String label) {
        int before = parses.get();
        require(policy.accepts(owner, tenant, user, revision) == expected, label);
        require(parses.get() == before, "identity SQL avoids unused tenant parsing: " + label);
    }

    private void identity() {
        accepts(true, OWNER, OWNER, USER, 7, "valid owner session");
        accepts(false, OWNER, OWNER, USER, 6, "stale revision");
        accepts(false, TARGET, TARGET, USER, 7, "forged owner");
        accepts(false, OWNER, OWNER, USER + 100, 7, "missing user");
        for (long invalid : List.of(0L, -1L, Long.MAX_VALUE)) {
            accepts(false, invalid, OWNER, USER, 7, "invalid owner");
            accepts(false, OWNER, invalid, USER, 7, "invalid target");
        }
        accepts(false, OWNER, OWNER, USER, -1, "invalid revision");
        jdbc.update("UPDATE sys_user SET status='1' WHERE user_id=?", USER);
        accepts(false, OWNER, OWNER, USER, 7, "disabled account");
        jdbc.update("UPDATE sys_user SET status='0',deleted=1 WHERE user_id=?", USER);
        accepts(false, OWNER, OWNER, USER, 7, "deleted account");
        jdbc.update("UPDATE sys_user SET deleted=0 WHERE user_id=?", USER);
        for (long tenant : List.of(OWNER, TARGET)) {
            jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=?", tenant);
            accepts(false, OWNER, tenant, USER, 7, "disabled tenant");
            jdbc.update("UPDATE sys_tenant SET status='0',deleted=1 WHERE tenant_id=?", tenant);
            accepts(false, OWNER, tenant, USER, 7, "deleted tenant");
            jdbc.update("UPDATE sys_tenant SET deleted=0,expire_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE tenant_id=?", tenant);
            accepts(false, OWNER, tenant, USER, 7, "expired tenant");
            jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=?", tenant);
        }
    }

    private void switching() {
        accepts(false, OWNER, TARGET, USER, 7, "employee cannot switch tenant");
        jdbc.update("UPDATE sys_role SET role_key='admin' WHERE role_id=?", ROLE);
        accepts(true, OWNER, TARGET, USER, 7, "administrator can switch tenant");
        jdbc.update("UPDATE sys_role SET status='1' WHERE role_id=?", ROLE);
        accepts(false, OWNER, TARGET, USER, 7, "disabled admin role");
        jdbc.update("UPDATE sys_role SET status='0',deleted=1 WHERE role_id=?", ROLE);
        accepts(false, OWNER, TARGET, USER, 7, "deleted admin role");
        jdbc.update("UPDATE sys_role SET deleted=0,tenant_id=? WHERE role_id=?", TARGET, ROLE);
        accepts(false, OWNER, TARGET, USER, 7, "foreign admin role");
        jdbc.update("UPDATE sys_role SET tenant_id=? WHERE role_id=?", OWNER, ROLE);
        jdbc.update("UPDATE sys_user_role SET tenant_id=? WHERE user_id=? AND role_id=?", TARGET, USER, ROLE);
        accepts(false, OWNER, TARGET, USER, 7, "foreign role binding");
        jdbc.update("UPDATE sys_user_role SET tenant_id=? WHERE user_id=? AND role_id=?", OWNER, USER, ROLE);
        for (long tenant : List.of(OWNER, TARGET)) {
            jdbc.update("UPDATE sys_tenant SET status='1' WHERE tenant_id=?", tenant);
            accepts(false, OWNER, TARGET, USER, 7, "switch cannot bypass disabled owner or target");
            jdbc.update("UPDATE sys_tenant SET status='0',deleted=1 WHERE tenant_id=?", tenant);
            accepts(false, OWNER, TARGET, USER, 7, "switch cannot bypass deleted owner or target");
            jdbc.update("UPDATE sys_tenant SET deleted=0 WHERE tenant_id=?", tenant);
            jdbc.update("UPDATE sys_tenant SET expire_time=DATE_SUB(NOW(),INTERVAL 1 DAY) WHERE tenant_id=?", tenant);
            accepts(false, OWNER, TARGET, USER, 7, "switch cannot bypass owner or target expiry");
            jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=?", tenant);
        }
        accepts(true, OWNER, TARGET, USER, 7, "admin restored");
    }

    private void syncFence() {
        for (long tenant : List.of(OWNER, TARGET)) {
            jdbc.update("UPDATE sys_im_sync_run SET tenant_id=? WHERE sync_run_id=?", tenant, SYNC);
            for (String pending : List.of("{}", "null", "{\"effectsPending\":null}", "{\"effectsPending\":0}", "{\"effectsPending\":\"false\"}", "{\"effectsPending\":true}")) {
                jdbc.update("UPDATE sys_im_sync_run SET result_summary=? WHERE sync_run_id=?", pending, SYNC);
                accepts(false, OWNER, TARGET, USER, 7, "missing or pending cleanup fence on either tenant");
            }
            jdbc.update("UPDATE sys_im_sync_run SET result_summary=JSON_OBJECT('effectsPending',false) WHERE sync_run_id=?", SYNC);
            accepts(true, OWNER, TARGET, USER, 7, "explicit no-pending marker");
        }
        jdbc.update("UPDATE sys_im_sync_run SET result_summary=JSON_OBJECT('effectsPending',true),tenant_id=100000 WHERE sync_run_id=?", SYNC);
        accepts(true, OWNER, TARGET, USER, 7, "unrelated tenant fence excluded");
        jdbc.update("UPDATE sys_im_sync_run SET tenant_id=?,mode='PREVIEW' WHERE sync_run_id=?", OWNER, SYNC);
        accepts(true, OWNER, TARGET, USER, 7, "preview excluded");
        jdbc.update("UPDATE sys_im_sync_run SET mode='APPLY',status='COMPLETED' WHERE sync_run_id=?", SYNC);
        accepts(true, OWNER, TARGET, USER, 7, "completed run excluded");
    }

    private void committedRevision() throws Exception {
        ExecutorService changes = Executors.newSingleThreadExecutor();
        TransactionTemplate outer = new TransactionTemplate(transactions);
        outer.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
        try {
            outer.execute(status -> {
                require(jdbc.queryForObject("SELECT version FROM sys_user WHERE user_id=?", Integer.class, USER) == 7, "original snapshot");
                try { changes.submit(() -> jdbc.update("UPDATE sys_user SET version=8 WHERE user_id=?", USER)).get(10, TimeUnit.SECONDS); }
                catch (Exception failure) { throw new IllegalStateException(failure); }
                accepts(false, OWNER, OWNER, USER, 7, "committed account change rejects old session immediately");
                accepts(true, OWNER, OWNER, USER, 8, "fresh revision accepted outside caller snapshot");
                require(jdbc.queryForObject("SELECT version FROM sys_user WHERE user_id=?", Integer.class, USER) == 7, "caller snapshot remains repeatable read");
                return null;
            });
        } finally { changes.shutdownNow(); require(changes.awaitTermination(10, TimeUnit.SECONDS), "revision worker stopped"); }
    }

    private void tenantIsolation() {
        for (boolean skip : List.of(false, true)) {
            TenantContext.setTenantId(TARGET);
            if (skip) TenantContext.setTenantSkip(); else TenantContext.clearTenantSkip();
            accepts(true, OWNER, OWNER, USER, 8, "caller tenant does not replace verified owner");
            require(Objects.equals(TenantContext.getTenantId(), TARGET) && TenantContext.getTenantSkip() == skip, "caller tenant context restored");
        }
        TenantContext.clearTenantSkip();
        int before = parses.get();
        require(employees.selectById(OWNER) == null, "ordinary mapper still rejects foreign employee");
        require(employees.selectById(TARGET) != null, "ordinary mapper still reads own employee");
        require(parses.get() > before, "production tenant parser still applied to ordinary mapper");
        TenantContext.clear();
        require(mapper.active(OWNER, TARGET, USER, 7) == 0, "direct mapper cannot bypass explicit version");
        require(mapper.active(TARGET, TARGET, USER, 8) == 0, "direct mapper cannot forge owner");
    }

    private void unavailable() {
        jdbc.execute("RENAME TABLE sys_im_sync_run TO session_read_unavailable");
        try { accepts(false, OWNER, OWNER, USER, 8, "database failure rejects identity"); }
        finally { jdbc.execute("RENAME TABLE session_read_unavailable TO sys_im_sync_run"); }
        accepts(true, OWNER, OWNER, USER, 8, "restored database accepts current identity");
    }

    private static void require(boolean condition, String label) {
        checks++;
        if (!condition) throw new AssertionError(label);
    }
}

package com.cloudflow.auth.im;

import cn.dev33.satoken.SaManager;
import cn.dev33.satoken.config.SaTokenConfig;
import cn.dev33.satoken.dao.SaTokenDao;
import cn.dev33.satoken.dao.SaTokenDaoDefaultImpl;
import cn.dev33.satoken.stp.StpLogic;
import cn.dev33.satoken.stp.StpUtil;
import cn.dev33.satoken.stp.parameter.SaLoginParameter;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.mapper.ImMapper;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.security.core.TokenService;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.common.tenant.entitlement.TenantPermissionPolicyService;
import com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sun.net.httpserver.HttpServer;
import jakarta.validation.Validation;
import jakarta.validation.ValidatorFactory;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.net.InetSocketAddress;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.ResultSet;
import java.sql.Statement;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.Callable;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.support.TransactionSynchronizationManager;

public final class ImConfigDatabaseChecks {
    private static int assertions;
    private static final long TENANT = 100000L;
    private static final long OTHER_TENANT = 990100L;
    private static final long OTHER_ADMIN = 990101L;
    private static final String ACCESS_TOKEN = "config-test-access-token-never-log";
    private final JdbcTemplate jdbc;
    private final ImMapper mapper;
    private final ImDatabase database;
    private final SqlSessionTemplate sessions;
    private final ImConfigService service;
    private final ImConfigRules rules;
    private final ImActors actors;
    private final SysAuditLogMapper audits;
    private final ImProperties properties = ImConfigChecks.properties();
    private final AtomicBoolean failAudit = new AtomicBoolean();
    private final AtomicInteger networkCalls = new AtomicInteger();
    private final AtomicReference<Runnable> responseHook = new AtomicReference<>(() -> { });
    private final AtomicReference<String> responseBody = new AtomicReference<>("{\"access_token\":\"" + ACCESS_TOKEN + "\",\"expires_in\":7200}");
    private final ThreadLocal<String> token = new ThreadLocal<>();
    private final TokenService tokens = new TokenService() {
        @Override public String getCurrentTokenValue() { return token.get(); }
    };
    private final long adminId;
    private final long employeeId;
    private final String adminToken;
    private final HttpServer server;

    private ImConfigDatabaseChecks(String url, ValidatorFactory validators, HttpServer server) throws Exception {
        this.server = server;
        DriverManagerDataSource source = new DriverManagerDataSource(url, "root", "");
        jdbc = new JdbcTemplate(source);
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setCacheEnabled(false);
        configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
        configuration.setDefaultStatementTimeout("true".equals(System.getenv("IM_CHECK_SYNC_EFFECTS")) ? 120 : 10);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setBanner(false);
        global.setDbConfig(new GlobalConfig.DbConfig());
        global.setMetaObjectHandler(new MyMetaObjectHandler());
        com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(ImMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.ImCallbackMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.ImTodoMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMessageDeliveryMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMessageRecordMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMessageChannelMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMessageTemplateMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMessageSubscribeMapper.class);
        configuration.addMapper(SysAuditLogMapper.class);
        configuration.addMapper(TenantEntitlementMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.ImOrganizationMapper.class);
        configuration.addMapper(com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper.class);
        configuration.addMapper(com.cloudflow.common.event.outbox.OutboxEventMapper.class);
        configuration.addMapper(com.cloudflow.common.tenant.session.mapper.LoginSessionMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysUserMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysUserTotpMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysUserLoginHistoryMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.OAuthMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysJobMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysJobLogMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysJobHandlerMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setMapperLocations(new Resource[]{new ClassPathResource("mapper/auth/ImMapper.xml"), new ClassPathResource("mapper/auth/ImCallbackMapper.xml"),
                new ClassPathResource("mapper/auth/ImTodoMapper.xml"), new ClassPathResource("mapper/SysMessageDeliveryMapper.xml"),
                new ClassPathResource("mapper/tenant/TenantEntitlementMapper.xml"), new ClassPathResource("mapper/auth/ImOrganizationMapper.xml"),
                new ClassPathResource("mapper/tenant/TenantQuotaMapper.xml"), new ClassPathResource("mapper/OutboxEventMapper.xml"),
                new ClassPathResource("mapper/tenant/LoginSessionMapper.xml"), new ClassPathResource("mapper/auth/SysUserMapper.xml"),
                new ClassPathResource("mapper/auth/OAuthMapper.xml"), new ClassPathResource("mapper/auth/SysJobMapper.xml"),
                new ClassPathResource("mapper/auth/SysJobLogMapper.xml"), new ClassPathResource("mapper/auth/SysJobHandlerMapper.xml")});
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        mapper = sessions.getMapper(ImMapper.class);
        DataSourceTransactionManager manager = new DataSourceTransactionManager(source);
        database = new ImDatabase(mapper, manager);
        actors = new ImActors(tokens, new TenantPermissionPolicyService(sessions.getMapper(TenantEntitlementMapper.class), manager), database);
        rules = new ImConfigRules(properties, new ImSecretCipher(properties), validators.getValidator(), new ObjectMapper());
        SysAuditLogMapper realAudits = sessions.getMapper(SysAuditLogMapper.class);
        audits = (SysAuditLogMapper) Proxy.newProxyInstance(getClass().getClassLoader(), new Class<?>[]{SysAuditLogMapper.class},
                (proxy, method, arguments) -> {
                    check(TransactionSynchronizationManager.isActualTransactionActive(), "audit participates in configuration transaction");
                    if (failAudit.get()) throw new IllegalStateException("private-storage-detail-never-log");
                    try { return method.invoke(realAudits, arguments); }
                    catch (InvocationTargetException failure) { throw failure.getCause(); }
                });
        URI local = URI.create("http://127.0.0.1:" + server.getAddress().getPort());
        ImConnectionProbe probe = new ImConnectionProbe(new WeComHttp(WeComHttp.directClient(), official -> {
            check(!TransactionSynchronizationManager.isActualTransactionActive(), "network request runs outside database transaction");
            return local.resolve(official.getRawPath() + "?" + official.getRawQuery());
        }, Duration.ofSeconds(5)));
        service = new ImConfigService(actors, database, rules, properties, probe, audits);
        adminId = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=1", Long.class);
        employeeId = jdbc.queryForObject("SELECT MIN(user_id) FROM sys_user_role WHERE tenant_id=100000 AND role_id=5", Long.class);
        fixtures();
        adminToken = login(adminId, TENANT);
        server.createContext("/cgi-bin/gettoken", exchange -> {
            networkCalls.incrementAndGet();
            responseHook.getAndSet(() -> { }).run();
            byte[] content = responseBody.get().getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.sendResponseHeaders(200, content.length);
            exchange.getResponseBody().write(content);
            exchange.close();
        });
        server.start();
    }

    public static void main(String[] arguments) throws Exception {
        check((arguments.length == 2 || arguments.length == 3 && List.of("sync-preview", "sync-write", "sync-execute", "sync-schedule", "login-accounts", "binding-identity", "binding-flow", "callbacks").contains(arguments[2]))
                && arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]{4,5}/g4_im_config_[a-f0-9]{32}\\?.+"), "owned scratch database URL required");
        try (Connection connection = DriverManager.getConnection(arguments[0], "root", ""); Statement statement = connection.createStatement();
                ResultSet result = statement.executeQuery("SELECT @@datadir, DATABASE()")) {
            check(result.next() && Path.of(result.getString(1)).toRealPath().equals(Path.of(arguments[1]).toRealPath()), "owned server data directory");
            check(result.getString(2).matches("g4_im_config_[a-f0-9]{32}"), "disposable schema only");
        }
        SaTokenConfig previousConfig = SaManager.getConfig();
        SaTokenDao previousDao = SaManager.getSaTokenDao();
        StpLogic previousLogic = StpUtil.getStpLogic();
        SaManager.setConfig(new SaTokenConfig().setTokenName("Authorization").setIsPrint(false).setDataRefreshPeriod(-1));
        SaTokenDaoDefaultImpl ownedDao = new SaTokenDaoDefaultImpl();
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        server.setExecutor(workers);
        try (ValidatorFactory validators = Validation.buildDefaultValidatorFactory()) {
            SaManager.setSaTokenDao(ownedDao);
            StpUtil.setStpLogic(new StpLogic("login"));
            ImConfigDatabaseChecks fixture = new ImConfigDatabaseChecks(arguments[0], validators, server);
            fixture.run();
            System.out.println("G4_IM_CONFIG_DATABASE: assertions=" + assertions
                    + "; failed=0; real_mysql=true; real_mybatis=true; real_transactions=true; real_loopback_http=true; real_satoken=true; redis=false; vendor_service=false; production_modified=false");
            if (arguments.length == 3 && "callbacks".equals(arguments[2])) {
                new ImCallbackDatabaseChecks(fixture.jdbc, fixture.database, fixture.sessions, fixture.rules, fixture.properties, fixture.audits, fixture.failAudit).run();
                fixture.todoManagement();
            } else if (arguments.length == 3 && List.of("binding-identity", "binding-flow").contains(arguments[2])) {
                new ImBindingIdentityChecks(fixture.jdbc, fixture.database, fixture.sessions, fixture.actors, fixture.properties,
                        fixture::login, fixture.token::set).run("binding-flow".equals(arguments[2]));
            } else if (arguments.length == 3 && "login-accounts".equals(arguments[2])) {
                new ImLoginAccountDatabaseChecks(fixture.jdbc, fixture.mapper, fixture.database, fixture.rules, fixture.properties, fixture.sessions).run();
            } else if (arguments.length == 3 && "sync-schedule".equals(arguments[2])) {
                new ImSyncWriteDatabaseChecks(fixture.jdbc, fixture.mapper, fixture.database, fixture.sessions,
                        fixture.service, fixture.actors, fixture.rules, fixture.properties, fixture.audits, fixture.failAudit, fixture::login)
                        .runSchedule(fixture.properties);
            } else if (arguments.length == 3 && "sync-execute".equals(arguments[2])) {
                new ImSyncWriteDatabaseChecks(fixture.jdbc, fixture.mapper, fixture.database, fixture.sessions,
                        fixture.service, fixture.actors, fixture.rules, fixture.properties, fixture.audits, fixture.failAudit, fixture::login)
                        .runExecution(server, fixture.token::set, fixture.properties);
            } else if (arguments.length == 3) {
                new ImSyncDatabaseChecks(fixture.jdbc, fixture.mapper, fixture.database, fixture.service, fixture.actors,
                        fixture.rules, fixture.properties, fixture.audits, fixture.failAudit, server, fixture::login, fixture.token::set).run();
                if ("sync-write".equals(arguments[2])) {
                    new ImSessionPolicyDatabaseChecks(fixture.jdbc, fixture.database, fixture.sessions).run();
                    new ImSyncWriteDatabaseChecks(fixture.jdbc, fixture.mapper, fixture.database, fixture.sessions,
                            fixture.service, fixture.actors, fixture.rules, fixture.properties, fixture.audits, fixture.failAudit, fixture::login).run();
                }
            }
        } finally {
            server.stop(0);
            workers.shutdownNow();
            TenantContext.clear();
            StpUtil.setStpLogic(previousLogic);
            SaManager.setSaTokenDao(previousDao);
            ownedDao.destroy();
            if (previousDao instanceof SaTokenDaoDefaultImpl localDao) localDao.destroy();
            SaManager.setConfig(previousConfig);
        }
    }

    private void fixtures() {
        equal(12, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1799", Integer.class), "formal IM menu count");
        equal("1780:system:im:config:list,1781:system:im:config:manage,1782:system:im:config:test,1783:system:im:sync:preview,1784:system:im:sync:run,1785:system:im:sync:list,1786:system:im:binding:list,1787:system:im:binding:manage,1788:system:im:binding:mine,1789:system:im:binding:bind,1790:system:im:binding:unbind,1791:system:im:todo:reconcile", jdbc.queryForObject("SELECT GROUP_CONCAT(CONCAT(menu_id,':',perms) ORDER BY menu_id) FROM sys_menu WHERE menu_id BETWEEN 1780 AND 1799", String.class), "formal IM menu permissions");
        equal("1:100000", jdbc.queryForObject("SELECT GROUP_CONCAT(CONCAT(role_id,':',tenant_id)) FROM sys_role_menu WHERE menu_id=1791", String.class), "todo reconcile exact approved administrator grant");
        equal("1:1786:100000,1:1787:100000", jdbc.queryForObject("SELECT GROUP_CONCAT(CONCAT(role_id,':',menu_id,':',tenant_id) ORDER BY menu_id) FROM sys_role_menu WHERE menu_id IN (1786,1787)", String.class), "formal binding management exact admin grants");
        equal("1:1780:100000,1:1781:100000,1:1782:100000,1:1783:100000,1:1784:100000,1:1785:100000", jdbc.queryForObject("SELECT GROUP_CONCAT(CONCAT(role_id,':',menu_id,':',tenant_id) ORDER BY menu_id) FROM sys_role_menu WHERE menu_id BETWEEN 1780 AND 1785", String.class), "formal IM exact admin grants");
        equal(33, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1788 AND 1790 AND role_id BETWEEN 1 AND 11 AND tenant_id=100000", Integer.class), "formal self binding grants all approved roles");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE menu_id BETWEEN 1788 AND 1790 AND (role_id NOT BETWEEN 1 AND 11 OR tenant_id<>100000)", Integer.class), "no unrelated self binding grants");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE job_id=1784 AND tenant_id=100000 AND handler_name='imSyncRecovery' AND service_name='auth' AND status='ENABLED' AND interval_ms=60000 AND timeout_seconds=240 AND lock_time_seconds=300 AND concurrent_flag=0", Integer.class), "formal confirmed-recovery job seeded");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_job WHERE job_id=1785 AND tenant_id=100000 AND handler_name='imCallbackRecovery' AND service_name='auth' AND status='ENABLED' AND interval_ms=10000 AND timeout_seconds=240 AND lock_time_seconds=300 AND concurrent_flag=0", Integer.class), "formal durable-callback recovery job seeded");
        jdbc.update("UPDATE sys_user SET pwd_reset_required='0',status='0',deleted=0 WHERE user_id IN (?,?) AND tenant_id=100000", adminId, employeeId);
        jdbc.update("UPDATE sys_tenant SET expire_time=NULL,status='0',deleted=0 WHERE tenant_id=100000");
        jdbc.update("INSERT INTO sys_tenant (tenant_id,tenant_code,tenant_name,status,deleted) VALUES (990100,'g4-im-other','G4隔离测试其他租户','0',0)");
        jdbc.update("INSERT INTO sys_user (user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required) SELECT 990101,990100,'g4-other-admin','G4其他管理员',password,'0',0,'0' FROM sys_user WHERE user_id=?", adminId);
        jdbc.update("INSERT INTO sys_role (role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (990101,990100,'G4管理员','admin',1,'0',0)");
        jdbc.update("INSERT INTO sys_user_role (user_id,role_id,tenant_id) VALUES (990101,990101,990100)");
        jdbc.update("INSERT INTO sys_role_menu (role_id,menu_id,tenant_id) VALUES (990101,1780,990100),(990101,1781,990100),(990101,1782,990100)");
    }

    private void run() throws Exception {
        equal(0L, service.list(1, 10).page().getTotal(), "no fabricated configuration");
        failAudit.set(true);
        rejected(() -> service.create(ImConfigChecks.createRequest()), "IM_AUDIT_UNAVAILABLE");
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_im_config", Integer.class), "audit failure rolls back configuration insert");
        failAudit.set(false);
        properties.setEnabled(false);
        ImViews.Config created = service.create(ImConfigChecks.createRequest());
        long configId = created.configId();
        equal("DISABLED", created.status(), "new application stays disabled");
        equal(1, jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_name='IM_CONFIG_CREATE' AND tenant_id=100000", Integer.class), "create writes one durable audit");
        rejected(() -> service.create(ImConfigChecks.createRequest()), "IM_CONFIG_EXISTS");
        rejected(() -> service.testConnection(configId, version(0)), "IM_DISABLED");
        equal(0, networkCalls.get(), "deployment disabled makes no network request");
        properties.setEnabled(true);
        ImConfigRow current = row(configId);
        ImSecretCipher cipher = new ImSecretCipher(properties);
        equal(ImConfigChecks.APP_KEY, cipher.decrypt(TENANT, "WECOM", ImSecretCipher.Field.APP_KEY, current.getAppKeyEncrypted()), "app key independently decrypted from database");
        equal(ImConfigChecks.APP_SECRET, cipher.decrypt(TENANT, "WECOM", ImSecretCipher.Field.APP_SECRET, current.getAppSecretEncrypted()), "app secret independently decrypted from database");
        equal(ImConfigChecks.CALLBACK_TOKEN, cipher.decrypt(TENANT, "WECOM", ImSecretCipher.Field.TOKEN, current.getTokenEncrypted()), "callback token independently decrypted from database");
        equal(ImConfigChecks.AES_KEY, cipher.decrypt(TENANT, "WECOM", ImSecretCipher.Field.AES_KEY, current.getAesKeyEncrypted()), "callback AES key independently decrypted from database");
        for (String secret : List.of(ImConfigChecks.APP_KEY, ImConfigChecks.APP_SECRET, ImConfigChecks.CALLBACK_TOKEN, ImConfigChecks.AES_KEY)) {
            String columns = jdbc.queryForObject("SELECT CONCAT_WS('|',app_key_encrypted,app_secret_encrypted,token_encrypted,aes_key_encrypted) FROM sys_im_config WHERE config_id=?", String.class, configId);
            check(!columns.contains(secret), "all persisted secrets encrypted");
            String view = new ObjectMapper().findAndRegisterModules().writeValueAsString(service.list(1, 10));
            check(!view.contains(secret) && !view.contains("im1:"), "ordinary response exposes configured flags only");
        }
        check(current.getAppKeyEncrypted().startsWith("im1:") && current.getAppSecretEncrypted().startsWith("im1:")
                && current.getTokenEncrypted().startsWith("im1:") && current.getAesKeyEncrypted().startsWith("im1:"), "all four fields have authenticated envelopes");
        System.out.println("G4_IM_CONFIG_DATABASE_SECRET_CHECKS: fields=4; database_decrypted=true; ordinary_responses_safe=true; real_mysql=true; real_http=false");
        String before = current.getAppSecretEncrypted();
        failAudit.set(true);
        ImConfigRequest failedChange = ImConfigChecks.editRequest(current);
        failedChange.setAppSecret(ImConfigChecks.change(ImConfigRequest.SecretAction.REPLACE, "replacement-secret-never-log"));
        rejected(() -> service.update(failedChange), "IM_AUDIT_UNAVAILABLE");
        equal(before, row(configId).getAppSecretEncrypted(), "audit failure rolls back secret replacement");
        equal(0, row(configId).getVersion(), "audit failure rolls back version increment");
        failAudit.set(false);
        ImViews.Config updated = service.update(ImConfigChecks.editRequest(current));
        equal(1, updated.version(), "version increments exactly once");
        equal(before, row(configId).getAppSecretEncrypted(), "KEEP persists identical ciphertext");
        rejected(() -> service.update(ImConfigChecks.editRequest(current)), "IM_VERSION_CONFLICT");
        check(service.testConnection(configId, version(1)).successful(), "real protocol token exchange succeeds");
        check(service.testConnection(configId, version(1)).successful(), "connection test does not reuse cache");
        equal(2, networkCalls.get(), "each connection test performs real fetch");
        responseBody.set("{\"errcode\":40013,\"errmsg\":\"private-provider-detail-never-log\"}");
        ImViews.TestResult failed = service.testConnection(configId, version(1));
        check(!failed.successful() && failed.reasonCode().equals("IM_PROVIDER_REJECTED") && !failed.message().contains("private-provider"), "remote failure stays explicit and safe");
        responseBody.set("{\"access_token\":\"" + ACCESS_TOKEN + "\",\"expires_in\":7200}");
        identity(configId);
        races(configId);
        permissionDuringNetwork(configId);
        preservedIdentity(configId);
        String audits = String.join("|", jdbc.queryForList("SELECT CONCAT_WS('|',before_val,after_val) FROM sys_audit_log WHERE audit_name LIKE 'IM_CONFIG_%'", String.class));
        for (String secret : List.of(ImConfigChecks.APP_KEY, ImConfigChecks.APP_SECRET, ImConfigChecks.CALLBACK_TOKEN, ImConfigChecks.AES_KEY, ACCESS_TOKEN, adminToken)) {
            check(!audits.contains(secret), "durable audit omits secrets and session token");
        }
        equal(0, jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5 AND menu_id BETWEEN 1780 AND 1787", Integer.class), "employee never receives IM management grants");
    }

    private void identity(long configId) {
        login(employeeId, TENANT);
        rejected(() -> service.list(1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> service.create(ImConfigChecks.createRequest()), "IM_PERMISSION_DENIED");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (5,1780,100000),(5,1781,100000)");
        rejected(() -> service.list(1, 10), "IM_PERMISSION_DENIED");
        rejected(() -> service.create(ImConfigChecks.createRequest()), "IM_PERMISSION_DENIED");
        jdbc.update("DELETE FROM sys_role_menu WHERE role_id=5 AND tenant_id=100000 AND menu_id IN (1780,1781)");
        login(OTHER_ADMIN, OTHER_TENANT);
        equal(0L, service.list(1, 10).page().getTotal(), "foreign tenant cannot list original configuration");
        ImConfigRequest guessed = ImConfigChecks.editRequest(row(configId));
        rejected(() -> service.update(guessed), "IM_CONFIG_NOT_FOUND");
        rejected(() -> service.testConnection(configId, version(guessed.getVersion())), "IM_CONFIG_NOT_FOUND");
        ImViews.Config other = service.create(ImConfigChecks.createRequest());
        check(other.configId() != configId, "same provider allowed once per different tenant");
        token.set(adminToken);
        TenantContext.setTenantId(OTHER_TENANT);
        TenantContext.setTenantSkip();
        equal(configId, service.list(1, 10).page().getRows().get(0).configId(), "session tenant overrides caller thread tenant and skip flag");
        equal(OTHER_TENANT, TenantContext.getTenantId(), "original tenant context restored");
        check(TenantContext.getTenantSkip(), "original skip flag restored after scoped read");
        TenantContext.clear();
        jdbc.update("UPDATE sys_user SET pwd_reset_required='1' WHERE user_id=?", adminId);
        rejected(() -> service.list(1, 10), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET pwd_reset_required='0',status='1' WHERE user_id=?", adminId);
        rejected(() -> service.list(1, 10), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_user SET status='0' WHERE user_id=?", adminId);
        jdbc.update("UPDATE sys_tenant SET expire_time='2000-01-01' WHERE tenant_id=100000");
        rejected(() -> service.list(1, 10), "IM_AUTHENTICATION_REQUIRED");
        jdbc.update("UPDATE sys_tenant SET expire_time=NULL WHERE tenant_id=100000");
        token.set("unissued-session");
        rejected(() -> service.list(1, 10), "IM_AUTHENTICATION_REQUIRED");
        token.set(adminToken);
    }

    private void races(long configId) throws Exception {
        int expected = row(configId).getVersion();
        CountDownLatch start = new CountDownLatch(1);
        ExecutorService workers = Executors.newFixedThreadPool(2);
        Callable<String> writer = () -> {
            token.set(adminToken);
            ImConfigRequest request = ImConfigChecks.editRequest(row(configId));
            request.setVersion(expected);
            check(start.await(5, TimeUnit.SECONDS), "concurrent writer starts");
            try { service.update(request); return "SAVED"; }
            catch (ImFailure failure) { return failure.getReasonCode(); }
            finally { token.remove(); }
        };
        try {
            Future<String> first = workers.submit(writer);
            Future<String> second = workers.submit(writer);
            start.countDown();
            List<String> outcomes = List.of(first.get(20, TimeUnit.SECONDS), second.get(20, TimeUnit.SECONDS));
            equal(1L, outcomes.stream().filter("SAVED"::equals).count(), "exactly one concurrent writer commits");
            equal(1L, outcomes.stream().filter("IM_VERSION_CONFLICT"::equals).count(), "stale concurrent writer rejected");
            equal(expected + 1, row(configId).getVersion(), "race increments version once");
        } finally { workers.shutdownNow(); }
        int version = row(configId).getVersion();
        responseHook.set(() -> jdbc.update("UPDATE sys_im_config SET version=version+1 WHERE config_id=?", configId));
        rejected(() -> service.testConnection(configId, version(version)), "IM_VERSION_CONFLICT");
    }

    private void permissionDuringNetwork(long configId) {
        int version = row(configId).getVersion();
        jdbc.update("UPDATE sys_tenant SET package_id=990100,package_version=0,effective_menu_ids='[6,1780,1781,1782]' WHERE tenant_id=100000");
        responseHook.set(() -> jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6,1780,1781]',version=version+1 WHERE tenant_id=100000"));
        rejected(() -> service.testConnection(configId, version(version)), "IM_PERMISSION_DENIED");
        jdbc.update("UPDATE sys_tenant SET effective_menu_ids='[6,1780]' WHERE tenant_id=100000");
        rejected(() -> service.update(ImConfigChecks.editRequest(row(configId))), "IM_PERMISSION_DENIED");
        equal(1L, service.list(1, 10).page().getTotal(), "package read remains while write removed");
        jdbc.update("UPDATE sys_tenant SET package_id=NULL,package_version=NULL,effective_menu_ids=NULL WHERE tenant_id=100000");
        responseHook.set(() -> jdbc.update("DELETE FROM sys_role_menu WHERE tenant_id=100000 AND role_id=1 AND menu_id=1782"));
        rejected(() -> service.testConnection(configId, version(version)), "IM_PERMISSION_DENIED");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (1,1782,100000)");
    }

    private void preservedIdentity(long configId) {
        jdbc.update("INSERT INTO sys_im_user_mapping (tenant_id,config_id,user_id,im_type,im_user_id,bind_type,bind_time) VALUES (100000,?,?,'WECOM','owned-mapping','MANUAL_BIND',NOW())", configId, adminId);
        ImConfigRequest change = ImConfigChecks.editRequest(row(configId));
        change.setCorpId("otherCorp");
        rejected(() -> service.update(change), "IM_IDENTITY_IN_USE");
        change.setCorpId("corpA");
        change.setAgentId("78");
        rejected(() -> service.update(change), "IM_IDENTITY_IN_USE");
        equal("corpA", row(configId).getCorpId(), "history cannot move to different enterprise");
    }

    private ImConfigRow row(long configId) { return database.read(TENANT, mapper -> mapper.config(TENANT, configId)); }
    private static ImVersionRequest version(int value) { ImVersionRequest request = new ImVersionRequest(); request.setVersion(value); return request; }

    private String login(long userId, long tenantId) {
        String issued = StpUtil.getStpLogic().createLoginSession(userId, new SaLoginParameter().setTimeout(3600).setIsShare(false).setIsConcurrent(true));
        StpUtil.getSessionByLoginId(userId).set(TokenService.LOGIN_USER_SESSION_KEY, Map.of("userId", userId, "tenantId", tenantId));
        token.set(issued);
        return issued;
    }

    private void todoManagement() throws Exception {
        int before = assertions;
        long testTenant = 992800L;
        long testAdmin = 993980L;
        long testRole = 993981L;
        jdbc.update("INSERT INTO sys_user(user_id,tenant_id,user_name,nick_name,password,status,deleted,pwd_reset_required) SELECT ?,?,'todo-owned-admin','待办核对管理员',password,'0',0,'0' FROM sys_user WHERE user_id=?", testAdmin, testTenant, adminId);
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (?,?,'待办核对角色','admin',1,'0',0)", testRole, testTenant);
        jdbc.update("INSERT INTO sys_user_role(user_id,role_id,tenant_id) VALUES (?,?,?)", testAdmin, testRole, testTenant);
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (?,1791,?)", testRole, testTenant);
        com.cloudflow.auth.mapper.ImTodoMapper todos = sessions.getMapper(com.cloudflow.auth.mapper.ImTodoMapper.class);
        long mapping = jdbc.queryForObject("SELECT MIN(mapping_id) FROM sys_im_todo_mapping WHERE tenant_id=? AND delivery_id IS NOT NULL", Long.class, testTenant);
        ImTodoRow row = database.read(testTenant, ignored -> todos.owned(testTenant, mapping));
        ImTodoReceipts receipts = ImTodoDeliveryDatabaseChecks.receipts(jdbc, database, sessions);
        AtomicInteger calls = new AtomicInteger();
        ImTodoProvider provider = new ImTodoProvider() {
            @Override public String providerType() { return "WECOM"; }
            @Override public com.cloudflow.common.message.channel.ChannelSendResult send(WeComCredentials config, Card card) { throw new AssertionError("No admin send"); }
            @Override public com.cloudflow.common.message.channel.ChannelSendResult terminal(WeComCredentials config, Completion completion) { throw new AssertionError("No admin transport"); }
        };
        ImTodoReconciler reconciler = new ImTodoReconciler(database, todos, receipts, null, null, rules, List.of(provider)) {
            @Override public boolean reconcile(long tenantId, long deliveryId) {
                check(!TransactionSynchronizationManager.isActualTransactionActive(), "admin reconciliation runs after audit transaction");
                check(tenantId == testTenant && deliveryId == row.getDeliveryId(), "admin action uses persisted tenant delivery"); calls.incrementAndGet(); return false;
            }
        };
        ImTodoManagement management = new ImTodoManagement(actors, database, todos, receipts, reconciler, properties, rules, audits);
        token.set(login(testAdmin, testTenant));
        ImTodoManagement.Overview page = management.list(row.getConfigId(), 1, 2);
        check(page.rows().size() == 2 && page.total() >= 4, "admin list pages owned persisted mappings");
        String response = new ObjectMapper().findAndRegisterModules().writeValueAsString(page);
        check(!response.contains("imUserId") && !response.contains("cardKeyHash") && !response.contains("responseCode") && !response.contains("private-receipt"), "admin overview excludes private identities and credentials");
        management.reconcile(new ImTodoManagement.Request(mapping, row.getVersion()));
        equal(1, calls.get(), "authorized admin invokes existing reconciler once");
        rejected(() -> management.reconcile(new ImTodoManagement.Request(mapping, row.getVersion() + 1)), "IM_CALLBACK_STALE");
        failAudit.set(true);
        boolean auditFailed = false;
        try { management.reconcile(new ImTodoManagement.Request(mapping, row.getVersion())); }
        catch (RuntimeException failure) { auditFailed = true; }
        finally { failAudit.set(false); }
        check(auditFailed && calls.get() == 1, "audit failure prevents admin external action");
        jdbc.update("DELETE FROM sys_role_menu WHERE role_id=? AND tenant_id=? AND menu_id=1791", testRole, testTenant);
        try { rejected(() -> management.list(row.getConfigId(), 1, 10), "IM_PERMISSION_DENIED"); }
        finally { jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (?,1791,?)", testRole, testTenant); }
        token.set(login(row.getReceiverUserId(), testTenant));
        rejected(() -> management.list(row.getConfigId(), 1, 10), "IM_PERMISSION_DENIED");
        jdbc.update("INSERT INTO sys_role_menu(role_id,menu_id,tenant_id) VALUES (990101,1791,990100)");
        token.set(login(OTHER_ADMIN, OTHER_TENANT));
        rejected(() -> management.list(row.getConfigId(), 1, 10), "IM_CONFIGURATION_INVALID");
        rejected(() -> management.reconcile(new ImTodoManagement.Request(mapping, row.getVersion())), "IM_CALLBACK_STALE");
        token.set(login(adminId, TENANT));
        equal(1, calls.get(), "rejected identities and stale versions perform no reconciliation");
        System.out.println("G4_IM_TODO_MANAGEMENT_DATABASE: assertions=" + (assertions - before) + "; failed=0; real_roles_and_tenants=true; real_audit=true; reconciler=controlled; vendor_service=false");
    }

    private static void rejected(Runnable operation, String reason) {
        try { operation.run(); throw new AssertionError("expected rejection " + reason); }
        catch (ImFailure failure) { equal(reason, failure.getReasonCode(), "safe reason code"); }
    }

    private static synchronized void check(boolean condition, String message) { assertions++; if (!condition) throw new AssertionError(message); }
    private static void equal(Object expected, Object actual, String message) { check(Objects.equals(expected, actual), message); }
}

package com.cloudflow.auth.tenantpackage;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysTenant;
import com.cloudflow.auth.domain.SysTenantPackage;
import com.cloudflow.auth.mapper.TenantPackageMapper;
import com.cloudflow.auth.platform.PlatformAccessService;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Adjustments;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Effective;
import com.cloudflow.auth.tenantpackage.TenantPackageRules.Quotas;
import com.cloudflow.auth.tenantpackage.TenantPackageSyncService.View;
import com.cloudflow.common.audit.domain.SysAuditLogEntity;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.zaxxer.hikari.HikariDataSource;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Proxy;
import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

public final class TenantPackageDatabaseChecks implements AutoCloseable {
    private static int checks;
    private static final long PLATFORM = 100000;
    private static final long OPERATOR = 42;
    private static final Instant START = Instant.parse("2026-09-28T08:00:00Z");
    private final HikariDataSource source;
    private final JdbcTemplate jdbc;
    private final TenantPackageMapper mapper;
    private final TenantPackageStore store;
    private final SqlSessionTemplate sessions;
    private final Path root;
    private final DataSourceTransactionManager transactions;
    private final TenantPackageCodec codec = new TenantPackageCodec(new ObjectMapper().registerModule(new JavaTimeModule()));
    private final AtomicReference<Instant> currentTime = new AtomicReference<>(START);
    private final AtomicLong currentOperator = new AtomicLong(OPERATOR);
    private final AtomicBoolean failAppliedAudit = new AtomicBoolean();
    private final AtomicReference<String> failAuditName = new AtomicReference<>();
    private final AtomicReference<Runnable> appliedAuditHook = new AtomicReference<>();
    private final SysAuditLogMapper audits;
    private final PlatformAccessService identity;
    private long packageId;

    public static void main(String[] arguments) throws Exception {
        if (arguments.length != 3 || !arguments[0].matches("jdbc:mysql://127\\.0\\.0\\.1:[0-9]+/cloud_flow_db\\?.+")) throw new IllegalArgumentException("Owned loopback database required");
        try (HikariDataSource admin = source(arguments[0], "tenant-package-test-owner")) {
            JdbcTemplate control = new JdbcTemplate(admin);
            equal(Path.of(arguments[1]).toRealPath(), Path.of(control.queryForObject("SELECT @@datadir", String.class)).toRealPath(), "owned database directory");
            equal(0L, control.queryForObject("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='cloudflow_package_checks'", Long.class), "test database must not exist");
            long originalTables = control.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db'", Long.class);
            control.execute("CREATE DATABASE cloudflow_package_checks CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci");
            try {
                try (TenantPackageDatabaseChecks fixture = new TenantPackageDatabaseChecks(arguments[0].replace("/cloud_flow_db?", "/cloudflow_package_checks?"), Path.of(arguments[2]))) {
                    fixture.seed();
                    fixture.codec();
                    fixture.previewAndConfirm();
                    fixture.expiredAndTampered();
                    fixture.overrides();
                    fixture.failedRetry();
                    fixture.concurrent();
                    fixture.rowLock();
                    fixture.platformIsolation();
                    fixture.cancellation();
                    fixture.concurrentCancellation();
                    fixture.finalItemCancellation();
                    new TenantPackageManagementChecks(fixture.jdbc, fixture.store, fixture.codec, fixture.audits,
                            fixture.failAuditName).verify();
                    new TenantAssignmentChecks(fixture.jdbc, fixture.store, fixture.codec, fixture.audits,
                            fixture.failAuditName).verify();
                    new TenantEntitlementChecks(fixture.jdbc, fixture.sessions, fixture.transactions,
                            fixture.store.read(database -> fixture.codec.rules(database.catalog())), fixture.codec).verify(fixture.packageId, fixture.root);
                    new TenantQuotaDatabaseChecks(fixture.jdbc, fixture.sessions, fixture.transactions, fixture.root).verify();
                    new TenantNavigationDatabaseChecks(fixture.jdbc, fixture.sessions).verify();
                    equal(0L, fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_tenant_package_sync_item WHERE status='PREVIEWED' AND sync_id IN (SELECT sync_id FROM sys_tenant_package_sync WHERE status='COMPLETED')", Long.class), "completed batch has no unprocessed item");
                }
            } finally {
                control.execute("DROP DATABASE cloudflow_package_checks");
                TenantContext.clear();
            }
            equal(0L, control.queryForObject("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='cloudflow_package_checks'", Long.class), "owned schema cleaned");
            equal(originalTables, control.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='cloud_flow_db'", Long.class), "integration schema unchanged");
        }
        System.out.println("TENANT_PACKAGE_DATABASE_CHECKS: assertions=" + checks + "; failed=0; real_mysql=true; production_mapper=true; production_sync_service=true; tenant_plugin=true; identity_double=true; audit_failure_injected=true; http=false; owned_schema_removed=true; integration_schema_unchanged=true");
    }

    private void verifyFormalPackageMenuSeed() throws Exception {
        equal("cloudflow_package_checks", jdbc.queryForObject("SELECT DATABASE()", String.class), "formal menu seed runs only in owned schema");
        jdbc.update("DELETE FROM sys_menu WHERE menu_id BETWEEN 1970 AND 1972");
        jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (1,100000,'平台管理员','admin',1,'0',0)");
        String sourceSql = Files.readString(root.resolve("cloudflow-backend/DB/06.cloudflow-business-seed.sql"));
        String beginning = "CREATE TEMPORARY TABLE h5_tenant_package_guard";
        String ending = "DROP TEMPORARY TABLE h5_tenant_package_guard;";
        int start = sourceSql.indexOf(beginning);
        int finish = sourceSql.indexOf(ending, start);
        equal(true, start >= 0 && finish > start && sourceSql.indexOf(beginning, start + 1) < 0, "one canonical menu seed section");
        String menuSql = sourceSql.substring(start, finish + ending.length()).replace("cloud_flow_db.", "cloudflow_package_checks.");
        org.springframework.core.io.support.EncodedResource script = new org.springframework.core.io.support.EncodedResource(
                new org.springframework.core.io.ByteArrayResource(menuSql.getBytes(java.nio.charset.StandardCharsets.UTF_8)), java.nio.charset.StandardCharsets.UTF_8);
        try (java.sql.Connection connection = source.getConnection()) {
            org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection, script);
            boolean conflictRejected = false;
            try { org.springframework.jdbc.datasource.init.ScriptUtils.executeSqlScript(connection, script); }
            catch (org.springframework.jdbc.datasource.init.ScriptException conflict) { conflictRejected = true; }
            finally {
                try (java.sql.Statement cleanup = connection.createStatement()) { cleanup.execute("DROP TEMPORARY TABLE IF EXISTS h5_tenant_package_guard"); }
            }
            equal(true, conflictRejected, "existing package menu IDs reject replay before insertion");
        }
        equal(List.of("1970:6:system:tenant-package:list", "1971:1970:system:tenant-package:manage", "1972:1970:system:tenant-package:sync"),
                jdbc.queryForList("SELECT CONCAT(menu_id,':',parent_id,':',perms) FROM sys_menu WHERE menu_id BETWEEN 1970 AND 1972 ORDER BY menu_id", String.class), "formal SQL inserts approved exact menu IDs and parents");
        equal(List.of("1:1970:100000", "1:1971:100000", "1:1972:100000"), jdbc.queryForList("SELECT CONCAT(role_id,':',menu_id,':',tenant_id) FROM sys_role_menu WHERE menu_id BETWEEN 1970 AND 1972 ORDER BY menu_id", String.class), "formal SQL grants only platform admin");
        equal(0L, jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE perms LIKE 'system:tenant-package:%' AND menu_id NOT BETWEEN 1970 AND 1972", Long.class), "no package menu outside approved IDs");
        System.out.println("TENANT_PACKAGE_MENU_SQL_CHECKS: menu_ids=1970,1971,1972; out_of_range=0; platform_grants=3; employee_grants=0; conflicting_replay_rejected=true; real_mysql=true; canonical_seed_section=true; integration_schema_modified=false");
    }

    private TenantPackageDatabaseChecks(String url, Path root) throws Exception {
        this.root = root;
        source = source(url, "tenant-package-database-checks");
        jdbc = new JdbcTemplate(source);
        String schema = Files.readString(root.resolve("cloudflow-backend/DB/01.cloudflow-common.sql"));
        Set<String> required = Set.of("sys_tenant", "sys_tenant_package", "sys_tenant_package_sync", "sys_tenant_package_sync_item", "sys_menu", "sys_audit_log", "sys_role", "sys_role_menu", "sys_user", "sys_user_role", "sys_file", "sys_file_config");
        int created = 0;
        Matcher tables = Pattern.compile("(?ms)^CREATE TABLE (\\w+) \\(.*?^\\) ENGINE=.*?;").matcher(schema);
        while (tables.find()) {
            if (required.contains(tables.group(1))) { jdbc.execute(tables.group()); created++; }
        }
        equal(12, created, "twelve unchanged formal table definitions imported");
        for (String row : Files.readAllLines(root.resolve("cloudflow-backend/cloudflow-auth/target/tenant-package-checks/catalog.tsv"))) {
            String[] values = row.split("\t", -1);
            jdbc.update("INSERT INTO sys_menu (menu_id,menu_name,parent_id,menu_type,status,perms) VALUES (?,'套餐测试菜单',?,?,?,?)",
                    Long.parseLong(values[0]), Long.parseLong(values[1]), values[2], values[3], values[4]);
        }
        verifyFormalPackageMenuSeed();
        MybatisConfiguration configuration = new MybatisConfiguration();
        configuration.setMapUnderscoreToCamelCase(true);
        configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
        GlobalConfig global = new GlobalConfig();
        global.setMetaObjectHandler(new com.cloudflow.common.handler.MyMetaObjectHandler());
        global.setDbConfig(new GlobalConfig.DbConfig().setLogicDeleteField("deleted").setLogicDeleteValue("1").setLogicNotDeleteValue("0"));
        GlobalConfigUtils.setGlobalConfig(configuration, global);
        configuration.addMapper(TenantPackageMapper.class);
        configuration.addMapper(SysAuditLogMapper.class);
        configuration.addMapper(com.cloudflow.common.tenant.entitlement.mapper.TenantEntitlementMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysMenuMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysRoleMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysRoleMenuMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.OAuthMapper.class);
        configuration.addMapper(com.cloudflow.common.tenant.quota.mapper.TenantQuotaMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysUserMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysTenantMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysUserRoleMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysFileMapper.class);
        configuration.addMapper(com.cloudflow.auth.mapper.SysFileConfigMapper.class);
        configuration.addMapper(com.cloudflow.hr.mapper.HrFileStorageMapper.class);
        configuration.addMapper(com.cloudflow.oa.mapper.OaPrivateFileMapper.class);
        configuration.addMapper(com.cloudflow.crm.mapper.CrmEmailPrivateFileMapper.class);
        MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
        factory.setDataSource(source);
        factory.setConfiguration(configuration);
        factory.setGlobalConfig(global);
        factory.setPlugins(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
        factory.setMapperLocations(new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/TenantPackageMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/SysMenuMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/OAuthMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/SysFileMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/SysFileConfigMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-service-hr/src/main/resources/mapper/HrFileStorageMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantQuotaMapper.xml")),
                new FileSystemResource(root.resolve("cloudflow-backend/cloudflow-common/cloudflow-common-data/src/main/resources/mapper/tenant/TenantEntitlementMapper.xml")));
        sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        mapper = sessions.getMapper(TenantPackageMapper.class);
        transactions = new DataSourceTransactionManager(source);
        store = new TenantPackageStore(mapper, transactions);
        SysAuditLogMapper actualAudits = sessions.getMapper(SysAuditLogMapper.class);
        audits = (SysAuditLogMapper) Proxy.newProxyInstance(SysAuditLogMapper.class.getClassLoader(), new Class<?>[] {SysAuditLogMapper.class}, (proxy, method, inputs) -> {
            String failedAction = failAuditName.get();
            if ("insert".equals(method.getName()) && inputs != null && inputs[0] instanceof SysAuditLogEntity audit
                    && audit.getAuditName().equals(failedAction) && failAuditName.compareAndSet(failedAction, null)) return 0;
            if ("insert".equals(method.getName()) && inputs != null && inputs[0] instanceof SysAuditLogEntity audit
                    && "TENANT_PACKAGE_ITEM_APPLIED".equals(audit.getAuditName()) && failAppliedAudit.compareAndSet(true, false)) return 0;
            if ("insert".equals(method.getName()) && inputs != null && inputs[0] instanceof SysAuditLogEntity audit
                    && "TENANT_PACKAGE_ITEM_APPLIED".equals(audit.getAuditName())) {
                Runnable hook = appliedAuditHook.getAndSet(null);
                if (hook != null) hook.run();
            }
            try { return method.invoke(actualAudits, inputs); }
            catch (InvocationTargetException exception) { throw exception.getCause(); }
        });
        identity = new PlatformAccessService(null, null, null, null, null, null, null, null) {
            @Override public Operator requireRecent(String permission) {
                if (!"system:tenant-package:sync".equals(permission)) throw new AssertionError("Unexpected platform permission");
                return new Operator(currentOperator.get(), PLATFORM);
            }
        };
        TenantContext.setTenantId(700000L);
    }

    private TenantPackageSyncService service() {
        return service(identity);
    }

    private TenantPackageSyncService service(PlatformAccessService access) {
        Clock clock = new Clock() {
            @Override public ZoneId getZone() { return ZoneOffset.UTC; }
            @Override public Clock withZone(ZoneId zone) { return this; }
            @Override public Instant instant() { return currentTime.get(); }
        };
        return new TenantPackageSyncService(access, store, codec, audits, clock);
    }

    private void seed() {
        SysTenantPackage template = new SysTenantPackage();
        template.setTenantId(PLATFORM);
        template.setPackageCode("SYNC_CHECK");
        template.setPackageName("套餐同步测试");
        template.setMenuIds("[1986]");
        template.setMaxUsers(10);
        template.setMaxStorageMb(100L);
        template.setEnabledModules("[]");
        template.setPrice(new BigDecimal("9.99"));
        template.setBillingCycle("MONTHLY");
        template.setSortNo(0);
        template.setStatus("ACTIVE");
        template.setCreateBy("42");
        template.setUpdateBy("42");
        template.setCreateTime(LocalDateTime.ofInstant(START, ZoneOffset.UTC));
        template.setUpdateTime(template.getCreateTime());
        equal(1, store.write(database -> database.insertPackage(template)), "package template saved by production mapper");
        packageId = template.getPackageId();
        equal(0, store.read(database -> database.findPackage(PLATFORM, packageId)).getVersion(), "new package version zero");
        equal(700000L, TenantContext.getTenantId(), "cross-tenant store restores original context");
        equal(false, TenantContext.getTenantSkip(), "cross-tenant store restores skip flag");
    }

    private void tenant(long tenantId, Adjustments override) {
        TenantPackageRules rules = store.read(database -> codec.rules(database.catalog()));
        Effective effective = rules.compose(List.of(), Set.of(), new Quotas(10, 100), override);
        jdbc.update("INSERT INTO sys_tenant (tenant_id,tenant_code,tenant_name,package_id,package_version,package_override,effective_menu_ids,user_limit,storage_limit,version) VALUES (?,?,'同步目标',?,0,?,?,10,100,0)",
                tenantId, "PKG_" + tenantId, packageId, codec.encode(override), codec.encode(effective.menuIds()));
    }

    private void codec() {
        for (String invalid : List.of("null", "{}", "[0]", "[-1]", "[1,1]", "[1.0]", "[1e0]", "[\"1\"]", "[true]", "[null]", "[9223372036854775808]", "[] []")) {
            rejects(null, () -> codec.ids(invalid));
        }
        equal(Set.of(Long.MAX_VALUE), codec.ids("[9223372036854775807]"), "bigint menu ID preserved");
        for (String invalid : List.of("null", "{}", "[\"crm\"]", "[\"CRM\",\"CRM\"]", "[null]", "[1]")) rejects(null, () -> codec.modules(invalid));
        for (String invalid : List.of("{\"addMenuIds\":[],\"removeMenuIds\":[],\"unexpected\":1}",
                "{\"addMenuIds\":[],\"addMenuIds\":[1986],\"removeMenuIds\":[]}", "{\"addMenuIds\":[\"1986\"],\"removeMenuIds\":[]}",
                "{\"addMenuIds\":[],\"removeMenuIds\":[],\"maxUsers\":1.5}", "{\"addMenuIds\":[],\"removeMenuIds\":[],\"maxStorageMb\":1e2}", "{}", "null")) {
            rejects(null, () -> codec.adjustments(invalid));
        }
        equal(Adjustments.none(), codec.adjustments(null), "absent override means no custom changes");
        equal(Adjustments.none(), codec.adjustments(codec.encode(Adjustments.none())), "explicit empty override roundtrip");
        SysTenant browser = new ObjectMapper().convertValue(java.util.Map.of("packageId", 999, "packageVersion", 99,
                "effectiveMenuIds", "[1]", "packageOverride", "{}"), SysTenant.class);
        equal(null, browser.getPackageId(), "legacy tenant body cannot assign package ID");
        equal(null, browser.getPackageVersion(), "legacy tenant body cannot forge package version");
        equal(null, browser.getEffectiveMenuIds(), "legacy tenant body cannot forge effective menus");
        equal(null, browser.getPackageOverride(), "legacy tenant body cannot forge overrides");
    }

    private void previewAndConfirm() {
        tenant(500, Adjustments.none());
        tenant(501, Adjustments.none());
        View preview = service().preview(packageId, List.of(501L, 500L));
        equal(2, preview.preview().items().size(), "exact persisted target count");
        equal("PREVIEWED", preview.status(), "preview does not claim application");
        equal(0, version(500), "preview never writes target tenant");
        equal(preview.preview().hash(), service().detail(preview.syncId()).preview().hash(), "new service instance reloads same durable hash");
        currentOperator.set(43);
        rejects("PREVIEW_NOT_FOUND", () -> service().detail(preview.syncId()));
        rejects("PREVIEW_NOT_FOUND", () -> service().confirm(preview.syncId(), preview.preview().hash()));
        currentOperator.set(OPERATOR);
        View completed = service().confirm(preview.syncId(), preview.preview().hash());
        equal("COMPLETED", completed.status(), "all tenants applied");
        equal(1, version(500), "first tenant advanced once");
        equal(1, version(501), "second tenant advanced once");
        equal(true, codec.ids(jdbc.queryForObject("SELECT effective_menu_ids FROM sys_tenant WHERE tenant_id=500", String.class)).contains(1986L), "selected independent function persisted");
        equal(2L, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "exactly one applied audit per tenant");
        equal("COMPLETED", service().confirm(preview.syncId(), preview.preview().hash()).status(), "lost response retry returns durable completed result");
        equal(1, version(500), "repeat never increments applied tenant");
        equal(2L, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "repeat creates no duplicate applied audit");
    }

    private void expiredAndTampered() {
        tenant(510, Adjustments.none());
        View preview = service().preview(packageId, List.of(510L));
        rejects("PREVIEW_HASH_MISMATCH", () -> service().confirm(preview.syncId(), "0".repeat(64)));
        currentTime.set(START.plusSeconds(300));
        rejects("PREVIEW_EXPIRED", () -> service().confirm(preview.syncId(), preview.preview().hash()));
        equal(0, version(510), "expired confirmation changed no tenant");
        currentTime.set(START);
        jdbc.update("UPDATE sys_tenant_package_sync_item SET expected_version=99 WHERE sync_id=?", preview.syncId());
        rejects("VERSION_CONFLICT", () -> service().confirm(preview.syncId(), preview.preview().hash()));
        equal(0, version(510), "damaged preview changed no tenant");
    }

    private void overrides() {
        Adjustments custom = new Adjustments(List.of(1762L), List.of(), 5, 20L);
        tenant(520, custom);
        tenant(521, Adjustments.none());
        View preview = service().preview(packageId, List.of(520L, 521L));
        jdbc.update("UPDATE sys_tenant SET package_override=?, version=version+1 WHERE tenant_id=521", codec.encode(new Adjustments(List.of(), List.of(), 3, null)));
        View result = service().confirm(preview.syncId(), preview.preview().hash());
        equal("PARTIAL", result.status(), "concurrent tenant edit makes batch partial");
        equal("APPLIED", result.items().stream().filter(item -> item.tenantId() == 520).findFirst().orElseThrow().status(), "unmodified tenant applied");
        equal("CONFLICT", result.items().stream().filter(item -> item.tenantId() == 521).findFirst().orElseThrow().status(), "concurrent edit preserved as conflict");
        equal(custom, codec.adjustments(jdbc.queryForObject("SELECT package_override FROM sys_tenant WHERE tenant_id=520", String.class)), "individual override retained exactly");
        equal(5, jdbc.queryForObject("SELECT user_limit FROM sys_tenant WHERE tenant_id=520", Integer.class), "individual users quota retained");
        equal(20L, jdbc.queryForObject("SELECT storage_limit FROM sys_tenant WHERE tenant_id=520", Long.class), "individual MB quota retained");
        equal(3, codec.adjustments(jdbc.queryForObject("SELECT package_override FROM sys_tenant WHERE tenant_id=521", String.class)).maxUsers(), "concurrent override not overwritten");
        service().confirm(preview.syncId(), preview.preview().hash());
        equal(1, version(520), "applied partial item never repeated");
        equal(1, version(521), "conflict item never silently retried");
        tenant(522, new Adjustments(List.of(), List.of(2L), null, null));
        View invalid = service().preview(packageId, List.of(522L));
        equal("REMOVED_ANCESTOR", invalid.preview().items().get(0).errorCode(), "removed directory conflict appears in preview");
        equal("PARTIAL", service().confirm(invalid.syncId(), invalid.preview().hash()).status(), "invalid override never applied");
        equal(0, version(522), "invalid override tenant untouched");
    }

    private void failedRetry() {
        tenant(530, Adjustments.none());
        View preview = service().preview(packageId, List.of(530L));
        failAppliedAudit.set(true);
        View failed = service().confirm(preview.syncId(), preview.preview().hash());
        equal("PARTIAL", failed.status(), "audit failure cannot complete");
        equal("FAILED", failed.items().get(0).status(), "failure stored durably");
        equal(0, version(530), "audit failure rolls back target change");
        equal(0L, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "failed transaction leaves no applied audit");
        currentTime.set(START.plusSeconds(600));
        equal("COMPLETED", service().confirm(preview.syncId(), preview.preview().hash()).status(), "confirmed failed batch recoverable after preview window");
        equal(1, version(530), "retry applies exactly once");
        equal(1L, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "retry persists one applied audit");
        currentTime.set(START);
    }

    private void concurrent() throws Exception {
        tenant(540, Adjustments.none());
        tenant(541, Adjustments.none());
        View preview = service().preview(packageId, List.of(540L, 541L));
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch start = new CountDownLatch(1);
        try {
            List<Future<View>> results = new ArrayList<>();
            for (int index = 0; index < 2; index++) results.add(workers.submit(() -> { start.await(); return service().confirm(preview.syncId(), preview.preview().hash()); }));
            start.countDown();
            for (Future<View> result : results) equal("COMPLETED", result.get(20, TimeUnit.SECONDS).status(), "concurrent confirmation converges");
            equal(1, version(540), "concurrent first tenant changed once");
            equal(1, version(541), "concurrent second tenant changed once");
            equal(2L, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "concurrent confirmations append one audit per target");
        } finally { workers.shutdownNow(); }
    }

    private void rowLock() throws Exception {
        tenant(550, Adjustments.none());
        View preview = service().preview(packageId, List.of(550L));
        ExecutorService workers = Executors.newFixedThreadPool(2);
        CountDownLatch locked = new CountDownLatch(1);
        CountDownLatch release = new CountDownLatch(1);
        try {
            Future<?> editor = workers.submit(() -> new TransactionTemplate(transactions).executeWithoutResult(status -> {
                jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=550 FOR UPDATE", Integer.class);
                locked.countDown();
                try { if (!release.await(20, TimeUnit.SECONDS)) throw new AssertionError("Editor timeout"); }
                catch (InterruptedException exception) { Thread.currentThread().interrupt(); throw new IllegalStateException(exception); }
                jdbc.update("UPDATE sys_tenant SET version=version+1 WHERE tenant_id=550");
            }));
            equal(true, locked.await(10, TimeUnit.SECONDS), "real editor holds target row lock");
            Future<View> applying = workers.submit(() -> service().confirm(preview.syncId(), preview.preview().hash()));
            boolean observed = false;
            for (int attempt = 0; attempt < 100 && !observed; attempt++) {
                observed = jdbc.queryForObject("SELECT COUNT(*) FROM performance_schema.data_lock_waits waits JOIN performance_schema.data_locks locks ON waits.REQUESTING_ENGINE_LOCK_ID=locks.ENGINE_LOCK_ID WHERE locks.OBJECT_SCHEMA='cloudflow_package_checks' AND locks.OBJECT_NAME='sys_tenant'", Long.class) > 0;
                if (!observed) Thread.sleep(50);
            }
            equal(true, observed, "MySQL reports sync waiting on real target row lock");
            release.countDown();
            editor.get(10, TimeUnit.SECONDS);
            View result = applying.get(10, TimeUnit.SECONDS);
            equal("CONFLICT", result.items().get(0).status(), "committed editor change detected after acquiring lock");
            equal(1, version(550), "only editor version is retained");
        } finally { release.countDown(); workers.shutdownNow(); }
    }

    private void platformIsolation() {
        equal(null, store.read(database -> database.findPackage(PLATFORM + 1, packageId)), "package lookup is platform scoped");
        equal(0L, store.read(database -> database.count(PLATFORM + 1)), "package count cannot cross platform");
        View preview = service().preview(packageId, List.of(500L));
        equal(null, store.read(database -> database.findSync(PLATFORM + 1, preview.syncId())), "batch lookup is platform scoped");
        equal(List.of(), store.read(database -> database.items(PLATFORM + 1, preview.syncId())), "item lookup is platform scoped");
        jdbc.update("UPDATE sys_tenant_package SET version=version+1 WHERE package_id=?", packageId);
        rejects("PACKAGE_VERSION_CONFLICT", () -> service().confirm(preview.syncId(), preview.preview().hash()));
        equal(1, version(500), "template edit invalidates old preview without tenant changes");
        equal(700000L, TenantContext.getTenantId(), "all operations restore caller tenant context");
    }

    private int version(long tenantId) { return jdbc.queryForObject("SELECT version FROM sys_tenant WHERE tenant_id=?", Integer.class, tenantId); }

    private void cancellation() {
        tenant(560, Adjustments.none());
        View preview = service().preview(packageId, List.of(560L));
        currentOperator.set(43);
        rejects("PREVIEW_NOT_FOUND", () -> service().cancel(preview.syncId(), preview.preview().hash()));
        currentOperator.set(OPERATOR);
        rejects("VERSION_CONFLICT", () -> service().cancel(preview.syncId(), "0".repeat(64)));
        failAuditName.set("TENANT_PACKAGE_CANCELLED");
        rejects("WRITE_FAILED", () -> service().cancel(preview.syncId(), preview.preview().hash()));
        equal("PREVIEWED", service().detail(preview.syncId()).status(), "cancellation audit failure rolls back status");
        equal(0L, auditCount(preview.syncId(), "TENANT_PACKAGE_CANCELLED"), "failed cancellation has no success audit");
        currentTime.set(START.plusSeconds(600));
        equal("CANCELLED", service().cancel(preview.syncId(), preview.preview().hash()).status(), "expired preview can still be cancelled");
        equal("CANCELLED", service().cancel(preview.syncId(), preview.preview().hash()).status(), "repeat cancellation is durable idempotent");
        equal(1L, auditCount(preview.syncId(), "TENANT_PACKAGE_CANCELLED"), "repeat cancellation does not audit twice");
        rejects("VERSION_CONFLICT", () -> service().confirm(preview.syncId(), preview.preview().hash()));
        equal(0, version(560), "cancelled preview never applies tenant");
        currentTime.set(START);
        View completed = service().preview(packageId, List.of(560L));
        service().confirm(completed.syncId(), completed.preview().hash());
        rejects("VERSION_CONFLICT", () -> service().cancel(completed.syncId(), completed.preview().hash()));
        jdbc.update("UPDATE sys_tenant_package_sync SET status='RUNNING' WHERE sync_id=?", completed.syncId());
        rejects("VERSION_CONFLICT", () -> service().cancel(completed.syncId(), completed.preview().hash()));
        equal("COMPLETED", service().confirm(completed.syncId(), completed.preview().hash()).status(), "crash before final batch status recovers without false cancellation");
        equal(1, version(560), "all-applied recovery never reapplies tenant");
    }

    private void concurrentCancellation() throws Exception {
        for (int pauseAt : List.of(2, 3)) {
            long firstTenant = 570 + pauseAt * 10L;
            long secondTenant = firstTenant + 1;
            tenant(firstTenant, Adjustments.none());
            tenant(secondTenant, Adjustments.none());
            View preview = service().preview(packageId, List.of(firstTenant, secondTenant));
            AtomicInteger authorizations = new AtomicInteger();
            CountDownLatch paused = new CountDownLatch(1);
            CountDownLatch released = new CountDownLatch(1);
            PlatformAccessService gated = new PlatformAccessService(null, null, null, null, null, null, null, null) {
                @Override public Operator requireRecent(String permission) {
                    if (authorizations.incrementAndGet() == pauseAt) {
                        paused.countDown();
                        try { if (!released.await(20, TimeUnit.SECONDS)) throw new AssertionError("Cancellation gate timeout"); }
                        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
                    }
                    return identity.requireRecent(permission);
                }
            };
            ExecutorService worker = Executors.newSingleThreadExecutor();
            try {
                Future<View> applying = worker.submit(() -> service(gated).confirm(preview.syncId(), preview.preview().hash()));
                equal(true, paused.await(10, TimeUnit.SECONDS), "confirmation paused between committed items");
                equal("CANCELLED", service().cancel(preview.syncId(), preview.preview().hash()).status(), "concurrent cancellation wins before next item");
                released.countDown();
                View result = applying.get(15, TimeUnit.SECONDS);
                equal("CANCELLED", result.status(), "confirmation finalizer cannot overwrite cancelled status");
                equal(pauseAt - 2, version(firstTenant), "cancellation preserves exactly the already committed tenant");
                equal(0, version(secondTenant), "next tenant is not applied after cancellation");
                equal((long) pauseAt - 2, auditCount(preview.syncId(), "TENANT_PACKAGE_ITEM_APPLIED"), "cancelled batch audits only committed items");
                equal(1L, auditCount(preview.syncId(), "TENANT_PACKAGE_CANCELLED"), "concurrent cancellation recorded once");
                rejects("VERSION_CONFLICT", () -> service().confirm(preview.syncId(), preview.preview().hash()));
            } finally { released.countDown(); worker.shutdownNow(); }
        }
    }
    private long auditCount(long syncId, String action) {
        return jdbc.queryForObject("SELECT COUNT(*) FROM sys_audit_log WHERE audit_field=? AND audit_name=?", Long.class, "tenant_package_sync:" + syncId, action);
    }

    private void finalItemCancellation() throws Exception {
        tenant(610, Adjustments.none());
        View preview = service().preview(packageId, List.of(610L));
        CountDownLatch beforeCommit = new CountDownLatch(1);
        CountDownLatch commitAllowed = new CountDownLatch(1);
        CountDownLatch beforeFinalization = new CountDownLatch(1);
        CountDownLatch finalizationAllowed = new CountDownLatch(1);
        AtomicInteger calls = new AtomicInteger();
        TenantPackageStore controlledStore = new TenantPackageStore(mapper, transactions) {
            @Override public <Result> Result write(java.util.function.Function<TenantPackageMapper, Result> operation) {
                if (calls.incrementAndGet() == 3) {
                    beforeFinalization.countDown();
                    await(finalizationAllowed);
                }
                return super.write(operation);
            }
        };
        TenantPackageSyncService applying = new TenantPackageSyncService(identity, controlledStore, codec, audits, Clock.fixed(START, ZoneOffset.UTC));
        appliedAuditHook.set(() -> { beforeCommit.countDown(); await(commitAllowed); });
        ExecutorService workers = Executors.newFixedThreadPool(2);
        try {
            Future<View> confirmation = workers.submit(() -> applying.confirm(preview.syncId(), preview.preview().hash()));
            equal(true, beforeCommit.await(10, TimeUnit.SECONDS), "last item holds package and batch locks before commit");
            Future<String> cancelling = workers.submit(() -> {
                try { return service().cancel(preview.syncId(), preview.preview().hash()).status(); }
                catch (TenantPackageFailure conflict) { return conflict.reason(); }
            });
            boolean waiting = false;
            for (int attempt = 0; attempt < 100 && !waiting; attempt++) {
                waiting = jdbc.queryForObject("SELECT COUNT(*) FROM performance_schema.data_lock_waits waits JOIN performance_schema.data_locks locks ON waits.REQUESTING_ENGINE_LOCK_ID=locks.ENGINE_LOCK_ID WHERE locks.OBJECT_SCHEMA='cloudflow_package_checks' AND locks.OBJECT_NAME='sys_tenant_package'", Long.class) > 0;
                if (!waiting) Thread.sleep(50);
            }
            equal(true, waiting, "cancellation has read old batch and waits for real package lock");
            commitAllowed.countDown();
            equal(true, beforeFinalization.await(10, TimeUnit.SECONDS), "last item committed while batch remains running");
            equal("VERSION_CONFLICT", cancelling.get(10, TimeUnit.SECONDS), "cancellation must observe committed last item after waiting rather than stale snapshot");
            equal("RUNNING", service().detail(preview.syncId()).status(), "all-applied batch is never falsely labelled cancelled");
            equal(1, version(610), "last committed tenant applied once");
            equal(0L, auditCount(preview.syncId(), "TENANT_PACKAGE_CANCELLED"), "rejected cancellation emits no success audit");
            finalizationAllowed.countDown();
            equal("COMPLETED", confirmation.get(10, TimeUnit.SECONDS).status(), "original confirmation finalizes accurately");
        } finally {
            commitAllowed.countDown();
            finalizationAllowed.countDown();
            appliedAuditHook.set(null);
            workers.shutdownNow();
            workers.awaitTermination(10, TimeUnit.SECONDS);
        }
    }

    private static void await(CountDownLatch latch) {
        try { if (!latch.await(20, TimeUnit.SECONDS)) throw new AssertionError("Controlled transaction timeout"); }
        catch (InterruptedException interrupted) { Thread.currentThread().interrupt(); throw new IllegalStateException(interrupted); }
    }

    private static HikariDataSource source(String url, String name) {
        HikariDataSource source = new HikariDataSource();
        source.setJdbcUrl(url);
        source.setUsername("root");
        source.setPassword("");
        source.setMaximumPoolSize(6);
        source.setMinimumIdle(0);
        source.setPoolName(name);
        return source;
    }

    private static void rejects(String reason, Runnable action) {
        try { action.run(); }
        catch (TenantPackageFailure failure) {
            if (reason != null) equal(reason, failure.reason(), "expected safe failure reason");
            else checks++;
            return;
        }
        throw new AssertionError("Expected package failure: " + reason);
    }

    private static void equal(Object expected, Object actual, String message) {
        if (!Objects.equals(expected, actual)) throw new AssertionError(message + ": expected=" + expected + ", actual=" + actual);
        checks++;
    }

    @Override public void close() { source.close(); }
}

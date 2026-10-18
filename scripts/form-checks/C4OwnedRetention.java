import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WorkflowConfigurationLockMapper;
import com.cloudflow.workflow.mapper.system.SysRoleMapper;
import com.cloudflow.workflow.mapper.system.SysUserMapper;
import com.cloudflow.workflow.mapper.system.SysUserRoleMapper;
import com.cloudflow.workflow.security.WorkflowSecurityUtils;
import com.cloudflow.workflow.service.IWorkflowCacheService;
import com.cloudflow.workflow.service.WorkflowConfigurationLockService;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormVersionDiff;
import com.cloudflow.workflow.service.WorkflowFormVersionService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;

public final class C4OwnedRetention {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;
    private static boolean removed;

    public static void main(String[] arguments) throws Exception {
        try (Isolation isolation = new Isolation(Path.of(arguments[0]))) {
            isolation.initialize();
            UserContext.setTenantId(100000L); UserContext.setUserId(1L); UserContext.setUserName("retention-fixture");
            new Fixture(isolation).verify();
        } catch (Throwable error) {
            System.err.println("C4_OWNED_RETENTION_FAILED: type=" + error.getClass().getSimpleName() + "; checks=" + checks);
            if (error instanceof AssertionError) System.err.println("C4_OWNED_ASSERTION: " + error.getMessage());
            throw new IllegalStateException("Owned retention checks failed; private details omitted");
        } finally { UserContext.clear(); TenantContext.clear(); }
        require(removed, "owned temporary database removed");
        System.out.println("C4_OWNED_RETENTION_RESULT=" + JSON.writeValueAsString(java.util.Map.of(
            "checks", checks, "latestRetained", 20, "referencedRetained", 3, "obsoleteRemoved", 2,
            "realService", true, "realMapper", true, "cacheEvictionStub", true, "temporaryDatabaseRemoved", removed,
            "applicationDatabaseWrites", 0, "redisWrites", 0)));
    }

    private static final class Isolation implements AutoCloseable {
        final Path root = Path.of("D:/CloudFlowPro").toRealPath();
        final Path run = root.resolve(".cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7").toRealPath();
        final String database = "wf_c4_owned_" + UUID.randomUUID().toString().replace("-", "");
        final String owner = UUID.randomUUID().toString().replace("-", "");
        final String url;
        final Connection management;
        boolean owned;
        Isolation(Path statePath) throws Exception {
            require(statePath.toRealPath().equals(run.resolve("state.json").toRealPath()), "fixed owned state path");
            JsonNode state = JSON.readTree(Files.readString(statePath).replace("\uFEFF", ""));
            require("RUNNING".equals(state.path("status").asText()) && Path.of(state.path("run").asText()).toRealPath().equals(run), "running owned state");
            int port = state.path("mysqlPort").asInt(); require(port > 0 && port <= 65535, "owned database port");
            String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8&connectTimeout=10000&socketTimeout=30000&allowMultiQueries=false";
            String base = "jdbc:mysql://127.0.0.1:" + port + "/"; url = base + database + options;
            management = DriverManager.getConnection(base + options, "root", "");
            try (Statement statement = management.createStatement(); ResultSet rows = statement.executeQuery("SELECT @@datadir")) {
                require(rows.next() && Path.of(rows.getString(1)).toRealPath().equals(run.resolve("mysql-data").toRealPath()), "owned MySQL data directory");
            } catch (Throwable error) { management.close(); throw error; }
        }
        void initialize() throws Exception {
            require(database.matches("wf_c4_owned_[a-f0-9]{32}"), "constrained temporary database identity");
            try (Statement statement = management.createStatement()) { statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"); }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) { statement.execute("CREATE TABLE c4_fixture_owner (owner_token CHAR(32) PRIMARY KEY) ENGINE=InnoDB"); }
            try (PreparedStatement statement = management.prepareStatement("INSERT INTO c4_fixture_owner(owner_token) VALUES (?)")) {
                statement.setString(1, owner); statement.executeUpdate(); owned = true;
            }
            for (String table : List.of("sys_audit_log", "sys_user", "sys_role", "sys_user_role", "wf_form_definition", "wf_process_definition", "wf_process_instance")) {
                String ddl = Files.readString(root.resolve("cloudflow-backend/DB/" + (table.startsWith("sys_") ? "01.cloudflow-common.sql" : "02.cloudflow-workflow.sql")));
                Matcher match = Pattern.compile("(?ms)^CREATE TABLE " + Pattern.quote(table) + "\\s*\\(.*?^\\) ENGINE=.*?;").matcher(ddl);
                require(match.find(), "current DDL for " + table);
                try (Statement statement = management.createStatement()) { statement.execute(match.group()); }
            }
        }
        @Override public void close() throws Exception {
            try {
                if (owned) {
                    management.setCatalog(database);
                    try (PreparedStatement statement = management.prepareStatement("SELECT COUNT(*) FROM c4_fixture_owner WHERE owner_token=?")) {
                        statement.setString(1, owner);
                        try (ResultSet rows = statement.executeQuery()) { require(rows.next() && rows.getInt(1) == 1, "ownership verified before database removal"); }
                    }
                    management.setCatalog("information_schema");
                    try (Statement statement = management.createStatement()) { statement.execute("DROP DATABASE " + database); removed = true; }
                }
            } finally { management.close(); }
        }
    }

    private static final class Fixture {
        final JdbcTemplate jdbc;
        final DataSourceTransactionManager manager;
        final WfFormDefinitionMapper forms;
        final WorkflowFormVersionService versions;
        Fixture(Isolation isolation) throws Exception {
            DriverManagerDataSource source = new DriverManagerDataSource(isolation.url, "root", "");
            jdbc = new JdbcTemplate(source); jdbc.setQueryTimeout(20); manager = new DataSourceTransactionManager(source);
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true);
            configuration.setCacheEnabled(false); configuration.setLocalCacheScope(LocalCacheScope.STATEMENT);
            configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig()); global.setMetaObjectHandler(new MyMetaObjectHandler());
            com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : List.of(WfFormDefinitionMapper.class, WorkflowConfigurationLockMapper.class, SysAuditLogMapper.class, SysUserMapper.class, SysRoleMapper.class, SysUserRoleMapper.class)) configuration.addMapper(mapper);
            configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            Path mapperRoot = isolation.root.resolve("cloudflow-backend/cloudflow-service-workflow/src/main/resources/mapper/workflow");
            factory.setMapperLocations(new FileSystemResource(mapperRoot.resolve("WfFormDefinitionMapper.xml")), new FileSystemResource(mapperRoot.resolve("WorkflowConfigurationLockMapper.xml")));
            SqlSessionTemplate sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject())); forms = sessions.getMapper(WfFormDefinitionMapper.class);
            WorkflowPermissionService permissions = new WorkflowPermissionService();
            inject(permissions, "sysRoleMapper", sessions.getMapper(SysRoleMapper.class)); inject(permissions, "sysUserRoleMapper", sessions.getMapper(SysUserRoleMapper.class)); inject(permissions, "sysUserMapper", sessions.getMapper(SysUserMapper.class));
            jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (1,100000,'Admin','ADMIN',1,'0',0)");
            jdbc.update("INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES (100000,1,1)");
            WorkflowConfigurationLockService locks = transactional(new WorkflowConfigurationLockService(sessions.getMapper(WorkflowConfigurationLockMapper.class)));
            WorkflowDraftJson json = new WorkflowDraftJson(JSON); JsonSchemaValidator validator = new JsonSchemaValidator();
            IWorkflowCacheService cache = (IWorkflowCacheService) Proxy.newProxyInstance(IWorkflowCacheService.class.getClassLoader(), new Class<?>[]{IWorkflowCacheService.class}, (target, method, values) -> {
                if (!method.getName().equals("evictForm")) throw new AssertionError("unexpected cache operation"); return null;
            });
            versions = transactional(new WorkflowFormVersionService(forms, locks, permissions, validator, new WorkflowFormVersionDiff(json, validator), new WorkflowSecurityUtils(), json, sessions.getMapper(SysAuditLogMapper.class), cache));
        }
        <T> T transactional(T target) {
            ProxyFactory proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true);
            proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
            @SuppressWarnings("unchecked") T result = (T) proxy.getProxy(); return result;
        }
        void verify() {
            WfFormDefinition latest = null;
            for (int version = 1; version <= 25; version++) {
                WfFormDefinition requested = new WfFormDefinition(); requested.setFormId("retention-form"); requested.setFormKey("retention"); requested.setFormName("Retention form");
                requested.setVersionLock(latest == null ? null : latest.getVersionLock());
                requested.setFieldsJson("[{\"id\":\"note\",\"type\":\"TEXT\",\"label\":\"Version " + version + "\"}]"); latest = versions.save(requested);
                require(latest.getVersion() == version, "consecutive persisted version " + version);
                if (version == 20) require(versions.cleanupForm("retention-form") == 0, "twenty-version boundary retains all");
            }
            jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,form_id,model_json,status) VALUES ('retention-definition',100000,'Retention','retention-process','retention-form','{}','PUBLISHED')");
            reference("active-reference", 1, 0); reference("deleted-reference", 2, 1);
            List<WfFormDefinition> candidates = forms.cleanupCandidates(100000L, "retention-form", 6);
            require(candidates.stream().map(WfFormDefinition::getVersion).toList().equals(List.of(3, 4, 5)), "candidate query excludes active and soft-deleted references");
            WfFormDefinition third = forms.selectVersion(100000L, "retention-form", 3);
            reference("late-reference", 3, 0);
            require(forms.deleteUnusedVersion(100000L, third.getId(), "retention-form", 3) == 0, "delete rechecks reference created after candidate selection");
            for (int version : List.of(1, 2)) {
                WfFormDefinition referenced = forms.selectVersion(100000L, "retention-form", version);
                require(forms.deleteUnusedVersion(100000L, referenced.getId(), "retention-form", version) == 0, "referenced version cannot be physically deleted " + version);
            }
            WfFormDefinition fourth = forms.selectVersion(100000L, "retention-form", 4);
            require(forms.deleteUnusedVersion(200000L, fourth.getId(), "retention-form", 4) == 0, "foreign tenant cannot delete candidate");
            require(forms.deleteUnusedVersion(100000L, fourth.getId(), "wrong-form", 4) == 0, "wrong form cannot delete candidate");
            require(forms.deleteUnusedVersion(100000L, latest.getId(), "retention-form", 25) == 0, "latest version cannot be physically deleted");
            require(versions.cleanupForm("retention-form") == 2, "cleanup removes only unreferenced versions four and five");
            require(Objects.equals(jdbc.queryForObject("SELECT COUNT(*) FROM wf_form_definition WHERE version>=6", Integer.class), 20), "latest twenty versions retained");
            require(Objects.equals(jdbc.queryForObject("SELECT COUNT(*) FROM wf_form_definition WHERE version IN (1,2,3)", Integer.class), 3), "all referenced old versions retained");
            require(forms.selectVersion(100000L, "retention-form", 4) == null && forms.selectVersion(100000L, "retention-form", 5) == null, "unreferenced obsolete versions actually deleted");
            require(versions.cleanupForm("retention-form") == 0 && versions.cleanupForm("absent") == 0, "repeated cleanup and missing form do not delete rows");
            require(Objects.equals(jdbc.queryForObject("SELECT COUNT(*) FROM wf_form_definition WHERE is_latest=1 AND version=25", Integer.class), 1), "latest version marker preserved");
        }
        void reference(String id, int version, int deleted) {
            jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,form_version,variables,deleted) VALUES (?,100000,'retention-process','retention-definition',?,1,?,'{}',?)", id, id, version, deleted);
        }
    }
    private static void inject(Object target, String property, Object value) throws Exception {
        Field field = target.getClass().getDeclaredField(property); field.setAccessible(true); field.set(target, value);
    }
    private static void require(boolean valid, String label) { checks++; if (!valid) throw new AssertionError(label); }
}

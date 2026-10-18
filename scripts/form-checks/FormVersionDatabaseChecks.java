import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.common.audit.mapper.SysAuditLogMapper;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.exception.PermissionDeniedException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDefinitionMapper;
import com.cloudflow.workflow.mapper.WfProcessDefinitionMapper;
import com.cloudflow.workflow.mapper.WorkflowConfigurationLockMapper;
import com.cloudflow.workflow.mapper.WorkflowFormFileMapper;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
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
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.reflect.Field;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Future;
import java.util.regex.Matcher;
import org.apache.ibatis.session.LocalCacheScope;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.transaction.support.TransactionTemplate;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.List;
import java.util.Objects;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

public final class FormVersionDatabaseChecks {
    private static final ObjectMapper JSON = new ObjectMapper().findAndRegisterModules();
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        try (Isolation isolation = new Isolation()) {
            isolation.initialize(); identity(100000L, 1L);
            Fixture fixture = new Fixture(isolation);
            fixture.business(); fixture.concurrentWriters(); fixture.auditRollback(); fixture.retention(); fixture.authorization(); fixture.privateFiles();
            System.out.println("PASS C4 real database checks=" + checks + "; current DDL/MyBatis XML/tenant plugin/role permission/Spring transactions; runtime database writes=0; Redis writes=0; service restarts=0");
        } catch (Throwable failure) {
            System.err.println("FAIL C4 real database checks=" + checks);
            for (Throwable cause = failure; cause != null; cause = cause.getCause()) {
                String details = cause instanceof SQLException sql ? " SQLState=" + sql.getSQLState() + " errorCode=" + sql.getErrorCode() : cause instanceof AssertionError ? " " + cause.getMessage() : "";
                System.err.println(cause.getClass().getName() + details);
                if (cause instanceof org.springframework.jdbc.BadSqlGrammarException grammar) System.err.println("SQL=" + grammar.getSql());
                for (Throwable suppressed : cause.getSuppressed()) System.err.println("suppressed=" + suppressed.getClass().getName());
                if (cause instanceof WorkflowException workflow) System.err.println("workflowCode=" + workflow.getCode());
                java.util.Arrays.stream(cause.getStackTrace()).filter(frame -> frame.getClassName().startsWith("FormVersionDatabaseChecks") || frame.getClassName().startsWith("com.cloudflow")).limit(6).forEach(frame -> System.err.println("  at " + frame));
            }
            throw new IllegalStateException("C4 isolated database verification failed; credential-free details printed");
        } finally { UserContext.clear(); TenantContext.clear(); }
    }

    private static final class Isolation implements AutoCloseable {
        final String database = required("C4_DB_TARGET");
        final String owner = required("C4_DB_OWNER");
        final String username = required("DB_USERNAME");
        final String password = required("DB_PASSWORD");
        final String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8&connectTimeout=10000&socketTimeout=45000&allowMultiQueries=false&sessionVariables=innodb_lock_wait_timeout=15";
        final String url;
        final Connection management;
        boolean owned;
        Isolation() throws Exception {
            require(database.matches("wf_c4_verify_[a-f0-9]{32}") && owner.matches("[a-f0-9]{32}"), "isolated database identity is constrained");
            require("192.168.1.173".equals(required("C4_DB_HOST")) && "3306".equals(required("C4_DB_PORT")), "expected test server");
            String base = "jdbc:mysql://192.168.1.173:3306/";
            url = base + database + options;
            management = DriverManager.getConnection(base + options, username, password);
        }
        void initialize() throws Exception {
            String menuRange = "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1400 AND 1449";
            String unexpectedMenus = "SELECT COUNT(*) FROM cloud_flow_db.sys_menu WHERE menu_id BETWEEN 1400 AND 1449 AND NOT ((menu_id=1400 AND menu_name='表单版本历史' AND perms='workflow:form:history') OR (menu_id=1401 AND menu_name='表单版本回滚' AND perms='workflow:form:rollback'))";
            try (Statement statement = management.createStatement();
                 ResultSet rows = statement.executeQuery(menuRange)) {
                rows.next(); int count = rows.getInt(1);
                System.out.println("C_MENU_BEFORE_IMPORT: range=1400-1449; approved_baseline_entries=" + count);
                require(count == 2, "C menu segment must contain the two approved deployment baseline entries");
            }
            try (Statement statement = management.createStatement();
                 ResultSet rows = statement.executeQuery(unexpectedMenus)) {
                rows.next(); int unexpected = rows.getInt(1);
                require(unexpected == 0, "C menu segment contains an unexpected entry or permission");
            }
            try (Statement statement = management.createStatement()) { statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"); }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) { statement.execute("CREATE TABLE c4_fixture_owner (owner_token CHAR(32) PRIMARY KEY) ENGINE=InnoDB"); }
            try (PreparedStatement insert = management.prepareStatement("INSERT INTO c4_fixture_owner(owner_token) VALUES (?)")) { insert.setString(1, owner); insert.executeUpdate(); owned = true; }
            Path ddl = Path.of(required("C4_DDL_ROOT")).toRealPath();
            String common = Files.readString(ddl.resolve("01.cloudflow-common.sql"));
            String workflow = Files.readString(ddl.resolve("02.cloudflow-workflow.sql"));
            for (String table : List.of("sys_audit_log", "sys_user", "sys_role", "sys_user_role", "sys_file", "wf_form_definition", "wf_process_definition", "wf_process_instance", "wf_form_field_permission")) {
                Matcher match = Pattern.compile("(?ms)^CREATE TABLE " + Pattern.quote(table) + "\\s*\\(.*?^\\) ENGINE=.*?;").matcher(table.startsWith("sys_") ? common : workflow);
                require(match.find(), "current production DDL exists for " + table);
                try (Statement statement = management.createStatement()) { statement.execute(match.group()); }
            }
            System.out.println("C4_DB_CREATED: isolated current-source tables=9; owner sentinel=1");
        }
        @Override public void close() throws Exception {
            try {
                if (owned) {
                    management.setCatalog(database);
                    try (PreparedStatement query = management.prepareStatement("SELECT COUNT(*) FROM c4_fixture_owner WHERE owner_token=?")) {
                        query.setString(1, owner); try (ResultSet rows = query.executeQuery()) { rows.next(); require(rows.getInt(1) == 1, "database ownership verified before removal"); }
                    }
                    management.setCatalog("information_schema");
                    try (Statement statement = management.createStatement()) { statement.execute("DROP DATABASE " + database); }
                    System.out.println("C4_DB_REMOVED: ownership verified; isolated database removed; cloud_flow_db untouched");
                }
            } finally { management.close(); }
        }
    }

    private static final class Fixture {
        final JdbcTemplate jdbc;
        final DataSourceTransactionManager manager;
        final TransactionTemplate transactions;
        final SqlSessionTemplate sessions;
        final WfFormDefinitionMapper forms;
        final WorkflowConfigurationLockService locks;
        final WorkflowFormVersionService versions;
        Fixture(Isolation isolation) throws Exception {
            DriverManagerDataSource source = new DriverManagerDataSource(isolation.url, isolation.username, isolation.password);
            jdbc = new JdbcTemplate(source); jdbc.setQueryTimeout(20);
            manager = new DataSourceTransactionManager(source); transactions = new TransactionTemplate(manager); transactions.setTimeout(20);
            MybatisConfiguration configuration = new MybatisConfiguration(); configuration.setMapUnderscoreToCamelCase(true); configuration.setCacheEnabled(false);
            configuration.setLocalCacheScope(LocalCacheScope.STATEMENT); configuration.setDefaultStatementTimeout(20); configuration.setLogImpl(org.apache.ibatis.logging.nologging.NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig(); global.setBanner(false); global.setDbConfig(new GlobalConfig.DbConfig()); global.setMetaObjectHandler(new MyMetaObjectHandler());
            com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : List.of(WfFormDefinitionMapper.class, WorkflowConfigurationLockMapper.class, WorkflowFormFileMapper.class, WorkflowFormReferenceMapper.class, WfProcessDefinitionMapper.class, SysAuditLogMapper.class, SysUserMapper.class, SysRoleMapper.class, SysUserRoleMapper.class)) configuration.addMapper(mapper);
            configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean(); factory.setDataSource(source); factory.setConfiguration(configuration); factory.setGlobalConfig(global);
            Path root = Path.of(required("C4_MAPPER_ROOT"));
            factory.setMapperLocations(new FileSystemResource(root.resolve("workflow/WfFormDefinitionMapper.xml")), new FileSystemResource(root.resolve("workflow/WorkflowConfigurationLockMapper.xml")), new FileSystemResource(root.resolve("workflow/WorkflowFormFileMapper.xml")), new FileSystemResource(root.resolve("workflow/WorkflowFormReferenceMapper.xml")));
            sessions = new SqlSessionTemplate(Objects.requireNonNull(factory.getObject())); forms = sessions.getMapper(WfFormDefinitionMapper.class);
            WorkflowPermissionService authorization = new WorkflowPermissionService();
            inject(authorization, "sysRoleMapper", sessions.getMapper(SysRoleMapper.class)); inject(authorization, "sysUserRoleMapper", sessions.getMapper(SysUserRoleMapper.class)); inject(authorization, "sysUserMapper", sessions.getMapper(SysUserMapper.class));
            jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (1,100000,'Admin','ADMIN',1,'0',0),(5,100000,'Employee','EMPLOYEE',5,'0',0),(11,200000,'Other admin','ADMIN',1,'0',0)");
            jdbc.update("INSERT INTO sys_user_role(tenant_id,user_id,role_id) VALUES (100000,1,1),(100000,5,5),(200000,1,11)");
            locks = transactional(new WorkflowConfigurationLockService(sessions.getMapper(WorkflowConfigurationLockMapper.class)));
            WorkflowDraftJson json = new WorkflowDraftJson(JSON); JsonSchemaValidator validator = new JsonSchemaValidator();
            IWorkflowCacheService cache = (IWorkflowCacheService) Proxy.newProxyInstance(IWorkflowCacheService.class.getClassLoader(), new Class<?>[]{IWorkflowCacheService.class}, (target, method, values) -> {
                if (!method.getName().equals("evictForm")) throw new AssertionError(method.getName()); return null;
            });
            versions = transactional(new WorkflowFormVersionService(forms, locks, authorization, validator, new WorkflowFormVersionDiff(json, validator), new WorkflowSecurityUtils(), json, sessions.getMapper(SysAuditLogMapper.class), cache));
        }
        <Service> Service transactional(Service target) {
            ProxyFactory proxy = new ProxyFactory(target); proxy.setProxyTargetClass(true); proxy.addAdvice(new TransactionInterceptor(manager, new AnnotationTransactionAttributeSource()));
            @SuppressWarnings("unchecked") Service result = (Service) proxy.getProxy(); return result;
        }
        WfFormDefinition latest() { return forms.selectLatest(100000L, "version-form"); }
        WfFormDefinition save(String label, Integer lock) {
            WfFormDefinition request = new WfFormDefinition(); request.setFormId("version-form"); request.setFormKey("expense"); request.setFormName("Version form"); request.setVersionLock(lock);
            request.setFieldsJson("[{\"id\":\"note\",\"type\":\"TEXT\",\"label\":\"" + label + "\"}]"); return versions.save(request);
        }
        long count(String sql, Object... arguments) { return Objects.requireNonNull(jdbc.queryForObject(sql, Long.class, arguments)); }
        void business() {
            WfFormDefinition first = save("Original", null);
            require(first.getVersion() == 1 && first.getId() != null && first.getVersionLock() == 0, "real insert separates business and physical IDs");
            WfFormDefinition same = save("Original", 0);
            require(same.getVersion() == 1 && same.getVersionLock() == 1 && count("SELECT COUNT(*) FROM wf_form_definition") == 1, "same schema does not insert history");
            WfFormDefinition second = save("Changed", 1);
            require(second.getVersion() == 2 && count("SELECT COUNT(*) FROM wf_form_definition WHERE is_latest=1") == 1, "exactly one latest row after version insert");
            require(versions.version("expense", 1).getFieldsJson().contains("Original"), "real history reads original schema");
            require("1".equals(versions.version("expense", 1).getCreateBy()), "creator read from real version audit");
            require(versions.versions("expense", new PageQuery()).getTotal() == 2, "real pagination metadata");
            require("MODIFY_FIELD".equals(versions.compare("expense", 1, 2).changeType()), "real version comparison");
            WfFormDefinition rollback = versions.rollback("expense", 1, second.getVersionLock(), null);
            require(rollback.getVersion() == 3 && rollback.getIsRollback() == 1 && rollback.getRollbackFromVersion() == 1, "real rollback inserts provenance");
            require(count("SELECT COUNT(*) FROM wf_form_definition") == 3, "rollback keeps intermediate rows");
            require(count("SELECT COUNT(*) FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='wf_form_definition'") == 17, "form DDL has exactly seventeen columns");
            jdbc.update("INSERT INTO wf_process_definition(definition_id,tenant_id,process_name,process_key,form_id,model_json,status,lock_version,version_lock) VALUES ('definition',100000,'Process','process','version-form','{}','PUBLISHED',9,77)");
            transactions.executeWithoutResult(status -> {
                WorkflowConfigurationLockService.LockedConfiguration locked = locks.lockDefinition("definition");
                require(locked.requireDefinition("definition").getVersionLock() == 9, "workflow definition retains lock_version mapping");
                require(locked.form("version-form").getVersionLock().equals(rollback.getVersionLock()), "form uses version_lock mapping");
                jdbc.update("INSERT INTO wf_process_instance(instance_id,tenant_id,process_def_key,definition_id,business_key,start_user_id,form_version,variables,deleted) VALUES ('old-instance',100000,'process','definition','old-business',1,1,'{}',1)");
            });
            System.out.println("PASS C4 DB version save/no-change/history/creator/pagination/diff/rollback/physical-key/lock mappings");
        }
        void concurrentWriters() throws Exception {
            WfFormDefinition before = latest(); CountDownLatch ready = new CountDownLatch(2); CountDownLatch start = new CountDownLatch(1);
            ExecutorService executor = Executors.newFixedThreadPool(2);
            try {
                ArrayList<Future<String>> futures = new java.util.ArrayList<java.util.concurrent.Future<String>>();
                for (String label : List.of("Writer one", "Writer two")) futures.add(executor.submit(() -> {
                    identity(100000L, 1L); ready.countDown();
                    try { requireThread(start.await(10, TimeUnit.SECONDS), "concurrent start released"); save(label, before.getVersionLock()); return "saved"; }
                    catch (WorkflowException conflict) { if (!"FORM_VERSION_CONFLICT".equals(conflict.getCode())) throw conflict; return "conflict"; }
                    finally { UserContext.clear(); TenantContext.clear(); }
                }));
                require(ready.await(10, TimeUnit.SECONDS), "both writers ready"); start.countDown();
                List<String> outcomes = List.of(futures.get(0).get(25, TimeUnit.SECONDS), futures.get(1).get(25, TimeUnit.SECONDS));
                require(outcomes.stream().filter("saved"::equals).count() == 1 && outcomes.stream().filter("conflict"::equals).count() == 1, "real concurrent saves have one winner and one optimistic conflict");
                require(latest().getVersion() == before.getVersion() + 1 && count("SELECT COUNT(*) FROM wf_form_definition WHERE is_latest=1") == 1, "concurrent writes retain one contiguous latest version");
            } finally { start.countDown(); executor.shutdownNow(); require(executor.awaitTermination(10, TimeUnit.SECONDS), "concurrent workers stopped"); }
            System.out.println("PASS C4 DB concurrent writers: saved=1; conflict=1; latest=1");
        }
        void auditRollback() {
            WfFormDefinition before = latest(); long rows = count("SELECT COUNT(*) FROM wf_form_definition"); long audits = count("SELECT COUNT(*) FROM sys_audit_log");
            jdbc.execute("CREATE TRIGGER c4_audit_failure BEFORE INSERT ON sys_audit_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture audit unavailable'");
            try {
                boolean failed = false;
                try { save("Audit failure", before.getVersionLock()); } catch (RuntimeException expected) { failed = true; }
                require(failed, "audit failure reaches caller");
                require(count("SELECT COUNT(*) FROM wf_form_definition") == rows && latest().getVersion().equals(before.getVersion()), "transaction rolls back new row and old latest marker");
                require(count("SELECT COUNT(*) FROM sys_audit_log") == audits, "failed audit leaves no record");
            } finally { jdbc.execute("DROP TRIGGER c4_audit_failure"); }
            System.out.println("PASS C4 DB audit fault: new version rolled back; previous latest retained");
        }
        void retention() {
            for (int index = latest().getVersion() + 1; index <= 25; index++) save("Version " + index, latest().getVersionLock());
            WfFormDefinition ancient = versions.version("expense", 1);
            require(forms.deleteUnusedVersion(100000L, ancient.getId(), "version-form", 1) == 0, "delete rechecks instance reference, including soft-deleted instance");
            int removed = versions.cleanupForm("version-form");
            require(removed == 4, "cleanup removes only four unreferenced older versions");
            require(count("SELECT COUNT(*) FROM wf_form_definition WHERE version>=6") == 20 && count("SELECT COUNT(*) FROM wf_form_definition WHERE version=1") == 1, "retention keeps last twenty and referenced first version");
            require(forms.selectVersion(100000L, "version-form", 2) == null, "unreferenced obsolete version removed");
            System.out.println("PASS C4 DB retention: newest=20; referenced old=1; removed=4; soft-deleted instance reference retained");
        }
        void authorization() {
            identity(100000L, 5L);
            for (Runnable operation : List.<Runnable>of(() -> save("Employee", latest().getVersionLock()), () -> versions.versions("expense", new PageQuery()), () -> versions.rollback("expense", 1, latest().getVersionLock(), null))) {
                boolean denied = false; try { operation.run(); } catch (PermissionDeniedException expected) { denied = true; } require(denied, "real EMPLOYEE role cannot manage form history");
            }
            identity(200000L, 1L);
            require(forms.selectLatest(200000L, "version-form") == null, "foreign tenant latest absent");
            boolean rejected = false; try { versions.version("expense", 1); } catch (WorkflowException expected) { rejected = true; } require(rejected, "foreign tenant admin cannot read history");
            identity(100000L, 1L);
            System.out.println("PASS C4 DB role and tenant isolation: EMPLOYEE save/history/rollback denied; foreign tenant history denied");
        }
        void privateFiles() throws Exception {
            WorkflowFormFileMapper files = sessions.getMapper(WorkflowFormFileMapper.class);
            WorkflowFormReferenceMapper references = sessions.getMapper(WorkflowFormReferenceMapper.class);
            String definition = "d".repeat(64); String instance = "i".repeat(64); String field = "f".repeat(100);
            LinkedHashMap<String, Object> scope = new java.util.LinkedHashMap<String, Object>(); scope.put("d", definition); scope.put("f", field); scope.put("i", null);
            jdbc.update("INSERT INTO sys_file(file_id,tenant_id,file_name,file_path,file_type,file_size,create_by,biz_type,biz_id,access_type,remark) VALUES (501,100000,'evidence.pdf','private/storage/key','pdf',128,'fixture-1','WORKFLOW_FORM',?,'PRIVATE',?)", definition, JSON.writeValueAsString(scope));
            require(references.findOwnedFormFile(100000L, "fixture-1", 501L, definition, null, field) != null, "real unbound file authorization matches all dimensions");
            require(references.findOwnedFormFile(100000L, "another", 501L, definition, null, field) == null, "another uploader denied");
            require(references.findOwnedFormFile(200000L, "fixture-1", 501L, definition, null, field) == null, "foreign tenant file denied");
            require(references.findOwnedFormFile(100000L, "fixture-1", 501L, "other", null, field) == null, "another definition denied");
            require(references.findOwnedFormFile(100000L, "fixture-1", 501L, definition, null, "other") == null, "another field denied");
            Map<String, Object> metadata = files.findFile(100000L, 501L);
            require(definition.equals(metadata.get("definitionId")) && field.equals(metadata.get("fieldPath")), "compact storage keys expose semantic metadata names");
            require(!metadata.containsKey("url") && !metadata.containsKey("filePath"), "metadata omits real storage paths");
            transactions.executeWithoutResult(status -> { require(files.bindFiles(100000L, definition, instance, "fixture-1", field, List.of(501L)) == 1, "private file binds atomically"); status.setRollbackOnly(); });
            require(references.findOwnedFormFile(100000L, "fixture-1", 501L, definition, null, field) != null, "failed start rolls back file binding");
            require(files.bindFiles(100000L, definition, instance, "wrong-owner", field, List.of(501L)) == 0, "wrong uploader cannot bind");
            require(files.bindFiles(100000L, definition, instance, "fixture-1", field, List.of(501L)) == 1, "successful start binds file");
            require(count("SELECT CHAR_LENGTH(remark) FROM sys_file WHERE file_id=501") == 255, "maximum context fits existing 255-character column after JSON normalization");
            require(instance.equals(files.findFile(100000L, 501L).get("instanceId")), "bound instance returned without truncation");
            require(references.findOwnedFormFile(100000L, "fixture-1", 501L, definition, null, field) == null, "bound file cannot be reused by a new start");
            require(references.findOwnedFormFile(100000L, null, 501L, definition, instance, field) != null, "authorized approval can preserve an original attachment");
            require(references.findOwnedFormFile(100000L, null, 501L, definition, "another-instance", field) == null, "attachment cannot cross instances");
            jdbc.update("UPDATE sys_file SET access_type='PUBLIC' WHERE file_id=501");
            require(files.findFile(100000L, 501L) == null, "public file cannot impersonate a workflow private attachment");
            System.out.println("PASS C3 DB private files: tenant/owner/definition/field/instance isolation; rollback-safe binding; metadata length=255; storage paths omitted");
        }
    }

    private static void identity(Long tenant, Long user) { UserContext.setTenantId(tenant); UserContext.setUserId(user); UserContext.setUserName("fixture-" + user); }
    private static void inject(Object target, String property, Object value) throws Exception { Field field = target.getClass().getDeclaredField(property); field.setAccessible(true); field.set(target, value); }
    private static String required(String name) { String value = System.getenv(name); if (value == null || value.isBlank()) throw new IllegalStateException("Missing " + name); return value; }
    private static void require(boolean valid, String message) { checks++; requireThread(valid, message); }
    private static void requireThread(boolean valid, String message) { if (!valid) throw new AssertionError(message); }
}

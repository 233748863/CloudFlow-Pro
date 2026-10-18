import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.config.GlobalConfig;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.TableInfo;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.spring.MybatisSqlSessionFactoryBean;
import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.domain.dto.CodegenImportDTO;
import com.cloudflow.auth.domain.dto.CodegenSaveDTO;
import com.cloudflow.auth.domain.vo.CodegenDetailVO;
import com.cloudflow.auth.mapper.SysCodegenColumnMapper;
import com.cloudflow.auth.mapper.SysCodegenTableMapper;
import com.cloudflow.auth.mapper.SysMenuMapper;
import com.cloudflow.auth.mapper.SysRoleMenuMapper;
import com.cloudflow.auth.service.ISysCodegenService;
import com.cloudflow.auth.service.codegen.CodegenTemplateRenderer;
import com.cloudflow.auth.service.impl.SysCodegenServiceImpl;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.exception.ServiceException;
import com.cloudflow.common.handler.MyMetaObjectHandler;
import com.cloudflow.common.idempotent.annotation.RepeatSubmit;
import com.cloudflow.common.log.annotation.SysLog;
import com.cloudflow.common.staticrules.StaticRuleScanner;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.oa.controller.SupplierController;
import com.cloudflow.oa.domain.SysSupplier;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.lang.annotation.Annotation;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import org.apache.ibatis.logging.nologging.NoLoggingImpl;
import org.mybatis.spring.SqlSessionTemplate;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.core.io.ByteArrayResource;
import org.springframework.core.io.FileSystemResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.transaction.annotation.AnnotationTransactionAttributeSource;
import org.springframework.transaction.interceptor.TransactionInterceptor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Field;
import java.lang.reflect.Method;
import java.lang.reflect.Modifier;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.DriverManager;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

public final class CodegenDatabaseChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> MESSAGE_TABLES = List.of("sys_message_channel", "sys_message_template",
            "sys_message_record", "sys_message_subscribe", "sys_sms_code");
    private static final List<String> TABLES = List.of("sys_codegen_table", "sys_codegen_column", "oa_supplier",
            "sys_message_channel", "sys_message_template", "sys_message_record", "sys_message_subscribe",
            "sys_sms_code", "sys_menu", "sys_role", "sys_role_menu");
    private static int assertions;

    public static void main(String[] arguments) throws Exception {
        require(arguments.length == 2 && Set.of("render", "compiled", "browser", "menu").contains(arguments[1]), "expected verification phase");
        Path workspace = Path.of(required("A1_CODEGEN_WORKSPACE")).toRealPath();
        Path root = Path.of(arguments[0]).toRealPath();
        require(root.startsWith(workspace.resolve(".cloudflow-runtime/codegen-db-checks"))
                && root.getFileName().toString().matches("[a-f0-9]{32}"), "owned evidence directory");
        identity(100000L);
        try (Isolation isolation = new Isolation(root, arguments[1])) {
            isolation.initialize();
            Fixture fixture = new Fixture(isolation, workspace, root);
            if ("menu".equals(arguments[1])) {
                SqlSessionTemplate sessions = fixture.sessions(List.of(SysMenuMapper.class, SysRoleMenuMapper.class), false);
                CodegenMenuChecks menus = new CodegenMenuChecks(fixture.service, fixture.source, sessions, root);
                menus.verify();
                CodegenBrowserServer.serve(fixture.service, root.resolve("menu-http"), menus);
                return;
            }
            if ("browser".equals(arguments[1])) {
                CodegenBrowserServer.serve(fixture.service, root.resolve("browser-http"));
                System.out.println("CODEGEN_BROWSER_BACKEND_CLOSED: runtime_writes=0; running_service_restarts=0");
                return;
            }
            if ("render".equals(arguments[1])) renderChecks(fixture, root);
            else compiledChecks(fixture, root);
            System.out.println("CODEGEN_DB_PHASE_PASS: phase=" + arguments[1] + "; assertions=" + assertions
                    + "; copied_source_tables=" + TABLES.size() + "; source_data_rows_copied=0; runtime_writes=0");
        } catch (Throwable failure) {
            printFailure("phase=" + arguments[1], failure);
            throw new IllegalStateException("Codegen database verification failed; sanitized evidence printed");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static void renderChecks(Fixture fixture, Path root) throws Exception {
        ISysCodegenService service = fixture.service;
        require(service.selectDatabaseTablePage("oa_supplier", null, 1, 20).getTotal() == 1, "real supplier is discoverable");
        reject(() -> service.importTables(importRequest("oa", List.of("oa_supplier", "a1_missing_table"))), "atomic import rejects missing table");
        require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_codegen_table", Integer.class) == 0, "failed import rolls back table metadata");
        require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_codegen_column", Integer.class) == 0, "failed import rolls back column metadata");
        service.importTables(importRequest("oa", List.of("oa_supplier")));
        service.importTables(importRequest("system", MESSAGE_TABLES));
        require(service.selectImportedTablePage(null, 1, 20).getTotal() == 6, "six real structures imported");
        require(service.selectDatabaseTablePage("oa_supplier", null, 1, 20).getTotal() == 0, "imported table excluded for owner tenant");
        reject(() -> service.importTables(importRequest("oa", List.of("oa_supplier"))), "duplicate import rejected");
        List<GeneratedCase> cases = new ArrayList<>();
        for (SysCodegenTable table : service.selectImportedTablePage(null, 1, 20).getRows()) {
            CodegenDetailVO detail = service.getDetail(table.getTableId());
            List<DbColumn> metadata = fixture.metadata(fixture.database, table.getTableName());
            require(metadata.equals(fixture.metadata("cloud_flow_db", table.getTableName())), "runtime metadata matches isolated copy: " + table.getTableName());
            require(detail.getColumns().size() == metadata.size(), "all real columns imported: " + table.getTableName());
            Map<String, DbColumn> byName = metadata.stream().collect(Collectors.toMap(DbColumn::name, column -> column));
            for (SysCodegenColumn column : detail.getColumns()) {
                DbColumn source = byName.get(column.getColumnName());
                require(source != null && source.type().equals(column.getColumnType())
                        && source.comment().equals(column.getColumnComment()), "imported column metadata: " + column.getColumnName());
                require(column.getPkFlag() == ("PRI".equals(source.key()) ? 1 : 0), "primary key inference");
                require(column.getIncrementFlag() == (source.extra().contains("auto_increment") ? 1 : 0), "identity inference");
            }
            detail.getTable().setPackageName("com.cloudflow.codegenacceptance." + table.getModuleName());
            if ("oa_supplier".equals(table.getTableName())) detail.getTable().setClassName("SysSupplier");
            service.saveConfiguration(saveRequest(detail));
            Map<String, String> files = service.preview(table.getTableId());
            cases.add(writeCase(root, detail.getTable(), metadata, files));
            if ("oa_supplier".equals(table.getTableName())) verifyMenuSql(fixture, files.get("sql/supplier-menu.sql"));
            System.out.println("CODEGEN_REAL_TABLE: table=" + table.getTableName() + "; columns=" + metadata.size()
                    + "; imported=true; generated_files=" + files.size() + "; java_files=5");
        }
        SysCodegenTable supplier = service.selectImportedTablePage(query("oa_supplier"), 1, 20).getRows().get(0);
        verifyTenantIsolation(fixture, supplier.getTableId());
        CodegenDetailVO custom = service.getDetail(supplier.getTableId());
        custom.getTable().setClassName("ConfiguredSupplier");
        column(custom, "supplier_id").setJavaField("customSupplierId");
        SysCodegenColumn nameColumn = column(custom, "supplier_name");
        nameColumn.setJavaField("displaySupplierName");
        nameColumn.setColumnComment("保留的手工字段说明");
        nameColumn.setQueryFlag(1);
        nameColumn.setQueryType("LIKE");
        nameColumn.setHtmlType("textarea");
        nameColumn.setDictType("a1_supplier_fixture");
        nameColumn.setSortNo(123);
        service.saveConfiguration(saveRequest(custom));
        fixture.jdbc.execute("ALTER TABLE oa_supplier ADD COLUMN a1_new_column VARCHAR(50) NULL COMMENT '新增字段'");
        service.syncTable(supplier.getTableId());
        CodegenDetailVO synced = service.getDetail(supplier.getTableId());
        SysCodegenColumn after = column(synced, "supplier_name");
        System.out.println("CODEGEN_SYNC_CONFIGURATION: java_field=" + after.getJavaField()
                + "; custom_comment_preserved=" + "保留的手工字段说明".equals(after.getColumnComment())
                + "; query=" + after.getQueryType() + "; sort=" + after.getSortNo());
        require("displaySupplierName".equals(after.getJavaField()), "sync preserves configured Java field name");
        require("customSupplierId".equals(column(synced, "supplier_id").getJavaField()), "sync preserves configured primary key Java field name");
        require("保留的手工字段说明".equals(after.getColumnComment()), "sync preserves configured field description");
        require(after.getQueryFlag() == 1 && "LIKE".equals(after.getQueryType()) && "textarea".equals(after.getHtmlType())
                && "a1_supplier_fixture".equals(after.getDictType()) && after.getSortNo() == 123, "sync preserves other editable configuration");
        require("a1NewColumn".equals(column(synced, "a1_new_column").getJavaField()), "sync appends new column");
        fixture.jdbc.execute("ALTER TABLE oa_supplier DROP COLUMN a1_new_column");
        service.syncTable(supplier.getTableId());
        require(service.getDetail(supplier.getTableId()).getColumns().stream().noneMatch(column -> "a1_new_column".equals(column.getColumnName())), "sync removes dropped column");
        cases.add(writeCase(root, synced.getTable(), fixture.metadata(fixture.database, "oa_supplier"), service.preview(supplier.getTableId())));
        require(cases.size() == 7, "six real tables and custom supplier variant");
        service.remove(List.of(supplier.getTableId()));
        reject(() -> service.getDetail(supplier.getTableId()), "deleted import cannot be read");
        require(fixture.jdbc.queryForObject("SELECT deleted FROM sys_codegen_table WHERE table_id=?", Integer.class,
                supplier.getTableId()) == 1, "logical delete flag is persisted under actual global configuration");
        require(service.selectImportedTablePage(query("oa_supplier"), 1, 20).getTotal() == 0, "deleted import leaves list");
        require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_codegen_column WHERE table_id=?", Integer.class,
                supplier.getTableId()) == 0, "deleted import columns are removed");
        service.importTables(importRequest("oa", List.of("oa_supplier")));
        require(service.selectImportedTablePage(query("oa_supplier"), 1, 20).getTotal() == 1, "deleted import can be reimported");
        require(service.selectImportedTablePage(query("oa_supplier"), 1, 20).getRows().get(0).getTableId().equals(supplier.getTableId()),
                "reimport restores the existing tenant and table configuration");
        JSON.writerWithDefaultPrettyPrinter().writeValue(root.resolve("generated-cases.json").toFile(), cases);
        new StaticRuleScanner(root.resolve("generated/src/main/java")).scan();
        System.out.println("CODEGEN_REAL_RENDER: tables=6; variants=7; java_sources=35; static_findings=0; compilation_pending=true");
    }

    private static void verifyTenantIsolation(Fixture fixture, Long tableId) {
        CodegenDetailVO ownerConfiguration = fixture.service.getDetail(tableId);
        identity(200000L);
        try {
            require(fixture.service.selectImportedTablePage(null, 1, 20).getTotal() == 0, "other tenant has no imported configuration");
            require(fixture.service.selectDatabaseTablePage("oa_supplier", null, 1, 20).getTotal() == 1, "other tenant can discover same physical table");
            reject(() -> fixture.service.getDetail(tableId), "other tenant cannot read columns");
            reject(() -> fixture.service.preview(tableId), "other tenant cannot render configuration");
            reject(() -> fixture.service.saveConfiguration(saveRequest(ownerConfiguration)), "other tenant cannot save configuration");
            reject(() -> fixture.service.syncTable(tableId), "other tenant cannot synchronize configuration");
            reject(() -> fixture.service.remove(List.of(tableId)), "other tenant cannot remove configuration");
            fixture.service.importTables(importRequest("oa", List.of("oa_supplier")));
            require(fixture.service.selectImportedTablePage(null, 1, 20).getTotal() == 1, "other tenant owns separate configuration");
        } finally { identity(100000L); }
        require(fixture.service.getDetail(tableId).getTable().getTenantId() == 100000L, "owner configuration remains intact");
        System.out.println("CODEGEN_IMPORT_TENANTS: tenants=2; cross_tenant_read_preview_save_sync_remove_rejected=true; shared_table_import=true");
    }

    private static void verifyMenuSql(Fixture fixture, String sql) throws Exception {
        require(sql != null, "real supplier generates menu SQL");
        fixture.jdbc.update("INSERT INTO sys_menu(menu_id,menu_name,parent_id,path,menu_type,visible,status) VALUES (6,'验证目录',0,'a1-verify','M','0','0')");
        fixture.jdbc.update("INSERT INTO sys_role(role_id,tenant_id,role_name,role_key,role_sort,status,deleted) VALUES (1,100000,'Admin','admin',1,'0',0),(5,100000,'Employee','employee',5,'0',0),(11,200000,'Other admin','admin',1,'0',0)");
        for (int iteration = 0; iteration < 2; iteration++) {
            try (Connection connection = fixture.source.getConnection()) {
                ScriptUtils.executeSqlScript(connection, new ByteArrayResource(sql.getBytes(StandardCharsets.UTF_8)));
            }
            require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE perms LIKE 'oa:supplier:%'", Integer.class) == 6, "generated menu and five buttons are idempotent");
            require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE menu_type='F' AND perms LIKE 'oa:supplier:%'", Integer.class) == 5, "five assignable buttons exist");
            require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id IN (1,11)", Integer.class) == 12, "both tenant administrators receive menu and buttons");
            require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_role_menu WHERE role_id=5", Integer.class) == 0, "generated SQL grants employee nothing");
        }
        require(fixture.jdbc.queryForObject("SELECT COUNT(*) FROM sys_menu WHERE parent_id=6 AND path='supplier' AND menu_type='C' AND visible='0' AND status='0'", Integer.class) == 1, "generated menu enabled and visible in database");
        System.out.println("CODEGEN_MENU_SQL: executions=2; menu_rows=1; buttons=5; admin_grants=12; employee_grants=0; frontend_visibility=NOT_TESTED; runtime_writes=0");
    }

    private static GeneratedCase writeCase(Path root, SysCodegenTable table, List<DbColumn> columns, Map<String, String> files) throws Exception {
        Path generated = root.resolve("generated");
        int javaFiles = 0;
        for (Map.Entry<String, String> file : files.entrySet()) {
            Path target = generated.resolve(file.getKey()).normalize();
            require(target.startsWith(generated), "generated path remains in evidence directory");
            if (!file.getKey().endsWith(".java")) target = root.resolve("sql-artifacts").resolve(table.getClassName()).resolve(file.getKey()).normalize();
            Files.createDirectories(target.getParent());
            Files.writeString(target, file.getValue(), StandardCharsets.UTF_8);
            if (file.getKey().endsWith(".java")) javaFiles++;
        }
        require(javaFiles == 5, "each real CRUD structure generates five Java files");
        return new GeneratedCase(table.getTableName(), table.getClassName(), table.getPackageName(), columns);
    }

    private static void compiledChecks(Fixture fixture, Path root) throws Exception {
        List<GeneratedCase> cases = JSON.readValue(root.resolve("generated-cases.json").toFile(), new TypeReference<>() {});
        List<String> failures = new ArrayList<>();
        try (URLClassLoader loader = new URLClassLoader(new URL[]{root.resolve("generated/target/classes").toUri().toURL()}, CodegenDatabaseChecks.class.getClassLoader())) {
            for (GeneratedCase generated : cases) {
                try {
                    require(generated.columns().equals(fixture.metadata(fixture.database, generated.tableName())), "schema unchanged between generation and execution");
                    Class<?> entity = loader.loadClass(generated.packageName() + ".domain." + generated.className());
                    Class<?> mapperType = loader.loadClass(generated.packageName() + ".mapper." + generated.className() + "Mapper");
                    Class<?> controller = loader.loadClass(generated.packageName() + ".controller." + generated.className() + "Controller");
                    require(generated.tableName().equals(entity.getAnnotation(TableName.class).value()), "generated table annotation");
                    if ("SysSupplier".equals(generated.className())) compareSupplier(entity, controller);
                    SqlSessionTemplate sessions = fixture.sessions(List.of(mapperType), false);
                    BaseMapper<?> mapper = (BaseMapper<?>) sessions.getMapper(mapperType);
                    TableInfo tableInfo = TableInfoHelper.getTableInfo(entity);
                    Set<String> mappedColumns = tableInfo.getFieldList().stream()
                            .map(field -> field.getColumn()).collect(Collectors.toSet());
                    mappedColumns.add(tableInfo.getKeyColumn());
                    Set<String> actualColumns = generated.columns().stream().map(DbColumn::name).collect(Collectors.toSet());
                    require(mappedColumns.equals(actualColumns), "generated persistence fields exactly match actual table: " + generated.tableName());
                    require(mapper.selectList(null).isEmpty(), "generated mapper reads actual empty table: " + generated.tableName());
                    if ("sys_sms_code".equals(generated.tableName())) smsCodeWrites(entity, mapper, fixture);
                    if ("ConfiguredSupplier".equals(generated.className())) configuredSupplierWrites(entity, mapper);
                    System.out.println("CODEGEN_REAL_MAPPER: table=" + generated.tableName() + "; class=" + generated.className() + "; select=PASS");
                } catch (Throwable failure) {
                    failures.add(generated.className());
                    printFailure("generated=" + generated.className(), failure);
                }
            }
        }
        System.out.println("CODEGEN_REAL_COMPILED: variants=" + cases.size() + "; passed=" + (cases.size() - failures.size()) + "; failed=" + failures.size());
        require(failures.isEmpty(), "generated mapper failures: " + String.join(",", failures));
    }

    @SuppressWarnings("unchecked")
    private static void smsCodeWrites(Class<?> entity, BaseMapper<?> untyped, Fixture fixture) throws Exception {
        BaseMapper<Object> mapper = (BaseMapper<Object>) untyped;
        Object code = entity.getConstructor().newInstance();
        entity.getMethod("setTenantId", Long.class).invoke(code, 100000L);
        entity.getMethod("setPhone", String.class).invoke(code, "13800000000");
        entity.getMethod("setCodeHash", String.class).invoke(code, "isolated-codegen-hash");
        entity.getMethod("setBizScene", String.class).invoke(code, "CODEGEN_ACCEPTANCE");
        entity.getMethod("setExpireTime", java.time.LocalDateTime.class).invoke(code, java.time.LocalDateTime.now().plusMinutes(5));
        require(mapper.insert(code) == 1, "actual SMS table accepts generated entity insert");
        Long identifier = (Long) entity.getMethod("getCodeId").invoke(code);
        Object loaded = mapper.selectById(identifier);
        require(loaded != null && entity.getMethod("getCreateTime").invoke(loaded) != null, "actual SMS create time fills without invented audit columns");
        identity(200000L);
        try { require(mapper.selectById(identifier) == null, "generated SMS mapper rejects cross-tenant read"); }
        finally { identity(100000L); }
        entity.getMethod("setUsedFlag", Integer.class).invoke(loaded, 1);
        require(mapper.updateById(loaded) == 1, "generated SMS mapper updates only actual columns");
        require(Integer.valueOf(1).equals(entity.getMethod("getUsedFlag").invoke(mapper.selectById(identifier))), "SMS update persisted");
        require(fixture.metadata(fixture.database, "sys_sms_code").equals(fixture.metadata("cloud_flow_db", "sys_sms_code")), "SMS table structure remains unchanged after generated CRUD");
        require(mapper.deleteById(identifier) == 1 && mapper.selectById(identifier) == null, "generated SMS mapper deletes intended isolated row");
        System.out.println("CODEGEN_SMS_CRUD: actual_columns=11; create_time_present=true; invented_audit_columns=0; insert_read_update_delete=PASS; cross_tenant_read_rejected=true; table_unchanged=true; runtime_writes=0");
    }

    @SuppressWarnings("unchecked")
    private static void configuredSupplierWrites(Class<?> entity, BaseMapper<?> untyped) throws Exception {
        BaseMapper<Object> mapper = (BaseMapper<Object>) untyped;
        Object supplier = entity.getConstructor().newInstance();
        entity.getMethod("setTenantId", Long.class).invoke(supplier, 100000L);
        entity.getMethod("setDisplaySupplierName", String.class).invoke(supplier, "独立验收供应商");
        entity.getMethod("setSupplierCode", String.class).invoke(supplier, "A1-CODEGEN-FIXTURE");
        require(mapper.insert(supplier) == 1, "configured names insert into actual supplier columns");
        Long identifier = (Long) entity.getMethod("getCustomSupplierId").invoke(supplier);
        require(identifier != null, "configured primary key receives generated database value");
        Object loaded = mapper.selectById(identifier);
        require("独立验收供应商".equals(entity.getMethod("getDisplaySupplierName").invoke(loaded)), "configured property reads persisted value");
        identity(200000L);
        try { require(mapper.selectById(identifier) == null, "generated mapper enforces tenant read isolation"); }
        finally { identity(100000L); }
        entity.getMethod("setDisplaySupplierName", String.class).invoke(loaded, "独立验收供应商修改");
        require(mapper.updateById(loaded) == 1, "configured property updates actual supplier column");
        require("独立验收供应商修改".equals(entity.getMethod("getDisplaySupplierName").invoke(mapper.selectById(identifier))), "configured property update persisted");
        require(mapper.deleteById(identifier) == 1 && mapper.selectById(identifier) == null, "configured primary key deletes intended row");
        System.out.println("CODEGEN_CONFIGURED_CRUD: custom_primary_key=true; custom_property=true; insert_read_update_delete=PASS; cross_tenant_read_rejected=true; runtime_writes=0");
    }

    private static void compareSupplier(Class<?> generated, Class<?> controller) throws Exception {
        Map<String, Field> actual = Arrays.stream(generated.getDeclaredFields()).filter(field -> !Modifier.isStatic(field.getModifiers())).collect(Collectors.toMap(Field::getName, field -> field));
        int fields = 0;
        for (Field expected : SysSupplier.class.getDeclaredFields()) {
            if (Modifier.isStatic(expected.getModifiers())) continue;
            TableField tableField = expected.getAnnotation(TableField.class);
            if (tableField != null && !tableField.exist()) continue;
            Field found = actual.get(expected.getName());
            require(found != null && found.getType().equals(expected.getType()), "supplier field type parity: " + expected.getName());
            for (Annotation annotation : expected.getAnnotations()) require(annotation.equals(found.getAnnotation(annotation.annotationType())), "supplier field annotation parity: " + expected.getName());
            fields++;
        }
        require(controller.getAnnotation(RequestMapping.class).value()[0].equals("/supplier"), "supplier route parity");
        for (Method expected : SupplierController.class.getDeclaredMethods()) {
            if (!Modifier.isPublic(expected.getModifiers())) continue;
            Method found = Arrays.stream(controller.getDeclaredMethods()).filter(method -> method.getName().equals(expected.getName())).findFirst().orElseThrow();
            require(normalizedSignature(expected, "com.cloudflow.oa.domain.SysSupplier").equals(normalizedSignature(found, generated.getName())), "supplier method signature parity: " + expected.getName());
            for (Class<? extends java.lang.annotation.Annotation> annotation : List.of(GetMapping.class, PostMapping.class, PutMapping.class, DeleteMapping.class, SaCheckPermission.class, RepeatSubmit.class)) {
                require(Objects.equals(expected.getAnnotation(annotation), found.getAnnotation(annotation)), "supplier method annotation parity: " + expected.getName() + ":" + annotation.getSimpleName());
            }
            require((expected.getAnnotation(SysLog.class) != null) == (found.getAnnotation(SysLog.class) != null), "supplier audit annotation presence");
        }
        System.out.println("CODEGEN_SUPPLIER_STRUCTURE: fields=" + fields + "; methods=5; signatures_and_permissions=PASS; business_implementation_equivalence=NOT_CLAIMED");
    }

    private static String normalizedSignature(Method method, String entity) {
        return (method.getGenericReturnType().getTypeName() + ":" + Arrays.stream(method.getGenericParameterTypes()).map(java.lang.reflect.Type::getTypeName).collect(Collectors.joining(","))).replace(entity, "SupplierEntity");
    }

    private static SysCodegenTable query(String name) { SysCodegenTable query = new SysCodegenTable(); query.setTableName(name); return query; }
    private static CodegenImportDTO importRequest(String module, List<String> tables) { CodegenImportDTO request = new CodegenImportDTO(); request.setModuleName(module); request.setTableNames(tables); return request; }
    private static CodegenSaveDTO saveRequest(CodegenDetailVO detail) { CodegenSaveDTO request = new CodegenSaveDTO(); request.setTable(detail.getTable()); request.setColumns(detail.getColumns()); return request; }
    private static SysCodegenColumn column(CodegenDetailVO detail, String name) { return detail.getColumns().stream().filter(column -> name.equals(column.getColumnName())).findFirst().orElseThrow(); }
    private static void identity(Long tenant) { UserContext.clear(); TenantContext.clear(); UserContext.setTenantId(tenant); TenantContext.setTenantId(tenant); UserContext.setUserId(1L); UserContext.setUserName("codegen-fixture"); }
    private static String required(String name) { String value = System.getenv(name); if (value == null || value.isBlank()) throw new IllegalStateException("Missing environment variable " + name); return value; }
    private static void require(boolean condition, String message) { if (!condition) throw new AssertionError(message); assertions++; }
    private static void reject(Runnable action, String label) { try { action.run(); } catch (ServiceException expected) { assertions++; return; } throw new AssertionError(label); }
    private static void inject(Object target, String name, Object value) throws Exception { Class<?> type = target.getClass(); while (type != null) { try { Field field = type.getDeclaredField(name); field.setAccessible(true); field.set(target, value); return; } catch (NoSuchFieldException missing) { type = type.getSuperclass(); } } throw new IllegalStateException(name); }
    private static void printFailure(String label, Throwable failure) {
        Throwable cause = failure;
        while (cause.getCause() != null && cause.getCause() != cause) cause = cause.getCause();
        String message = Objects.toString(cause.getMessage(), "").replace('\n', ' ').replace('\r', ' ');
        for (String name : List.of("DB_PASSWORD", "REDIS_PASSWORD", "NACOS_PASSWORD")) {
            String value = System.getenv(name);
            if (value != null && !value.isEmpty()) message = message.replace(value, "[REDACTED]");
        }
        System.out.println("CODEGEN_DB_FAILURE: " + label + "; type=" + cause.getClass().getSimpleName() + "; message=" + message);
    }

    public record DbColumn(String name, int position, String type, String defaultValue, String nullable, String key, String extra, String comment) {}
    public record GeneratedCase(String tableName, String className, String packageName, List<DbColumn> columns) {}

    private static final class Fixture {
        private final String database;
        private final DriverManagerDataSource source;
        private final JdbcTemplate jdbc;
        private final Path workspace;
        private final ISysCodegenService service;

        private Fixture(Isolation isolation, Path workspace, Path root) throws Exception {
            this.database = isolation.database;
            this.workspace = workspace;
            source = new DriverManagerDataSource(isolation.url, required("DB_USERNAME"), required("DB_PASSWORD"));
            jdbc = new JdbcTemplate(source);
            SqlSessionTemplate sessions = sessions(List.of(SysCodegenTableMapper.class, SysCodegenColumnMapper.class), true);
            SysCodegenServiceImpl target = new SysCodegenServiceImpl(sessions.getMapper(SysCodegenColumnMapper.class), new CodegenTemplateRenderer());
            inject(target, "baseMapper", sessions.getMapper(SysCodegenTableMapper.class));
            Path project = Files.createDirectories(root.resolve("browser-project"));
            inject(target, "configuredProjectRoot", project.toString());
            ProxyFactory proxy = new ProxyFactory(target);
            proxy.addAdvice(new TransactionInterceptor(new DataSourceTransactionManager(source), new AnnotationTransactionAttributeSource()));
            service = (ISysCodegenService) proxy.getProxy();
        }

        private SqlSessionTemplate sessions(List<Class<?>> mappers, boolean codegen) throws Exception {
            MybatisConfiguration configuration = new MybatisConfiguration();
            configuration.setMapUnderscoreToCamelCase(true);
            configuration.setDefaultStatementTimeout(20);
            configuration.setLogImpl(NoLoggingImpl.class);
            GlobalConfig global = new GlobalConfig();
            global.setBanner(false);
            GlobalConfig.DbConfig dbConfig = new GlobalConfig.DbConfig();
            dbConfig.setLogicDeleteField("deleted");
            dbConfig.setLogicDeleteValue("1");
            dbConfig.setLogicNotDeleteValue("0");
            global.setDbConfig(dbConfig);
            global.setMetaObjectHandler(new MyMetaObjectHandler());
            com.baomidou.mybatisplus.core.toolkit.GlobalConfigUtils.setGlobalConfig(configuration, global);
            for (Class<?> mapper : mappers) configuration.addMapper(mapper);
            configuration.addInterceptor(new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor());
            MybatisSqlSessionFactoryBean factory = new MybatisSqlSessionFactoryBean();
            factory.setDataSource(source);
            factory.setConfiguration(configuration);
            factory.setGlobalConfig(global);
            if (codegen) factory.setMapperLocations(new FileSystemResource(workspace.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/SysCodegenTableMapper.xml")));
            if (mappers.contains(SysMenuMapper.class)) factory.setMapperLocations(new FileSystemResource(workspace.resolve("cloudflow-backend/cloudflow-auth/src/main/resources/mapper/auth/SysMenuMapper.xml")));
            return new SqlSessionTemplate(Objects.requireNonNull(factory.getObject()));
        }

        private List<DbColumn> metadata(String schema, String table) {
            return jdbc.query("""
                    SELECT COLUMN_NAME,ORDINAL_POSITION,COLUMN_TYPE,COLUMN_DEFAULT,IS_NULLABLE,COLUMN_KEY,EXTRA,COLUMN_COMMENT
                    FROM information_schema.columns WHERE table_schema=? AND table_name=? ORDER BY ORDINAL_POSITION
                    """, (row, index) -> new DbColumn(row.getString(1), row.getInt(2), row.getString(3), row.getString(4), row.getString(5), row.getString(6), row.getString(7), row.getString(8)), schema, table);
        }
    }

    private static final class Isolation implements AutoCloseable {
        private final String database = "a1_codegen_verify_" + UUID.randomUUID().toString().replace("-", "");
        private final String owner = UUID.randomUUID().toString().replace("-", "");
        private final String base = "jdbc:mysql://192.168.1.173:3306/";
        private final String options = "?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8&connectTimeout=10000&socketTimeout=45000&allowMultiQueries=false";
        private final String url = base + database + options;
        private final Connection management;
        private final List<String> tables;
        private boolean owned;

        private Isolation(Path root, String phase) throws Exception {
            tables = new ArrayList<>(TABLES);
            if ("menu".equals(phase)) tables.add("sys_user_role");
            require(database.matches("a1_codegen_verify_[a-f0-9]{32}"), "database identifier constrained");
            require(required("DB_URL").matches("jdbc:mysql://192\\.168\\.1\\.173:3306/cloud_flow_db(?:\\?.*)?"), "expected runtime credential source");
            management = DriverManager.getConnection(base + options, required("DB_USERNAME"), required("DB_PASSWORD"));
            JSON.writeValue(root.resolve("database-ownership-" + phase + ".json").toFile(), Map.of("database", database, "owner", owner));
        }

        private void initialize() throws Exception {
            try (Statement statement = management.createStatement()) { statement.execute("CREATE DATABASE " + database + " CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci"); }
            management.setCatalog(database);
            try (Statement statement = management.createStatement()) { statement.execute("CREATE TABLE a1_codegen_fixture_owner(owner_token CHAR(32) PRIMARY KEY) ENGINE=InnoDB"); }
            try (PreparedStatement insert = management.prepareStatement("INSERT INTO a1_codegen_fixture_owner(owner_token) VALUES (?)")) { insert.setString(1, owner); insert.executeUpdate(); owned = true; }
            for (String table : tables) {
                require(table.matches("[a-z_]+") && database.equals(management.getCatalog()), "DDL stays within owned database");
                try (Statement statement = management.createStatement()) { statement.execute("CREATE TABLE " + table + " LIKE cloud_flow_db." + table); }
            }
            System.out.println("CODEGEN_DB_CREATED: database=" + database + "; copied_table_definitions=" + tables.size() + "; source_rows_copied=0");
        }

        @Override public void close() throws Exception {
            try {
                if (owned) {
                    require(database.matches("a1_codegen_verify_[a-f0-9]{32}") && !"cloud_flow_db".equals(database), "cleanup identifier constrained");
                    management.setCatalog(database);
                    try (PreparedStatement query = management.prepareStatement("SELECT COUNT(*) FROM a1_codegen_fixture_owner WHERE owner_token=?")) {
                        query.setString(1, owner);
                        try (ResultSet rows = query.executeQuery()) { rows.next(); require(rows.getInt(1) == 1, "database ownership verified before cleanup"); }
                    }
                    management.setCatalog("information_schema");
                    try (Statement statement = management.createStatement()) { statement.execute("DROP DATABASE " + database); }
                    try (PreparedStatement query = management.prepareStatement("SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name=?")) {
                        query.setString(1, database);
                        try (ResultSet rows = query.executeQuery()) { rows.next(); require(rows.getInt(1) == 0, "owned database removed"); }
                    }
                    System.out.println("CODEGEN_DB_REMOVED: ownership_verified=true; remaining=0; runtime_writes=0");
                }
            } finally { management.close(); }
        }
    }
}

import cn.dev33.satoken.annotation.SaCheckPermission;
import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.auth.service.codegen.CodegenTemplateRenderer;
import com.cloudflow.common.security.annotation.Inner;
import com.cloudflow.common.staticrules.StaticRuleScanner;
import com.fasterxml.jackson.annotation.JsonFormat;
import java.lang.reflect.Method;
import java.util.Map;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Field;
import java.net.URLClassLoader;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public final class CodegenTemplateChecks {
    private static int checks;
    private static int endpoints;
    private static final List<String> CATEGORIES = List.of("CRUD", "TREE", "SUB", "INNER");

    public static void main(String[] arguments) throws Exception {
        if (arguments.length < 1 || arguments.length > 2) throw new IllegalArgumentException("Expected generated project directory and optional --compiled");
        Path root = Path.of(arguments[0]).toRealPath();
        if (arguments.length == 2) {
            check("--compiled".equals(arguments[1]), "supported verification mode");
            try (URLClassLoader loader = new URLClassLoader(new java.net.URL[]{root.resolve("target/classes").toUri().toURL()}, CodegenTemplateChecks.class.getClassLoader())) {
                for (String category : CATEGORIES) {
                    for (boolean features : List.of(true, false)) verifyCompiled(loader, table(category, features), features);
                }
            }
            System.out.printf("CODEGEN_COMPILED_CHECKS: assertions=%d; variants=8; mapped_endpoints=%d; database_writes=0; service_restarts=0%n", checks, endpoints);
            return;
        }
        CodegenTemplateRenderer renderer = new CodegenTemplateRenderer();
        verifyAuditPresence(renderer);
        int javaSources = 0;
        for (String category : CATEGORIES) {
            for (boolean features : List.of(true, false)) {
                SysCodegenTable table = table(category, features);
                Map<String, String> rendered = renderer.render(table, columns(features));
                int expectedFiles = "INNER".equals(category) ? 6 : "SUB".equals(category) ? 8 : 7;
                check(rendered.size() == expectedFiles, category + " generated file count");
                String entity = rendered.get("src/main/java/" + table.getPackageName().replace('.', '/') + "/domain/" + table.getClassName() + ".java");
                check(entity != null, "entity output exists");
                check(entity.contains("List<Integer> inValueList"), "typed IN query collection");
                check(entity.contains("BigDecimal beginBetweenValue") && entity.contains("BigDecimal endBetweenValue"), "typed BETWEEN query bounds");
                check(entity.contains("private Long tenantId;") == features, "tenant feature switch");
                check(entity.contains("@Version") == features, "optimistic lock feature switch");
                check(entity.contains("private Integer deleted;") == features, "logical deletion feature switch");
                check(rendered.keySet().stream().anyMatch(name -> name.endsWith("Mapper.xml")) == "SUB".equals(category), "custom XML only for subtable template");
                check(rendered.keySet().stream().anyMatch(name -> name.endsWith("-menu.sql")) != "INNER".equals(category), "internal template excludes menu SQL");
                for (Map.Entry<String, String> entry : rendered.entrySet()) {
                    Path destination = root.resolve(entry.getKey()).normalize();
                    check(destination.startsWith(root), "generated path stays in owned project");
                    Files.createDirectories(destination.getParent());
                    Files.writeString(destination, entry.getValue(), StandardCharsets.UTF_8, StandardOpenOption.CREATE_NEW);
                    if (entry.getKey().endsWith(".java")) javaSources++;
                }
                System.out.printf("CODEGEN_RENDER_CASE: category=%s; tenant_logic_version=%s; generated_files=%d%n", category, features, rendered.size());
            }
        }
        check(javaSources == 40, "five Java files for each of eight variants");
        new StaticRuleScanner(root.resolve("src/main/java")).scan();
        System.out.printf("CODEGEN_RENDER_CHECKS: assertions=%d; variants=8; java_sources=%d; static_findings=0; compilation_pending=true%n", checks, javaSources);
    }

    private static SysCodegenTable table(String category, boolean features) {
        String categoryName = category.charAt(0) + category.substring(1).toLowerCase(Locale.ROOT);
        String className = "Generated" + categoryName + (features ? "Full" : "Basic");
        SysCodegenTable table = new SysCodegenTable();
        table.setTableId(1L);
        table.setTableName("oa_" + className.toLowerCase(Locale.ROOT));
        table.setTableComment("生成器验收 */ \"引号\" '单引号' \\ 路径\n换行");
        table.setModuleName("oa");
        table.setBusinessName(className.toLowerCase(Locale.ROOT));
        table.setClassName(className);
        table.setFunctionName(table.getTableComment());
        table.setPackageName("com.cloudflow.codegen.acceptance");
        table.setAuthor("验收 */ \"作者\"\n下一行");
        table.setTplCategory(category);
        table.setParentMenuId(1300L);
        table.setSubTableName(table.getTableName() + "_item");
        table.setSubTableFk("parent_id");
        table.setTreeParentCode("parent_id");
        table.setTreeNameCode("name");
        table.setTenantFieldFlag(features ? 1 : 0);
        table.setLogicDeleteFlag(features ? 1 : 0);
        table.setVersionFieldFlag(features ? 1 : 0);
        return table;
    }

    private static void verifyAuditPresence(CodegenTemplateRenderer renderer) {
        List<String> databaseNames = List.of("create_by", "create_time", "update_by", "update_time");
        List<String> javaNames = List.of("createBy", "createTime", "updateBy", "updateTime");
        for (String category : List.of("CRUD", "TREE", "SUB", "INNER", "HR_TYPED")) {
            for (int mask = 0; mask < 16; mask++) {
                SysCodegenTable table = table(category, true);
                List<SysCodegenColumn> selected = new ArrayList<>(columns(true));
                for (int index = 0; index < databaseNames.size(); index++) {
                    if ((mask & (1 << index)) == 0) {
                        String name = databaseNames.get(index);
                        selected.removeIf(column -> name.equals(column.getColumnName()));
                    }
                }
                Map<String, String> rendered = renderer.render(table, selected);
                String entityPath = "src/main/java/" + table.getPackageName().replace('.', '/')
                        + ("HR_TYPED".equals(category) ? "/domain/entity/" : "/domain/") + table.getClassName() + ".java";
                String entity = rendered.get(entityPath);
                String ddl = rendered.get("sql/" + table.getTableName() + ".sql");
                for (int index = 0; index < databaseNames.size(); index++) {
                    boolean present = (mask & (1 << index)) != 0;
                    check(entity.contains(" " + javaNames.get(index) + ";") == present,
                            "actual audit entity field " + category + ":" + mask + ":" + databaseNames.get(index));
                    if (ddl != null) check(ddl.contains("  " + databaseNames.get(index) + " ") == present,
                            "actual audit DDL column " + category + ":" + mask + ":" + databaseNames.get(index));
                }
            }
        }
        System.out.println("CODEGEN_AUDIT_PRESENCE: categories=5; audit_subsets=16; cases=80; invented_columns=0");
    }

    private static List<SysCodegenColumn> columns(boolean features) {
        List<SysCodegenColumn> columns = new ArrayList<>();
        SysCodegenColumn primary = column("id", "id", "Long", "bigint", null, false);
        primary.setPkFlag(1);
        primary.setIncrementFlag(features ? 1 : 0);
        columns.add(primary);
        if (features) columns.add(column("tenant_id", "tenantId", "Long", "bigint", null, false));
        columns.add(column("parent_id", "parentId", "Long", "bigint", null, false));
        columns.add(column("name", "name", "String", "varchar(80)", null, false));
        for (String query : List.of("EQ", "NE", "GT", "GE", "LT", "LE")) {
            String prefix = query.toLowerCase(Locale.ROOT);
            columns.add(column(prefix + "_value", prefix + "Value", "Long", "bigint", query, false));
        }
        columns.add(column("like_value", "likeValue", "String", "varchar(80)", "LIKE", false));
        columns.add(column("between_value", "betweenValue", "BigDecimal", "decimal(12,2)", "BETWEEN", false));
        columns.add(column("in_value", "inValue", "Integer", "int", "IN", false));
        columns.add(column("effective_date", "effectiveDate", "LocalDate", "date", null, false));
        columns.add(column("effective_time", "effectiveTime", "LocalTime", "time", null, false));
        columns.add(column("effective_at", "effectiveAt", "LocalDateTime", "datetime", null, false));
        if (features) {
            columns.add(column("deleted", "deleted", "Integer", "tinyint", null, true));
            columns.add(column("version", "version", "Integer", "int", null, true));
        }
        columns.add(column("create_by", "createBy", "String", "varchar(64)", null, true));
        columns.add(column("create_time", "createTime", "LocalDateTime", "datetime", null, true));
        columns.add(column("update_by", "updateBy", "String", "varchar(64)", null, true));
        columns.add(column("update_time", "updateTime", "LocalDateTime", "datetime", null, true));
        for (int index = 0; index < columns.size(); index++) columns.get(index).setSortNo(index);
        return columns;
    }

    private static SysCodegenColumn column(String name, String field, String javaType, String databaseType, String query, boolean audit) {
        SysCodegenColumn column = new SysCodegenColumn();
        column.setColumnName(name);
        column.setColumnComment("字段 */ \"说明\" '单引号' \\ 路径\n下一行");
        column.setColumnType(databaseType);
        column.setJavaField(field);
        column.setJavaType(javaType);
        column.setPkFlag(0);
        column.setIncrementFlag(0);
        column.setRequiredFlag(0);
        column.setAuditFieldFlag(audit ? 1 : 0);
        column.setQueryFlag(query == null ? 0 : 1);
        column.setQueryType(query == null ? "EQ" : query);
        return column;
    }

    private static void verifyCompiled(ClassLoader loader, SysCodegenTable table, boolean features) throws Exception {
        String prefix = table.getPackageName();
        Class<?> entity = Class.forName(prefix + ".domain." + table.getClassName(), false, loader);
        Class<?> controller = Class.forName(prefix + ".controller." + table.getClassName() + "Controller", false, loader);
        check(table.getTableName().equals(entity.getAnnotation(TableName.class).value()), "compiled table mapping");
        check(entity.getDeclaredField("id").isAnnotationPresent(TableId.class), "compiled primary key");
        check(hasField(entity, "tenantId") == features, "compiled tenant switch");
        check(hasField(entity, "deleted") == features, "compiled logical deletion switch");
        check(hasField(entity, "version") == features, "compiled optimistic lock switch");
        if (features) {
            check(entity.getDeclaredField("version").isAnnotationPresent(Version.class), "compiled optimistic lock annotation");
            check(entity.getDeclaredField("deleted").getAnnotation(TableField.class).fill() == FieldFill.INSERT, "compiled logical deletion fill");
        }
        for (String name : List.of("createBy", "createTime", "updateBy", "updateTime")) {
            Field field = entity.getDeclaredField(name);
            FieldFill expected = name.startsWith("create") ? FieldFill.INSERT : FieldFill.INSERT_UPDATE;
            check(field.getAnnotation(TableField.class).fill() == expected, "compiled audit fill " + name);
        }
        for (String name : List.of("createTime", "updateTime", "effectiveAt")) {
            check("yyyy-MM-dd HH:mm:ss".equals(entity.getDeclaredField(name).getAnnotation(JsonFormat.class).pattern()), "compiled datetime format " + name);
        }
        check("yyyy-MM-dd".equals(entity.getDeclaredField("effectiveDate").getAnnotation(JsonFormat.class).pattern()), "compiled date format");
        check("HH:mm:ss".equals(entity.getDeclaredField("effectiveTime").getAnnotation(JsonFormat.class).pattern()), "compiled time format");
        for (String field : List.of("beginBetweenValue", "endBetweenValue", "inValueList")) {
            check(!entity.getDeclaredField(field).getAnnotation(TableField.class).exist(), "query-only field excluded from persistence");
        }
        boolean inner = "INNER".equals(table.getTplCategory());
        String expectedPath = inner ? "/inner/oa/" + table.getBusinessName() : "/" + table.getBusinessName();
        check(expectedPath.equals(controller.getAnnotation(RequestMapping.class).value()[0]), "compiled controller route");
        for (Method method : controller.getDeclaredMethods()) {
            if (method.isSynthetic()) continue;
            if (inner) {
                check(method.isAnnotationPresent(Inner.class), "compiled inner method guard");
                check(!method.isAnnotationPresent(SaCheckPermission.class), "inner method has no external permission");
            } else {
                SaCheckPermission permission = method.getAnnotation(SaCheckPermission.class);
                check(permission != null, "compiled external method permission guard");
                for (String value : permission.value()) check(value.startsWith("oa:" + table.getBusinessName() + ":"), "compiled permission prefix");
            }
            endpoints++;
        }
        int expectedEndpoints = inner ? 1 : "SUB".equals(table.getTplCategory()) ? 6 : 5;
        check(controller.getDeclaredMethods().length == expectedEndpoints, "compiled endpoint count");
    }

    private static boolean hasField(Class<?> type, String name) {
        try { type.getDeclaredField(name); return true; }
        catch (NoSuchFieldException missing) { return false; }
    }

    private static void check(boolean passed, String label) {
        if (!passed) throw new AssertionError(label);
        checks++;
    }
}

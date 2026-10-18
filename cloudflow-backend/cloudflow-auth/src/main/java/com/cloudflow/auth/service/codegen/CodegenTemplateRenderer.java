package com.cloudflow.auth.service.codegen;

import com.cloudflow.auth.domain.SysCodegenColumn;
import com.cloudflow.auth.domain.SysCodegenTable;
import com.cloudflow.common.core.exception.ServiceException;
import org.apache.velocity.VelocityContext;
import org.apache.velocity.app.VelocityEngine;
import org.springframework.stereotype.Component;

import java.io.InputStreamReader;
import java.io.StringWriter;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

/**
 * 外置 Velocity 模板渲染器。
 */
@Component
public class CodegenTemplateRenderer {

    private final VelocityEngine velocityEngine;

    public CodegenTemplateRenderer() {
        Properties properties = new Properties();
        properties.setProperty("resource.loaders", "class");
        properties.setProperty("resource.loader.class.class",
                "org.apache.velocity.runtime.resource.loader.ClasspathResourceLoader");
        properties.setProperty("resource.default_encoding", StandardCharsets.UTF_8.name());
        velocityEngine = new VelocityEngine(properties);
        velocityEngine.init();
    }

    public Map<String, String> render(SysCodegenTable table, List<SysCodegenColumn> sourceColumns) {
        if (table == null) {
            throw new ServiceException("表配置不能为空");
        }
        List<SysCodegenColumn> columns = (sourceColumns == null ? List.<SysCodegenColumn>of() : sourceColumns).stream()
                .filter(java.util.Objects::nonNull)
                .sorted(Comparator.comparing(SysCodegenColumn::getSortNo,
                        Comparator.nullsLast(Integer::compareTo)))
                .toList();
        SysCodegenColumn pkColumn = columns.stream()
                .filter(column -> Integer.valueOf(1).equals(column.getPkFlag()))
                .findFirst()
                .orElseThrow(() -> new ServiceException("表未配置主键，无法生成代码"));
        SysCodegenColumn treeParentColumn = columns.stream()
                .filter(column -> table.getTreeParentCode() != null
                        && table.getTreeParentCode().equalsIgnoreCase(column.getColumnName()))
                .findFirst().orElse(null);
        SysCodegenColumn treeNameColumn = columns.stream()
                .filter(column -> table.getTreeNameCode() != null
                        && table.getTreeNameCode().equalsIgnoreCase(column.getColumnName()))
                .findFirst().orElse(null);
        List<SysCodegenColumn> businessColumns = columns.stream()
                .filter(column -> !Integer.valueOf(1).equals(column.getPkFlag()))
                .filter(column -> !Integer.valueOf(1).equals(column.getAuditFieldFlag()))
                .filter(column -> !"tenant_id".equals(column.getColumnName()))
                .toList();
        List<SysCodegenColumn> queryColumns = columns.stream()
                .filter(column -> Integer.valueOf(1).equals(column.getQueryFlag()))
                .filter(column -> !Integer.valueOf(1).equals(column.getAuditFieldFlag()))
                .filter(column -> !"tenant_id".equalsIgnoreCase(column.getColumnName()))
                .toList();
        List<SysCodegenColumn> betweenColumns = queryColumns.stream()
                .filter(column -> "BETWEEN".equalsIgnoreCase(column.getQueryType()))
                .toList();
        List<SysCodegenColumn> inColumns = queryColumns.stream()
                .filter(column -> "IN".equalsIgnoreCase(column.getQueryType()))
                .toList();
        List<SysCodegenColumn> ddlColumns = columns.stream()
                .filter(column -> !"tenant_id".equalsIgnoreCase(column.getColumnName()))
                .filter(column -> !Integer.valueOf(1).equals(column.getAuditFieldFlag()))
                .toList();
        boolean customQuery = "SUB".equals(table.getTplCategory());

        VelocityContext context = new VelocityContext();
        context.put("table", table);
        context.put("columns", columns);
        context.put("pkColumn", pkColumn);
        context.put("businessColumns", businessColumns);
        context.put("queryColumns", queryColumns);
        context.put("betweenColumns", betweenColumns);
        context.put("inColumns", inColumns);
        context.put("ddlColumns", ddlColumns);
        context.put("customQuery", customQuery);
        context.put("treeParentColumn", treeParentColumn);
        context.put("treeNameColumn", treeNameColumn);
        context.put("ClassName", table.getClassName());
        context.put("className", lowerFirst(table.getClassName()));
        context.put("pkCapField", upperFirst(pkColumn.getJavaField()));
        context.put("packagePath", table.getPackageName().replace('.', '/'));
        String entityPackage = "HR_TYPED".equals(table.getTplCategory())
                ? table.getPackageName() + ".domain.entity"
                : table.getPackageName() + ".domain";
        context.put("entityPackage", entityPackage);
        context.put("hasBigDecimal", hasType(columns, "BigDecimal"));
        context.put("hasLocalDate", hasType(columns, "LocalDate"));
        context.put("hasLocalTime", hasType(columns, "LocalTime"));
        context.put("hasLocalDateTime", hasType(columns, "LocalDateTime"));
        context.put("hasCreateBy", hasColumn(columns, "create_by"));
        context.put("hasCreateTime", hasColumn(columns, "create_time"));
        context.put("hasUpdateBy", hasColumn(columns, "update_by"));
        context.put("hasUpdateTime", hasColumn(columns, "update_time"));
        context.put("treeTemplate", "TREE".equals(table.getTplCategory()));
        context.put("subTemplate", "SUB".equals(table.getTplCategory()));
        context.put("hasCollectionFields", !inColumns.isEmpty() || "TREE".equals(table.getTplCategory()));
        context.put("innerTemplate", "INNER".equals(table.getTplCategory()));
        context.put("hrTypedTemplate", "HR_TYPED".equals(table.getTplCategory()));

        Map<String, String> rendered = new LinkedHashMap<>();
        String javaRoot = "src/main/java/" + table.getPackageName().replace('.', '/');
        String entityFolder = "HR_TYPED".equals(table.getTplCategory()) ? "/domain/entity/" : "/domain/";
        rendered.put(javaRoot + entityFolder + table.getClassName() + ".java",
                merge("codegen/java/entity.java.vm", context));

        if ("HR_TYPED".equals(table.getTplCategory())) {
            rendered.put("snippets/" + table.getClassName() + "ResourceController.java.txt",
                    merge("codegen/java/hrTypedController.java.vm", context));
            return rendered;
        }

        rendered.put(javaRoot + "/controller/" + table.getClassName() + "Controller.java",
                merge("codegen/java/controller.java.vm", context));

        rendered.put(javaRoot + "/mapper/" + table.getClassName() + "Mapper.java",
                merge("codegen/java/mapper.java.vm", context));
        rendered.put(javaRoot + "/service/I" + table.getClassName() + "Service.java",
                merge("codegen/java/service.java.vm", context));
        rendered.put(javaRoot + "/service/impl/" + table.getClassName() + "ServiceImpl.java",
                merge("codegen/java/serviceImpl.java.vm", context));
        if (customQuery) {
            rendered.put("src/main/resources/mapper/" + table.getModuleName() + "/"
                            + table.getClassName() + "Mapper.xml",
                    merge("codegen/java/mapper.xml.vm", context));
        }

        rendered.put("sql/" + table.getTableName() + ".sql",
                merge("codegen/sql/ddl.sql.vm", context));
        // INNER 模板只生成内部接口，不产生任何外部权限码或菜单片段。
        if (!"INNER".equals(table.getTplCategory())) {
            rendered.put("sql/" + table.getBusinessName() + "-menu.sql",
                    merge("codegen/sql/menu.sql.vm", context));
        }
        return rendered;
    }

    private String merge(String templatePath, VelocityContext context) {
        try (InputStreamReader reader = new InputStreamReader(
                requireResource(templatePath), StandardCharsets.UTF_8)) {
            StringWriter writer = new StringWriter();
            velocityEngine.evaluate(context, writer, "cloudflow-codegen", reader);
            return writer.toString();
        } catch (Exception e) {
            throw new ServiceException("生成模板失败：" + templatePath, e);
        }
    }

    private java.io.InputStream requireResource(String path) {
        java.io.InputStream stream = Thread.currentThread().getContextClassLoader().getResourceAsStream(path);
        if (stream == null) {
            throw new ServiceException("代码模板不存在：" + path);
        }
        return stream;
    }

    private boolean hasType(List<SysCodegenColumn> columns, String type) {
        return columns.stream().anyMatch(column -> type.equals(column.getJavaType()));
    }

    private boolean hasColumn(List<SysCodegenColumn> columns, String name) {
        return columns.stream().anyMatch(column -> name.equalsIgnoreCase(column.getColumnName()));
    }

    private String lowerFirst(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return value.substring(0, 1).toLowerCase(Locale.ROOT) + value.substring(1);
    }

    private String upperFirst(String value) {
        if (value == null || value.isEmpty()) {
            return value;
        }
        return value.substring(0, 1).toUpperCase(Locale.ROOT) + value.substring(1);
    }
}

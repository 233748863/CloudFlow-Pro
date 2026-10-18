import cn.dev33.satoken.annotation.SaCheckPermission;
import cn.dev33.satoken.annotation.SaMode;
import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper;
import com.baomidou.mybatisplus.extension.plugins.inner.InnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cloudflow.common.config.MybatisPlusConfig;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.common.core.domain.PageQuery;
import com.cloudflow.common.core.domain.PageResult;
import com.cloudflow.common.core.domain.R;
import com.cloudflow.common.tenant.TenantConfigProperties;
import com.cloudflow.common.tenant.TenantContext;
import com.cloudflow.workflow.controller.WorkflowDraftController;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormDraftMapper;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.WorkflowDefinitionConfigService;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowDraftReferenceService;
import com.cloudflow.workflow.service.WorkflowLaunchContextService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.regex.Matcher;
import net.sf.jsqlparser.expression.NullValue;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.statement.select.PlainSelect;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.mapping.ParameterMapping;
import org.apache.ibatis.mapping.ResultMap;
import org.apache.ibatis.session.RowBounds;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.RequestMapping;

import java.lang.reflect.Proxy;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.regex.Pattern;

public final class WorkflowDraftReferenceChecks {
    private static final Long TENANT = 100010L;
    private static final Long FOREIGN_TENANT = 200020L;
    private static final Long USER = 11L;
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int checks;

    public static void main(String[] arguments) throws Exception {
        identity(TENANT);
        try {
            launchBoundaries();
            fieldBoundaries();
            paginationAndServerConfiguration();
            xmlAndTenantBoundaries(Path.of(arguments[0]));
            controllerBoundary();
            System.out.println("PASS: WorkflowDraftReferenceChecks checks=" + checks
                    + "; OFFLINE real services/XML/tenant and pagination interceptors; mapper data is simulated; no HTTP or database");
        } finally {
            UserContext.clear();
            TenantContext.clear();
        }
    }

    private static void launchBoundaries() {
        WorkflowDraftReferenceChecks.Fixture fixture = new Fixture();
        fixture.fields("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"}]");
        fixture.options("person", new PageQuery());
        fixture.definition.setStartPermissionValue("[12]");
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.definition.setStartPermissionValue("[11]");
        UserContext.setUserId(12L);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        UserContext.setUserId(null);
        denied(fixture, "PERMISSION_DENIED", () -> fixture.options("person", new PageQuery()));
        UserContext.setUserId(USER);
        identity(null);
        denied(fixture, "PERMISSION_DENIED", () -> fixture.options("person", new PageQuery()));
        identity(FOREIGN_TENANT);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        identity(TENANT);
        WfProcessDefinition foreign = definition("foreign-definition", FOREIGN_TENANT);
        fixture.definitions.add(foreign);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.service.options(foreign.getDefinitionId(), "person", new PageQuery()));
        fixture.form.setTenantId(FOREIGN_TENANT);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.form.setTenantId(TENANT);
        fixture.definition.setStatus("DRAFT");
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.definition.setStatus("PUBLISHED");
        fixture.definition.setIsArchived(1);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.definition.setIsArchived(0);
        fixture.definition.setDeleted(1);
        denied(fixture, "DRAFT_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.definition.setDeleted(0);
        WfProcessDefinition newer = definition("new-definition", TENANT);
        newer.setVersion(2);
        fixture.definitions.add(newer);
        denied(fixture, "DRAFT_STALE", () -> fixture.options("person", new PageQuery()));
    }

    private static void fieldBoundaries() {
        WorkflowDraftReferenceChecks.Fixture fixture = new Fixture();
        fixture.fields("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"}]");
        for (String field : Arrays.asList(null, "", " ", "missing", "person' OR 1=1", "x".repeat(101))) {
            denied(fixture, "DRAFT_REFERENCE_UNAVAILABLE", () -> fixture.options(field, new PageQuery()));
        }
        for (String type : List.of("TEXT", "NUMBER", "DATE", "FILE", "USER", "employee", "POSITON", "EMPLOYEE'")) {
            fixture.fields("[{\"id\":\"person\",\"type\":\"" + type + "\"}]");
            denied(fixture, List.of("TEXT", "NUMBER", "DATE").contains(type) ? "DRAFT_REFERENCE_UNAVAILABLE" : "FORM_UNSUPPORTED_FIELD_TYPE", () -> fixture.options("person", new PageQuery()));
        }
        fixture.fields("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"},{\"id\":\"person\",\"type\":\"DEPT\"}]");
        denied(fixture, "INVALID_REQUEST", () -> fixture.options("person", new PageQuery()));
        fixture.form.setFieldsJson("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"}]");
        denied(fixture, "INVALID_REQUEST", () -> fixture.options("person", new PageQuery()));
        fixture.fields("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"}]");
        fixture.permissions.add(permission("person", false));
        fixture.permissions.add(permission("person", true));
        denied(fixture, "DRAFT_REFERENCE_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.permissions.clear();
        fixture.permissions.add(permission("other", false));
        fixture.permissions.add(permission("person", true));
        equal(10, fixture.options("person", new PageQuery()).getRows().size(), "visible read-only reference remains readable");
        fixture.definition.setFormId(null);
        denied(fixture, "DRAFT_REFERENCE_UNAVAILABLE", () -> fixture.options("person", new PageQuery()));
        fixture.definition.setFormId("reference-form");
        fixture.fields("[{\"id\":\"" + "x".repeat(100) + "\",\"type\":\"POST\"}]");
        equal(10, fixture.options("x".repeat(100), new PageQuery()).getRows().size(), "100-character field id is accepted");
    }

    private static void paginationAndServerConfiguration() {
        WorkflowDraftReferenceChecks.Fixture fixture = new Fixture();
        for (String type : List.of("EMPLOYEE", "DEPT", "POST", "POSITION")) {
            for (String active : List.of("", ",\"onlyActive\":true", ",\"onlyActive\":false")) {
                fixture.fields("[{\"id\":\"reference\",\"type\":\"" + type + "\"" + active + "}]");
                PageQuery query = new PageQuery();
                query.getParams().putAll(Map.of("tenantId", FOREIGN_TENANT, "onlyActive", active.endsWith("false"),
                        "type", "TEXT", "fieldId", "private", "pageSize", Integer.MAX_VALUE));
                fixture.options("reference", query);
                equal(TENANT, fixture.lastTenant, "query parameters cannot replace authenticated tenant");
                equal(type, fixture.lastType, "reference type comes from current stored form");
                equal(!active.endsWith("false"), fixture.lastActive, "onlyActive comes from current stored field");
            }
        }
        fixture.fields("[{\"id\":\"reference\",\"type\":\"EMPLOYEE\"}]");
        List<Integer> sizes = Arrays.asList(null, -1, 0, 1, 99, 100, 101, Integer.MAX_VALUE);
        List<Long> expectedSizes = List.of(10L, 10L, 10L, 1L, 99L, 100L, 100L, 100L);
        for (int index = 0; index < sizes.size(); index++) {
            PageQuery query = new PageQuery();
            query.setPageSize(sizes.get(index));
            PageResult<WorkflowFormReferenceVO> result = fixture.options("reference", query);
            equal(expectedSizes.get(index), fixture.lastPage.getSize(), "mapper page size is bounded before query");
            equal(expectedSizes.get(index), result.getPageSize(), "response reports bounded page size");
            equal(expectedSizes.get(index).intValue(), result.getRows().size(), "page contains no more than 100 option rows");
            equal(105L, result.getTotal(), "total count is preserved");
        }
        for (int number : List.of(-3, 0, 2, Integer.MAX_VALUE)) {
            PageQuery query = new PageQuery();
            query.setPageNum(number);
            query.setPageSize(1000);
            PageResult<WorkflowFormReferenceVO> result = fixture.options("reference", query);
            equal((long) Math.max(1, number), result.getPageNum(), "page number remains positive");
            equal(number <= 0 ? 100 : number == 2 ? 5 : 0, result.getRows().size(), "page offsets do not bypass limit");
        }
    }

    private static void xmlAndTenantBoundaries(Path workspace) throws Exception {
        MybatisConfiguration configuration = new MybatisConfiguration();
        for (String name : List.of("WorkflowFormReferenceMapper.xml", "WorkflowConfigurationLockMapper.xml", "WfFormDraftMapper.xml")) {
            String resource = "mapper/workflow/" + name;
            try (InputStream input = WorkflowDraftReferenceChecks.class.getClassLoader().getResourceAsStream(resource)) {
                check(input != null, "actual mapper XML is available: " + name);
                new XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
            }
        }
        List<InnerInterceptor> plugins = new MybatisPlusConfig(new TenantConfigProperties()).mybatisPlusInterceptor().getInterceptors();
        TenantLineInnerInterceptor tenantPlugin = plugins.stream().filter(TenantLineInnerInterceptor.class::isInstance)
                .map(TenantLineInnerInterceptor.class::cast).findFirst().orElseThrow();
        PaginationInnerInterceptor pagePlugin = plugins.stream().filter(PaginationInnerInterceptor.class::isInstance)
                .map(PaginationInnerInterceptor.class::cast).findFirst().orElseThrow();
        MappedStatement statement = configuration.getMappedStatement(WorkflowFormReferenceMapper.class.getName() + ".pageReferences");
        ResultMap mapping = statement.getResultMaps().get(0);
        equal(WorkflowFormReferenceVO.class, mapping.getType(), "mapper materializes a dedicated option type");
        equal(List.of("id", "label", "department_id"), mapping.getConstructorResultMappings().stream()
                .map(property -> property.getColumn()).toList(), "only option constructor columns are mapped");
        check(mapping.getConstructorResultMappings().stream().allMatch(property -> property.getJavaType() == String.class),
                "reference identifiers remain strings");
        Map<String, List<String>> branches = Map.of(
                "EMPLOYEE", List.of("hr_employee", "employee_row.id", "employee_row.name", "employee_row.employee_status NOT IN ('RESIGNED', 'LEFT', 'TERMINATED', 'SUSPENDED')"),
                "DEPT", List.of("sys_dept", "dept_id", "dept_name", "status = '0'"),
                "POST", List.of("sys_post", "post_id", "post_name", "status = '0'"),
                "POSITION", List.of("hr_position", "id", "position_name", "status = 1"));
        for (String type : List.of("EMPLOYEE", "DEPT", "POST", "POSITION")) {
            List<String> expected = branches.get(type);
            for (boolean active : List.of(true, false)) {
                LinkedHashMap<String, Object> parameters = new LinkedHashMap<String, Object>();
                parameters.put("tenantId", FOREIGN_TENANT);
                parameters.put("type", type);
                parameters.put("onlyActive", active);
                PageQuery pageQuery = new PageQuery();
                pageQuery.setPageSize(Integer.MAX_VALUE);
                parameters.put("page", pageQuery.build());
                BoundSql bound = statement.getBoundSql(parameters);
                PlainSelect select = (PlainSelect) CCJSqlParserUtil.parse(bound.getSql());
                equal(expected.get(0), ((net.sf.jsqlparser.schema.Table) select.getFromItem()).getName(), type + " uses its approved reference table");
                equal(List.of("id", "label", "department_id"), select.getSelectItems().stream()
                        .map(item -> item.getAlias().getName()).toList(), type + " has an exact projection allowlist");
                equal("CAST(" + expected.get(1) + " AS CHAR)", select.getSelectItems().get(0).getExpression().toString(), type + " id is text");
                equal(expected.get(2), select.getSelectItems().get(1).getExpression().toString(), type + " label is the display name");
                if ("EMPLOYEE".equals(type)) {
                    equal("CAST(employee_row.dept_id AS CHAR)", select.getSelectItems().get(2).getExpression().toString(), "employee option only includes department identity");
                    equal(1, select.getJoins().size(), "employee options join only the department scope source");
                    equal("sys_dept department_row", select.getJoins().get(0).getRightItem().toString(), "department scope uses the approved table");
                    String joined = select.getJoins().get(0).toString();
                    check(joined.contains("department_row.tenant_id = employee_row.tenant_id") && joined.contains("department_row.dept_id = employee_row.dept_id")
                            && joined.contains("department_row.deleted = 0"), "department join preserves tenant, identity and deletion boundaries");
                } else {
                    check(select.getSelectItems().get(2).getExpression() instanceof NullValue, type + " department metadata is null");
                    check(select.getJoins() == null || select.getJoins().isEmpty(), type + " does not join employee management details");
                }
                equal(List.of("tenantId"), bound.getParameterMappings().stream().map(parameter -> parameter.getProperty()).toList(),
                        type + " tenant is a bound parameter");
                equal(active, select.getWhere().toString().contains(expected.get(3)), type + " active filter follows server flag");
                if (Set.of("EMPLOYEE", "DEPT").contains(type)) {
                    check(select.getWhere().toString().contains("deleted = 0"), type + " always excludes deleted rows");
                }
                tenantPlugin.beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
                check(bound.getSql().contains("tenant_id = " + TENANT), type + " real interceptor adds authenticated tenant");
                check(bound.getSql().contains("tenant_id = ?"), type + " explicit tenant predicate survives rewriting");
                equal(FOREIGN_TENANT, parameters.get("tenantId"), type + " conflicting tenant cannot remove either predicate");
                pagePlugin.beforeQuery(null, statement, parameters, RowBounds.DEFAULT, null, bound);
                check(bound.getSql().matches("(?s).*LIMIT \\?\\s*"), type + " real pagination adds a bound LIMIT");
                ParameterMapping limit = bound.getParameterMappings().get(bound.getParameterMappings().size() - 1);
                equal(100L, ((Number) bound.getAdditionalParameter(limit.getProperty())).longValue(), type + " SQL limit is 100");
            }
        }
        BoundSql unknown = statement.getBoundSql(Map.of("tenantId", TENANT, "type", "EMPLOYEE' OR 1=1", "onlyActive", false));
        PlainSelect empty = (PlainSelect) CCJSqlParserUtil.parse(unknown.getSql());
        equal(null, empty.getFromItem(), "unknown mapper type cannot select a business table");
        equal("1 = 0", empty.getWhere().toString(), "unknown mapper type fails closed");
        IgnoreStrategy strategy = InterceptorIgnoreHelper.initSqlParserInfoCache(WfFormDraftMapper.class);
        for (Method method : WfFormDraftMapper.class.getDeclaredMethods()) {
            InterceptorIgnoreHelper.initSqlParserInfoCache(strategy, WfFormDraftMapper.class.getName(), method);
        }
        for (String method : List.of("findDefinition", "lockDefinitions", "lockForm", "lockStartPermissions")) {
            MappedStatement contextStatement = configuration.getMappedStatement(WfFormDraftMapper.class.getName() + "." + method);
            Map<String, ?> parameters = Map.of("tenantId", TENANT, "definitionId", "definition", "processKey", "reference-flow", "formId", "reference-form");
            BoundSql bound = contextStatement.getBoundSql(parameters);
            tenantPlugin.beforeQuery(null, contextStatement, parameters, RowBounds.DEFAULT, null, bound);
            check(bound.getSql().matches("(?s).*tenant_id\\s*=\\s*\\?.*"), method + " keeps explicit tenant isolation even when locks skip rewriting");
            check(bound.getParameterMappings().stream().anyMatch(parameter -> parameter.getProperty().equals("tenantId")),
                    method + " binds the authenticated tenant");
        }
        String schema = Files.readString(workspace.resolve("cloudflow-backend/DB/03.cloudflow-hr.sql"));
        Matcher position = Pattern.compile("(?is)CREATE TABLE\\s+`?hr_position`?\\s*\\((.*?)\\)\\s*ENGINE").matcher(schema);
        check(position.find(), "current HR position schema is present");
        check(!Pattern.compile("(?im)^\\s*`?dept_id`?\\s").matcher(position.group(1)).find(), "current hr_position has no dept_id column");
    }

    private static void controllerBoundary() throws Exception {
        equal(List.of("/wf/draft"), List.of(WorkflowDraftController.class.getAnnotation(RequestMapping.class).value()), "draft route is unchanged");
        Method endpoint = WorkflowDraftController.class.getMethod("referenceOptions", String.class, String.class, PageQuery.class);
        equal(List.of("/context/{definitionId}/references/{fieldId}"), List.of(endpoint.getAnnotation(GetMapping.class).value()), "options use a read-only GET route");
        SaCheckPermission permission = endpoint.getAnnotation(SaCheckPermission.class);
        equal(Set.of("workflow:draft:view", "workflow:draft:save"), Set.of(permission.value()), "options use existing draft permissions only");
        equal(SaMode.OR, permission.mode(), "either view or save draft permission is sufficient");
        check(endpoint.getParameters()[2].isAnnotationPresent(ModelAttribute.class), "only page query is bound as a model attribute");
        WorkflowDraftReferenceChecks.Fixture fixture = new Fixture();
        fixture.fields("[{\"id\":\"person\",\"type\":\"EMPLOYEE\"}]");
        WorkflowDraftController controller = new WorkflowDraftController(null, fixture.contexts, fixture.json, fixture.service);
        R<PageResult<WorkflowFormReferenceVO>> response = controller.referenceOptions(fixture.definition.getDefinitionId(), "person", new PageQuery());
        equal(200, response.getCode(), "controller delegates to real reference service");
        JsonNode option = JSON.valueToTree(response.getData().getRows().get(0));
        HashSet<String> names = new HashSet<String>();
        option.fieldNames().forEachRemaining(names::add);
        equal(Set.of("id", "label", "departmentId"), names, "serialized response exposes no employee management fields");
        equal("9007199254740993", option.get("id").asText(), "large employee id preserves every digit");
        check(option.get("departmentId").isNull(), "department metadata is explicitly null");
        fixture.definition.setStartPermissionValue("[12]");
        denied(fixture, "DRAFT_UNAVAILABLE", () -> controller.referenceOptions(fixture.definition.getDefinitionId(), "person", new PageQuery()));
        fixture.definition.setStartPermissionValue("[11]");
        fixture.permissions.add(permission("person", false));
        denied(fixture, "DRAFT_REFERENCE_UNAVAILABLE", () -> controller.referenceOptions(fixture.definition.getDefinitionId(), "person", new PageQuery()));
    }

    private static final class Fixture {
        final WfProcessDefinition definition = definition("reference-definition", TENANT);
        final List<WfProcessDefinition> definitions = new ArrayList<>(List.of(definition));
        final WfFormDefinition form = new WfFormDefinition();
        final List<WfFormFieldPermission> permissions = new ArrayList<>();
        final WorkflowDraftJson json = new WorkflowDraftJson(JSON);
        final WorkflowLaunchContextService contexts;
        final WorkflowDraftReferenceService service;
        int referenceReads;
        Long lastTenant;
        String lastType;
        boolean lastActive;
        Page<?> lastPage;

        Fixture() {
            form.setFormId("reference-form");
            form.setTenantId(TENANT);
            form.setStatus("PUBLISHED");
            form.setFormName("Offline reference fixture");
            form.setVersion(1);
            form.setFieldsJson("[]");
            WfFormDraftMapper draftMapper = (WfFormDraftMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{WfFormDraftMapper.class}, (proxy, method, supplied) -> switch (method.getName()) {
                        case "findDefinition" -> definitions.stream().filter(row -> Objects.equals(row.getTenantId(), supplied[0])
                                && Objects.equals(row.getDefinitionId(), supplied[1]) && !Integer.valueOf(1).equals(row.getDeleted())).findFirst().orElse(null);
                        case "lockDefinitions" -> definitions.stream().filter(row -> Objects.equals(row.getTenantId(), supplied[0])
                                && Objects.equals(row.getProcessKey(), supplied[1])).toList();
                        case "lockForm" -> Objects.equals(form.getTenantId(), supplied[0]) && Objects.equals(form.getFormId(), supplied[1]) ? form : null;
                        case "lockStartPermissions" -> permissions.stream().filter(row -> Objects.equals(row.getTenantId(), supplied[0])
                                && Objects.equals(row.getDefinitionId(), supplied[1])).toList();
                        default -> throw new AssertionError("Unexpected draft mapper operation: " + method.getName());
                    });
            WorkflowFormReferenceMapper references = (WorkflowFormReferenceMapper) Proxy.newProxyInstance(getClass().getClassLoader(),
                    new Class<?>[]{WorkflowFormReferenceMapper.class}, (proxy, method, supplied) -> {
                        if (!method.getName().equals("pageReferences")) throw new AssertionError("Employee detail lookup is forbidden: " + method.getName());
                        referenceReads++;
                        lastTenant = (Long) supplied[1];
                        lastType = (String) supplied[2];
                        lastActive = (boolean) supplied[3];
                        @SuppressWarnings("unchecked")
                        Page<WorkflowFormReferenceVO> page = (Page<WorkflowFormReferenceVO>) supplied[0];
                        lastPage = page;
                        ArrayList<WorkflowFormReferenceVO> rows = new ArrayList<WorkflowFormReferenceVO>();
                        for (long offset = page.offset(); offset < Math.min(105L, page.offset() + page.getSize()); offset++) {
                            rows.add(new WorkflowFormReferenceVO(String.valueOf(9007199254740993L + offset), "Option " + offset, null));
                        }
                        return page.setTotal(105L).setRecords(rows);
                    });
            WorkflowPermissionService permissionService = new WorkflowPermissionService();
            WorkflowDefinitionConfigService configurations = new WorkflowDefinitionConfigService(null, null, null, new WorkflowGraphModelResolver(), permissionService, null, JSON);
            contexts = new WorkflowLaunchContextService(draftMapper, permissionService, configurations, json);
            service = new WorkflowDraftReferenceService(contexts, references, json, new com.cloudflow.workflow.validator.JsonSchemaValidator());
        }

        void fields(String value) {
            form.setFieldsJson(value.replace("\"id\":", "\"label\":\"Reference\",\"id\":"));
        }

        com.cloudflow.common.core.domain.PageResult<WorkflowFormReferenceVO> options(String field, PageQuery query) {
            return service.options(definition.getDefinitionId(), field, query);
        }
    }

    private static WfProcessDefinition definition(String identifier, Long tenant) {
        WfProcessDefinition definition = new WfProcessDefinition();
        definition.setDefinitionId(identifier);
        definition.setTenantId(tenant);
        definition.setProcessKey("reference-flow");
        definition.setProcessName("Offline reference flow");
        definition.setStatus("PUBLISHED");
        definition.setVersion(1);
        definition.setDeleted(0);
        definition.setIsArchived(0);
        definition.setStartPermissionType("USER");
        definition.setStartPermissionValue("[11]");
        definition.setFormId("reference-form");
        definition.setModelJson("{\"nodes\":[{\"id\":\"start\",\"type\":\"START\",\"title\":\"start\"},"
                + "{\"id\":\"end\",\"type\":\"END\",\"title\":\"end\"}],\"edges\":[{\"source\":\"start\",\"target\":\"end\"}]}");
        return definition;
    }

    private static WfFormFieldPermission permission(String field, boolean visible) {
        WfFormFieldPermission permission = new WfFormFieldPermission();
        permission.setTenantId(TENANT);
        permission.setDefinitionId("reference-definition");
        permission.setNodeKey("__START__");
        permission.setFieldId(field);
        permission.setVisibleFlag(visible);
        permission.setEditableFlag(false);
        permission.setRequiredFlag(false);
        return permission;
    }

    private static void identity(Long tenant) {
        UserContext.setTenantId(tenant);
        UserContext.setUserId(USER);
        TenantContext.setTenantId(tenant);
        TenantContext.clearTenantSkip();
    }

    private static void denied(Fixture fixture, String code, Runnable action) {
        int reads = fixture.referenceReads;
        try {
            action.run();
            throw new AssertionError("Unavailable reference request unexpectedly succeeded: " + code);
        } catch (WorkflowException expected) {
            equal(code, expected.getCode(), "reference request is rejected with its expected business code");
        }
        equal(reads, fixture.referenceReads, "rejected request cannot query any reference options");
    }

    private static void equal(Object expected, Object actual, String message) {
        check(Objects.equals(expected, actual), message + "; expected=" + expected + "; actual=" + actual);
    }

    private static void check(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError("Workflow reference check " + checks + ": " + message);
    }
}

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.AbstractWrapper;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.WfFormDefinition;
import com.cloudflow.workflow.domain.WfFormFieldPermission;
import com.cloudflow.workflow.domain.WfProcessDefinition;
import com.cloudflow.workflow.domain.dto.FieldPermissionDTO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WfFormFieldPermissionMapper;
import com.cloudflow.workflow.model.WorkflowGraphModelResolver;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowConfigurationLockService;
import com.cloudflow.workflow.service.WorkflowDefinitionConfigService;
import com.cloudflow.workflow.service.WorkflowPermissionService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.lang.reflect.Proxy;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import org.apache.ibatis.builder.MapperBuilderAssistant;

public final class C3PermissionPathChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<FieldPermissionDTO> REQUESTED = List.of(
            new FieldPermissionDTO("approval", "salary", false, false, null),
            new FieldPermissionDTO("approval", "items.amount", false, false, null),
            new FieldPermissionDTO("approval", "items.note", true, false, true));
    private static int checks;
    private static int cases;
    private static int failures;

    public static void main(String[] arguments) {
        TableInfoHelper.initTableInfo(new MapperBuilderAssistant(new MybatisConfiguration(), "c3-paths"), WfFormFieldPermission.class);
        UserContext.setTenantId(100000L); UserContext.setUserId(1L); UserContext.setUserName("permission-path-check");
        try {
            for (String layout : List.of("GROUP", "GRID", "TABS", "COLLAPSE")) {
                run(layout + "_save_filter_copy", () -> verifySavedAndCopied(layout));
                run(layout + "_reject_layout_prefixed_path", () -> verifyWrongPath(layout));
            }
            run("moving_fields_into_layout_keeps_permissions", C3PermissionPathChecks::verifyMovedFields);
            run("root_fields_keep_existing_behavior", () -> verifySavedAndCopied(null));
            System.out.println("C3_PERMISSION_PATHS: cases=" + cases + "; checks=" + checks + "; failures=" + failures
                    + "; real_config_and_filter=true; mapper_test_doubles=true; database_writes=0");
            if (failures != 0) throw new AssertionError("Permission path cases failed: " + failures);
        } finally { UserContext.clear(); }
    }

    private static void verifySavedAndCopied(String layout) {
        Fixture fixture = new Fixture(schema(layout));
        fixture.service.saveFieldPermissions("source", REQUESTED);
        List<WfFormFieldPermission> source = fixture.records("source");
        equal(3, source.size(), "All requested logical paths saved");
        equal(Set.of("salary", "items.amount", "items.note"), source.stream().map(WfFormFieldPermission::getFieldId).collect(java.util.stream.Collectors.toSet()), "Saved paths match actual field values");
        verifyProjection(fixture.schema, source);
        List<String> originalIds = source.stream().map(WfFormFieldPermission::getPermissionId).toList();
        WfProcessDefinition target = definition("target");
        fixture.service.copyFieldPermissions(fixture.source, target, fixture.form);
        List<WfFormFieldPermission> copied = fixture.records("target");
        equal(3, copied.size(), "New version retains all restrictions");
        equal(REQUESTED, copied.stream().map(permission -> new FieldPermissionDTO(permission.getNodeKey(), permission.getFieldId(), permission.getVisibleFlag(), permission.getEditableFlag(), permission.getRequiredFlag())).toList(), "Copied rules retain visibility editing and required flags");
        check(copied.stream().noneMatch(permission -> originalIds.contains(permission.getPermissionId())), "Copied permissions have new identities");
        equal(originalIds, fixture.records("source").stream().map(WfFormFieldPermission::getPermissionId).toList(), "Source version remains intact");
        verifyProjection(fixture.schema, copied);
        target.setTenantId(200000L);
        rejects(() -> fixture.service.copyFieldPermissions(fixture.source, target, fixture.form), "Cross tenant copy rejected");
    }

    private static void verifyWrongPath(String layout) {
        Fixture fixture = new Fixture(schema(layout));
        rejects(() -> fixture.service.saveFieldPermissions("source", List.of(new FieldPermissionDTO("approval", "outer.section.salary", false, false, null))), "Layout names must not create invented scalar paths");
        rejects(() -> fixture.service.saveFieldPermissions("source", List.of(new FieldPermissionDTO("approval", "outer.section.items.amount", false, false, null))), "Nested table column uses only table and column identifiers");
        equal(0, fixture.records("source").size(), "Invalid path rejection precedes replacement");
    }

    private static void verifyMovedFields() {
        Fixture fixture = new Fixture(schema(null));
        fixture.service.saveFieldPermissions("source", REQUESTED);
        WfFormDefinition targetForm = form(schema("GROUP"));
        fixture.service.copyFieldPermissions(fixture.source, definition("target"), targetForm);
        equal(3, fixture.records("target").size(), "Layout-only movement must not discard permissions");
        verifyProjection(targetForm.getFieldsJson(), fixture.records("target"));
    }

    private static void verifyProjection(String schema, List<WfFormFieldPermission> permissions) {
        Map<String, Object> original = Map.of("salary", "12345.67", "publicNote", "visible", "items", List.of(Map.of("_rowId", "one", "amount", "987.65", "note", "visible row")));
        List<FieldPermissionVO> values = permissions.stream().map(permission -> new FieldPermissionVO(permission.getNodeKey(), permission.getFieldId(), permission.getVisibleFlag(), permission.getEditableFlag(), permission.getRequiredFlag())).toList();
        FormDataPermissionFilter.Projection projection = new FormDataPermissionFilter(JSON, new JsonSchemaValidator()).filter(schema, original, values, Set.of("approval"), true);
        check(!projection.values().containsKey("salary"), "Saved restriction removes salary key");
        check(!projection.fields().toString().contains("SECRET_SALARY_LABEL"), "Saved restriction removes salary definition");
        Object rows = projection.values().get("items");
        check(rows instanceof List<?>, "Visible subtable retained");
        Map<?, ?> row = (Map<?, ?>) ((List<?>) rows).get(0);
        check(!row.containsKey("amount") && row.containsKey("note"), "Saved column restriction removes only protected column");
        check(projection.permissions().stream().anyMatch(permission -> permission.fieldId().equals("items.note") && !permission.editableFlag() && Boolean.TRUE.equals(permission.requiredFlag())), "Column readonly and required override retained");
        equal("12345.67", original.get("salary"), "Filtering does not change engine data");
    }

    private static String schema(String layout) {
        ArrayNode fields = JSON.createArrayNode();
        fields.addObject().put("id", "salary").put("type", "AMOUNT").put("label", "SECRET_SALARY_LABEL").put("precision", 2);
        ObjectNode table = fields.addObject().put("id", "items").put("type", "SUB_TABLE").put("label", "明细").put("maxRows", 100);
        ArrayNode columns = table.putArray("columns");
        columns.addObject().put("id", "amount").put("type", "AMOUNT").put("label", "私有金额");
        columns.addObject().put("id", "note").put("type", "TEXT").put("label", "说明");
        if (layout != null) {
            ObjectNode section = JSON.createObjectNode().put("id", "section").put("type", layout).put("label", "布局");
            if ("GRID".equals(layout)) section.put("columns", 2);
            section.set("children", fields);
            ObjectNode outer = JSON.createObjectNode().put("id", "outer").put("type", "GROUP").put("label", "外层分组");
            outer.putArray("children").add(section);
            fields = JSON.createArrayNode().add(outer);
        }
        fields.addObject().put("id", "publicNote").put("type", "TEXT").put("label", "公开说明");
        new JsonSchemaValidator().validateFormSchema(fields.toString());
        return fields.toString();
    }

    private static WfFormDefinition form(String schema) {
        WfFormDefinition form = new WfFormDefinition(); form.setFormId("form"); form.setTenantId(100000L); form.setFieldsJson(schema); return form;
    }

    private static WfProcessDefinition definition(String id) {
        WfProcessDefinition definition = new WfProcessDefinition(); definition.setDefinitionId(id); definition.setTenantId(100000L);
        definition.setStatus("DRAFT"); definition.setFormId("form"); definition.setModelJson("{\"nodes\":[{\"id\":\"start\",\"type\":\"START\"},{\"id\":\"approval\",\"type\":\"APPROVAL\",\"title\":\"审批\"},{\"id\":\"end\",\"type\":\"END\"}],\"edges\":[{\"source\":\"start\",\"target\":\"approval\"},{\"source\":\"approval\",\"target\":\"end\"}]}"); return definition;
    }

    private static final class Fixture {
        private final String schema;
        private final WfProcessDefinition source = definition("source");
        private final WfFormDefinition form;
        private final List<WfFormFieldPermission> saved = new ArrayList<>();
        private final WorkflowDefinitionConfigService service;
        private Fixture(String schema) {
            this.schema = schema; this.form = form(schema);
            WfFormFieldPermissionMapper fields = (WfFormFieldPermissionMapper) Proxy.newProxyInstance(WfFormFieldPermissionMapper.class.getClassLoader(), new Class<?>[]{WfFormFieldPermissionMapper.class}, (proxy, method, arguments) -> {
                if ("insert".equals(method.getName())) { saved.add((WfFormFieldPermission) arguments[0]); return 1; }
                if (!Set.of("selectList", "delete").contains(method.getName())) throw new AssertionError("Unexpected mapper operation");
                AbstractWrapper<?, ?, ?> query = (AbstractWrapper<?, ?, ?>) arguments[0]; query.getSqlSegment();
                Collection<Object> parameters = query.getParamNameValuePairs().values();
                if (!parameters.contains(100000L)) throw new AssertionError("Tenant predicate missing");
                List<WfFormFieldPermission> matching = saved.stream().filter(record -> parameters.contains(record.getDefinitionId()) && record.getTenantId().equals(100000L)).toList();
                if ("selectList".equals(method.getName())) return matching;
                saved.removeAll(matching); return matching.size();
            });
            WorkflowConfigurationLockService locks = new WorkflowConfigurationLockService(null) {
                @Override public LockedConfiguration lockDefinition(String id) {
                    if (!"source".equals(id)) throw new AssertionError("Unexpected definition");
                    return new LockedConfiguration(100000L, List.of(source), Map.of("form", form));
                }
            };
            WorkflowPermissionService authorization = new WorkflowPermissionService() {
                @Override public void checkDefinitionPermission(String action) {
                    if (!Objects.equals(UserContext.getUserId(), 1L)) throw new AssertionError("Unexpected operator");
                }
            };
            service = new WorkflowDefinitionConfigService(null, locks, fields, new WorkflowGraphModelResolver(), authorization, null, JSON);
        }
        private List<WfFormFieldPermission> records(String definitionId) { return saved.stream().filter(record -> record.getDefinitionId().equals(definitionId)).toList(); }
    }

    private static void run(String label, Runnable operation) {
        cases++;
        try { operation.run(); System.out.println("C3_PERMISSION_PATH_CASE: name=" + label + "; passed=true"); }
        catch (Exception | AssertionError failure) { failures++; System.out.println("C3_PERMISSION_PATH_CASE: name=" + label + "; passed=false; error=" + failure.getClass().getSimpleName()); }
    }
    private static void rejects(Runnable operation, String label) { try { operation.run(); } catch (WorkflowException expected) { checks++; return; } throw new AssertionError(label); }
    private static void check(boolean condition, String label) { if (!condition) throw new AssertionError(label); checks++; }
    private static void equal(Object expected, Object actual, String label) { check(Objects.equals(expected, actual), label); }
}

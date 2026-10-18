import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.plugins.IgnoreStrategy;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.dto.DraftSaveRequest;
import com.cloudflow.workflow.domain.vo.DraftDetailVO;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormInputService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.mapping.MappedStatement;

public final class WorkflowDraftChecks {
    private static int checks;
    private static final WorkflowDraftJson JSON = new WorkflowDraftJson(new ObjectMapper());

    public static void main(String[] args) throws Exception {
        UserContext.setTenantId(100000L);
        UserContext.setUserId(5L);
        try {
            jsonBoundaries();
            responseIdentifiers();
            formBoundaries();
            lockingSqlBoundaries();
            System.out.println("PASS: H workflow draft validation checks=" + checks);
        } finally {
            UserContext.clear();
        }
    }

    private static void lockingSqlBoundaries() throws Exception {
        MybatisConfiguration configuration = new com.baomidou.mybatisplus.core.MybatisConfiguration();
        for (String file : List.of("WorkflowConfigurationLockMapper.xml", "WfFormDraftMapper.xml", "WfProcessInstanceMapper.xml")) {
            String resource = "mapper/workflow/" + file;
            try (InputStream input = WorkflowDraftChecks.class.getClassLoader().getResourceAsStream(resource)) {
                new org.apache.ibatis.builder.xml.XMLMapperBuilder(input, configuration, resource, configuration.getSqlFragments()).parse();
            }
        }
        TenantLineInnerInterceptor interceptor = new com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor(
                new com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler() {
                    @Override
                    public net.sf.jsqlparser.expression.Expression getTenantId() {
                        return new net.sf.jsqlparser.expression.LongValue(100000L);
                    }
                });
        for (Class<?> mapper : List.of(com.cloudflow.workflow.mapper.WorkflowConfigurationLockMapper.class,
                com.cloudflow.workflow.mapper.WfFormDraftMapper.class, com.cloudflow.workflow.mapper.WfProcessInstanceMapper.class)) {
            yes(mapper.getAnnotation(com.baomidou.mybatisplus.annotation.InterceptorIgnore.class) == null);
            IgnoreStrategy strategy = com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper.initSqlParserInfoCache(mapper);
            for (Method method : mapper.getDeclaredMethods()) {
                if (method.getAnnotation(com.baomidou.mybatisplus.annotation.InterceptorIgnore.class) == null) continue;
                com.baomidou.mybatisplus.core.plugins.InterceptorIgnoreHelper.initSqlParserInfoCache(strategy, mapper.getName(), method);
                MappedStatement statement = configuration.getMappedStatement(mapper.getName() + "." + method.getName());
                Map<String, ?> parameters = Map.of("tenantId", 100000L, "processKey", "test-key", "definitionId", "test-definition", "businessKey", "test-business");
                BoundSql bound = statement.getBoundSql(parameters);
                String original = bound.getSql();
                yes(original.matches("(?s).*tenant_id\\s*=\\s*\\?.*"));
                yes(bound.getParameterMappings().stream().anyMatch(parameter -> parameter.getProperty().equals("tenantId")));
                interceptor.beforeQuery(null, statement, parameters, org.apache.ibatis.session.RowBounds.DEFAULT, null, bound);
                equal(bound.getSql(), original);
                yes(bound.getSql().trim().endsWith("FOR UPDATE"));
            }
        }
    }

    private static void jsonBoundaries() {
        String prefix = "{\"definitionId\":\"definition\",\"expectedVersion\":0,\"loadedContextHash\":\"" + "a".repeat(64) + "\",";
        DraftSaveRequest request = JSON.readRequest(prefix + "\"formData\":{\"amount\":12.50}}");
        equal(request.expectedVersion(), 0);
        equal(request.definitionId(), "definition");
        equal(request.formData().get("amount").toString(), "12.5");
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix + "\"formData\":{\"amount\":1,\"amount\":2}}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix + "\"formData\":{},\"userId\":1}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix + "\"formData\":[]} "));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix + "\"formData\":{}} {}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix.replace("\"expectedVersion\":0", "\"expectedVersion\":0.5") + "\"formData\":{}}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readRequest(prefix.replace("\"definitionId\":\"definition\"", "\"definitionId\":12") + "\"formData\":{}}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readStartRequest("{\"draftId\":\"draft\",\"expectedVersion\":1,\"tenantId\":200}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.readStartRequest("{\"draftId\":\"draft\",\"draftId\":\"other\",\"expectedVersion\":1}"));
        rejected("DRAFT_INVALID_DATA", () -> JSON.data(Map.of("number", Double.NaN)));
        rejected("DRAFT_INVALID_DATA", () -> JSON.data(Map.of("object", new Object())));
        rejected("DRAFT_TOO_LARGE", () -> JSON.data(Map.of("text", "字".repeat(349526))));
        rejected("DRAFT_TOO_LARGE", () -> JSON.assignees(Map.of("node", java.util.Collections.nCopies(10001, 123456L))));
        Map<String, Object> nested = Map.of("value", "end");
        for (int depth = 0; depth < 17; depth++) nested = Map.of("nested", nested);
        Map<String, Object> tooDeep = nested;
        rejected("DRAFT_TOO_LARGE", () -> JSON.data(tooDeep));
        equal(JSON.hash(Map.of("first", 1, "second", 2)), JSON.hash(Map.of("second", 2, "first", 1)));
        yes(!JSON.hash(List.of(1, 2)).equals(JSON.hash(List.of(2, 1))));
        equal(JSON.readStartRequest("{\"draftId\":\"draft\",\"expectedVersion\":1}").getExpectedVersion(), 1);
        String deepModel = "{\"node\":".repeat(24) + "{}" + "}".repeat(24);
        yes(JSON.tree(deepModel).isObject());
    }

    private static void responseIdentifiers() {
        DraftDetailVO detail = new DraftDetailVO("draft", "definition", "流程", null, null, null, 1,
                "AVAILABLE", null, null, Map.of(), Map.of("approval", List.of("9007199254740993")), "a".repeat(64));
        JsonNode userId = new ObjectMapper().valueToTree(detail).path("nodeAssignees").path("approval").path(0);
        yes(userId.isTextual());
        equal(userId.textValue(), "9007199254740993");
    }

    private static void formBoundaries() {
        WorkflowFormReferenceMapper references = new WorkflowFormReferenceMapper() {
            @Override
            public List<String> findDictionaryValues(Long tenantId, String dictType) {
                throw new AssertionError("Legacy draft checks cannot enumerate dictionaries");
            }

            @Override
            public Map<String, Object> findOwnedFormFile(Long tenantId, String userName, Long fileId, String definitionId, String instanceId, String fieldPath) {
                throw new AssertionError("Legacy draft checks cannot access files");
            }

            @Override
            public Map<String, Object> findReference(Long tenantId, String type, Long referenceId, boolean onlyActive) {
                if (!Long.valueOf(100000L).equals(tenantId) || referenceId != 9L) return null;
                Map<String, Object> result = new LinkedHashMap<>();
                result.put("id", 9L); result.put("name", "记录名称"); result.put("employeeNo", "EMP-9");
                result.put("deptId", 10L); result.put("deptName", "研发部");
                return result;
            }

            @Override
            public com.baomidou.mybatisplus.extension.plugins.pagination.Page<com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO> pageReferences(
                    com.baomidou.mybatisplus.extension.plugins.pagination.Page<com.cloudflow.workflow.domain.vo.WorkflowFormReferenceVO> page,
                    Long tenantId, String type, boolean onlyActive, Long scopeDeptId, String dictType) {
                throw new AssertionError("Form validation cannot enumerate references");
            }
        };
        WorkflowFormInputService forms = new WorkflowFormInputService(references, JSON, new com.cloudflow.workflow.validator.JsonSchemaValidator());
        String fields = """
            [{"id":"text","type":"TEXT","required":true},
             {"id":"number","type":"NUMBER"},{"id":"date","type":"DATE"},
             {"id":"option","type":"SELECT","options":["甲","乙"]},
             {"id":"note","type":"TEXTAREA"},
             {"id":"employee","type":"EMPLOYEE","displayFieldId":"employeeName",
              "fillMappings":[{"targetFieldId":"deptName","source":"deptName"},{"targetFieldId":"deptId","source":"deptId"}]},
             {"id":"deptName","type":"TEXT","readonly":true},
             {"id":"department","type":"DEPT"},{"id":"post","type":"POST"},{"id":"position","type":"POSITION"},
             {"id":"fixed","type":"TEXT","readonly":true,"defaultValue":"固定值"}]
            """;
        DraftLaunchContextVO context = context(fields, List.of());
        equal(forms.validate(context, Map.of(), false).get("fixed"), "固定值");
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of(), true));
        Map<String, Object> valid = new LinkedHashMap<>();
        valid.put("text", "申请"); valid.put("number", "12.50"); valid.put("date", "2026-09-14");
        valid.put("option", "甲"); valid.put("note", "说明"); valid.put("employee", "9");
        valid.put("department", 9); valid.put("post", "9"); valid.put("position", 9L);
        Map<String, Object> checked = forms.validate(context, valid, true);
        equal(checked.get("employee"), "9"); equal(checked.get("employeeName"), "记录名称");
        equal(JSON.data(forms.validate(context, Map.of("number", "12.50"), false)),
                JSON.data(forms.validate(context, Map.of("number", 12.5), false)));
        equal(checked.get("deptId"), "10"); equal(checked.get("deptName"), "研发部");
        equal(checked.get("department"), "9"); equal(checked.get("post"), "9"); equal(checked.get("position"), "9");
        equal(valid.size(), 9);
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("employee", "-1"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("employee", "10"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("employee", "9", "deptId", "20"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("employee", "9", "deptName", "伪造部门"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("unknown", 1), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("fixed", "伪造默认值"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("number", "NaN"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("number", "1e9999"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("date", "2026-02-30"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("option", "丙"), false));
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("text", Map.of("nested", "value")), false));
        DraftLaunchContextVO hidden = context(fields, List.of(new FieldPermissionVO("__START__", "note", false, false, false)));
        rejected("FORM_INVALID_DATA", () -> forms.validate(hidden, Map.of("note", "隐藏内容"), false));
        DraftLaunchContextVO required = context("[{\"id\":\"note\",\"type\":\"TEXT\"}]", List.of(new FieldPermissionVO("__START__", "note", true, true, true)));
        rejected("FORM_INVALID_DATA", () -> forms.validate(required, Map.of(), true));
        DraftLaunchContextVO advanced = context("[{\"id\":\"table\",\"type\":\"SUBTABLE\"}]", List.of());
        rejected("FORM_UNSUPPORTED_FIELD_TYPE", () -> forms.validate(advanced, Map.of(), false));
        DraftLaunchContextVO simplePattern = context("[{\"id\":\"phone\",\"type\":\"TEXT\",\"regex\":\"^1[0-9]{10}$\"}]", List.of());
        equal(forms.validate(simplePattern, Map.of("phone", "13800000000"), true).get("phone"), "13800000000");
        rejected("FORM_INVALID_DATA", () -> forms.validate(simplePattern, Map.of("phone", "123"), false));
        DraftLaunchContextVO unsafePattern = context("[{\"id\":\"value\",\"type\":\"TEXT\",\"regex\":\"^(a+)+$\"}]", List.of());
        rejected("FORM_UNSUPPORTED_VALIDATION", () -> forms.validate(unsafePattern, Map.of("value", "a".repeat(10000) + "!"), false));
        DraftLaunchContextVO optionalPattern = context("[{\"id\":\"value\",\"type\":\"TEXT\",\"regex\":\"^a?a?$\"}]", List.of());
        rejected("FORM_UNSUPPORTED_VALIDATION", () -> forms.validate(optionalPattern, Map.of("value", "a"), false));
        DraftLaunchContextVO readonlyReference = context("[{\"id\":\"employee\",\"type\":\"EMPLOYEE\",\"readonly\":true,\"defaultValue\":9,\"displayFieldId\":\"name\"}]", List.of());
        equal(forms.validate(readonlyReference, Map.of("employee", "9"), false).get("name"), "记录名称");
        UserContext.setTenantId(100001L);
        rejected("FORM_INVALID_DATA", () -> forms.validate(context, Map.of("employee", "9"), false));
        UserContext.setTenantId(100000L);
        DraftLaunchContextVO noForm = new DraftLaunchContextVO("def", "key", "无表单", null, null, List.of(), List.of(), "a".repeat(64));
        equal(forms.validate(noForm, Map.of(), true).size(), 0);
        rejected("FORM_INVALID_DATA", () -> forms.validate(noForm, Map.of("variable", "value"), false));
    }

    private static DraftLaunchContextVO context(String fields, List<FieldPermissionVO> permissions) {
        JsonNode definition = JSON.tree(fields);
        definition.forEach(field -> ((com.fasterxml.jackson.databind.node.ObjectNode) field).put("label", field.path("id").asText()));
        return new DraftLaunchContextVO("def", "key", "测试定义", "form",
                Map.of("id", "form", "name", "表单", "fields", definition), permissions, List.of(), "a".repeat(64));
    }

    private static void rejected(String code, Runnable action) {
        try {
            action.run();
            throw new AssertionError("Expected rejection " + code);
        } catch (WorkflowException expected) {
            equal(expected.getCode(), code);
        }
    }

    private static void equal(Object actual, Object expected) {
        checks++;
        if (!java.util.Objects.equals(actual, expected)) throw new AssertionError("Expected " + expected + ", actual " + actual);
    }

    private static void yes(boolean condition) {
        checks++;
        if (!condition) throw new AssertionError("Condition failed");
    }
}

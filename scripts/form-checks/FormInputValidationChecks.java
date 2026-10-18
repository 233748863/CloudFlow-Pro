import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.exception.WorkflowExceptionHandler;
import com.cloudflow.workflow.domain.dto.ErrorResponse;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.http.ResponseEntity;
import com.cloudflow.workflow.mapper.WorkflowFormReferenceMapper;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormInputService;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.lang.reflect.Proxy;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

public final class FormInputValidationChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final WorkflowDraftJson DRAFT_JSON = new WorkflowDraftJson(JSON);
    private static int checks;
    private static int referenceQueries;
    private static final WorkflowFormReferenceMapper REFERENCES = (WorkflowFormReferenceMapper) Proxy.newProxyInstance(
            FormInputValidationChecks.class.getClassLoader(), new Class<?>[]{WorkflowFormReferenceMapper.class}, (proxy, method, arguments) -> {
                if ("findReference".equals(method.getName())) {
                    referenceQueries++;
                    if (!Long.valueOf(100000).equals(arguments[0])) return null;
                    String type = (String) arguments[1];
                    long referenceId = (Long) arguments[2];
                    long allowed = "USER_MULTI".equals(type) ? 19 : type.startsWith("DEPT") ? 10 : 9;
                    if (referenceId != allowed) return null;
                    return Map.of("id", allowed, "name", "可信记录", "deptId", 10L, "deptName", "研发部", "deptAncestors", "0,1");
                }
                if ("findDictionaryValues".equals(method.getName())) return Long.valueOf(100000).equals(arguments[0]) && "expense_kind".equals(arguments[1]) ? List.of("TRAVEL", "OFFICE", "1") : List.of();
                if ("findOwnedFormFile".equals(method.getName())) {
                    if (!Long.valueOf(100000).equals(arguments[0]) || !"form-owner".equals(arguments[1])) return null;
                    long fileId = (Long) arguments[2];
                    return fileId == 11 || fileId == 12 ? Map.of("size", 128L, "extension", fileId == 11 ? "pdf" : "png") : null;
                }
                throw new AssertionError("Unexpected mapper method " + method.getName());
            });
    private static final WorkflowFormInputService FORMS = new WorkflowFormInputService(REFERENCES, DRAFT_JSON, new JsonSchemaValidator());

    public static void main(String[] arguments) {
        UserContext.setTenantId(100000L);
        UserContext.setUserId(5L);
        UserContext.setUserName("form-owner");
        try {
            scalarInputs();
            clearedDefaults();
            referenceInputs();
            permissionInputs();
            tableInputs();
            approvalInputs();
            approvalTypeInputs();
            errorResponses();
            System.out.println("Batch C form input service checks passed: " + checks + "; draft/start/approval validation; original values retained; mapper authorization invoked; database writes=0");
        } finally { UserContext.clear(); }
    }

    private static void scalarInputs() {
        for (String type : List.of("TEXT", "TEXTAREA", "RICH_TEXT")) equal(validate(field(type, "value"), Map.of("value", "内容")).get("value"), "内容");
        for (String type : List.of("NUMBER", "AMOUNT")) {
            ObjectNode number = field(type, "number").put("precision", 2).put("min", "0");
            equal(String.valueOf(validate(number, Map.of("number", "10000000000000000.10")).get("number")), "10000000000000000.1");
            invalid(context(number), Map.of("number", "-1"), "number");
            invalid(context(number), Map.of("number", "1.001"), "number");
        }
        equal(String.valueOf(validate(field("NUMBER", "number"), Map.of("number", "1e2")).get("number")), "1E+2");
        equal(validate(field("DATETIME", "value"), Map.of("value", "2026-09-15T11:32:00")).get("value"), "2026-09-15T11:32:00");
        equal(validate(field("TIME", "value"), Map.of("value", "11:32")).get("value"), "11:32");
        equal(validate(field("DATE_RANGE", "value"), Map.of("value", List.of("2026-09-15", "2026-09-16"))).get("value"), List.of("2026-09-15", "2026-09-16"));
        for (String type : List.of("MULTI_SELECT", "CHECKBOX_GROUP")) {
            ObjectNode choice = field(type, "choices");
            choice.set("options", JSON.createArrayNode().add("A").add("B"));
            equal(validate(choice, Map.of("choices", List.of("A", "B"))).get("choices"), List.of("A", "B"));
            invalid(context(choice), Map.of("choices", List.of("A", "A")), "choices");
        }
        ObjectNode dictionary = field("DICT_SELECT", "kind").put("dictType", "expense_kind");
        equal(validate(dictionary, Map.of("kind", "TRAVEL")).get("kind"), "TRAVEL");
        invalid(context(dictionary), Map.of("kind", "DISABLED"), "kind");
        ObjectNode upload = field("UPLOAD_FILE", "files").put("maxCount", 1).put("accept", "application/pdf");
        equal(validate(upload, Map.of("files", List.of(11))).get("files"), List.of("11"));
        invalid(context(upload), Map.of("files", List.of("12")), "files");
        invalid(context(upload), Map.of("files", List.of("13")), "files");
        UserContext.setUserName("other-user");
        invalid(context(upload), Map.of("files", List.of("11")), "files");
        UserContext.setUserName("form-owner");
        equal(validate(field("UPLOAD_IMAGE", "files"), Map.of("files", List.of("12"))).get("files"), List.of("12"));
        invalid(context(field("UPLOAD_IMAGE", "files")), Map.of("files", List.of("11")), "files");
        ObjectNode layout = field("GROUP", "layout");
        layout.set("children", JSON.createArrayNode().add(field("TEXT", "text")));
        equal(validate(layout, Map.of("text", "嵌套内容")).get("text"), "嵌套内容");
        invalid(context(layout), Map.of("layout", Map.of("text", "伪造形状")), "layout");
        invalid(context(field("DESCRIPTION", "help")), Map.of("help", "伪造说明"), "help");
    }

    private static void clearedDefaults() {
        for (String type : List.of("TEXT", "NUMBER", "DATE", "SELECT", "TEXTAREA", "EMPLOYEE", "DEPT", "POST", "POSITION")) {
            String defaultValue = "NUMBER".equals(type) ? "12.5" : "DATE".equals(type) ? "2026-10-05" : "DEPT".equals(type) ? "10" : List.of("EMPLOYEE", "POST", "POSITION").contains(type) ? "9" : "A";
            ObjectNode field = field(type, "value").put("defaultValue", defaultValue);
            if ("SELECT".equals(type)) field.set("options", JSON.createArrayNode().add("A"));
            DraftLaunchContextVO context = context(field);
            require(FORMS.validate(context, Map.of(), false).get("value") != null, "missing original field receives its configured default");
            for (boolean complete : List.of(false, true)) {
                Map<String, Object> supplied = new LinkedHashMap<>();
                supplied.put("value", null);
                Map<String, Object> cleared = FORMS.validate(context, supplied, complete);
                require(cleared.containsKey("value"), "explicit null must remain present after validation");
                equal(cleared.get("value"), null);
                require(DRAFT_JSON.readData(DRAFT_JSON.data(cleared)).containsKey("value"), "saved null must not become a missing defaulted field");
                equal(FORMS.validate(context, Map.of("value", ""), complete).get("value"), "");
            }
        }
        ObjectNode table = field("SUB_TABLE", "items");
        table.set("columns", JSON.createArrayNode().add(field("TEXT", "value").put("defaultValue", "A")));
        Map<String, Object> row = new LinkedHashMap<>(); row.put("_rowId", "cleared-row"); row.put("value", null);
        Map<String, Object> values = FORMS.validate(context(table), Map.of("items", List.of(row)), false);
        require(((Map<?, ?>) ((List<?>) values.get("items")).get(0)).containsKey("value"), "nested clears retain their explicit null");
    }

    private static void referenceInputs() {
        ObjectNode users = field("USER_MULTI", "users").put("scopeDeptId", "1");
        equal(validate(users, Map.of("users", List.of("19"))).get("users"), List.of("19"));
        invalid(context(users), Map.of("users", List.of("9")), "users");
        invalid(context(users), Map.of("users", List.of("19", "19")), "users");
        invalid(context(users.deepCopy().put("scopeDeptId", "99")), Map.of("users", List.of("19")), "users");
        equal(validate(field("DEPT_MULTI", "departments").put("scopeDeptId", "10"), Map.of("departments", List.of(10))).get("departments"), List.of("10"));
        UserContext.setTenantId(100001L);
        invalid(context(users), Map.of("users", List.of("19")), "users");
        invalid(context(field("DICT_SELECT", "kind").put("dictType", "expense_kind")), Map.of("kind", "TRAVEL"), "kind");
        UserContext.setTenantId(100000L);
        ObjectNode employee = field("EMPLOYEE", "employee").put("displayFieldId", "employeeName");
        employee.set("fillMappings", JSON.createArrayNode().add(JSON.createObjectNode().put("targetFieldId", "departmentName").put("source", "deptName")));
        equal(validate(employee, Map.of("employee", "9")).get("departmentName"), "研发部");
        invalid(context(employee), Map.of("employee", "9", "employeeName", "伪造人员"), "employeeName");
        invalid(context(employee, List.of(permission("employeeName", false, false, false))), Map.of("employee", "9", "employeeName", "可信记录"), "employeeName");
        require(!FORMS.validate(context(employee, List.of(permission("employeeName", false, false, false))), Map.of("employee", "9"), true).containsKey("employeeName"), "hidden derived field is removed");
        ObjectNode group = field("GROUP", "group");
        group.set("children", JSON.createArrayNode().add(employee.put("filterByDeptFieldId", "department")).add(field("TEXT", "department")));
        equal(validate(group, Map.of("employee", "9", "department", "1")).get("employee"), "9");
        invalid(context(group), Map.of("employee", "9", "department", "99"), "employee");
        referenceQueries = 0;
        validate(employee, Map.of("employee", "9"));
        equal(referenceQueries, 1);
    }

    private static void permissionInputs() {
        ObjectNode text = field("TEXT", "text").put("required", true);
        DraftLaunchContextVO hidden = context(text, List.of(permission("text", false, false, true)));
        equal(FORMS.validate(hidden, Map.of(), true), Map.of());
        invalid(hidden, Map.of("text", "secret"), "text");
        equal(FORMS.validate(context(text, List.of(permission("text", true, true, false))), Map.of(), true), Map.of());
        invalid(context(field("TEXT", "text"), List.of(permission("text", true, true, true))), Map.of(), "text");
        ObjectNode fixed = field("TEXT", "fixed").put("defaultValue", "可信默认值");
        DraftLaunchContextVO readonly = context(fixed, List.of(permission("fixed", true, false, false)));
        equal(FORMS.validate(readonly, Map.of(), true).get("fixed"), "可信默认值");
        invalid(readonly, Map.of("fixed", "伪造内容"), "fixed");
        ObjectNode group = field("GROUP", "group");
        group.set("children", JSON.createArrayNode().add(text));
        equal(FORMS.validate(context(group, List.of(permission("group", false, false, false))), Map.of(), true), Map.of());
        invalid(context(group, List.of(permission("group", false, false, false))), Map.of("text", "隐藏父容器"), "text");
        ObjectNode amount = field("AMOUNT", "amount");
        ObjectNode note = field("TEXT", "note").put("required", true).put("visibleExpr", "${amount} > 100");
        ArrayNode fields = JSON.createArrayNode().add(amount).add(note);
        equal(FORMS.validate(context(fields, List.of()), Map.of("amount", "1e2"), true).get("amount"), "100");
        invalid(context(fields, List.of()), Map.of("amount", "50", "note", "隐藏值"), "note");
        invalid(context(fields, List.of()), Map.of("amount", "101"), "note");
        equal(FORMS.validate(context(fields, List.of()), Map.of("amount", "101", "note", "显示值"), true).get("note"), "显示值");
        note.remove("visibleExpr");
        note.put("disabledExpr", "${amount} <= 100").put("defaultValue", "默认说明");
        equal(FORMS.validate(context(fields, List.of()), Map.of("amount", "50"), true).get("note"), "默认说明");
        invalid(context(fields, List.of()), Map.of("amount", "50", "note", "禁用值篡改"), "note");
        equal(FORMS.validate(context(fields, List.of()), Map.of("amount", "101", "note", "合法编辑"), true).get("note"), "合法编辑");
        amount.put("readonly", true).put("defaultValue", "50");
        invalid(context(fields, List.of()), Map.of("amount", "101", "note", "伪造依赖字段"), "amount");
        ObjectNode larger = field("AMOUNT", "larger");
        ObjectNode smaller = field("AMOUNT", "smaller");
        ObjectNode explanation = field("TEXT", "explanation").put("required", true).put("visibleExpr", "${larger} > ${smaller}");
        DraftLaunchContextVO numericFields = context(JSON.createArrayNode().add(larger).add(smaller).add(explanation), List.of());
        invalid(numericFields, Map.of("larger", "10", "smaller", "2"), "explanation");
        equal(FORMS.validate(numericFields, Map.of("larger", "1e2", "smaller", "99", "explanation", "说明"), true).get("larger"), "100");
    }

    private static void tableInputs() {
        ObjectNode cost = field("AMOUNT", "cost").put("required", true).put("min", "0");
        ObjectNode privateValue = field("TEXT", "privateValue").put("required", true);
        ObjectNode upload = field("UPLOAD_FILE", "file");
        ObjectNode table = field("SUB_TABLE", "items").put("maxRows", 2).put("minRows", 1);
        table.set("columns", JSON.createArrayNode().add(cost).add(privateValue).add(upload));
        DraftLaunchContextVO context = context(table, List.of(permission("items.privateValue", false, false, true)));
        Map<String, Object> data = Map.of("items", List.of(Map.of("_rowId", "first", "cost", "0.10", "file", List.of("11"))));
        Map<String, Object> result = FORMS.validate(context, data, true);
        equal(DRAFT_JSON.canonical(result), "{\"items\":[{\"_rowId\":\"first\",\"cost\":\"0.1\",\"file\":[\"11\"]}]}");
        invalid(context, Map.of("items", List.of(Map.of("cost", "-1"))), "items[0].cost");
        invalid(context, Map.of("items", List.of(Map.of("cost", "1", "privateValue", "越权"))), "items[0].privateValue");
        invalid(context, Map.of("items", List.of(Map.of("cost", "1", "unknown", "注入"))), "items[0].unknown");
        invalid(context, Map.of("items", List.of(Map.of("cost", "1", "file", List.of("11", "12")))), "items[0].file");
        invalid(context, Map.of("items", List.of(Map.of("cost", "1", "_rowId", "same"), Map.of("cost", "2", "_rowId", "same"))), "items[1]._rowId");
        invalid(context, Map.of("items", List.of()), "items");
        invalid(context, Map.of("items", List.of(Map.of("cost", "1"), Map.of("cost", "2"), Map.of("cost", "3"))), "items");
        invalid(context, Map.of("items", List.of("not an object")), "items[0].");
        equal(FORMS.validate(context, Map.of(), false), Map.of());
        cost.put("readonly", true).put("defaultValue", "0.10");
        equal(((Map<?, ?>) ((List<?>) FORMS.validate(context(table, List.of(permission("items.privateValue", false, false, true))), Map.of("items", List.of(Map.of())), true).get("items")).get(0)).get("cost"), "0.1");
        invalid(context(table, List.of(permission("items.privateValue", false, false, true))), Map.of("items", List.of(Map.of("cost", "1"))), "items[0].cost");
    }

    private static void approvalInputs() {
        ObjectNode locked = field("TEXT", "locked").put("readonly", true).put("defaultValue", "definition default");
        DraftLaunchContextVO definition = context(JSON.createArrayNode().add(locked).add(field("TEXT", "editable")).add(field("TEXT", "hidden")), List.of(permission("hidden", false, false, false)));
        Map<String, Object> original = Map.of("locked", "instance original", "editable", "old", "hidden", "secret");
        equal(FORMS.validateApproval(definition, original, Map.of("editable", "new"), true), Map.of("locked", "instance original", "editable", "new", "hidden", "secret"));
        equal(FORMS.validateApproval(definition, original, Map.of("locked", "instance original"), true), original);
        Map<String, Object> clearing = new LinkedHashMap<>();
        clearing.put("editable", null);
        require(FORMS.validateApproval(definition, original, clearing, true).containsKey("editable"), "cleared optional fields retain a null update");
        equal(FORMS.validateApproval(definition, original, clearing, true).get("editable"), null);
        approvalInvalid(definition, original, Map.of("locked", "definition default"), true, "locked", true);
        approvalInvalid(definition, original, Map.of("hidden", "tampered"), true, "hidden", true);
        approvalInvalid(definition, original, Map.of("undeclared", "injected"), true, "undeclared", true);
        approvalInvalid(definition, original, Map.of("editable", "changed"), false, "editable", true);
        DraftLaunchContextVO granted = context(field("TEXT", "editable"), List.of(permission("editable", true, true, false)));
        equal(FORMS.validateApproval(granted, Map.of("editable", "before"), Map.of("editable", "after"), false).get("editable"), "after");
        DraftLaunchContextVO required = context(field("TEXT", "required"), List.of(permission("required", true, true, true)));
        approvalInvalid(required, Map.of(), Map.of(), true, "required", false);
        ObjectNode employee = field("EMPLOYEE", "person").put("displayFieldId", "personName");
        DraftLaunchContextVO reference = context(JSON.createArrayNode().add(employee).add(field("UPLOAD_FILE", "file")), List.of());
        Map<String, Object> archived = Map.of("person", "999", "personName", "历史员工姓名", "file", List.of("999"));
        int beforeQueries = referenceQueries;
        equal(FORMS.validateApproval(reference, archived, Map.of(), true), archived);
        equal(referenceQueries, beforeQueries);
        approvalInvalid(reference, archived, Map.of("person", "888"), true, "person", false);
        ObjectNode table = field("SUB_TABLE", "items");
        table.set("columns", JSON.createArrayNode().add(field("TEXT", "note")).add(field("TEXT", "secret")));
        DraftLaunchContextVO tableContext = context(table, List.of(permission("items.secret", false, false, false)));
        Map<String, Object> rows = Map.of("items", List.of(Map.of("_rowId", "first", "note", "A", "secret", "first secret"), Map.of("_rowId", "second", "note", "B", "secret", "second secret")));
        Map<String, Object> reordered = FORMS.validateApproval(tableContext, rows, Map.of("items", List.of(Map.of("_rowId", "second", "note", "changed B"), Map.of("_rowId", "first", "note", "changed A"))), true);
        List<?> resultRows = (List<?>) reordered.get("items");
        equal(((Map<?, ?>) resultRows.get(0)).get("secret"), "second secret");
        equal(((Map<?, ?>) resultRows.get(1)).get("secret"), "first secret");
        equal(((Map<?, ?>) ((List<?>) rows.get("items")).get(0)).get("note"), "A");
        approvalInvalid(tableContext, rows, Map.of("items", List.of(Map.of("_rowId", "first", "secret", "injected"))), true, "items[0].secret", true);
        table.put("allowSort", false);
        approvalInvalid(tableContext, rows, Map.of("items", List.of(Map.of("_rowId", "second"), Map.of("_rowId", "first"))), true, "items", true);
        table.put("allowDelete", false);
        approvalInvalid(tableContext, rows, Map.of("items", List.of(Map.of("_rowId", "first"))), true, "items", true);
        Map<String, Object> clearingRows = new LinkedHashMap<>(); clearingRows.put("items", null);
        approvalInvalid(tableContext, rows, clearingRows, true, "items", true);
        table.put("allowAdd", false);
        approvalInvalid(tableContext, rows, Map.of("items", List.of(Map.of("_rowId", "first"), Map.of("_rowId", "second"), Map.of("_rowId", "new"))), true, "items", true);
        List<?> created = (List<?>) FORMS.validate(context(field("SUB_TABLE", "newItems").set("columns", JSON.createArrayNode().add(field("TEXT", "note")))), Map.of("newItems", List.of(Map.of("note", "new"))), true).get("newItems");
        require(((Map<?, ?>) created.get(0)).get("_rowId") instanceof String, "server materializes missing row identity");
    }

    private static void approvalTypeInputs() {
        for (String type : List.of("TEXT", "TEXTAREA", "RICH_TEXT")) {
            DraftLaunchContextVO text = context(field(type, "value"));
            approvalInvalid(text, Map.of("value", "17"), Map.of("value", 17), true, "value", false);
            approvalInvalid(text, Map.of("value", "false"), Map.of("value", false), true, "value", false);
            equal(FORMS.validateApproval(text, Map.of("value", "17"), Map.of("value", "17"), true).get("value"), "17");
        }
        DraftLaunchContextVO toggle = context(field("SWITCH", "value"));
        approvalInvalid(toggle, Map.of("value", false), Map.of("value", "false"), true, "value", false);
        approvalInvalid(toggle, Map.of("value", true), Map.of("value", "true"), true, "value", false);
        equal(FORMS.validateApproval(toggle, Map.of("value", false), Map.of("value", false), true).get("value"), false);
        equal(FORMS.validateApproval(toggle, Map.of("value", false), Map.of("value", true), true).get("value"), true);
        approvalInvalid(context(field("SWITCH", "value").put("readonly", true)), Map.of("value", false), Map.of("value", "false"), true, "value", true);
        approvalInvalid(context(field("SWITCH", "value"), List.of(permission("value", false, false, false))), Map.of("value", false), Map.of("value", "false"), true, "value", true);
        for (String type : List.of("SELECT", "RADIO_GROUP")) {
            ObjectNode choice = field(type, "value"); choice.set("options", JSON.createArrayNode().add("1").add("2"));
            approvalInvalid(context(choice), Map.of("value", "1"), Map.of("value", 1), true, "value", false);
        }
        approvalInvalid(context(field("DICT_SELECT", "value").put("dictType", "expense_kind")), Map.of("value", "1"), Map.of("value", 1), true, "value", false);
        equal(FORMS.validateApproval(context(field("NUMBER", "value")), Map.of("value", 12.34), Map.of("value", "12.340"), true).get("value").toString(), "12.34");
        equal(FORMS.validateApproval(context(field("AMOUNT", "value")), Map.of("value", "12.34"), Map.of("value", 12.340), true).get("value"), "12.34");
        ObjectNode table = field("SUB_TABLE", "items"); table.set("columns", JSON.createArrayNode().add(field("TEXT", "note")));
        Map<String, Object> original = Map.of("items", List.of(Map.of("_rowId", "typed-row", "note", "17")));
        approvalInvalid(context(table), original, Map.of("items", List.of(Map.of("_rowId", "typed-row", "note", 17))), true, "items[0].note", false);
        equal(((Map<?, ?>) ((List<?>) original.get("items")).get(0)).get("note"), "17");
    }

    private static void approvalInvalid(DraftLaunchContextVO context, Map<String, Object> original, Map<String, Object> supplied,
                                         boolean editable, String path, boolean tampered) {
        try {
            FORMS.validateApproval(context, original, supplied, editable);
            throw new AssertionError("Expected approval rejection for " + path);
        } catch (WorkflowFormValidationException exception) {
            require(exception.getFieldErrors().stream().anyMatch(error -> path.equals(error.getField())), "approval error path " + path);
            equal(exception.getTamperedFields().contains(path), tampered);
            require(exception.getFieldErrors().stream().allMatch(error -> error.getRejectedValue() == null), "approval error does not echo values");
        }
    }

    private static void errorResponses() {
        ObjectNode table = field("SUB_TABLE", "items");
        table.set("columns", JSON.createArrayNode().add(field("TEXT", "name")));
        DraftLaunchContextVO context = context(JSON.createArrayNode()
                .add(field("TEXT", "note").put("required", true))
                .add(field("AMOUNT", "amount")).add(table).add(field("TEXT", "secret")),
                List.of(permission("secret", false, false, false)));
        String privateValue = "PRIVATE_RESPONSE_VALUE_20261005";
        Map<String, Object> input = Map.of("amount", privateValue, "items", List.of(Map.of("name", Map.of("private", privateValue))),
                "secret", privateValue, privateValue, privateValue);
        for (String route : List.of("/wf/draft", "/wf/start", "/wf/complete")) {
            try {
                FORMS.validate(context, input, true);
                throw new AssertionError("Expected invalid form response");
            } catch (WorkflowFormValidationException exception) {
                Map<String, Object> attributes = new LinkedHashMap<>();
                HttpServletRequest request = (HttpServletRequest) Proxy.newProxyInstance(FormInputValidationChecks.class.getClassLoader(),
                        new Class<?>[]{HttpServletRequest.class}, (proxy, method, arguments) -> switch (method.getName()) {
                            case "getRequestURI" -> route;
                            case "getMethod" -> "POST";
                            case "getContextPath" -> "";
                            case "getAttribute" -> attributes.get(arguments[0]);
                            case "setAttribute" -> attributes.put((String) arguments[0], arguments[1]);
                            case "removeAttribute" -> attributes.remove(arguments[0]);
                            default -> null;
                        });
                ResponseEntity<ErrorResponse> response = new WorkflowExceptionHandler().handleWorkflowException(exception, request);
                equal(response.getStatusCode().value(), 400);
                ErrorResponse body = response.getBody();
                equal(body.getCode(), "FORM_INVALID_DATA");
                require(body.getErrors() != null, "form error paths survive response handling");
                equal(body.getErrors().stream().map(ErrorResponse.FieldError::getField).toList(), List.of("note", "amount", "items[0].name"));
                require(body.getErrors().stream().allMatch(error -> error.getRejectedValue() == null), "response excludes rejected values");
                require(body.getErrors().stream().noneMatch(error -> error.getMessage().contains(privateValue)), "response excludes submitted secrets");
                equal(body.getData(), null);
                require(exception.getTamperedFields().containsAll(List.of("secret", privateValue)), "security audit retains tampered identities internally");
            }
        }
    }

    private static ObjectNode field(String type, String fieldId) {
        return JSON.createObjectNode().put("id", fieldId).put("type", type).put("label", fieldId).put("required", false);
    }

    private static FieldPermissionVO permission(String fieldId, boolean visible, boolean editable, boolean required) {
        return new FieldPermissionVO("__START__", fieldId, visible, editable, required);
    }

    private static DraftLaunchContextVO context(ObjectNode field) { return context(field, List.of()); }

    private static DraftLaunchContextVO context(ObjectNode field, List<FieldPermissionVO> permissions) {
        return context(JSON.createArrayNode().add(field), permissions);
    }

    private static DraftLaunchContextVO context(ArrayNode fields, List<FieldPermissionVO> permissions) {
        return new DraftLaunchContextVO("definition", "process", "测试流程", "form", Map.of("fields", fields), permissions, List.of(), "hash");
    }

    private static Map<String, Object> validate(ObjectNode field, Map<String, Object> values) {
        return FORMS.validate(context(field), values, true);
    }

    private static void invalid(DraftLaunchContextVO context, Map<String, Object> values, String fieldPath) {
        try {
            FORMS.validate(context, new LinkedHashMap<>(values), true);
            throw new AssertionError("Expected rejection for " + fieldPath);
        } catch (WorkflowFormValidationException exception) {
            require(exception.getFieldErrors().stream().anyMatch(error -> fieldPath.equals(error.getField())), "error path " + fieldPath);
            require(exception.getFieldErrors().stream().allMatch(error -> error.getRejectedValue() == null), "sensitive rejected values stay absent");
        }
    }

    private static void equal(Object actual, Object expected) { require(Objects.equals(actual, expected), "expected " + expected + ", actual " + actual); }

    private static void require(boolean condition, String message) {
        checks++;
        if (!condition) throw new AssertionError(message);
    }
}

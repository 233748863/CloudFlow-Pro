import com.cloudflow.common.core.utils.RestrictedExpression;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class FormPermissionChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final FormDataPermissionFilter FILTER = new FormDataPermissionFilter(JSON, new JsonSchemaValidator());
    private static int checks;

    public static void main(String[] arguments) {
        fieldFiltering();
        nestedFiltering();
        expressionFiltering();
        derivedFiltering();
        System.out.println("Batch C form permission projection checks passed: " + checks + "; hidden keys and definitions removed; raw engine data unchanged");
    }

    private static void fieldFiltering() {
        ArrayNode schema = fields(field("name", "TEXT"), field("salary", "AMOUNT"));
        Map<String, Object> raw = new LinkedHashMap<>(Map.of("name", "可见", "salary", "12000.10", "_internal", "private", "unknown", "private"));
        FormDataPermissionFilter.Projection projected = project(schema, raw, List.of(permission("salary", false, false)), Set.of("manager"));
        equal(projected.values(), Map.of("name", "可见"));
        equal(projected.fields().size(), 1);
        equal(projected.fields().get(0).path("id").asText(), "name");
        require(projected.fields().get(0).path("readonly").asBoolean(), "approval defaults to read-only");
        equal(raw.get("salary"), "12000.10");
        require(projected.permissions().stream().noneMatch(permission -> permission.fieldId().equals("salary")), "hidden permission identifiers are not emitted");
        FormDataPermissionFilter.Projection hr = project(schema, raw, List.of(permission("salary", false, false)), Set.of("hr"));
        equal(hr.values().get("salary"), "12000.10");
        equal(project(schema, raw, List.of(permission("salary", false, false)), Set.of("manager", "hr")).values(), Map.of("name", "可见"));
        FormDataPermissionFilter.Projection editable = project(schema, raw, List.of(permission("name", true, true)), Set.of("manager"));
        require(!editable.fields().get(0).path("readonly").asBoolean(), "explicit node grant permits editing");
        projected.values().put("name", "changed copy");
        equal(raw.get("name"), "可见");
    }

    private static void nestedFiltering() {
        ObjectNode group = field("privateGroup", "GROUP");
        group.set("children", fields(field("salary", "AMOUNT")));
        ObjectNode table = field("items", "SUB_TABLE");
        table.set("columns", fields(field("label", "TEXT"), field("cost", "AMOUNT")));
        table.set("summaryColumns", JSON.createArrayNode().add(JSON.createObjectNode().put("columnId", "cost").put("aggregation", "SUM")));
        table.set("defaultValue", JSON.valueToTree(List.of(Map.of("label", "default", "cost", "secret"))));
        Map<String, Object> row = new LinkedHashMap<>(Map.of("_rowId", "first", "label", "item", "cost", "55.15"));
        Map<String, Object> raw = Map.of("salary", "15000", "items", new ArrayList<>(List.of(row)));
        FormDataPermissionFilter.Projection projected = project(fields(group, table), raw, List.of(permission("privateGroup", false, false), permission("items.cost", false, false)), Set.of("manager"));
        require(!projected.values().containsKey("salary"), "hidden parent removes descendant values");
        require(projected.fields().toString().indexOf("salary") < 0, "hidden parent removes descendant definitions");
        equal(projected.fields().get(0).path("columns").size(), 1);
        equal(projected.fields().get(0).path("summaryColumns").size(), 0);
        require(!projected.fields().get(0).path("defaultValue").get(0).has("cost"), "hidden columns removed from schema default rows");
        List<?> safeRows = (List<?>) projected.values().get("items");
        equal(safeRows.get(0), Map.of("_rowId", "first", "label", "item"));
        equal(row.get("cost"), "55.15");
        ((Map<String, Object>) safeRows.get(0)).put("label", "mutated response");
        equal(row.get("label"), "item");
    }

    private static void expressionFiltering() {
        ObjectNode amount = field("amount", "AMOUNT");
        ObjectNode reason = field("reason", "TEXT").put("visibleExpr", "${amount} > 10000");
        ArrayNode fields = fields(amount, reason);
        equal(project(fields, Map.of("amount", "9000", "reason", "hidden"), List.of(), Set.of("manager")).values(), Map.of("amount", "9000"));
        equal(project(fields, Map.of("amount", "10000.01", "reason", "shown"), List.of(), Set.of("manager")).values().get("reason"), "shown");
        FormDataPermissionFilter.Projection sanitized = project(fields, Map.of("amount", "10000.01", "reason", "shown"), List.of(permission("amount", false, false)), Set.of("manager"));
        equal(sanitized.fields().get(0).path("visibleExpr").asText(), "true");
        require(!sanitized.fields().toString().contains("amount"), "hidden expression references do not leak in visible schema");
        reason.put("visibleExpr", "Math.random()");
        FormDataPermissionFilter.Projection invalid = project(fields, Map.of("reason", "hidden"), List.of(), Set.of("manager"));
        require(!invalid.values().containsKey("reason"), "invalid expressions deny value visibility");
        equal(invalid.fields().get(1).path("visibleExpr").asText(), "false");
        equal(RestrictedExpression.referencedFields("${amount} > 1 && '${reason}' != 'x'", Set.of("amount", "reason")), Set.of("amount"));
        ObjectNode table = field("items", "SUB_TABLE");
        table.set("columns", fields(field("cost", "AMOUNT"), field("note", "TEXT").put("visibleExpr", "${cost} > 1")));
        List<?> rows = (List<?>) project(fields(table), Map.of("items", List.of(Map.of("cost", "0.1", "note", "hidden"), Map.of("cost", "2", "note", "shown"))), List.of(), Set.of("manager")).values().get("items");
        require(!((Map<?, ?>) rows.get(0)).containsKey("note"), "subtable expressions hide individual row values");
        equal(((Map<?, ?>) rows.get(1)).get("note"), "shown");
    }

    private static void derivedFiltering() {
        ObjectNode employee = field("employee", "EMPLOYEE").put("displayFieldId", "employeeName");
        ObjectNode container = field("privateGroup", "GROUP");
        container.set("children", fields(field("employeeName", "TEXT")));
        FormDataPermissionFilter.Projection projected = project(fields(employee, container), Map.of("employee", "1", "employeeName", "private name"), List.of(permission("privateGroup", false, false)), Set.of("manager"));
        require(!projected.values().containsKey("employeeName"), "fill target does not bypass hidden ancestor");
        require(!projected.fields().toString().contains("employeeName"), "hidden fill target is removed from source metadata");
        FormDataPermissionFilter.Projection sourceHidden = project(fields(employee, field("employeeName", "TEXT")), Map.of("employee", "1", "employeeName", "private name"), List.of(permission("employee", false, false)), Set.of("manager"));
        require(!sourceHidden.values().containsKey("employeeName"), "hidden source also protects stored derived values");
        require(!sourceHidden.fields().toString().contains("employeeName"), "hidden source protects derived definitions");
        FormDataPermissionFilter.Projection automatic = project(fields(employee), Map.of("employee", "1", "employeeName", "allowed name"), List.of(), Set.of("manager"));
        equal(automatic.values().get("employeeName"), "allowed name");
    }

    private static FormDataPermissionFilter.Projection project(ArrayNode schema, Map<String, Object> data, List<FieldPermissionVO> permissions, Set<String> nodes) {
        return FILTER.filter(schema.toString(), data, permissions, nodes, false);
    }
    private static FieldPermissionVO permission(String fieldId, boolean visible, boolean editable) { return new FieldPermissionVO("manager", fieldId, visible, editable, null); }
    private static ObjectNode field(String fieldId, String type) { return JSON.createObjectNode().put("id", fieldId).put("type", type).put("label", fieldId).put("required", false); }
    private static ArrayNode fields(ObjectNode... fields) { ArrayNode result = JSON.createArrayNode(); for (ObjectNode field : fields) result.add(field); return result; }
    private static void equal(Object actual, Object expected) { require(Objects.equals(actual, expected), "expected=" + expected + "; actual=" + actual); }
    private static void require(boolean valid, String message) { checks++; if (!valid) throw new AssertionError(message); }
}

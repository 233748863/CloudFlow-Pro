import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormVersionDiff;
import com.cloudflow.workflow.service.WorkflowImSummaryPolicy;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;

public final class FormImSummaryChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final JsonSchemaValidator VALIDATOR = new JsonSchemaValidator();
    private static final FormDataPermissionFilter FILTER = new FormDataPermissionFilter(JSON, VALIDATOR);
    private static final WorkflowImSummaryPolicy POLICY = new WorkflowImSummaryPolicy();
    private static int checks;

    public static void main(String[] arguments) {
        consent();
        visibility();
        boundaries();
        schema();
        System.out.println("IM form summary checks passed: " + checks + "; real field projection and consent policy; external sends=0");
    }

    private static void consent() {
        ObjectNode note = field("note", "TEXT");
        ArrayNode fields = fields(note);
        Map<String, Object> values = Map.of("note", "visible-value", "unlisted", "private-value", "_internal", "private-value");
        equal(summary(fields, values, List.of(), fields), List.of());
        note.put("imSummaryAllowed", false);
        equal(summary(fields, values, List.of(), fields), List.of());
        note.put("imSummaryAllowed", "true");
        equal(summary(fields, values, List.of(), fields), List.of());
        note.put("imSummaryAllowed", true);
        equal(summary(fields, values, List.of(), fields), List.of(new WorkflowImSummaryPolicy.Field("note", "visible-value")));
        equal(summary(fields, values, List.of(), fields(field("note", "TEXT"))), List.of());
        equal(summary(fields, values, List.of(), JSON.createArrayNode()), List.of());
        equal(summary(fields, values, List.of(), fields(field("note", "AMOUNT").put("imSummaryAllowed", true))), List.of());
        equal(summary(fields(field("note", "TEXT")), values, List.of(), fields), List.of());
        equal(values.size(), 3);
        require(!summary(fields, values, List.of(), fields).toString().contains("visible-value"), "diagnostics hide field contents");
        WorkflowFormVersionDiff versions = new WorkflowFormVersionDiff(new WorkflowDraftJson(JSON), VALIDATOR);
        String before = fields(field("note", "TEXT")).toString();
        require(!versions.checksum(before).equals(versions.checksum(fields.toString())), "consent change produces a version");
        equal(versions.compare(before, fields.toString(), 1, 2).modified().get(0).properties().get("imSummaryAllowed").after().booleanValue(), true);
    }

    private static void visibility() {
        ObjectNode salary = field("salary", "AMOUNT").put("imSummaryAllowed", true);
        ObjectNode note = field("note", "TEXT").put("imSummaryAllowed", true);
        ArrayNode fields = fields(salary, note);
        Map<String, Object> values = Map.of("salary", "12000.10", "note", "shown");
        equal(summary(fields, values, List.of(hidden("salary")), fields), List.of(new WorkflowImSummaryPolicy.Field("note", "shown")));
        equal(FILTER.filter(fields.toString(), values, List.of(hidden("salary")), Set.of("other"), false).values().size(), 2);
        FormDataPermissionFilter.Projection other = FILTER.filter(fields.toString(), values, List.of(hidden("salary")), Set.of("other"), false);
        equal(POLICY.extract(other, fields).size(), 2);
        ObjectNode group = field("section", "GROUP");
        group.set("children", fields(salary, note));
        equal(summary(fields(group), values, List.of(hidden("section")), fields(group)), List.of());
        group.put("visibleExpr", "false");
        equal(summary(fields(group), values, List.of(), fields(group)), List.of());
        group.remove("visibleExpr");
        note.put("visibleExpr", "${salary} > 15000");
        equal(summary(fields(group), values, List.of(), fields(group)), List.of(new WorkflowImSummaryPolicy.Field("salary", "12000.10")));
        note.remove("visibleExpr");
        ObjectNode employee = field("employee", "EMPLOYEE").put("displayFieldId", "note");
        equal(summary(fields(employee, note), Map.of("employee", 5, "note", "derived-name"), List.of(hidden("employee")), fields(employee, note)), List.of());
        equal(values.get("salary"), "12000.10");
    }

    private static void boundaries() {
        ArrayNode many = JSON.createArrayNode();
        Map<String, Object> values = new LinkedHashMap<>();
        for (int index = 0; index < 8; index++) {
            many.add(field("field" + index, "TEXT").put("imSummaryAllowed", true));
            values.put("field" + index, "value" + index);
        }
        List<WorkflowImSummaryPolicy.Field> result = summary(many, values, List.of(), many);
        equal(result.size(), 5);
        equal(result.get(4).value(), "value4");
        for (Object malformed : List.of(Map.of("name", "private"), List.of("private"), 17, true)) {
            equal(summary(fields(field("text", "TEXT").put("imSummaryAllowed", true)), Map.of("text", malformed), List.of(), fields(field("text", "TEXT").put("imSummaryAllowed", true))), List.of());
        }
        ObjectNode text = field("text", "TEXT").put("label", "😀".repeat(20)).put("imSummaryAllowed", true);
        String value = summary(fields(text), Map.of("text", "😀".repeat(140)), List.of(), fields(text)).get(0).value();
        equal(value.codePointCount(0, value.length()), 128);
        equal(value.codePointAt(value.length() - 3), 0x1F600);
        String label = summary(fields(text), Map.of("text", "value"), List.of(), fields(text)).get(0).label();
        equal(label.codePointCount(0, label.length()), 16);
        equal(summary(fields(text), Map.of("text", "  \n\t  "), List.of(), fields(text)), List.of());
        ObjectNode amount = field("amount", "AMOUNT").put("imSummaryAllowed", true);
        equal(summary(fields(amount), Map.of("amount", "42.10"), List.of(), fields(amount)).get(0).value(), "42.10");
        for (Object malformed : List.of("NaN", "1e1000000", Double.NaN, Map.of("amount", "private"))) {
            equal(summary(fields(amount), Map.of("amount", malformed), List.of(), fields(amount)), List.of());
        }
        ObjectNode toggle = field("toggle", "SWITCH").put("imSummaryAllowed", true);
        equal(summary(fields(toggle), Map.of("toggle", false), List.of(), fields(toggle)).get(0).value(), "否");
        equal(summary(fields(toggle), Map.of("toggle", "true"), List.of(), fields(toggle)), List.of());
        for (String type : List.of("RICH_TEXT", "UPLOAD_FILE", "EMPLOYEE", "SUB_TABLE")) {
            ObjectNode unsafe = field("unsafe", type).put("imSummaryAllowed", true);
            if ("SUB_TABLE".equals(type)) unsafe.set("columns", fields(field("text", "TEXT").put("imSummaryAllowed", true)));
            equal(summary(fields(unsafe), Map.of("unsafe", "private"), List.of(), fields(unsafe)), List.of());
        }
    }

    private static void schema() {
        for (String type : JsonSchemaValidator.IM_SUMMARY_TYPES) {
            ObjectNode allowed = field("allowed", type).put("imSummaryAllowed", true);
            if (Set.of("SELECT", "RADIO_GROUP").contains(type)) allowed.set("options", JSON.createArrayNode().add("one"));
            VALIDATOR.validateFormSchema(fields(allowed).toString());
            checks++;
        }
        for (String malformed : List.of("\"true\"", "1", "null", "[]", "{}")) {
            rejected("[{\"id\":\"text\",\"label\":\"Text\",\"type\":\"TEXT\",\"imSummaryAllowed\":" + malformed + "}]");
        }
        for (String type : List.of("RICH_TEXT", "UPLOAD_FILE", "UPLOAD_IMAGE", "EMPLOYEE", "DEPT", "DICT_SELECT", "DESCRIPTION", "DIVIDER", "GROUP")) {
            rejected(fields(field("unsafe", type).put("imSummaryAllowed", true)).toString());
        }
        ObjectNode table = field("table", "SUB_TABLE");
        table.set("columns", fields(field("column", "TEXT").put("imSummaryAllowed", true)));
        rejected(fields(table).toString());
    }

    private static List<WorkflowImSummaryPolicy.Field> summary(ArrayNode fields, Map<String, Object> values, List<FieldPermissionVO> permissions, ArrayNode current) {
        return POLICY.extract(FILTER.filter(fields.toString(), values, permissions, Set.of("manager"), false), current);
    }

    private static ObjectNode field(String identifier, String type) { return JSON.createObjectNode().put("id", identifier).put("type", type).put("label", identifier); }
    private static ArrayNode fields(ObjectNode... fields) { ArrayNode result = JSON.createArrayNode(); for (ObjectNode field : fields) result.add(field); return result; }
    private static FieldPermissionVO hidden(String identifier) { return new FieldPermissionVO("manager", identifier, false, false, false); }
    private static void rejected(String schema) { try { VALIDATOR.validateFormSchema(schema); throw new AssertionError("Unsafe summary schema accepted"); } catch (WorkflowException expected) { checks++; } }
    private static void equal(Object actual, Object expected) { require(Objects.equals(actual, expected), "Summary behavior mismatch"); }
    private static void require(boolean condition, String message) { checks++; if (!condition) throw new AssertionError(message); }
}

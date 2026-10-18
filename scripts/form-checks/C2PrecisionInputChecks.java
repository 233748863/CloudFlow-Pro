import com.cloudflow.common.core.context.UserContext;
import com.cloudflow.workflow.domain.vo.DraftLaunchContextVO;
import com.cloudflow.workflow.service.WorkflowDraftJson;
import com.cloudflow.workflow.service.WorkflowFormInputService;
import com.cloudflow.workflow.service.WorkflowFormVersionDiff;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.util.List;
import java.util.Map;

public final class C2PrecisionInputChecks {
    public static void main(String[] arguments) {
        ObjectMapper mapper = new ObjectMapper();
        WorkflowDraftJson json = new WorkflowDraftJson(mapper);
        WorkflowFormInputService service = new WorkflowFormInputService(null, json, new JsonSchemaValidator());
        ObjectNode table = mapper.createObjectNode().put("id", "items").put("type", "SUB_TABLE").put("label", "精确金额明细").put("minRows", 3).put("maxRows", 500);
        ArrayNode columns = table.putArray("columns");
        columns.addObject().put("id", "text").put("type", "TEXT").put("label", "明细说明").put("required", true).put("width", 200);
        for (String field : List.of("gross", "net", "average", "counted")) {
            columns.addObject().put("id", field).put("type", "counted".equals(field) ? "NUMBER" : "AMOUNT").put("label", field).put("precision", 2).put("width", 300);
        }
        ArrayNode summaries = table.putArray("summaryColumns");
        for (String field : List.of("gross", "net", "average", "counted")) {
            summaries.addObject().put("columnId", field).put("aggregation", "average".equals(field) ? "AVG" : "counted".equals(field) ? "COUNT" : "SUM");
        }
        DraftLaunchContextVO context = new DraftLaunchContextVO("definition", "process", "精度核对", "form", Map.of("fields", mapper.createArrayNode().add(table)), List.of(), List.of(), "hash");
        String whole = "1" + "0".repeat(89);
        Map<String, Object> input = Map.of("items", List.of(
                Map.of("_rowId", "row-0", "text", "明细甲", "gross", whole + ".01", "net", whole + ".01", "average", whole, "counted", 1),
                Map.of("_rowId", "row-1", "text", "明细乙", "gross", "0.02", "net", "-" + whole, "average", whole + ".01", "counted", 0),
                Map.of("_rowId", "row-2", "text", "明细丙", "net", "0.02")));
        UserContext.setTenantId(100000L);
        UserContext.setUserId(5L);
        UserContext.setUserName("precision-check");
        try {
            int checks = 0;
            for (boolean complete : List.of(false, true)) {
                Map<String, Object> result = service.validate(context, input, complete);
                if (!json.canonical(result).equals(json.canonical(input))) throw new AssertionError("Exact input values changed");
                checks++;
            }
            WorkflowFormVersionDiff differences = new WorkflowFormVersionDiff(json, new JsonSchemaValidator());
            String savedSchema = differences.normalized(json.canonical(mapper.createArrayNode().add(table)));
            new JsonSchemaValidator().validateFormSchema(savedSchema);
            DraftLaunchContextVO restored = new DraftLaunchContextVO("definition", "process", "精度核对", "form", Map.of("fields", json.tree(savedSchema)), List.of(), List.of(), "hash");
            for (boolean complete : List.of(false, true)) {
                Map<String, Object> result = service.validate(restored, input, complete);
                if (!json.canonical(result).equals(json.canonical(input))) throw new AssertionError("Saved schema changed exact input values");
                checks++;
            }
            for (int maximum : List.of(10, 100, 500)) {
                ObjectNode bounded = table.deepCopy().put("minRows", 10).put("maxRows", maximum);
                new JsonSchemaValidator().validateFormSchema(differences.normalized(json.canonical(mapper.createArrayNode().add(bounded))));
                checks++;
            }
            ObjectNode number = mapper.createObjectNode().put("id", "number").put("type", "NUMBER").put("label", "数字").put("precision", 10).put("min", 100);
            String integerSchema = json.canonical(mapper.createArrayNode().add(number));
            new JsonSchemaValidator().validateFormSchema(differences.normalized(integerSchema));
            checks++;
            number.put("min", 100.0);
            if (!differences.checksum(integerSchema).equals(differences.checksum(json.canonical(mapper.createArrayNode().add(number))))) throw new AssertionError("Equivalent numeric representations changed checksum");
            checks++;
            if (!savedSchema.equals(differences.normalized(savedSchema))) throw new AssertionError("Saved schema normalization is not stable");
            checks++;
            System.out.println("C2_PRECISION_INPUT: cases=" + checks + "; full_digits=true; saved_integer_schema=true; draft_and_start=true; database_writes=0");
        } finally { UserContext.clear(); }
    }
}

import com.cloudflow.workflow.exception.WorkflowFormValidationException;
import com.cloudflow.workflow.exception.WorkflowException;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class FormSchemaValidationChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final JsonSchemaValidator VALIDATOR = new JsonSchemaValidator();
    private static int checks;
    private static final JsonSchemaValidator.ValueLookup LOOKUP = new JsonSchemaValidator.ValueLookup() {
        public Set<String> dictionaryValues(String dictType) { return "expense_kind".equals(dictType) ? Set.of("A", "B") : Set.of(); }
        public boolean referenceAllowed(String type, long referenceId, JsonNode field) { return referenceId == 7 && field.path("scopeDeptId").asText("1").equals("1"); }
        public JsonSchemaValidator.FileValue file(long fileId) {
            return switch ((int) fileId) {
                case 11 -> new JsonSchemaValidator.FileValue(100, "pdf");
                case 12 -> new JsonSchemaValidator.FileValue(100, "png");
                case 13 -> new JsonSchemaValidator.FileValue(2_097_152, "pdf");
                case 14 -> new JsonSchemaValidator.FileValue(100, "exe");
                default -> null;
            };
        }
    };

    public static void main(String[] arguments) throws Exception {
        require(JsonSchemaValidator.FIELD_TYPES.size() == 30, "all explicit field types exist");
        require(JsonSchemaValidator.COLUMN_TYPES.size() == 10, "column allowlist matches PRD");
        for (String type : JsonSchemaValidator.FIELD_TYPES) {
            ObjectNode field = validField(type, "field" + type);
            VALIDATOR.validateFormSchema(schema(field));
            checks++;
        }
        for (String fieldId : List.of("__proto__", "constructor", "prototype", "_rowId", "bad.id", "1bad", "field".repeat(26))) {
            invalidSchema(schema(validField("TEXT", fieldId)), "invalid field identifier");
        }
        invalidSchema("{}", "root must be array");
        invalidSchema("[", "invalid JSON is refused");
        invalidSchema(schema(validField("unknown", "unknown")), "unsupported type");
        invalidSchema(schema(validField("TEXT", "same"), validField("NUMBER", "same")), "duplicate global identifiers");
        ObjectNode longTable = validField("SUB_TABLE", "a".repeat(50));
        longTable.set("columns", JSON.createArrayNode().add(validField("TEXT", "b".repeat(50))));
        invalidSchema(schema(longTable), "qualified column ID must fit permission storage");
        longTable.set("columns", JSON.createArrayNode().add(validField("TEXT", "b".repeat(49))));
        VALIDATOR.validateFormSchema(schema(longTable));
        invalidSchema(schema(validField("TEXT", "text").put("required", "true")), "boolean options are typed");
        invalidSchema(schema(validField("NUMBER", "number").put("precision", 19)), "precision cap");
        invalidSchema(schema(validField("NUMBER", "number").put("min", 10).put("max", 1)), "minimum cannot exceed maximum");
        invalidSchema(schema(validField("NUMBER", "number").put("min", "invalid")), "numeric options are typed");
        invalidSchema(schema(validField("DICT_SELECT", "dict").put("dictType", "")), "dictionary type required");
        invalidSchema(schema(validField("TEXT", "text").put("visibleExpr", "${absent} == 1")), "unknown expression variable");
        invalidSchema(schema(validField("TEXT", "text").put("visibleExpr", "eval('true')")), "expression execution denied");
        for (String property : List.of("visibleExpr", "disabledExpr")) {
            ObjectNode invalidExpression = validField("TEXT", "text");
            invalidExpression.set(property, JSON.createObjectNode());
            invalidSchema(schema(invalidExpression), "object cannot bypass expression validation");
            invalidExpression.set(property, JSON.createArrayNode());
            invalidSchema(schema(invalidExpression), "array cannot bypass expression validation");
            invalidSchema(schema(validField("TEXT", "text").put(property, true)), "boolean cannot bypass expression validation");
        }
        invalidSchema(schema(validField("TEXT", "text").put("regex", "^(a+)+$")), "catastrophic regular expression rejected");
        invalidSchema(schema(validField("TEXT", "text").put("regex", "^[a-z]+[a-z]+$")), "overlapping repetitions rejected");
        ObjectNode inner = validField("GROUP", "inner");
        ObjectNode middle = validField("GROUP", "middle");
        middle.set("children", JSON.createArrayNode().add(inner));
        ObjectNode outer = validField("GROUP", "outer");
        outer.set("children", JSON.createArrayNode().add(middle));
        VALIDATOR.validateFormSchema(schema(outer));
        checks++;
        ObjectNode fourth = validField("GROUP", "fourth");
        fourth.set("children", JSON.createArrayNode().add(outer));
        invalidSchema(schema(fourth), "four layout levels are refused");

        ObjectNode text = validField("TEXT", "reason").put("required", true);
        valid(text, "description");
        invalid(text, 42, "reason");
        invalid(text, List.of(), "reason");
        invalid(validField("TEXT", "optionalText"), List.of(), "optionalText");
        invalid(text, "", "reason");
        require(VALIDATOR.validateFormData(schema(text), Map.of(), false, LOOKUP).valid(), "incomplete draft may omit required values");
        require(!VALIDATOR.validateFormData(schema(text), Map.of("reason", "yes", "extra", "injected"), true, LOOKUP).valid(), "unknown fields rejected");
        ObjectNode amount = validField("AMOUNT", "amount").put("min", "0.01").put("max", "9999999999999999.99").put("precision", 2);
        for (Object value : List.of("0.01", "12.30", "9999999999999999.99", 1)) valid(amount, value);
        for (Object value : List.of("0", "10000000000000000", "0.001", "NaN", Double.POSITIVE_INFINITY, Map.of("value", 1), true)) invalid(amount, value, "amount");
        valid(validField("NUMBER", "number"), "1e2");
        invalid(validField("NUMBER", "number"), "1e999999999", "number");
        valid(validField("SWITCH", "enabled"), false);
        invalid(validField("SWITCH", "enabled"), "false", "enabled");
        invalid(validField("SWITCH", "enabled"), "", "enabled");
        valid(validField("DATE", "date"), "2024-02-29");
        for (String value : List.of("2025-02-29", "2026-02-30", "2026-2-1", "today")) invalid(validField("DATE", "date"), value, "date");
        valid(validField("DATETIME", "dateTime"), "2026-09-15T10:30");
        invalid(validField("DATETIME", "dateTime"), "2026-09-15T25:30", "dateTime");
        valid(validField("TIME", "time"), "10:30:00");
        invalid(validField("TIME", "time"), "24:01", "time");
        valid(validField("DATE_RANGE", "range"), List.of("2026-09-15", "2026-09-16"));
        invalid(validField("DATE_RANGE", "range"), List.of("2026-09-16", "2026-09-15"), "range");
        invalid(validField("DATE_RANGE", "range"), List.of("2026-09-15"), "range");
        invalid(validField("DATE_RANGE", "range"), "", "range");
        for (String type : List.of("SELECT", "RADIO_GROUP", "DICT_SELECT")) {
            valid(validField(type, "choice"), "A");
            invalid(validField(type, "choice"), "injected", "choice");
            invalid(validField(type, "choice"), 1, "choice");
        }
        for (String type : List.of("MULTI_SELECT", "CHECKBOX_GROUP")) {
            valid(validField(type, "choices"), List.of("A", "B"));
            invalid(validField(type, "choices"), List.of("A", "A"), "choices");
            invalid(validField(type, "choices"), List.of("other"), "choices");
            invalid(validField(type, "choices"), "A", "choices");
        }
        for (String type : JsonSchemaValidator.REFERENCE_TYPES) {
            boolean multiple = type.endsWith("MULTI");
            valid(validField(type, "reference"), multiple ? List.of("7") : "7");
            invalid(validField(type, "reference"), multiple ? List.of("8") : "8", "reference");
            invalid(validField(type, "reference"), multiple ? List.of("7.5") : "7.5", "reference");
        }
        require(!VALIDATOR.validateFormData(schema(validField("EMPLOYEE", "employee")), Map.of("employee", "7")).valid(), "missing reference authorization denies access");
        ObjectNode upload = validField("UPLOAD_FILE", "files").put("maxCount", 1).put("maxSize", 1).put("accept", "application/pdf");
        valid(upload, List.of("11"));
        for (Object value : List.of(List.of("11", "11"), List.of("12"), List.of("13"), List.of("14"), List.of("99"), List.of("https://example.invalid/file"), "11")) invalid(upload, value, "files");
        valid(validField("UPLOAD_IMAGE", "images"), List.of("12"));
        invalid(validField("UPLOAD_IMAGE", "images"), List.of("11"), "images");
        valid(validField("TEXT", "code").put("regex", "^[A-Z]{2,5}$"), "CODE");
        invalid(validField("TEXT", "code").put("regex", "^[A-Z]{2,5}$"), "unsafe", "code");

        ObjectNode column = validField("AMOUNT", "cost").put("required", true).put("min", 0);
        ObjectNode table = validField("SUB_TABLE", "items").put("minRows", 1).put("maxRows", 2);
        table.set("columns", JSON.createArrayNode().add(column));
        valid(table, List.of(Map.of("_rowId", "first", "cost", "0.10")));
        invalid(table, List.of(), "items");
        invalid(table, List.of(Map.of()), "items[0].cost");
        invalid(table, List.of(Map.of("cost", "-1")), "items[0].cost");
        invalid(table, List.of(Map.of("cost", "1", "injected", "secret")), "items[0].injected");
        invalid(table, List.of(Map.of("cost", "1", "_rowId", "same"), Map.of("cost", "2", "_rowId", "same")), "items[1]._rowId");
        invalid(table, List.of(Map.of("cost", "1"), Map.of("cost", "2"), Map.of("cost", "3")), "items");
        for (int maximum : List.of(0, -1, 501)) invalidSchema(schema(table.deepCopy().put("maxRows", maximum)), "invalid row cap");
        ObjectNode badColumn = table.deepCopy();
        badColumn.set("columns", JSON.createArrayNode().add(validField("TEXTAREA", "notes")));
        invalidSchema(schema(badColumn), "unsupported subtable column");
        ObjectNode attachmentTable = validField("SUB_TABLE", "attachments");
        attachmentTable.set("columns", JSON.createArrayNode().add(validField("UPLOAD_FILE", "file")));
        valid(attachmentTable, List.of(Map.of("file", List.of("11"))));
        invalid(attachmentTable, List.of(Map.of("file", List.of("11", "12"))), "attachments[0].file");
        ObjectNode badSummary = table.deepCopy();
        badSummary.set("summaryColumns", JSON.createArrayNode().add(JSON.createObjectNode().put("columnId", "missing").put("aggregation", "SUM")));
        invalidSchema(schema(badSummary), "invalid summary column");
        ObjectNode layout = validField("GROUP", "group");
        layout.set("children", JSON.createArrayNode().add(text).add(table));
        JsonSchemaValidator.FormValidationResult result = VALIDATOR.validateFormData(schema(layout), Map.of("reason", "", "items", List.of(Map.of("cost", "secret"))), true, LOOKUP);
        require(result.errors().containsKey("reason") && result.errors().containsKey("items[0].cost"), "recursive errors retain field paths");
        require(!result.errors().toString().contains("secret"), "rejected values are not exposed");
        try { result.throwIfInvalid(); throw new AssertionError("validation exception expected"); }
        catch (WorkflowFormValidationException exception) {
            require(exception.getFieldErrors().size() == 2, "structured field errors reach API exception");
            require(exception.getFieldErrors().stream().allMatch(error -> error.getRejectedValue() == null), "API error never carries rejected secrets");
        }
        System.out.println("Batch C form schema checks passed: " + checks + "; field types=30; recursive values and authorized references verified");
    }

    private static ObjectNode validField(String type, String fieldId) {
        ObjectNode field = JSON.createObjectNode().put("id", fieldId).put("type", type).put("label", fieldId).put("required", false);
        if (Set.of("SELECT", "MULTI_SELECT", "RADIO_GROUP", "CHECKBOX_GROUP").contains(type)) field.set("options", JSON.createArrayNode().add("A").add("B"));
        if ("DICT_SELECT".equals(type)) field.put("dictType", "expense_kind");
        if (JsonSchemaValidator.LAYOUT_TYPES.contains(type)) field.set("children", JSON.createArrayNode().add(validField("TEXT", "child" + fieldId)));
        if ("GRID".equals(type)) field.put("columns", 2);
        if ("SUB_TABLE".equals(type)) field.set("columns", JSON.createArrayNode().add(validField("TEXT", "column")));
        return field;
    }

    private static String schema(ObjectNode... fields) throws Exception {
        return JSON.writeValueAsString(fields);
    }

    private static void valid(ObjectNode field, Object value) throws Exception {
        JsonSchemaValidator.FormValidationResult result = VALIDATOR.validateFormData(schema(field), Map.of(field.path("id").asText(), value), true, LOOKUP);
        require(result.valid(), "valid value for " + field.path("type").asText() + ": " + result.errors());
    }

    private static void invalid(ObjectNode field, Object value, String errorPath) throws Exception {
        JsonSchemaValidator.FormValidationResult result = VALIDATOR.validateFormData(schema(field), Map.of(field.path("id").asText(), value), true, LOOKUP);
        require(result.errors().containsKey(errorPath), "invalid value path: " + errorPath + ": " + result.errors());
    }

    private static void invalidSchema(String schema, String message) {
        boolean rejected = false;
        try { VALIDATOR.validateFormSchema(schema); }
        catch (WorkflowException exception) { rejected = true; }
        require(rejected, message);
    }

    private static void require(boolean result, String message) {
        checks++;
        if (!result) throw new AssertionError(message);
    }
}

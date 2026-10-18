import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import com.cloudflow.common.core.utils.RestrictedExpression;
import com.cloudflow.workflow.domain.vo.FieldPermissionVO;
import com.cloudflow.workflow.service.FormDataPermissionFilter;
import com.cloudflow.workflow.validator.JsonSchemaValidator;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.slf4j.LoggerFactory;

public final class C3ExpressionParityChecks {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static int filterChecks;
    public static void main(String[] arguments) throws Exception {
        Path directory = Path.of(arguments[0]);
        JsonNode corpus = JSON.readTree(directory.resolve("corpus.json").toFile());
        List<Map<String, Object>> results = new ArrayList<>();
        for (JsonNode entry : corpus) {
            String name = entry.path("name").asText(), expression = entry.path("expression").asText();
            Set<String> declared = new HashSet<>(JSON.convertValue(entry.path("fields"), new TypeReference<List<String>>() { }));
            Map<String, Object> values = JSON.convertValue(entry.path("values"), new TypeReference<Map<String, Object>>() { });
            boolean syntax = true;
            try { RestrictedExpression.validatePredicate(expression, declared); } catch (IllegalArgumentException invalid) { syntax = false; }
            RestrictedExpression.BooleanResult result = RestrictedExpression.evaluatePredicate(expression, values, declared);
            if (syntax != entry.path("expected").path("syntax").asBoolean() || result.valid() != entry.path("expected").path("valid").asBoolean() || result.value() != entry.path("expected").path("value").asBoolean()) throw new AssertionError(name);
            results.add(Map.of("name", name, "syntax", syntax, "valid", result.valid(), "value", result.value()));
        }
        filterBoundaries();
        Files.writeString(directory.resolve("backend.json"), JSON.writeValueAsString(Map.of("results", results, "filterChecks", filterChecks, "filterChecksPassed", true)));
        System.out.println("C3_EXPRESSION_BACKEND: cases=" + results.size() + "; filter_checks=" + filterChecks + "; passed=true");
    }

    private static void filterBoundaries() {
        JsonSchemaValidator validator = new JsonSchemaValidator();
        FormDataPermissionFilter filter = new FormDataPermissionFilter(JSON, validator);
        ArrayNode fields = JSON.createArrayNode();
        fields.addObject().put("id", "amount").put("type", "AMOUNT").put("label", "金额");
        fields.addObject().put("id", "type").put("type", "TEXT").put("label", "类型");
        fields.addObject().put("id", "secret").put("type", "TEXT").put("label", "受限内容").put("visibleExpr", "${amount} > 10000 && ${type} == 'SPECIAL'");
        fields.addObject().put("id", "fixed").put("type", "TEXT").put("label", "只读内容").put("disabledExpr", "false");
        String privateValue = "C3_EXPRESSION_PRIVATE_VALUE";
        Map<String, Object> values = Map.of("amount", "10000.01", "type", "SPECIAL", "secret", privateValue, "fixed", privateValue);
        List<FieldPermissionVO> rules = List.of(new FieldPermissionVO("approval", "secret", false, false, null), new FieldPermissionVO("approval", "fixed", true, false, null));
        FormDataPermissionFilter.Projection denied = filter.filter(fields.toString(), values, rules, Set.of("approval"), true);
        require(!denied.values().containsKey("secret") && !denied.fields().toString().contains("受限内容"), "Node-hidden field overrides true expression");
        require(denied.permissions().stream().anyMatch(permission -> permission.fieldId().equals("fixed") && !permission.editableFlag()), "Node readonly overrides enabling expression");
        require(values.get("secret").equals(privateValue), "Engine values retained");
        FormDataPermissionFilter.Projection inherited = filter.filter(fields.toString(), values, List.of(), Set.of("approval"), true);
        require(inherited.values().get("secret").equals(privateValue), "No permission rule retains valid visible data");
        Logger logger = (Logger) LoggerFactory.getLogger(FormDataPermissionFilter.class);
        ListAppender<ILoggingEvent> events = new ListAppender<>(); events.start(); logger.addAppender(events);
        try {
            ((com.fasterxml.jackson.databind.node.ObjectNode) fields.get(2)).put("visibleExpr", "${undeclared} == '" + privateValue + "'");
            FormDataPermissionFilter.Projection invalid = filter.filter(fields.toString(), values, List.of(), Set.of("approval"), true);
            require(!invalid.values().containsKey("secret"), "Unknown field condition is false");
            require(events.list.stream().anyMatch(event -> event.getFormattedMessage().contains("fieldId=secret")), "Unknown field failure logs safe field identifier");
            require(events.list.stream().noneMatch(event -> event.getFormattedMessage().contains(privateValue) || event.getFormattedMessage().contains("undeclared")), "Expression and private value absent from diagnostics");
            require(invalid.fields().get(2).path("visibleExpr").asText().equals("false"), "Outbound unknown condition replaced by false");
        } finally { logger.detachAppender(events); events.stop(); }
    }
    private static void require(boolean accepted, String name) { if (!accepted) throw new AssertionError(name); filterChecks++; }
}

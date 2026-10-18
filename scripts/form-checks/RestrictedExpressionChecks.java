import com.cloudflow.common.core.utils.RestrictedExpression;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

public final class RestrictedExpressionChecks {
    private static int checks;
    private static final Set<String> FIELDS = Set.of("amount", "type", "enabled", "missing", "first", "second");
    private static final Map<String, Object> VALUES = Map.of("amount", "10000.01", "type", "SPECIAL", "enabled", true, "first", "0.1", "second", "0.2");

    public static void main(String[] arguments) {
        for (String expression : List.of("${amount} > 10000 && ${type} == 'SPECIAL'", "!false", "${enabled}", "true || false && false", "(true || false) && true", "${missing} == null", "${amount} != 10000", "-1 < 0", "'001' != '1'", "'中文' == '中文'", "'it\\'s' == 'it\\'s'", "(((((true)))))")) {
            RestrictedExpression.BooleanResult result = RestrictedExpression.evaluatePredicate(expression, VALUES, FIELDS);
            require(result.valid() && result.value(), "valid true condition: " + expression);
        }
        for (String expression : List.of("${amount} < 10000", "${type} == 'NORMAL'", "${missing} != null", "true && false", "false || false", "!${enabled}")) {
            RestrictedExpression.BooleanResult result = RestrictedExpression.evaluatePredicate(expression, VALUES, FIELDS);
            require(result.valid() && !result.value(), "valid false condition: " + expression);
        }
        for (String expression : List.of("", "${unknown} == 1", "${amount}.getClass()", "T(java.lang.Runtime).getRuntime()", "eval('true')", "new Function('true')", "${type.length} > 0", "${constructor} == null", "${__proto__} == null", "true;false", "true ? 1 : 0", "${amount} + 1 > 0", "- ${amount} < 0", "((((((true))))))", "!!!!!!true", "true &&", "(true", "true)", "01 == 1", "'bad\\n' == 'bad'", "true && ${unknown} == 1", "false && ${unknown} == 1", "true".repeat(126))) {
            require(!RestrictedExpression.evaluatePredicate(expression, VALUES, FIELDS).valid(), "invalid predicate is denied: " + expression);
            boolean rejected = false;
            try { RestrictedExpression.validatePredicate(expression, FIELDS); }
            catch (IllegalArgumentException exception) { rejected = true; }
            require(rejected, "invalid predicate cannot be saved");
        }
        for (String expression : List.of("${amount}", "${missing} > 1", "true < false", "${enabled} == 1", "!${missing}")) {
            require(!RestrictedExpression.evaluatePredicate(expression, VALUES, FIELDS).valid(), "runtime type mismatch is denied");
        }
        require(RestrictedExpression.evaluateNumeric("${first} + ${second}", VALUES, FIELDS).compareTo(new BigDecimal("0.3")) == 0, "exact decimal sum");
        require(RestrictedExpression.evaluateNumeric("(2 + 3) * 4 - 1", VALUES, FIELDS).compareTo(new BigDecimal("19")) == 0, "arithmetic precedence");
        require(RestrictedExpression.evaluateNumeric("1 / 8", VALUES, FIELDS).compareTo(new BigDecimal("0.125")) == 0, "decimal division");
        require(RestrictedExpression.evaluateNumeric("-${amount}", VALUES, FIELDS).compareTo(new BigDecimal("-10000.01")) == 0, "numeric mode allows variable negation");
        boolean dividedByZero = false;
        try { RestrictedExpression.evaluateNumeric("1 / 0", VALUES, FIELDS); }
        catch (ArithmeticException exception) { dividedByZero = true; }
        require(dividedByZero, "division by zero is refused");
        require(!RestrictedExpression.evaluatePredicate("${amount} > 0", Map.of("amount", List.of(1)), FIELDS).valid(), "arrays cannot be inspected");
        require(!RestrictedExpression.evaluatePredicate("${amount} > 0", Map.of("amount", Map.of("secret", 1)), FIELDS).valid(), "objects cannot be inspected");
        require(RestrictedExpression.numericReferences("${first} * 0.7 + ${second} * 0.3", FIELDS).equals(Set.of("first", "second")), "numeric references use arithmetic parser");
        for (String expression : List.of("'5' + 1", "true", "null", "!${enabled}", "1 == 1", "1 > 0", "true || 1", "${amount}.getClass()", "abs(-1)", "${unknown} + 1", "((((((1))))))", "1".repeat(501))) {
            boolean rejected = false;
            try { RestrictedExpression.numericReferences(expression, FIELDS); }
            catch (IllegalArgumentException exception) { rejected = true; }
            require(rejected, "numeric mode rejects non-arithmetic syntax");
        }
        System.out.println("Batch C restricted expression checks passed: " + checks + "; no script engine; depth<=5; length<=500");
    }

    private static void require(boolean result, String message) {
        checks++;
        if (!result) throw new AssertionError(message);
    }
}

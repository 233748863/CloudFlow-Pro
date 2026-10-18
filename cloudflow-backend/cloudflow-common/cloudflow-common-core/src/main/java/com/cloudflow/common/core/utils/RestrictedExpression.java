package com.cloudflow.common.core.utils;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.List;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class RestrictedExpression {
    private static final MathContext PRECISION = new MathContext(80, RoundingMode.HALF_UP);
    private static final Pattern NUMBER = Pattern.compile("(?:0|[1-9]\\d*)(?:\\.\\d+)?");
    private static final Pattern VARIABLE = Pattern.compile("\\$\\{([A-Za-z_][A-Za-z0-9_]{0,99})}");
    private static final Pattern KEYWORD = Pattern.compile("(?:true|false|null)\\b");
    private static final Set<String> RESERVED = Set.of("__proto__", "constructor", "prototype");
    private static final Map<String, Integer> PRECEDENCE = Map.ofEntries(
            Map.entry("||", 1), Map.entry("&&", 2), Map.entry("==", 3), Map.entry("!=", 3),
            Map.entry(">", 4), Map.entry(">=", 4), Map.entry("<", 4), Map.entry("<=", 4),
            Map.entry("+", 5), Map.entry("-", 5), Map.entry("*", 6), Map.entry("/", 6));
    private static final List<String> OPERATORS = List.of("==", "!=", ">=", "<=", "&&", "||", "!", ">", "<", "(", ")", "+", "-", "*", "/");

    private RestrictedExpression() {
    }

    public record BooleanResult(boolean valid, boolean value) {
    }

    public static void validatePredicate(String expression, Set<String> declaredFields) {
        new Parser(expression, declaredFields, false).parse();
    }

    public static Set<String> referencedFields(String expression, Set<String> declaredFields) {
        Set<String> result = new LinkedHashSet<>();
        collectReferences(new Parser(expression, declaredFields, false).parse(), result);
        return Set.copyOf(result);
    }

    private static void collectReferences(Node node, Set<String> references) {
        if (node instanceof Variable variable) references.add(variable.fieldId());
        else if (node instanceof Unary unary) collectReferences(unary.operand(), references);
        else if (node instanceof Binary binary) {
            collectReferences(binary.left(), references);
            collectReferences(binary.right(), references);
        }
    }

    public static BooleanResult evaluatePredicate(String expression, Map<String, ?> values, Set<String> declaredFields) {
        try {
            Node parsed = new Parser(expression, declaredFields, false).parse();
            return new BooleanResult(true, booleanValue(parsed.evaluate(values)));
        } catch (IllegalArgumentException | ArithmeticException exception) {
            return new BooleanResult(false, false);
        }
    }

    public static BigDecimal evaluateNumeric(String expression, Map<String, ?> values, Set<String> declaredFields) {
        return numeric(new Parser(expression, declaredFields, true).parse().evaluate(values)).stripTrailingZeros();
    }

    public static Set<String> numericReferences(String expression, Set<String> declaredFields) {
        Set<String> result = new LinkedHashSet<>();
        collectReferences(new Parser(expression, declaredFields, true).parse(), result);
        return Set.copyOf(result);
    }

    private interface Node {
        Object evaluate(Map<String, ?> values);
    }

    private record Literal(Object value) implements Node {
        public Object evaluate(Map<String, ?> values) {
            return value;
        }
    }

    private record Variable(String fieldId) implements Node {
        public Object evaluate(Map<String, ?> values) {
            Object value = values.get(fieldId);
            if (value == null || value instanceof String || value instanceof Boolean || value instanceof BigDecimal) return value;
            if (value instanceof Number number) return new BigDecimal(number.toString());
            throw invalid("表达式字段只能为文字、数字或布尔值");
        }
    }

    private record Unary(String operator, Node operand) implements Node {
        public Object evaluate(Map<String, ?> values) {
            Object value = operand.evaluate(values);
            return "!".equals(operator) ? !booleanValue(value) : numeric(value).negate();
        }
    }

    private record Binary(String operator, Node left, Node right) implements Node {
        public Object evaluate(Map<String, ?> values) {
            Object first = left.evaluate(values);
            if ("&&".equals(operator)) return booleanValue(first) && booleanValue(right.evaluate(values));
            if ("||".equals(operator)) return booleanValue(first) || booleanValue(right.evaluate(values));
            Object second = right.evaluate(values);
            return switch (operator) {
                case "+" -> numeric(first).add(numeric(second), PRECISION);
                case "-" -> numeric(first).subtract(numeric(second), PRECISION);
                case "*" -> numeric(first).multiply(numeric(second), PRECISION);
                case "/" -> numeric(first).divide(numeric(second), PRECISION);
                default -> compare(operator, first, second);
            };
        }
    }

    private static boolean compare(String operator, Object first, Object second) {
        Integer comparison;
        if (first == null || second == null) comparison = first == second ? 0 : null;
        else if (first instanceof BigDecimal || second instanceof BigDecimal) comparison = numeric(first).compareTo(numeric(second));
        else if (first instanceof String firstText && second instanceof String secondText) comparison = firstText.compareTo(secondText);
        else if (first instanceof Boolean firstBoolean && second instanceof Boolean secondBoolean) comparison = firstBoolean.compareTo(secondBoolean);
        else comparison = null;
        if ("==".equals(operator)) return comparison != null && comparison == 0;
        if ("!=".equals(operator)) return comparison == null || comparison != 0;
        if (comparison == null || first instanceof Boolean || second instanceof Boolean) throw invalid("比较运算的值类型不一致");
        return switch (operator) {
            case ">" -> comparison > 0;
            case ">=" -> comparison >= 0;
            case "<" -> comparison < 0;
            case "<=" -> comparison <= 0;
            default -> throw invalid("表达式包含未支持的运算符");
        };
    }

    private static BigDecimal numeric(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (!(value instanceof String text) || text.length() > 128 || !text.matches("-?(?:0|[1-9]\\d*)(?:\\.\\d+)?")) throw invalid("表达式需要有效数字");
        return new BigDecimal(text);
    }

    private static boolean booleanValue(Object value) {
        if (!(value instanceof Boolean booleanValue)) throw invalid("表达式需要布尔值");
        return booleanValue;
    }

    private record Token(String kind, String text, Object value) {
    }

    private static final class Parser {
        private final String expression;
        private final Set<String> declaredFields;
        private final boolean arithmetic;
        private int position;
        private Token token;

        private Parser(String expression, Set<String> declaredFields, boolean arithmetic) {
            if (expression == null || expression.isBlank() || expression.length() > 500) throw invalid("表达式不能为空且最多500字符");
            this.expression = expression;
            this.declaredFields = Set.copyOf(declaredFields);
            this.arithmetic = arithmetic;
            this.token = readToken();
        }

        private Node parse() {
            Node result = binary(1, 0);
            if (!"end".equals(token.kind())) throw invalid("表达式包含未支持的语法");
            return result;
        }

        private Token advance() {
            Token previous = token;
            token = readToken();
            return previous;
        }

        private Token readToken() {
            while (position < expression.length() && " \t\r\n".indexOf(expression.charAt(position)) >= 0) position++;
            if (position >= expression.length()) return new Token("end", "", null);
            String remainder = expression.substring(position);
            if (remainder.startsWith("${")) {
                Matcher matcher = VARIABLE.matcher(remainder);
                if (!matcher.lookingAt() || !declaredFields.contains(matcher.group(1)) || RESERVED.contains(matcher.group(1))) throw invalid("表达式引用了未声明字段");
                position += matcher.end();
                return new Token("variable", matcher.group(1), null);
            }
            if (remainder.charAt(0) == '\'') {
                if (arithmetic) throw invalid("得分公式不支持文字常量");
                position++;
                StringBuilder value = new StringBuilder();
                while (position < expression.length()) {
                    char character = expression.charAt(position++);
                    if (character == '\'') return new Token("literal", value.toString(), value.toString());
                    if (character == '\\') {
                        if (position >= expression.length()) throw invalid("字符串缺少结束引号");
                        char escaped = expression.charAt(position++);
                        if (escaped != '\\' && escaped != '\'') throw invalid("字符串仅支持引号与反斜线转义");
                        value.append(escaped);
                    } else {
                        if (character < 32) throw invalid("字符串不能包含控制字符");
                        value.append(character);
                    }
                }
                throw invalid("字符串缺少结束引号");
            }
            Matcher number = NUMBER.matcher(remainder);
            if (number.lookingAt()) {
                position += number.end();
                return new Token("literal", number.group(), new BigDecimal(number.group()));
            }
            Matcher keyword = KEYWORD.matcher(remainder);
            if (keyword.lookingAt()) {
                if (arithmetic) throw invalid("得分公式不支持布尔或空值常量");
                position += keyword.end();
                return new Token("literal", keyword.group(), "null".equals(keyword.group()) ? null : "true".equals(keyword.group()));
            }
            for (String operator : OPERATORS) {
                if (remainder.startsWith(operator)) {
                    position += operator.length();
                    return new Token("operator", operator, null);
                }
            }
            throw invalid("表达式包含未支持的字符");
        }

        private Node binary(int minimum, int depth) {
            Node left = unary(depth);
            while ("operator".equals(token.kind()) && PRECEDENCE.getOrDefault(token.text(), 0) >= minimum) {
                String operator = advance().text();
                if (!arithmetic && List.of("+", "-", "*", "/").contains(operator)) throw invalid("字段条件不支持算术运算");
                if (arithmetic && !List.of("+", "-", "*", "/").contains(operator)) throw invalid("得分公式仅支持四则运算");
                Node right = binary(PRECEDENCE.get(operator) + 1, depth);
                left = new Binary(operator, left, right);
            }
            return left;
        }

        private Node unary(int depth) {
            if (depth > 5) throw invalid("表达式嵌套最多5层");
            if ("operator".equals(token.kind()) && List.of("!", "-").contains(token.text())) {
                String operator = advance().text();
                if (arithmetic && "!".equals(operator)) throw invalid("得分公式不支持逻辑运算");
                Node operand = unary(depth + 1);
                if (!arithmetic && "-".equals(operator) && (!(operand instanceof Literal literal) || !(literal.value() instanceof BigDecimal))) throw invalid("字段条件仅支持负数字面量");
                return new Unary(operator, operand);
            }
            if ("operator".equals(token.kind()) && "(".equals(token.text())) {
                advance();
                Node expression = binary(1, depth + 1);
                if (!")".equals(advance().text())) throw invalid("表达式括号不匹配");
                return expression;
            }
            Token value = advance();
            return switch (value.kind()) {
                case "literal" -> new Literal(value.value());
                case "variable" -> new Variable(value.text());
                default -> throw invalid("表达式缺少有效值");
            };
        }
    }

    private static IllegalArgumentException invalid(String message) {
        return new IllegalArgumentException(message);
    }
}

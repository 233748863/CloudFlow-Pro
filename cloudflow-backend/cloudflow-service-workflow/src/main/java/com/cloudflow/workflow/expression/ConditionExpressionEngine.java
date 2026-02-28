package com.cloudflow.workflow.expression;

import com.cloudflow.workflow.expression.ConditionExpression.ConditionGroup;
import com.cloudflow.workflow.expression.ConditionExpression.ConditionItem;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.expression.ExpressionParser;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.expression.spel.support.SimpleEvaluationContext;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.math.BigDecimal;
import java.util.Arrays;
import java.util.List;
import java.util.Map;

/**
 * 条件表达式引擎
 * 借鉴 poco-flow 的 NodeExpressionStrategyFactory 设计，支持：
 * 1. 结构化条件评估（分组条件 + AND/OR 组合）
 * 2. SpEL 表达式直接评估（兼容原有逻辑）
 * 3. 默认分支取反逻辑（排他网关中最后一个分支自动取反前面所有条件）
 *
 * 运算符支持：
 *   ==, !=, >, >=, <, <=          数值/字符串比较
 *   contains, notContains          字符串包含
 *   in, notIn                      值在列表中（逗号分隔）
 *   empty, notEmpty                空值判断
 */
@Component
public class ConditionExpressionEngine {

    private static final Logger log = LoggerFactory.getLogger(ConditionExpressionEngine.class);

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ExpressionParser spelParser = new SpelExpressionParser();

    /**
     * 评估条件：优先尝试结构化条件，回退到 SpEL 表达式
     *
     * @param condition 条件字符串（可以是 JSON 结构化条件，也可以是 SpEL 表达式）
     * @param variables 流程变量
     * @return 条件是否满足
     */
    public boolean evaluate(String condition, Map<String, Object> variables) {
        if (!StringUtils.hasText(condition)) {
            return true; // 无条件 = 默认通过
        }

        // 尝试解析为结构化条件 JSON
        String trimmed = condition.trim();
        if (trimmed.startsWith("{")) {
            try {
                ConditionExpression expr = objectMapper.readValue(trimmed, ConditionExpression.class);
                return evaluateStructured(expr, variables);
            } catch (Exception e) {
                log.debug("[ConditionExpressionEngine] 非结构化条件JSON，回退到SpEL: {}", e.getMessage());
            }
        }

        // 回退到 SpEL 表达式评估（兼容原有逻辑）
        return evaluateSpel(condition, variables);
    }

    /**
     * 评估结构化条件表达式
     * 借鉴 poco-flow 的 handle() 方法，支持分组条件的 AND/OR 组合
     *
     * @param expression 结构化条件
     * @param variables  流程变量
     * @return 条件是否满足
     */
    public boolean evaluateStructured(ConditionExpression expression, Map<String, Object> variables) {
        if (expression == null || expression.getGroups() == null || expression.getGroups().isEmpty()) {
            return true;
        }

        // 组间关系：true=AND（所有组都满足），false=OR（任一组满足）
        boolean groupModeAnd = expression.getGroupMode() != null && expression.getGroupMode();

        for (ConditionGroup group : expression.getGroups()) {
            boolean groupResult = evaluateGroup(group, variables);

            if (groupModeAnd && !groupResult) {
                // AND 模式下，任一组不满足则整体不满足
                return false;
            }
            if (!groupModeAnd && groupResult) {
                // OR 模式下，任一组满足则整体满足
                return true;
            }
        }

        // AND 模式：所有组都满足 -> true；OR 模式：所有组都不满足 -> false
        return groupModeAnd;
    }

    /**
     * 评估单个条件组
     * 借鉴 poco-flow 的 handleGroupCondition() 方法
     *
     * @param group     条件组
     * @param variables 流程变量
     * @return 组内条件是否满足
     */
    private boolean evaluateGroup(ConditionGroup group, Map<String, Object> variables) {
        if (group == null || group.getConditions() == null || group.getConditions().isEmpty()) {
            return true;
        }

        // 组内关系：true=AND, false=OR
        boolean modeAnd = group.getMode() != null && group.getMode();

        for (ConditionItem item : group.getConditions()) {
            boolean itemResult = evaluateItem(item, variables);

            if (modeAnd && !itemResult) {
                return false;
            }
            if (!modeAnd && itemResult) {
                return true;
            }
        }

        return modeAnd;
    }

    /**
     * 评估单个条件项
     * 借鉴 poco-flow 的 handleSingleCondition() 方法
     *
     * @param item      条件项
     * @param variables 流程变量
     * @return 条件是否满足
     */
    private boolean evaluateItem(ConditionItem item, Map<String, Object> variables) {
        if (item == null || !StringUtils.hasText(item.getField())) {
            return true;
        }

        String field = item.getField();
        String operator = item.getOperator();
        String expectedValue = item.getValue();

        // 从变量中获取实际值
        Object actualValue = variables != null ? variables.get(field) : null;

        // 空值判断运算符
        if ("empty".equals(operator)) {
            return actualValue == null || String.valueOf(actualValue).isEmpty();
        }
        if ("notEmpty".equals(operator)) {
            return actualValue != null && !String.valueOf(actualValue).isEmpty();
        }

        // 实际值为空时，除了 empty/notEmpty 外，其他运算符都返回 false
        if (actualValue == null) {
            return false;
        }

        String actualStr = String.valueOf(actualValue);

        try {
            switch (operator) {
                case "==":
                case "eq":
                    return compareValues(actualValue, expectedValue) == 0;

                case "!=":
                case "ne":
                    return compareValues(actualValue, expectedValue) != 0;

                case ">":
                case "gt":
                    return compareValues(actualValue, expectedValue) > 0;

                case ">=":
                case "gte":
                    return compareValues(actualValue, expectedValue) >= 0;

                case "<":
                case "lt":
                    return compareValues(actualValue, expectedValue) < 0;

                case "<=":
                case "lte":
                    return compareValues(actualValue, expectedValue) <= 0;

                case "contains":
                    return actualStr.contains(expectedValue);

                case "notContains":
                    return !actualStr.contains(expectedValue);

                case "in":
                    // 值在列表中（逗号分隔）
                    List<String> inList = Arrays.asList(expectedValue.split(","));
                    return inList.stream().map(String::trim).anyMatch(v -> v.equals(actualStr));

                case "notIn":
                    List<String> notInList = Arrays.asList(expectedValue.split(","));
                    return notInList.stream().map(String::trim).noneMatch(v -> v.equals(actualStr));

                default:
                    log.warn("[ConditionExpressionEngine] 不支持的运算符: {}", operator);
                    return false;
            }
        } catch (Exception e) {
            log.warn("[ConditionExpressionEngine] 条件评估异常, field={}, operator={}, value={}, error={}",
                    field, operator, expectedValue, e.getMessage());
            return false;
        }
    }

    /**
     * 比较两个值（自动推断类型：优先数值比较，回退字符串比较）
     *
     * @param actual   实际值
     * @param expected 期望值（字符串）
     * @return 负数=小于, 0=等于, 正数=大于
     */
    private int compareValues(Object actual, String expected) {
        if (actual == null && expected == null) return 0;
        if (actual == null) return -1;
        if (expected == null) return 1;

        // 尝试数值比较
        try {
            BigDecimal actualNum;
            if (actual instanceof Number) {
                actualNum = new BigDecimal(actual.toString());
            } else {
                actualNum = new BigDecimal(String.valueOf(actual));
            }
            BigDecimal expectedNum = new BigDecimal(expected);
            return actualNum.compareTo(expectedNum);
        } catch (NumberFormatException ignored) {
            // 非数值，回退到字符串比较
        }

        // 布尔值比较
        String actualStr = String.valueOf(actual);
        if (("true".equalsIgnoreCase(actualStr) || "false".equalsIgnoreCase(actualStr))
                && ("true".equalsIgnoreCase(expected) || "false".equalsIgnoreCase(expected))) {
            boolean a = Boolean.parseBoolean(actualStr);
            boolean b = Boolean.parseBoolean(expected);
            return Boolean.compare(a, b);
        }

        // 字符串比较
        return actualStr.compareTo(expected);
    }

    /**
     * SpEL 表达式评估（兼容原有逻辑）
     * 安全措施（多层防御）：
     * 1. 使用 SimpleEvaluationContext（禁止类型引用、构造函数、Bean 引用）
     * 2. 表达式长度限制（防止 ReDoS 和资源耗尽）
     * 3. 危险模式黑名单（拒绝明显的注入尝试）
     *
     * @param expression SpEL 表达式
     * @param variables  流程变量
     * @return 条件是否满足
     */
    public boolean evaluateSpel(String expression, Map<String, Object> variables) {
        if (!StringUtils.hasText(expression)) {
            return true;
        }

        // P0-4 防御纵深：表达式长度限制
        if (expression.length() > 500) {
            log.warn("[ConditionExpressionEngine] SpEL表达式过长({}字符)，拒绝执行", expression.length());
            return false;
        }

        // P0-4 防御纵深：拒绝包含危险模式的表达式
        // 即使 SimpleEvaluationContext 已经阻止了这些操作，仍然在入口处拦截以记录告警
        String lower = expression.toLowerCase();
        if (lower.contains("t(") || lower.contains("runtime") || lower.contains("exec(")
                || lower.contains("processbuilder") || lower.contains("classloader")
                || lower.contains("forname") || lower.contains("getclass")
                || lower.contains("java.lang") || lower.contains("java.io")
                || lower.contains("java.net") || lower.contains("javax.")
                || lower.contains("spring") || lower.contains("import ")) {
            log.warn("[ConditionExpressionEngine] SpEL表达式包含危险模式，拒绝执行: {}", expression);
            return false;
        }

        try {
            // P1-4: 前端传入的表达式使用 JavaScript 风格（如 amount > 5000），
            // 但 SpEL 的 setVariable 设置的变量需要用 #varName 引用。
            // 这里自动将表达式中的已知变量名替换为 #varName 格式。
            String processedExpr = preprocessSpelExpression(expression, variables);

            // SimpleEvaluationContext 是安全的：禁止类型引用(T())、构造函数(new)、Bean引用(@)
            SimpleEvaluationContext context = SimpleEvaluationContext.forReadOnlyDataBinding().build();
            if (variables != null) {
                variables.forEach(context::setVariable);
            }
            Boolean result = spelParser.parseExpression(processedExpr).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            log.warn("[ConditionExpressionEngine] SpEL表达式求值失败: expression={}, error={}", expression, e.getMessage());
            return false;
        }
    }

    /**
     * P1-4: 预处理前端传入的条件表达式，使其兼容 SpEL 语法
     * 1. 将表达式中出现的已知变量名替换为 #varName（SpEL 变量引用格式）
     * 2. 前端使用 JavaScript 风格的 &&、||、== 在 SpEL 中均可正常工作
     *    （SpEL 的 == 对字符串做值比较，等同于 .equals()）
     *
     * @param expression 原始表达式
     * @param variables  流程变量（用于识别变量名）
     * @return 处理后的 SpEL 表达式
     */
    private String preprocessSpelExpression(String expression, Map<String, Object> variables) {
        if (variables == null || variables.isEmpty()) {
            return expression;
        }
        String result = expression;
        // 按变量名长度降序排序，避免短变量名误替换长变量名的一部分
        // 例如 amount 和 amountTotal，先替换 amountTotal 再替换 amount
        List<String> sortedKeys = new java.util.ArrayList<>(variables.keySet());
        sortedKeys.sort((a, b) -> b.length() - a.length());
        for (String varName : sortedKeys) {
            // 只替换独立的变量名（前后不是字母/数字/下划线/#），避免误替换已有 #varName 或子串
            // 使用单词边界匹配：变量名前后不能是字母、数字、下划线或 #
            String regex = "(?<![#\\w])" + java.util.regex.Pattern.quote(varName) + "(?!\\w)";
            result = result.replaceAll(regex, "#" + varName);
        }
        return result;
    }

    /**
     * 生成默认分支的取反条件
     * 借鉴 poco-flow 的 handleDefaultBranch() 方法
     * 排他网关中，最后一个分支的条件 = NOT(前面所有分支条件的 OR)
     *
     * @param otherBranchConditions 其他分支的条件列表
     * @param variables             流程变量
     * @return 默认分支是否应该执行（即其他所有分支都不满足时为 true）
     */
    public boolean evaluateDefaultBranch(List<String> otherBranchConditions, Map<String, Object> variables) {
        if (otherBranchConditions == null || otherBranchConditions.isEmpty()) {
            return true;
        }

        // 如果任一其他分支条件满足，则默认分支不执行
        for (String condition : otherBranchConditions) {
            if (evaluate(condition, variables)) {
                return false;
            }
        }

        // 所有其他分支都不满足，默认分支执行
        return true;
    }
}

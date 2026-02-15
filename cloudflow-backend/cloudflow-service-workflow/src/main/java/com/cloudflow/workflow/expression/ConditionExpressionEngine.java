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
     * 使用 SimpleEvaluationContext 防止 SpEL 注入攻击
     *
     * @param expression SpEL 表达式
     * @param variables  流程变量
     * @return 条件是否满足
     */
    public boolean evaluateSpel(String expression, Map<String, Object> variables) {
        if (!StringUtils.hasText(expression)) {
            return true;
        }
        try {
            SimpleEvaluationContext context = SimpleEvaluationContext.forReadOnlyDataBinding().build();
            if (variables != null) {
                variables.forEach(context::setVariable);
            }
            Boolean result = spelParser.parseExpression(expression).getValue(context, Boolean.class);
            return result != null && result;
        } catch (Exception e) {
            log.warn("[ConditionExpressionEngine] SpEL表达式求值失败: expression={}, error={}", expression, e.getMessage());
            return false;
        }
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

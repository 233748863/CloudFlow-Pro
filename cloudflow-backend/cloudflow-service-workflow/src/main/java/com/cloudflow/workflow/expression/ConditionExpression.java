package com.cloudflow.workflow.expression;

import java.util.List;
import java.util.Map;

/**
 * 条件表达式模型
 * 借鉴 poco-flow 的 Condition / GroupCondition / Node 条件模型
 *
 * 支持两层嵌套：
 *   - 外层：多个 ConditionGroup，组间关系由 groupMode 决定（AND/OR）
 *   - 内层：每个 Group 内多个 Condition，组内关系由 group.mode 决定（AND/OR）
 *
 * 示例 JSON（存储在节点的 conditionConfig 字段中）：
 * {
 *   "groupMode": true,          // true=AND, false=OR（组间关系）
 *   "groups": [
 *     {
 *       "mode": true,            // true=AND, false=OR（组内关系）
 *       "conditions": [
 *         { "field": "amount", "operator": ">", "value": "5000" },
 *         { "field": "dept", "operator": "==", "value": "finance" }
 *       ]
 *     }
 *   ]
 * }
 */
public class ConditionExpression {

    /** 组间逻辑关系：true=AND, false=OR */
    private Boolean groupMode;

    /** 条件组列表 */
    private List<ConditionGroup> groups;

    public Boolean getGroupMode() {
        return groupMode;
    }

    public void setGroupMode(Boolean groupMode) {
        this.groupMode = groupMode;
    }

    public List<ConditionGroup> getGroups() {
        return groups;
    }

    public void setGroups(List<ConditionGroup> groups) {
        this.groups = groups;
    }

    /**
     * 条件组
     */
    public static class ConditionGroup {

        /** 组内逻辑关系：true=AND, false=OR */
        private Boolean mode;

        /** 条件列表 */
        private List<ConditionItem> conditions;

        public Boolean getMode() {
            return mode;
        }

        public void setMode(Boolean mode) {
            this.mode = mode;
        }

        public List<ConditionItem> getConditions() {
            return conditions;
        }

        public void setConditions(List<ConditionItem> conditions) {
            this.conditions = conditions;
        }
    }

    /**
     * 单个条件项
     */
    public static class ConditionItem {

        /** 变量字段名（如 amount、dept、level） */
        private String field;

        /** 比较运算符（==、!=、>、>=、<、<=、contains、notContains、in、notIn） */
        private String operator;

        /** 比较值 */
        private String value;

        /** 字段类型（可选：STRING、NUMBER、BOOLEAN，默认自动推断） */
        private String fieldType;

        public String getField() {
            return field;
        }

        public void setField(String field) {
            this.field = field;
        }

        public String getOperator() {
            return operator;
        }

        public void setOperator(String operator) {
            this.operator = operator;
        }

        public String getValue() {
            return value;
        }

        public void setValue(String value) {
            this.value = value;
        }

        public String getFieldType() {
            return fieldType;
        }

        public void setFieldType(String fieldType) {
            this.fieldType = fieldType;
        }
    }
}

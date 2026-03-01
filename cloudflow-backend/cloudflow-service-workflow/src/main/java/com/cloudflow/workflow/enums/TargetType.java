package com.cloudflow.workflow.enums;

/**
 * 操作对象类型枚举
 * 
 * @author CloudFlow
 */
public enum TargetType {
    
    TEMPLATE("模板"),
    WORKFLOW("流程"),
    VERSION("版本"),
    CATEGORY("分类");

    private final String description;

    TargetType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}

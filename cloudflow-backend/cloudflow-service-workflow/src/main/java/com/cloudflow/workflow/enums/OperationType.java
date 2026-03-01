package com.cloudflow.workflow.enums;

/**
 * 操作类型枚举
 * 
 * @author CloudFlow
 */
public enum OperationType {
    
    // 模板操作
    TEMPLATE_CREATE("模板创建"),
    TEMPLATE_UPDATE("模板更新"),
    TEMPLATE_DELETE("模板删除"),
    
    // 版本操作
    VERSION_CREATE("版本创建"),
    VERSION_ROLLBACK("版本回滚"),
    
    // 流程操作
    WORKFLOW_CREATE("流程创建"),
    WORKFLOW_UPDATE("流程更新"),
    WORKFLOW_DELETE("流程删除"),
    WORKFLOW_ARCHIVE("流程归档"),
    WORKFLOW_RESTORE("流程恢复"),
    WORKFLOW_EXPORT("流程导出"),
    WORKFLOW_IMPORT("流程导入"),
    
    // 批量操作
    BATCH_ARCHIVE("批量归档"),
    BATCH_RESTORE("批量恢复"),
    BATCH_DELETE("批量删除"),
    BATCH_EXPORT("批量导出"),
    BATCH_IMPORT("批量导入");

    private final String description;

    OperationType(String description) {
        this.description = description;
    }

    public String getDescription() {
        return description;
    }
}

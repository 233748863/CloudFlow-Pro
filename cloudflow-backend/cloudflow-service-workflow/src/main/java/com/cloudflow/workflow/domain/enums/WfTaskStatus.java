package com.cloudflow.workflow.domain.enums;

/**
 * 任务状态
 */
public enum WfTaskStatus {
    TODO("TODO", "待处理"),
    COMPLETED("COMPLETED", "已完成"),
    REJECTED("REJECTED", "已驳回"),
    REVOKED("REVOKED", "已撤销"),
    SUSPENDED("SUSPENDED", "已暂停"),
    DELEGATED("DELEGATED", "已委派");

    private final String code;
    private final String desc;

    WfTaskStatus(String code, String desc) {
        this.code = code;
        this.desc = desc;
    }

    public String getCode() {
        return code;
    }

    public String getDesc() {
        return desc;
    }
}

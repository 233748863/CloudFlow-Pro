package com.cloudflow.workflow.domain.enums;

/**
 * 流程实例状态
 */
public enum WfProcessStatus {
    RUNNING("RUNNING", "运行中"),
    COMPLETED("COMPLETED", "已完成"),
    REJECTED("REJECTED", "已驳回"),
    REVOKED("REVOKED", "已撤销"),
    SUSPENDED("SUSPENDED", "已暂停"),
    INVALIDATED("INVALIDATED", "已作废");

    private final String code;
    private final String desc;

    WfProcessStatus(String code, String desc) {
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

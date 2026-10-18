package com.cloudflow.workflow.domain.enums;

import com.cloudflow.workflow.exception.WorkflowException;
import java.util.List;
import java.util.Set;

/**
 * 流程实例状态
 */
public enum WfProcessStatus {
    DRAFT("DRAFT", "草稿"),
    RUNNING("RUNNING", "运行中"),
    PASSED("PASSED", "已通过"),
    AUTO_PASSED("AUTO_PASSED", "自动通过"),
    REJECTED("REJECTED", "已驳回"),
    TERMINATED("TERMINATED", "已终止"),
    INVALIDATED("INVALIDATED", "已作废"),
    CANCELLED("CANCELLED", "发起人已撤销"),
    WITHDRAWN("WITHDRAWN", "审批人已撤回"),
    TASK_BACK("TASK_BACK", "已回退"),
    PAUSED("PAUSED", "已暂停"),
    RESTARTED("RESTARTED", "重新提交"),
    PENDING("PENDING", "等待外部处理"),
    FAILED("FAILED", "执行异常");

    private static final List<String> ACTIVE_CODES = List.of("RUNNING", "WITHDRAWN", "TASK_BACK", "RESTARTED", "PENDING");
    private static final List<String> OPEN_CODES = List.of("RUNNING", "WITHDRAWN", "TASK_BACK", "RESTARTED", "PENDING", "PAUSED", "FAILED");
    private static final Set<WfProcessStatus> TERMINAL = Set.of(PASSED, AUTO_PASSED, REJECTED, TERMINATED, INVALIDATED, CANCELLED);

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

    public boolean isTerminal() {
        return TERMINAL.contains(this);
    }

    public boolean canTransitionTo(WfProcessStatus target) {
        if (target == this) {
            return true;
        }
        if (isTerminal()) {
            return false;
        }
        if (this == DRAFT) {
            return Set.of(RUNNING, RESTARTED, CANCELLED, INVALIDATED).contains(target);
        }
        if (this == PAUSED || this == FAILED) {
            return Set.of(RUNNING, RESTARTED, TASK_BACK, PENDING, PAUSED, TERMINATED, INVALIDATED, CANCELLED).contains(target);
        }
        return target != DRAFT;
    }

    public static WfProcessStatus fromCode(String code) {
        try {
            return valueOf(code);
        } catch (IllegalArgumentException | NullPointerException exception) {
            throw WorkflowException.validationError("未知流程实例状态: " + code);
        }
    }

    public static List<String> activeCodes() {
        return ACTIVE_CODES;
    }

    public static List<String> openCodes() {
        return OPEN_CODES;
    }

    public static List<String> successCodes() {
        return List.of(PASSED.code, AUTO_PASSED.code);
    }

    public static boolean isActive(String code) {
        return code != null && ACTIVE_CODES.contains(code);
    }

    public static boolean isOpen(String code) {
        return code != null && OPEN_CODES.contains(code);
    }

    public static boolean isSuccess(String code) {
        return code != null && successCodes().contains(code);
    }
}

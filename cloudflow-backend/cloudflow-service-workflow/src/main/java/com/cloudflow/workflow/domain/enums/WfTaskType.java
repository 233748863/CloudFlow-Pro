package com.cloudflow.workflow.domain.enums;

import com.cloudflow.workflow.domain.WfNodeConfig;

public enum WfTaskType {
    APPROVAL, CC, MANUAL,
    COUNTERSIGN, OR_SIGN, PERCENT_SIGN, SEQUENTIAL_SIGN, WEIGHT_SIGN,
    TRANSFER, DELEGATE, DELEGATE_RETURN, ADD_SIGN, REDUCE_SIGN,
    REJECT, REJECT_JUMP, AUTO_PASS, AUTO_REJECT, AUTO_SKIP;

    public static String forNode(WfNodeConfig node) {
        if (node == null) {
            return APPROVAL.name();
        }
        return forNode(node.getType(), node.getSignType());
    }

    public static String forNode(String nodeType, String signType) {
        if ("COPY".equals(nodeType)) {
            return CC.name();
        }
        if ("MANUAL".equals(nodeType)) {
            return MANUAL.name();
        }
        if (!"APPROVAL".equals(nodeType)) {
            return null;
        }
        return forSignType(signType);
    }

    public static String forSignType(String signType) {
        if (signType == null || signType.isBlank()) {
            return APPROVAL.name();
        }
        return switch (signType) {
            case "ALL" -> COUNTERSIGN.name();
            case "ANY" -> OR_SIGN.name();
            case "PERCENT" -> PERCENT_SIGN.name();
            case "SEQUENTIAL" -> SEQUENTIAL_SIGN.name();
            case "WEIGHT" -> WEIGHT_SIGN.name();
            default -> APPROVAL.name();
        };
    }

    public static String forAction(String action, String taskType) {
        if (AUTO_PASS.name().equals(taskType) || AUTO_REJECT.name().equals(taskType)) {
            return taskType;
        }
        if (action == null) {
            return taskType == null ? APPROVAL.name() : taskType;
        }
        return switch (action) {
            case "REJECT" -> REJECT.name();
            case "REJECT_TO_PREVIOUS", "REJECT_JUMP" -> REJECT_JUMP.name();
            case "DELEGATE", "TRANSFER" -> TRANSFER.name();
            case "DELEGATE_WITH_RETURN" -> DELEGATE.name();
            case "DELEGATE_RETURN" -> DELEGATE_RETURN.name();
            case "ADD_SIGN", "ADD_SIGNATURE" -> ADD_SIGN.name();
            case "REMOVE_SIGN", "REDUCE_SIGN", "REDUCTION_SIGNATURE" -> REDUCE_SIGN.name();
            default -> taskType == null ? APPROVAL.name() : taskType;
        };
    }
}

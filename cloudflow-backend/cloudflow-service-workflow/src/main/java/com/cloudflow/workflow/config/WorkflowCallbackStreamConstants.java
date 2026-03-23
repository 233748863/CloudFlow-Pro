package com.cloudflow.workflow.config;

/**
 * workflow 跨服务审批回写 Stream 常量
 */
public final class WorkflowCallbackStreamConstants {

    private WorkflowCallbackStreamConstants() {
    }

    /**
     * 审批结果回写 Stream Key
     */
    public static final String APPROVAL_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback";
}

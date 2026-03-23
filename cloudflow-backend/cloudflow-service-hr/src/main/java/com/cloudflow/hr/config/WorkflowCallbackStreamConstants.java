package com.cloudflow.hr.config;

/**
 * Workflow 与 HR 之间的 Redis Stream 常量。
 */
public final class WorkflowCallbackStreamConstants {

    private WorkflowCallbackStreamConstants() {
    }

    /**
     * 审批结果回写 Stream Key
     */
    public static final String APPROVAL_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback";

    /**
     * HR 侧消费组
     */
    public static final String APPROVAL_CALLBACK_GROUP = "group:hr:workflow-callback";
}

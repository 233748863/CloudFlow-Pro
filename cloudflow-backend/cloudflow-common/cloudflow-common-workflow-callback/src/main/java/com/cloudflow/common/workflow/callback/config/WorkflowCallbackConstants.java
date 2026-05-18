package com.cloudflow.common.workflow.callback.config;

import java.util.Map;

/**
 * 工作流回调跨服务共享的常量与帮助方法。
 */
public final class WorkflowCallbackConstants {

    private WorkflowCallbackConstants() {
    }

    /** workflow 默认全局回写 Stream Key；业务侧应通过 properties 显式覆盖为独立通道。 */
    public static final String DEFAULT_APPROVAL_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback";

    /** 回写操作人固定标识，业务侧写入 {@code updateBy} 字段时使用。 */
    public static final String WORKFLOW_UPDATE_BY = "workflow-stream";

    /** 审批结果常量：通过。 */
    public static final String RESULT_APPROVED = "APPROVED";

    /** 审批结果常量：驳回。 */
    public static final String RESULT_REJECTED = "REJECTED";

    /**
     * 给流程变量补齐回调所需的元数据：业务类型、业务主键、业务编号、回写 Stream Key。
     */
    public static void applyCallbackMetadata(Map<String, Object> variables,
                                             String businessType,
                                             Long businessId,
                                             String businessNo,
                                             String callbackStreamKey) {
        if (variables == null) {
            return;
        }
        variables.put("businessType", businessType);
        variables.put("businessId", businessId);
        variables.put("businessNo", businessNo);
        variables.put("callbackStreamKey", callbackStreamKey);
    }
}

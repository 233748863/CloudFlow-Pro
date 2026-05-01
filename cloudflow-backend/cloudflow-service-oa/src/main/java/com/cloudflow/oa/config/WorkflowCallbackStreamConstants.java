package com.cloudflow.oa.config;

import java.util.Map;

/**
 * Workflow 与 OA 之间的 Redis Stream 常量。
 */
public final class WorkflowCallbackStreamConstants {

    private WorkflowCallbackStreamConstants() {
    }

    /**
     * OA 专属审批结果回写 Stream Key。
     * 使用独立通道，避免 HR 与 OA 互相消费对方的审批事件。
     */
    public static final String APPROVAL_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback:oa";

    /**
     * OA 侧消费组。
     */
    public static final String APPROVAL_CALLBACK_GROUP = "group:oa:workflow-callback";

    /**
     * Stream 回写操作人的固定标识。
     */
    public static final String WORKFLOW_UPDATE_BY = "workflow-stream";

    public static final String BUSINESS_TYPE_BUSINESS_TRIP = "business_trip";
    public static final String BUSINESS_TYPE_EXPENSE_CLAIM = "expense_claim";
    public static final String BUSINESS_TYPE_PAYMENT_REQUEST = "payment_request";
    public static final String BUSINESS_TYPE_PURCHASE_REQUEST = "purchase_request";
    public static final String BUSINESS_TYPE_VEHICLE_APPROVAL = "vehicle_approval";
    public static final String BUSINESS_TYPE_KNOWLEDGE_DOCUMENT = "KNOWLEDGE_DOCUMENT";
    public static final String BUSINESS_TYPE_SEAL_APPLICATION = "seal_application";
    public static final String BUSINESS_TYPE_LICENSE_BORROW = "license_borrow";
    public static final String BUSINESS_TYPE_LICENSE_RENEWAL = "license_renewal";
    public static final String BUSINESS_TYPE_CONTRACT = "biz_contract";

    /**
     * 给流程变量补齐回调所需的公共元数据。
     */
    public static void applyCallbackMetadata(Map<String, Object> variables,
                                             String businessType,
                                             Long businessId,
                                             String businessNo) {
        if (variables == null) {
            return;
        }
        variables.put("businessType", businessType);
        variables.put("businessId", businessId);
        variables.put("businessNo", businessNo);
        variables.put("callbackStreamKey", APPROVAL_CALLBACK_STREAM_KEY);
    }
}

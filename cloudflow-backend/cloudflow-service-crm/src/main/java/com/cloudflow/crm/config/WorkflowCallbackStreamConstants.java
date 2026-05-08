package com.cloudflow.crm.config;

import java.util.Map;

public final class WorkflowCallbackStreamConstants {

    private WorkflowCallbackStreamConstants() {
    }

    public static final String APPROVAL_CALLBACK_STREAM_KEY = "workflow:stream:approval-callback:crm";
    public static final String APPROVAL_CALLBACK_GROUP = "group:crm:workflow-callback";
    public static final String WORKFLOW_UPDATE_BY = "workflow-stream";

    public static final String BUSINESS_TYPE_CRM_QUOTE = "crm_quote";
    public static final String BUSINESS_TYPE_CRM_RENEWAL = "crm_renewal";

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

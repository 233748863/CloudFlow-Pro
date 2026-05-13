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
    public static final String BUSINESS_TYPE_CRM_CUSTOMER_CLAIM = "crm_customer_claim";
    public static final String BUSINESS_TYPE_CRM_CUSTOMER_LEVEL = "crm_customer_level";
    public static final String BUSINESS_TYPE_CRM_OPPORTUNITY_DOWNGRADE = "crm_opportunity_downgrade";
    public static final String BUSINESS_TYPE_CRM_REFUND = "crm_refund";

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

package com.cloudflow.crm.constant;

/**
 * CRM 模块下的工作流业务类型常量，对应 workflow 服务侧 {@code businessType}。
 */
public final class CrmBusinessTypes {

    private CrmBusinessTypes() {
    }

    public static final String CRM_QUOTE = "crm_quote";
    public static final String CRM_RENEWAL = "crm_renewal";
    public static final String CRM_CUSTOMER_CLAIM = "crm_customer_claim";
    public static final String CRM_CUSTOMER_LEVEL = "crm_customer_level";
    public static final String CRM_OPPORTUNITY_DOWNGRADE = "crm_opportunity_downgrade";
    public static final String CRM_REFUND = "crm_refund";
}

package com.cloudflow.oa.constant;

/**
 * OA 模块下的工作流业务类型常量，对应 workflow 服务侧 {@code businessType}。
 */
public final class OaBusinessTypes {

    private OaBusinessTypes() {
    }

    public static final String BUSINESS_TRIP = "business_trip";
    public static final String EXPENSE_CLAIM = "expense_claim";
    public static final String PAYMENT_REQUEST = "payment_request";
    public static final String PURCHASE_REQUEST = "purchase_request";
    public static final String VEHICLE_APPROVAL = "vehicle_approval";
    public static final String KNOWLEDGE_DOCUMENT = "KNOWLEDGE_DOCUMENT";
    public static final String SEAL_APPLICATION = "seal_application";
    public static final String SEAL_RENEWAL = "seal_renewal";
    public static final String LICENSE_BORROW = "license_borrow";
    public static final String LICENSE_RENEWAL = "license_renewal";
    public static final String CONTRACT = "biz_contract";
    public static final String PROJECT = "project_approval";
    public static final String BUDGET_PLAN = "budget_plan";
    public static final String BUDGET_ADJUSTMENT = "budget_adjustment";
}

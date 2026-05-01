package com.cloudflow.oa.util;

/**
 * OA 合同、链路与风险常量。
 */
public final class OaContractConstants {

    private OaContractConstants() {
    }

    public static final String BUSINESS_TYPE_CONTRACT = "CONTRACT";
    public static final String BUSINESS_TYPE_APPROVAL = "APPROVAL";
    public static final String BUSINESS_TYPE_SEAL = "SEAL";
    public static final String BUSINESS_TYPE_RISK = "RISK";

    public static final String CONTRACT_STATUS_DRAFT = "DRAFT";
    public static final String CONTRACT_STATUS_PENDING = "PENDING";
    public static final String CONTRACT_STATUS_APPROVED = "APPROVED";
    public static final String CONTRACT_STATUS_REJECTED = "REJECTED";
    public static final String CONTRACT_STATUS_SEALING = "SEALING";
    public static final String CONTRACT_STATUS_SEALED = "SEALED";
    public static final String CONTRACT_STATUS_ACTIVE = "ACTIVE";
    public static final String CONTRACT_STATUS_EXPIRED = "EXPIRED";
    public static final String CONTRACT_STATUS_TERMINATED = "TERMINATED";
    public static final String CONTRACT_STATUS_CANCELLED = "CANCELLED";

    public static final String RISK_STATUS_OPEN = "OPEN";
    public static final String RISK_STATUS_HANDLING = "HANDLING";
    public static final String RISK_STATUS_CLOSED = "CLOSED";
    public static final String RISK_STATUS_IGNORED = "IGNORED";

    public static final String RISK_SOURCE_RULE = "RULE";
    public static final String RISK_SOURCE_MANUAL = "MANUAL";

    public static final String RISK_LEVEL_LOW = "LOW";
    public static final String RISK_LEVEL_MEDIUM = "MEDIUM";
    public static final String RISK_LEVEL_HIGH = "HIGH";
    public static final String RISK_LEVEL_CRITICAL = "CRITICAL";
}

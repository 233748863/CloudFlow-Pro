package com.cloudflow.crm.config;

/**
 * CRM 对外发布的领域事件 Redis Stream 常量。
 * 下游模块（HR、OA、通知）可订阅 {@link #CRM_EVENTS_STREAM_KEY} 消费。
 */
public final class CrmEventStreamConstants {

    private CrmEventStreamConstants() {
    }

    /** CRM 领域事件全局 Stream。 */
    public static final String CRM_EVENTS_STREAM_KEY = "crm:stream:events";

    /** CRM 自我订阅消费组（处理回款→发票、赢单→合同等内部闭环）。 */
    public static final String SELF_CONSUMER_GROUP = "group:crm:self-events";

    public static final String EVENT_OPPORTUNITY_WON = "OpportunityWon";
    public static final String EVENT_CUSTOMER_CREATED = "CustomerCreated";
    public static final String EVENT_RECEIVABLE_CONFIRMED = "ReceivableConfirmed";
    public static final String EVENT_CUSTOMER_OWNER_CHANGED = "CustomerOwnerChanged";
    public static final String EVENT_CONTRACT_APPROVED = "ContractApproved";
}

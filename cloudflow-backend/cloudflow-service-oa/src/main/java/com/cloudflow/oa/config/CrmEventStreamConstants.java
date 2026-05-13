package com.cloudflow.oa.config;

/**
 * OA 对外广播领域事件的 Redis Stream 常量。
 * 与 CRM 侧 {@code CrmEventStreamConstants} 对齐使用同一全局 stream。
 */
public final class CrmEventStreamConstants {

    private CrmEventStreamConstants() {
    }

    public static final String CRM_EVENTS_STREAM_KEY = "crm:stream:events";

    public static final String EVENT_CONTRACT_APPROVED = "ContractApproved";
    public static final String EVENT_CONTRACT_REJECTED = "ContractRejected";
}

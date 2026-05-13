package com.cloudflow.crm.config;

/**
 * CRM 订阅的 HR 领域事件 Stream 常量（需与 cloudflow-service-hr 保持一致）。
 */
public final class HrEventStreamConstants {

    private HrEventStreamConstants() {
    }

    public static final String EMPLOYEE_LEFT_STREAM_KEY = "hr:stream:employee-left";

    public static final String EMPLOYEE_LEFT_GROUP = "group:crm:hr-employee-left";
}

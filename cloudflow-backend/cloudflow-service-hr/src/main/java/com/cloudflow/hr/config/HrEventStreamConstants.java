package com.cloudflow.hr.config;

/**
 * HR 对外发布的领域事件 Redis Stream 常量。
 */
public final class HrEventStreamConstants {

    private HrEventStreamConstants() {
    }

    /** 员工离职生效事件。CRM / OA 等模块订阅用于交接待办。 */
    public static final String EMPLOYEE_LEFT_STREAM_KEY = "hr:stream:employee-left";
}

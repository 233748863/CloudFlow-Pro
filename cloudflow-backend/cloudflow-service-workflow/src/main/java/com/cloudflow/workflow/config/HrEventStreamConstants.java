package com.cloudflow.workflow.config;

/**
 * HR employee-left stream constants shared with hr/crm modules.
 */
public final class HrEventStreamConstants {

    private HrEventStreamConstants() {
    }

    public static final String EMPLOYEE_LEFT_STREAM_KEY = "hr:stream:employee-left";

    public static final String EMPLOYEE_LEFT_GROUP = "group:workflow:hr-employee-left";
}

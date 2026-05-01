package com.cloudflow.oa.util;

/**
 * 用印/证照借用常量。
 */
public final class OaBorrowConstants {

    private OaBorrowConstants() {
    }

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PENDING = "PENDING";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";
    public static final String STATUS_BORROWED = "BORROWED";
    public static final String STATUS_RETURNED = "RETURNED";
    public static final String STATUS_OVERDUE = "OVERDUE";
    public static final String STATUS_CANCELLED = "CANCELLED";

    public static final String RESOURCE_AVAILABLE = "AVAILABLE";
    public static final String RESOURCE_BORROWED = "BORROWED";
    public static final String RESOURCE_DISABLED = "DISABLED";

    public static final String BUSINESS_TYPE_SEAL = "SEAL";
    public static final String BUSINESS_TYPE_LICENSE = "LICENSE";

    public static final String HANDOVER_BORROW = "BORROW";
    public static final String HANDOVER_RETURN = "RETURN";

    public static final String REMINDER_AUTO = "AUTO";
    public static final String REMINDER_MANUAL = "MANUAL";

    public static final long DEFAULT_TENANT_ID = 100000L;
}

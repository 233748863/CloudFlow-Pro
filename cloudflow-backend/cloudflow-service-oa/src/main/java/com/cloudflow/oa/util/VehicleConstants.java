package com.cloudflow.oa.util;

public final class VehicleConstants {

    private VehicleConstants() {
    }

    public static final String BUSINESS_TYPE_VEHICLE = "VEHICLE";

    public static final String VEHICLE_STATUS_AVAILABLE = "1";
    public static final String VEHICLE_STATUS_BOOKED = "2";
    public static final String VEHICLE_STATUS_IN_USE = "3";
    public static final String VEHICLE_STATUS_MAINTENANCE = "4";
    public static final String VEHICLE_STATUS_SCRAPPED = "5";

    public static final String USAGE_STATUS_PENDING = "0";
    public static final String USAGE_STATUS_APPROVED = "1";
    public static final String USAGE_STATUS_REJECTED = "2";
    public static final String USAGE_STATUS_IN_USE = "3";
    public static final String USAGE_STATUS_COMPLETED = "4";
    public static final String USAGE_STATUS_CANCELLED = "5";

    public static final String RISK_CODE_OVERDUE_RETURN = "VEHICLE_OVERDUE_RETURN";
    public static final String RISK_CODE_INSURANCE_EXPIRY = "VEHICLE_INSURANCE_EXPIRY";
    public static final String RISK_CODE_INSPECTION_EXPIRY = "VEHICLE_INSPECTION_EXPIRY";
    public static final String RISK_CODE_MAINTENANCE_DUE = "VEHICLE_MAINTENANCE_DUE";
    public static final String RISK_CODE_PENDING_VIOLATION = "VEHICLE_PENDING_VIOLATION";
    public static final String RISK_CODE_HIGH_COST = "VEHICLE_HIGH_COST";
}

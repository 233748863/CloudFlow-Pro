package com.cloudflow.oa.domain.export;

import com.cloudflow.common.sensitive.utils.SensitiveUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * OA Excel 导出辅助工具。
 * 统一处理时间格式、状态枚举和敏感字段展示，避免各业务重复维护。
 */
public final class OaExcelExportHelper {

    private static final DateTimeFormatter DATE_TIME_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");

    private OaExcelExportHelper() {
    }

    public static String formatDateTime(LocalDateTime value) {
        return value == null ? "" : value.format(DATE_TIME_FORMATTER);
    }

    public static String formatDate(LocalDate value) {
        return value == null ? "" : value.format(DATE_FORMATTER);
    }

    public static String formatStatus(String status) {
        if (status == null) {
            return "";
        }
        return switch (status) {
            case "DRAFT" -> "草稿";
            case "PENDING" -> "审批中";
            case "APPROVED" -> "已通过";
            case "REJECTED" -> "已驳回";
            case "CANCELLED" -> "已取消";
            case "PAID" -> "已打款";
            default -> status;
        };
    }

    public static String formatLeaveType(String leaveType) {
        if (leaveType == null) {
            return "";
        }
        return switch (leaveType) {
            case "ANNUAL" -> "年假";
            case "SICK" -> "病假";
            case "PERSONAL" -> "事假";
            case "MATERNITY" -> "产假";
            case "MARRIAGE" -> "婚假";
            case "BEREAVEMENT" -> "丧假";
            case "OTHER" -> "其他";
            default -> leaveType;
        };
    }

    public static String formatExpenseCategory(String category) {
        if (category == null) {
            return "";
        }
        return switch (category) {
            case "TRAVEL" -> "差旅";
            case "OFFICE" -> "办公";
            case "ENTERTAIN" -> "招待";
            case "TRANSPORT" -> "交通";
            case "OTHER" -> "其他";
            default -> category;
        };
    }

    public static String formatPaymentType(String paymentType) {
        if (paymentType == null) {
            return "";
        }
        return switch (paymentType) {
            case "PURCHASE" -> "采购";
            case "SERVICE" -> "服务";
            case "RENT" -> "租金";
            case "OTHER" -> "其他";
            default -> paymentType;
        };
    }

    public static String formatTransportType(String transportType) {
        if (transportType == null) {
            return "";
        }
        return switch (transportType) {
            case "PLANE" -> "飞机";
            case "TRAIN" -> "火车";
            case "CAR" -> "自驾";
            case "OTHER" -> "其他";
            default -> transportType;
        };
    }

    public static String formatOvertimeType(String overtimeType) {
        if (overtimeType == null) {
            return "";
        }
        return switch (overtimeType) {
            case "WORKDAY" -> "工作日";
            case "WEEKEND" -> "周末";
            case "HOLIDAY" -> "节假日";
            default -> overtimeType;
        };
    }

    public static String formatCompensateType(String compensateType) {
        if (compensateType == null) {
            return "";
        }
        return switch (compensateType) {
            case "SALARY" -> "加班费";
            case "LEAVE" -> "调休";
            default -> compensateType;
        };
    }

    public static String formatAppealType(String appealType) {
        if (appealType == null) {
            return "";
        }
        return switch (appealType) {
            case "MAKEUP" -> "补卡";
            case "FIELD" -> "外勤";
            default -> appealType;
        };
    }

    public static String formatCheckType(String checkType) {
        if (checkType == null) {
            return "";
        }
        return switch (checkType) {
            case "1" -> "签到";
            case "2" -> "签退";
            default -> checkType;
        };
    }

    public static String formatOriginalStatus(String originalStatus) {
        if (originalStatus == null) {
            return "";
        }
        return switch (originalStatus) {
            case "LATE" -> "迟到";
            case "EARLY" -> "早退";
            case "ABSENT" -> "缺卡";
            case "ABNORMAL" -> "异常";
            default -> originalStatus;
        };
    }

    public static String formatMealFlag(Integer needMeal) {
        if (needMeal == null) {
            return "";
        }
        return needMeal == 1 ? "是" : "否";
    }

    public static String maskBankCard(String account) {
        return SensitiveUtils.maskBankCard(account);
    }
}

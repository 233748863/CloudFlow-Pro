package com.cloudflow.oa.domain.export;

import com.cloudflow.common.sensitive.utils.SensitiveUtils;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * OA 导出辅助工具。
 * <p>
 * 这里只保留 OA 当前仍在使用的导出格式化逻辑，避免混入 HR 假勤领域的历史残留。
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
            case "PAID" -> "已付款";
            default -> status;
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

    public static String maskBankCard(String account) {
        return SensitiveUtils.maskBankCard(account);
    }
}

package com.cloudflow.crm.service.opportunity;

import com.cloudflow.crm.exception.CrmBusinessException;
import java.math.BigDecimal;
import java.math.RoundingMode;

public final class CrmSalesAmounts {
    private static final BigDecimal HUNDRED = new BigDecimal("100");

    private CrmSalesAmounts() { }

    public record Line(BigDecimal quantity, BigDecimal unitPrice, BigDecimal discountRate,
            BigDecimal taxRate, BigDecimal lineAmount, BigDecimal taxAmount) { }

    public static Line line(BigDecimal quantity, BigDecimal unitPrice, BigDecimal discountRate, BigDecimal taxRate) {
        BigDecimal normalizedQuantity = decimal(quantity, 12, 4, "产品数量");
        if (normalizedQuantity.signum() <= 0) throw invalid("产品数量必须大于0");
        BigDecimal normalizedPrice = decimal(unitPrice, 12, 4, "产品单价");
        BigDecimal discount = percentage(discountRate == null ? HUNDRED : discountRate, 4, "折扣百分数");
        BigDecimal tax = percentage(taxRate == null ? BigDecimal.ZERO : taxRate, 4, "税率百分数");
        BigDecimal subtotal = decimal(normalizedQuantity.multiply(normalizedPrice).multiply(discount)
                .divide(HUNDRED, 2, RoundingMode.HALF_UP), 14, 2, "产品未税金额");
        BigDecimal taxAmount = decimal(subtotal.multiply(tax).divide(HUNDRED, 2, RoundingMode.HALF_UP), 14, 2, "产品税额");
        return new Line(normalizedQuantity, normalizedPrice, discount, tax, subtotal, taxAmount);
    }

    public static BigDecimal expected(BigDecimal amount) {
        return decimal(amount == null ? BigDecimal.ZERO : amount, 12, 2, "商机预计金额");
    }

    public static BigDecimal winRate(BigDecimal percentage) {
        return percentage(percentage == null ? BigDecimal.ZERO : percentage, 2, "商机赢率");
    }

    public static BigDecimal stageRate(BigDecimal ratio) {
        BigDecimal normalized = decimal(ratio, 2, 4, "阶段默认赢率");
        if (normalized.compareTo(BigDecimal.ONE) > 0) throw invalid("阶段默认赢率必须在0至1之间");
        return normalized;
    }

    public static BigDecimal weighted(BigDecimal expectedAmount, BigDecimal winRate) {
        return decimal(expected(expectedAmount).multiply(winRate(winRate)).divide(HUNDRED, 2, RoundingMode.HALF_UP), 12, 2, "商机加权金额");
    }

    public static BigDecimal percentage(BigDecimal value, int scale, String label) {
        BigDecimal normalized = decimal(value, 3, scale, label);
        if (normalized.compareTo(HUNDRED) > 0) throw invalid(label + "必须在0至100之间");
        return normalized;
    }

    public static BigDecimal decimal(BigDecimal value, int integerDigits, int scale, String label) {
        if (value == null || value.signum() < 0 || value.compareTo(BigDecimal.TEN.pow(integerDigits)) >= 0
                || value.stripTrailingZeros().scale() > scale) throw invalid(label + "须为非负数，最多" + integerDigits + "位整数和" + scale + "位小数");
        return value.setScale(scale, RoundingMode.UNNECESSARY);
    }

    private static CrmBusinessException invalid(String message) { return new CrmBusinessException(message); }
}

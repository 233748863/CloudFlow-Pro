package com.cloudflow.hr.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.math.BigDecimal;
import java.math.RoundingMode;

import static com.cloudflow.hr.service.HrHException.conflict;

public final class HrAdvancePayrollPolicy {
    private static final BigDecimal MAX_PAYROLL = new BigDecimal("9999999999999999.99");

    private HrAdvancePayrollPolicy() { }

    public static BigDecimal budget(BigDecimal netAmount, JsonNode snapshot) {
        BigDecimal net = money(netAmount);
        JsonNode policy = snapshot == null ? null : snapshot.get("payrollDeduction");
        if (snapshot == null || !snapshot.path("ruleId").isIntegralNumber() || !snapshot.path("ruleId").canConvertToLong() || snapshot.path("ruleId").asLong() <= 0
                || !snapshot.path("ruleVersion").isIntegralNumber() || !snapshot.path("ruleVersion").canConvertToInt()
                || snapshot.path("ruleVersion").asInt() < 0 || policy == null
                || !"CONFIRMED".equals(policy.path("confirmationStatus").asText())
                || !policy.path("maximumNetRatio").isNumber() || !policy.path("minimumNetAmount").isNumber()) {
            throw conflict("ADVANCE_PAYROLL_POLICY_REQUIRED", "借款扣还须先核定比例、最低实发额及规则版本，不使用默认政策");
        }
        BigDecimal ratio = policy.path("maximumNetRatio").decimalValue();
        BigDecimal minimum = money(policy.path("minimumNetAmount").decimalValue());
        if (ratio.signum() < 0 || ratio.compareTo(BigDecimal.ONE) > 0) {
            throw conflict("ADVANCE_PAYROLL_POLICY_INVALID", "核定工资扣还比例须在0至1之间");
        }
        return net.multiply(ratio).setScale(2, RoundingMode.DOWN).min(net.subtract(minimum).max(BigDecimal.ZERO));
    }

    private static BigDecimal money(BigDecimal value) {
        if (value == null || value.signum() < 0 || value.compareTo(MAX_PAYROLL) > 0) {
            throw conflict("ADVANCE_PAYROLL_AMOUNT_INVALID", "可扣工资或最低实发额缺失、为负或超过工资字段容量");
        }
        try {
            return value.setScale(2, RoundingMode.UNNECESSARY);
        } catch (ArithmeticException failure) {
            throw conflict("ADVANCE_PAYROLL_AMOUNT_INVALID", "可扣工资及最低实发额最多保留两位小数");
        }
    }
}

package com.cloudflow.oa.service.impl;

import java.math.BigDecimal;
import java.math.RoundingMode;

public final class OaTimesheetAmountCalculator {
    private OaTimesheetAmountCalculator() { }

    public static BigDecimal reversal(BigDecimal originalAmount, BigDecimal rate, BigDecimal originalHours, BigDecimal reservedHours, BigDecimal reservedAmount, BigDecimal requestedHours) {
        BigDecimal totalHours = reservedHours.add(requestedHours);
        if (requestedHours.signum() <= 0 || totalHours.compareTo(originalHours) > 0) throw new IllegalArgumentException("累计冲正工时超过原明细工时");
        BigDecimal remaining = originalAmount.subtract(reservedAmount);
        if (remaining.signum() < 0) throw new IllegalStateException("既有冲正金额超出原记录，请先核对原始工时");
        BigDecimal amount = totalHours.compareTo(originalHours) == 0 ? remaining : rate.multiply(requestedHours).setScale(2, RoundingMode.HALF_UP).min(remaining);
        return OaRecordSupport.decimal(amount.negate(), 18, 2, true, "冲正金额");
    }
}

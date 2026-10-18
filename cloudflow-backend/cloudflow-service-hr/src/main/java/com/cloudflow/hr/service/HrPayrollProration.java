package com.cloudflow.hr.service;

import com.cloudflow.hr.exception.HrBusinessException;
import java.math.BigDecimal;
import java.math.RoundingMode;

public final class HrPayrollProration {
    private HrPayrollProration() {}

    public static BigDecimal portion(BigDecimal amount, long previousUnits, long currentUnits, long totalUnits) {
        if (amount == null || amount.signum() < 0 || previousUnits < 0 || currentUnits < 0 || totalUnits <= 0
                || previousUnits + currentUnits > totalUnits) {
            throw new HrBusinessException("PAYROLL_PRORATION_INVALID", "薪资分摊金额、计薪数量或分母无效");
        }
        BigDecimal divisor = BigDecimal.valueOf(totalUnits);
        BigDecimal cumulative = amount.multiply(BigDecimal.valueOf(previousUnits + currentUnits)).divide(divisor, 2, RoundingMode.HALF_UP);
        BigDecimal previous = amount.multiply(BigDecimal.valueOf(previousUnits)).divide(divisor, 2, RoundingMode.HALF_UP);
        return cumulative.subtract(previous);
    }
}

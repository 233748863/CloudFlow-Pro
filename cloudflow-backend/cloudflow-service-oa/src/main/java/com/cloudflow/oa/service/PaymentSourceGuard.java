package com.cloudflow.oa.service;

import com.cloudflow.oa.domain.BizPaymentRequest;
import java.math.BigDecimal;
import java.math.RoundingMode;

public final class PaymentSourceGuard {
    private static final BigDecimal MAX_AMOUNT = new BigDecimal("999999999999.99");

    private PaymentSourceGuard() { }

    public static void ordinary(BizPaymentRequest payment) {
        if (payment == null) throw new IllegalArgumentException("付款申请不能为空");
        if (payment.getSourceBizType() != null || payment.getSourceBizId() != null) {
            throw new IllegalArgumentException("关联人事业务的付款须通过已核实的来源业务处理");
        }
    }

    public static void amount(BigDecimal value) {
        if (value == null || value.signum() <= 0 || value.compareTo(MAX_AMOUNT) > 0) {
            throw new IllegalArgumentException("付款金额必须大于0且不超过999999999999.99");
        }
        try { value.setScale(2, RoundingMode.UNNECESSARY); }
        catch (ArithmeticException failure) { throw new IllegalArgumentException("付款金额最多保留两位小数", failure); }
    }
}

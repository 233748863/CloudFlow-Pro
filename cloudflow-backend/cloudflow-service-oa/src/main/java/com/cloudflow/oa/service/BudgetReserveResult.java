package com.cloudflow.oa.service;

import lombok.Data;

import java.math.BigDecimal;

/**
 * OA-P0-2 预算预占结果。
 *
 * <p>正常预占成功 {@code accepted=true};
 * 超过 BLOCK 阈值时 {@code accepted=false} 并填充 {@code exceededAmount/threshold},
 * 上层据此为审批流追加 CFO 特批分支而非抛异常中断流程。
 */
@Data
public class BudgetReserveResult {

    private boolean accepted;
    private BigDecimal exceededAmount;
    private BigDecimal threshold;
    private String reason;

    public static BudgetReserveResult accepted() {
        BudgetReserveResult r = new BudgetReserveResult();
        r.setAccepted(true);
        return r;
    }

    public static BudgetReserveResult rejected(BigDecimal exceededAmount, BigDecimal threshold, String reason) {
        BudgetReserveResult r = new BudgetReserveResult();
        r.setAccepted(false);
        r.setExceededAmount(exceededAmount);
        r.setThreshold(threshold);
        r.setReason(reason);
        return r;
    }
}

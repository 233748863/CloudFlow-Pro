package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 报销单打款确认事件
 */
@Data
public class ExpenseClaimPaidEvent {

    /** 报销单ID */
    private Long claimId;

    /** 报销单号 */
    private String claimNo;

    /** 申请人ID */
    private Long userId;

    /** 申请人姓名 */
    private String userName;

    /** 报销金额 */
    private BigDecimal totalAmount;

    /** 打款确认时间 */
    private LocalDateTime paidAt;
}

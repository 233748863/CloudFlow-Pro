package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 报销单提交事件
 */
@Data
public class ExpenseClaimSubmittedEvent {

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

    /** 报销类别 */
    private String category;

    /** 报销说明 */
    private String description;

    /** 部门名称 */
    private String deptName;

    /** 是否超标 */
    private Boolean exceededStandard;

    /** 超标金额 */
    private BigDecimal exceededAmount;

    /** 是否超预算 */
    private Boolean budgetExceeded;

    /** 超预算金额 */
    private BigDecimal budgetExceededAmount;

    /** 提交时间 */
    private LocalDateTime submittedAt;
}

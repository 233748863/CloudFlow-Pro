package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 发票绑定业务单据事件
 */
@Data
public class InvoiceBoundEvent {

    /** 发票ID */
    private Long invoiceId;

    /** 发票代码 */
    private String invoiceCode;

    /** 发票号码 */
    private String invoiceNo;

    /** 发票方向 */
    private String invoiceDirection;

    /** 发票金额 */
    private BigDecimal grossAmount;

    /** 关联客户ID */
    private Long customerId;

    /** 关联客户名称 */
    private String customerName;

    /** 关联合同ID */
    private Long contractId;

    /** 关联合同编号 */
    private String contractNo;

    /** 关联报销单ID */
    private Long expenseClaimId;

    /** 关联付款申请ID */
    private Long paymentRequestId;

    /** 绑定时间 */
    private LocalDateTime boundAt;
}

package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 发票核销事件
 */
@Data
public class InvoiceWriteoffEvent {

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

    /** 本次核销金额 */
    private BigDecimal writeoffAmount;

    /** 累计核销金额 */
    private BigDecimal totalWriteoffAmount;

    /** 核销后状态 */
    private String status;

    /** 核销日期 */
    private LocalDate writeoffDate;

    /** 关联客户ID */
    private Long customerId;

    /** 关联合同ID */
    private Long contractId;

    /** 核销时间 */
    private LocalDateTime writeoffAt;
}

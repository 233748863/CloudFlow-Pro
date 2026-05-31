package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 发票作废事件
 */
@Data
public class InvoiceVoidEvent {

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

    /** 作废原因 */
    private String remark;

    /** 关联客户ID */
    private Long customerId;

    /** 关联合同ID */
    private Long contractId;

    /** 作废时间 */
    private LocalDateTime voidAt;
}

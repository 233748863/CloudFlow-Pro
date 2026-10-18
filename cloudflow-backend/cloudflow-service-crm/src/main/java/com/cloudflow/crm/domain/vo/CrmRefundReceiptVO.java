package com.cloudflow.crm.domain.vo;

import com.fasterxml.jackson.annotation.JsonFormat;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import lombok.Data;

@Data
public class CrmRefundReceiptVO {
    private Long receiptEventId;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime occurredTime;
    private String source;
    private String currency;
    private Integer teamVersion;
    private BigDecimal amount;
    private BigDecimal refundedAmount;
    private BigDecimal remainingAmount;
}

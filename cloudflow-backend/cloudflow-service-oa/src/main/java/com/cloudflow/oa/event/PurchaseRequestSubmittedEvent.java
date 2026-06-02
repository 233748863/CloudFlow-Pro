package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class PurchaseRequestSubmittedEvent {

    private Long purchaseId;

    private String purchaseNo;

    private Long userId;

    private String userName;

    private String deptName;

    private String supplierName;

    private BigDecimal totalAmount;

    private String reason;

    private String itemSummary;

    private LocalDateTime submittedAt;
}

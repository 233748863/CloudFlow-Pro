package com.cloudflow.oa.event;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
public class PaymentRequestSubmittedEvent {

    private Long paymentId;

    private String paymentNo;

    private Long userId;

    private String userName;

    private String deptName;

    private BigDecimal amount;

    private String paymentType;

    private String payeeName;

    private String payeeAccount;

    private String payeeBank;

    private String reason;

    private LocalDateTime submittedAt;
}

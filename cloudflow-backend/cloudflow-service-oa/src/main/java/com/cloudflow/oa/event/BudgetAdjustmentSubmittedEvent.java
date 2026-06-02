package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class BudgetAdjustmentSubmittedEvent {

    private Long adjustmentId;

    private String adjustmentNo;

    private LocalDateTime submittedAt;
}

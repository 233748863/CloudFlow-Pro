package com.cloudflow.oa.event;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class BudgetPlanSubmittedEvent {

    private Long budgetId;

    private String budgetNo;

    private LocalDateTime submittedAt;
}

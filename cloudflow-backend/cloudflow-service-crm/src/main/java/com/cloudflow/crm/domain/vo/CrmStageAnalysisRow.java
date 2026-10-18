package com.cloudflow.crm.domain.vo;

import java.math.BigDecimal;
import lombok.Data;

@Data
public class CrmStageAnalysisRow {
    private String stage;
    private long currentCount;
    private BigDecimal currentAmount;
    private BigDecimal weightedForecast;
    private long incompleteCount;
    private long incompleteSeconds;
    private long untrackedCount;
    private long completedCount;
    private long completedSeconds;
    private long cohortCount;
    private long convertedCount;
    private long wonCount;
    private long lostCount;
}

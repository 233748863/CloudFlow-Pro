package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class CrmOpportunityBoardCardVO {
    private Long opportunityId;
    private Long customerId;
    private String customerName;
    private String opportunityName;
    private BigDecimal expectedAmount;
    private BigDecimal winRate;
    private Integer stageStayDays;
    private String ownerName;
    private String expectedSignDate;
}

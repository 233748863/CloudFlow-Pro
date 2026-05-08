package com.cloudflow.crm.domain.vo;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class RemoteProjectLinkVO {
    private Long projectId;
    private String projectNo;
    private String projectName;
    private String status;
    private String riskLevel;
    private BigDecimal budgetAmount;
    private BigDecimal actualCostAmount;
    private String sourceType;
    private Long sourceId;
    private String sourceName;
}

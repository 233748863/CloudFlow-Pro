package com.cloudflow.crm.domain.vo;

import lombok.Data;

@Data
public class CrmLinkSummaryVO {
    private Integer contractCount;
    private Integer invoiceCount;
    private Integer budgetCount;
    private Integer projectCount;
    private Integer openTodoCount;
    private Integer openRiskCount;
}

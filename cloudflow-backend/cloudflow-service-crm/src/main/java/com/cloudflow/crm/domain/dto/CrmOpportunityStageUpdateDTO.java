package com.cloudflow.crm.domain.dto;

import lombok.Data;

@Data
public class CrmOpportunityStageUpdateDTO {
    private Long opportunityId;
    private String stage;
    private String lostReason;
}

package com.cloudflow.crm.domain.dto;

import lombok.Data;

@Data
public class CrmAudienceCondition {
    private String memberType;
    private String industry;
    private Long territoryId;
    private String marketSegment;
    private String levelCode;
    private Integer scoreMin;
    private Integer scoreMax;
}

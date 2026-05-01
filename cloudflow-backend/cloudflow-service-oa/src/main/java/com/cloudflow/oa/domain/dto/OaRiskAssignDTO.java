package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 风险指派入参。
 */
@Data
public class OaRiskAssignDTO {
    private Long ownerId;
    private String ownerName;
}

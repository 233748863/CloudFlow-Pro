package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 风险状态更新入参。
 */
@Data
public class OaRiskStatusDTO {
    private String riskStatus;
    private String handleRemark;
}

package com.cloudflow.oa.domain.dto;

import lombok.Data;

/**
 * 用车审批入参。
 */
@Data
public class VehicleUsageApprovalDTO {

    private Boolean approved;

    private String remark;
}

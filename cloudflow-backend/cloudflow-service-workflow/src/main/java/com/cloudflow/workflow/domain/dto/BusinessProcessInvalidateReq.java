package com.cloudflow.workflow.domain.dto;

import lombok.Data;

@Data
public class BusinessProcessInvalidateReq {

    private Long tenantId;

    private String processInstanceId;

    private String businessType;

    private Long businessId;

    private String reason;
}

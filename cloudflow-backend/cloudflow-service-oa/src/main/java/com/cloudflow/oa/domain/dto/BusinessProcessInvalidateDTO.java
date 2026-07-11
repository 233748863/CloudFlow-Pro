package com.cloudflow.oa.domain.dto;

import lombok.Data;

@Data
public class BusinessProcessInvalidateDTO {
    private Long tenantId;
    private String processInstanceId;
    private String businessType;
    private Long businessId;
    private String reason;
}

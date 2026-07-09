package com.cloudflow.hr.client.dto;

import lombok.Data;

/**
 * Workflow 作废流程入参。
 */
@Data
public class WorkflowInvalidateRequest {

    private Long tenantId;

    private String processInstanceId;

    private String businessType;

    private Long businessId;

    private String reason;
}

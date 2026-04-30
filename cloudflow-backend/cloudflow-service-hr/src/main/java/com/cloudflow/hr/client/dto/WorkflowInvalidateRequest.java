package com.cloudflow.hr.client.dto;

import lombok.Data;

/**
 * Workflow 作废流程入参。
 */
@Data
public class WorkflowInvalidateRequest {

    private String instanceId;

    private String reason;
}

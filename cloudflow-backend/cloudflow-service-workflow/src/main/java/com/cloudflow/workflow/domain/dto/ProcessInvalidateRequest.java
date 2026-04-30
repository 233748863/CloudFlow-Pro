package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 作废流程入参。
 */
@Data
public class ProcessInvalidateRequest {

    private String instanceId;

    private String reason;
}

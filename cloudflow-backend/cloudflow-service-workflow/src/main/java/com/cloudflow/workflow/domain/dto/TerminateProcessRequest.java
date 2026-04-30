package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 终止流程入参。
 */
@Data
public class TerminateProcessRequest {

    private String instanceId;

    private String reason;
}

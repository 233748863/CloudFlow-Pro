package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 催办任务入参。
 */
@Data
public class UrgeTaskRequest {

    private String taskId;

    private String reason;
}

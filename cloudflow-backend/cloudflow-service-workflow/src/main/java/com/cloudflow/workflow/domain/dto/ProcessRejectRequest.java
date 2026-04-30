package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 驳回任务入参。
 */
@Data
public class ProcessRejectRequest {

    private String taskId;

    private String targetNodeKey;

    private String comment;
}

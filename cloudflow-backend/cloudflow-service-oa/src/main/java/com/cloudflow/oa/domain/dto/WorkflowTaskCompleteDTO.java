package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.Map;

/**
 * 远程完成任务入参。
 */
@Data
public class WorkflowTaskCompleteDTO {

    private String taskId;

    private String action;

    private String comment;

    private Map<String, Object> variables;

    private String delegateUserId;
}

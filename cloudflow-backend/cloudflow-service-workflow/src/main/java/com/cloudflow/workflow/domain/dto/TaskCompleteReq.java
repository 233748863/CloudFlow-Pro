package com.cloudflow.workflow.domain.dto;

import lombok.Data;
import java.util.Map;

@Data
public class TaskCompleteReq {
    private String taskId;
    private String action; // APPROVE, REJECT
    private String comment;
    private Map<String, Object> variables;
}

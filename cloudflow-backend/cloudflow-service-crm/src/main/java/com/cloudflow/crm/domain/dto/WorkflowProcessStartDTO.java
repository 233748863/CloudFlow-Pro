package com.cloudflow.crm.domain.dto;

import lombok.Data;

import java.util.Map;

@Data
public class WorkflowProcessStartDTO {

    private String processDefKey;

    private String businessKey;

    private Map<String, Object> variables;
}

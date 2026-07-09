package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.Map;

@Data
public class InternalWorkflowStartDTO {

    private Long tenantId;

    private String processDefKey;

    private String businessKey;

    private Long startUserId;

    private String startUserName;

    private Map<String, Object> variables;
}

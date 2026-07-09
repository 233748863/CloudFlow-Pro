package com.cloudflow.oa.domain.dto;

import lombok.Data;

import java.util.Map;

/**
 * 远程启动流程入参。
 */
@Data
public class WorkflowProcessStartDTO {

    private Long tenantId;

    private String processDefKey;

    private String businessKey;

    private Map<String, Object> variables;
}

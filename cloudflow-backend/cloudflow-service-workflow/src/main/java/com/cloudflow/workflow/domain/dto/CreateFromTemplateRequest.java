package com.cloudflow.workflow.domain.dto;

import lombok.Data;

/**
 * 从模板创建流程请求 DTO
 */
@Data
public class CreateFromTemplateRequest {
    /** 流程名称 */
    private String workflowName;

    /** 流程描述 */
    private String description;

    /** 流程Key（可选，不提供则自动生成） */
    private String processKey;
}

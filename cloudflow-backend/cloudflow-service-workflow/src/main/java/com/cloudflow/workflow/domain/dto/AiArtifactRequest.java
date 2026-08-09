package com.cloudflow.workflow.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

/**
 * AI 生成后端产物请求 DTO
 *
 * @author CloudFlow
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class AiArtifactRequest {

    /**
     * 产物类型：SQL / NACOS_CONFIG / JAVA_ENGINE
     */
    @NotBlank(message = "产物类型不能为空")
    private String artifactType;

    /**
     * 工作流定义（前端 WorkflowDefinition 的 JSON 结构）
     */
    @NotNull(message = "工作流定义不能为空")
    private Map<String, Object> workflow;
}

package com.cloudflow.workflow.domain.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 流程定义校验入参（无运行时变量）。
 */
@Data
@Schema(name = "SimulationValidateRequest", description = "流程定义校验入参")
public class SimulationValidateRequest {

    @Schema(description = "流程定义 ID")
    @NotBlank(message = "流程定义 ID 不能为空")
    @Size(max = 128)
    private String definitionId;
}

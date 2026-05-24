package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 培训报名入参。
 */
@Data
@Schema(name = "HrTrainingEnrollDTO", description = "培训报名入参")
public class HrTrainingEnrollDTO {

    @Schema(description = "培训排期 ID")
    @NotNull(message = "排期 ID 不能为空")
    private Long sessionId;

    @Schema(description = "报名类型 SELF/ASSIGN")
    @Size(max = 32)
    private String enrollType;

    @Schema(description = "备注")
    @Size(max = 500)
    private String comment;
}

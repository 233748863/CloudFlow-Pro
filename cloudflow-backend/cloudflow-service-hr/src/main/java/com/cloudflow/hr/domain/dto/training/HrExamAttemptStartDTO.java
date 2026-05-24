package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 开始作答入参。
 */
@Data
@Schema(name = "HrExamAttemptStartDTO", description = "开始作答入参")
public class HrExamAttemptStartDTO {

    @Schema(description = "培训排期 ID（可选 用于关联到具体培训场次）")
    private Long sessionId;
}

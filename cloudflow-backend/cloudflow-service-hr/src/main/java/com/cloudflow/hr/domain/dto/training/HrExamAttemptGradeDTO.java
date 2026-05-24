package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 主观题人工批改入参。
 */
@Data
@Schema(name = "HrExamAttemptGradeDTO", description = "主观题人工批改入参")
public class HrExamAttemptGradeDTO {

    @Schema(description = "评分")
    private BigDecimal score;

    @Schema(description = "是否通过")
    private Boolean passFlag;

    @Schema(description = "批改评语")
    @Size(max = 500)
    private String comment;
}

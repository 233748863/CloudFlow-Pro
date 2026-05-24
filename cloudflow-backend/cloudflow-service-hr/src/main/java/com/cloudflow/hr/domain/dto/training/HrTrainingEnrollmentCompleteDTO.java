package com.cloudflow.hr.domain.dto.training;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 培训结业登记入参。
 */
@Data
@Schema(name = "HrTrainingEnrollmentCompleteDTO", description = "培训结业登记入参")
public class HrTrainingEnrollmentCompleteDTO {

    @Schema(description = "结业状态 PASS/FAIL/EXEMPT")
    @Size(max = 32)
    private String completionStatus;

    @Schema(description = "结业成绩")
    private BigDecimal score;

    @Schema(description = "评语")
    @Size(max = 500)
    private String comment;
}

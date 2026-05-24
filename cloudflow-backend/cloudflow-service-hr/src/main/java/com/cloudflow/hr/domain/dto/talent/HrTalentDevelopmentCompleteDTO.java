package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 完成培养行动入参。
 */
@Data
@Schema(name = "HrTalentDevelopmentCompleteDTO", description = "完成培养行动入参")
public class HrTalentDevelopmentCompleteDTO {

    @Schema(description = "评估分数（0-100，可空）")
    @DecimalMin(value = "0", message = "评估分数不得小于 0")
    @DecimalMax(value = "100", message = "评估分数不得大于 100")
    private BigDecimal evaluationScore;

    @Schema(description = "评估备注")
    @Size(max = 1024)
    private String evaluationNotes;
}

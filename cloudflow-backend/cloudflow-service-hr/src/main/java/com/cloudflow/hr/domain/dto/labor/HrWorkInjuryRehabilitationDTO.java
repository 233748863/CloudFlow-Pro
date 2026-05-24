package com.cloudflow.hr.domain.dto.labor;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/**
 * 工伤康复跟踪记录新增/修改入参。
 */
@Data
@Schema(name = "HrWorkInjuryRehabilitationDTO", description = "工伤康复跟踪记录入参")
public class HrWorkInjuryRehabilitationDTO {

    @Schema(description = "返岗日期")
    @NotNull(message = "返岗日期不能为空")
    private LocalDate returnDate;

    @Schema(description = "岗位调整说明")
    @Size(max = 512)
    private String positionAdjustment;

    @Schema(description = "新岗位 ID")
    private Long newPositionId;

    @Schema(description = "能力评估")
    @Size(max = 1024)
    private String abilityAssessment;

    @Schema(description = "下次跟进日期")
    private LocalDate followUpAt;

    @Schema(description = "状态：ONGOING/COMPLETED/TERMINATED")
    @Size(max = 32)
    private String status;
}

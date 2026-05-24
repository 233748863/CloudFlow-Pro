package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 加入人才池入参。
 */
@Data
@Schema(name = "HrTalentPoolJoinDTO", description = "加入人才池入参")
public class HrTalentPoolJoinDTO {

    @Schema(description = "员工 ID")
    @NotNull(message = "员工 ID 不能为空")
    private Long employeeId;

    @Schema(description = "来源盘点 ID（可空）")
    private Long sourceReviewId;
}

package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;

/**
 * 培养行动创建/更新入参。
 *
 * <p>剔除系统字段（id/tenantId/deleted/audit）。
 */
@Data
@Schema(name = "HrTalentDevelopmentActionDTO", description = "培养行动创建/更新入参")
public class HrTalentDevelopmentActionDTO {

    @Schema(description = "员工 ID")
    @NotNull(message = "员工 ID 不能为空")
    private Long employeeId;

    @Schema(description = "来源盘点 ID")
    private Long sourceReviewId;

    @Schema(description = "来源人才池 ID")
    private Long sourcePoolId;

    @Schema(description = "行动类型：TRAINING/MENTORING/ASSIGNMENT/CERTIFICATION 等")
    @Size(max = 32)
    private String actionType;

    @Schema(description = "行动名称")
    @NotBlank(message = "行动名称不能为空")
    @Size(max = 128)
    private String actionName;

    @Schema(description = "导师员工 ID")
    private Long mentorId;

    @Schema(description = "负责人员工 ID")
    private Long ownerId;

    @Schema(description = "开始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;

    @Schema(description = "关联培训场次 ID")
    private Long trainingSessionId;

    @Schema(description = "状态：PLANNED/IN_PROGRESS/COMPLETED/CANCELLED；不传默认 PLANNED")
    @Size(max = 32)
    private String status;

    @Schema(description = "行动描述")
    @Size(max = 1024)
    private String description;
}

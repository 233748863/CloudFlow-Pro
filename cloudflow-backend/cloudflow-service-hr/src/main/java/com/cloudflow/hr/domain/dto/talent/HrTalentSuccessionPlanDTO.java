package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 继任计划创建/更新入参。
 *
 * <p>剔除系统字段（id/tenantId/processInstanceId/publishTime/deleted/audit）。
 */
@Data
@Schema(name = "HrTalentSuccessionPlanDTO", description = "继任计划创建/更新入参")
public class HrTalentSuccessionPlanDTO {

    @Schema(description = "计划编号；不传由后端生成")
    @Size(max = 64)
    private String planNo;

    @Schema(description = "计划名称")
    @NotBlank(message = "计划名称不能为空")
    @Size(max = 128)
    private String planName;

    @Schema(description = "对应职位 ID")
    private Long positionId;

    @Schema(description = "现任人员工 ID")
    private Long incumbentEmployeeId;

    @Schema(description = "是否关键岗位：1 关键 / 0 普通")
    private Integer keyRoleFlag;

    @Schema(description = "继任风险等级：HIGH/MEDIUM/LOW")
    @Size(max = 16)
    private String riskLevel;

    @Schema(description = "现任留任风险描述")
    @Size(max = 256)
    private String retentionRisk;

    @Schema(description = "计划说明")
    @Size(max = 1024)
    private String description;

    @Schema(description = "计划责任人员工 ID")
    private Long ownerId;

    @Schema(description = "计划状态：DRAFT/IN_PROGRESS/PUBLISHED/CLOSED；不传默认 DRAFT")
    @Size(max = 32)
    private String status;
}

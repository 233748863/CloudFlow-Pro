package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

/**
 * 继任人提名入参。
 *
 * <p>{@code planId} 由 path 传入，剔除系统字段（id/tenantId/notifiedAt/deleted/audit）。
 */
@Data
@Schema(name = "HrTalentSuccessorDTO", description = "继任人提名入参")
public class HrTalentSuccessorDTO {

    @Schema(description = "继任人员工 ID")
    @NotNull(message = "继任人员工 ID 不能为空")
    private Long employeeId;

    @Schema(description = "就绪度：READY_NOW/READY_1_2Y/READY_3_5Y/NOT_READY")
    @Size(max = 32)
    private String readiness;

    @Schema(description = "排名顺序")
    private Integer rankOrder;

    @Schema(description = "关联盘点参与人记录 ID")
    private Long talentReviewParticipantId;

    @Schema(description = "差距分析与发展点")
    @Size(max = 1024)
    private String developmentGap;

    @Schema(description = "留任动作")
    @Size(max = 1024)
    private String retentionAction;

    @Schema(description = "状态：NOMINATED/CONFIRMED/REJECTED；不传默认 NOMINATED")
    @Size(max = 32)
    private String status;
}

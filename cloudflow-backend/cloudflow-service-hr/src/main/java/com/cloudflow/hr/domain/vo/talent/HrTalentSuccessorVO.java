package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 继任人视图。
 */
@Data
@Schema(name = "HrTalentSuccessorVO", description = "继任人视图")
public class HrTalentSuccessorVO {

    @Schema(description = "继任人记录主键")
    private Long id;

    @Schema(description = "所属计划 ID")
    private Long planId;

    @Schema(description = "继任人员工 ID")
    private Long employeeId;

    @Schema(description = "就绪度")
    private String readiness;

    @Schema(description = "排名顺序")
    private Integer rankOrder;

    @Schema(description = "关联盘点参与人记录 ID")
    private Long talentReviewParticipantId;

    @Schema(description = "差距分析与发展点")
    private String developmentGap;

    @Schema(description = "留任动作")
    private String retentionAction;

    @Schema(description = "状态")
    private String status;

    @Schema(description = "通知时间")
    private LocalDateTime notifiedAt;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;
}

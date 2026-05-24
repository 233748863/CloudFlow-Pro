package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 人才盘点参与人视图（九宫格 / 校准列表）。
 *
 * <p>对应 {@code HrTalentReviewParticipant} entity 对外暴露字段，剔除多租户/逻辑删除。
 */
@Data
@Schema(name = "HrTalentParticipantVO", description = "人才盘点参与人视图")
public class HrTalentParticipantVO {

    @Schema(description = "参与记录主键")
    private Long id;

    @Schema(description = "所属盘点 ID")
    private Long reviewId;

    @Schema(description = "参与员工 ID")
    private Long employeeId;

    @Schema(description = "业绩分（0-100）")
    private BigDecimal performanceScore;

    @Schema(description = "业绩段位 HIGH/MEDIUM/LOW")
    private String performanceBand;

    @Schema(description = "潜力分 1-5")
    private Integer potentialScore;

    @Schema(description = "潜力段位 HIGH/MEDIUM/LOW")
    private String potentialBand;

    @Schema(description = "九宫格位置 1-9")
    private Integer gridCell;

    @Schema(description = "校准会议备注")
    private String calibrationNotes;

    @Schema(description = "培养行动摘要")
    private String developActionSummary;

    @Schema(description = "落格决策人 userId")
    private Long decidedBy;

    @Schema(description = "落格决策时间")
    private LocalDateTime decidedAt;
}

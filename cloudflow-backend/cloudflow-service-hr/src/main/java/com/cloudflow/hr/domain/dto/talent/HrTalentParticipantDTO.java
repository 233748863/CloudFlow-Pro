package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 校准盘点参与人入参。
 *
 * <p>对应 {@link com.cloudflow.hr.domain.entity.HrTalentReviewParticipant} 中由 HR 手工录入的可校准字段，
 * 业绩/潜力的 band 与 grid_cell 由后端按当前 score 自动派生，前端如显式传 band 也会被采用并触发 grid_cell 重算。
 */
@Data
@Schema(name = "HrTalentParticipantDTO", description = "校准盘点参与人入参")
public class HrTalentParticipantDTO {

    @Schema(description = "业绩分（0-100，可空）")
    @DecimalMin(value = "0", message = "业绩分不得小于 0")
    @DecimalMax(value = "100", message = "业绩分不得大于 100")
    private BigDecimal performanceScore;

    @Schema(description = "业绩段位 HIGH/MEDIUM/LOW；不传则按 performanceScore 派生")
    @Size(max = 16)
    private String performanceBand;

    @Schema(description = "潜力分 1-5")
    @Min(value = 1, message = "潜力分至少为 1")
    @Max(value = 5, message = "潜力分至多为 5")
    private Integer potentialScore;

    @Schema(description = "潜力段位 HIGH/MEDIUM/LOW；不传则按 potentialScore 派生")
    @Size(max = 16)
    private String potentialBand;

    @Schema(description = "校准会议备注")
    @Size(max = 1024)
    private String calibrationNotes;

    @Schema(description = "培养行动摘要")
    @Size(max = 1024)
    private String developActionSummary;
}

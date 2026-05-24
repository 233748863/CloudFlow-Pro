package com.cloudflow.hr.domain.dto.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 人才盘点活动创建/更新入参。
 *
 * <p>对应 {@code hr_talent_review} 表的可写字段子集，剔除系统字段
 * （id/tenantId/deleted/createTime/updateTime/createBy/updateBy/processInstanceId/performanceSourceObjectiveId/publishTime）。
 * status 字段保留接受 DRAFT 初始态，发布后流转由专用接口控制。
 */
@Data
@Schema(name = "HrTalentReviewDTO", description = "人才盘点活动创建/更新入参")
public class HrTalentReviewDTO {

    @Schema(description = "盘点编号；不传由后端按 TR-{时间戳} 生成")
    @Size(max = 64)
    private String reviewNo;

    @Schema(description = "盘点活动名称")
    @NotBlank(message = "盘点活动名称不能为空")
    @Size(max = 128)
    private String reviewName;

    @Schema(description = "盘点年度（如 2025）")
    private Integer reviewYear;

    @Schema(description = "盘点周期类型：H / Q / Y 等")
    @Size(max = 16)
    private String cycleType;

    @Schema(description = "盘点范围类型：DEPT / POSITION / LEVEL / CUSTOM")
    @Size(max = 32)
    private String scopeType;

    @Schema(description = "盘点范围值（JSON / CSV，按 scopeType 解析）")
    @Size(max = 1024)
    private String scopeValue;

    @Schema(description = "盘点责任人员工 ID")
    private Long ownerId;

    @Schema(description = "盘点截止日期")
    private LocalDate deadline;

    @Schema(description = "盘点发布时间（业务态，通常由系统在发布时回写，可选填）")
    private LocalDateTime publishTime;

    @Schema(description = "盘点活动状态：DRAFT/IN_PROGRESS/CALIBRATING/PUBLISHED/CLOSED；不传默认 DRAFT")
    @Size(max = 32)
    private String status;

    @Schema(description = "盘点说明")
    @Size(max = 1024)
    private String description;
}

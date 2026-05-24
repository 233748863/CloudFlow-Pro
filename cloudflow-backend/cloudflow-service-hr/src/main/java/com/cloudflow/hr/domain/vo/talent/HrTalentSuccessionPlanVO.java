package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 继任计划详情视图。
 */
@Data
@Schema(name = "HrTalentSuccessionPlanVO", description = "继任计划详情视图")
public class HrTalentSuccessionPlanVO {

    @Schema(description = "计划主键")
    private Long id;

    @Schema(description = "计划编号")
    private String planNo;

    @Schema(description = "计划名称")
    private String planName;

    @Schema(description = "对应职位 ID")
    private Long positionId;

    @Schema(description = "现任人员工 ID")
    private Long incumbentEmployeeId;

    @Schema(description = "是否关键岗位：1 关键 / 0 普通")
    private Integer keyRoleFlag;

    @Schema(description = "继任风险等级")
    private String riskLevel;

    @Schema(description = "现任留任风险描述")
    private String retentionRisk;

    @Schema(description = "计划说明")
    private String description;

    @Schema(description = "计划责任人员工 ID")
    private Long ownerId;

    @Schema(description = "计划状态")
    private String status;

    @Schema(description = "关联流程实例 ID")
    private String processInstanceId;

    @Schema(description = "发布时间")
    private LocalDateTime publishTime;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    @Schema(description = "更新时间")
    private LocalDateTime updateTime;
}

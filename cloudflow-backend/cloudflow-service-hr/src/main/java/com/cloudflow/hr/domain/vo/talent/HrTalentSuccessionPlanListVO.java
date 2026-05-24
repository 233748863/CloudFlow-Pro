package com.cloudflow.hr.domain.vo.talent;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 继任计划列表行视图。
 */
@Data
@Schema(name = "HrTalentSuccessionPlanListVO", description = "继任计划列表行视图")
public class HrTalentSuccessionPlanListVO {

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

    @Schema(description = "是否关键岗位")
    private Integer keyRoleFlag;

    @Schema(description = "继任风险等级")
    private String riskLevel;

    @Schema(description = "计划责任人员工 ID")
    private Long ownerId;

    @Schema(description = "计划状态")
    private String status;

    @Schema(description = "创建时间")
    private LocalDateTime createTime;
}

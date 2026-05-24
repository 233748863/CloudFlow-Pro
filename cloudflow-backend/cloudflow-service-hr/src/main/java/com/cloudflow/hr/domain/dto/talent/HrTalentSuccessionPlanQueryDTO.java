package com.cloudflow.hr.domain.dto.talent;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 继任计划分页查询条件。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrTalentSuccessionPlanQueryDTO", description = "继任计划分页查询条件")
public class HrTalentSuccessionPlanQueryDTO extends PageQuery {

    @Schema(description = "关键字（按计划编号 / 名称模糊匹配）")
    private String keyword;

    @Schema(description = "计划状态")
    private String status;

    @Schema(description = "对应职位 ID")
    private Long positionId;

    @Schema(description = "现任人员工 ID")
    private Long incumbentEmployeeId;

    @Schema(description = "是否关键岗位")
    private Integer keyRoleFlag;

    @Schema(description = "风险等级")
    private String riskLevel;

    @Schema(description = "计划责任人员工 ID")
    private Long ownerId;
}

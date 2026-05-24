package com.cloudflow.hr.domain.dto.performance;

import com.cloudflow.common.core.domain.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 绩效域共用分页查询入参（目标/分解/结果/调薪/目标树列表使用）。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(name = "HrPerformanceCommonQueryDTO", description = "绩效域共用分页查询入参")
public class HrPerformanceCommonQueryDTO extends PageQuery {

    @Schema(description = "关键字 模糊匹配 目标名/编号")
    private String keyword;

    @Schema(description = "员工 ID")
    private Long employeeId;

    @Schema(description = "部门 ID")
    private Long deptId;

    @Schema(description = "周期类型 MONTHLY/QUARTERLY/SEMIANNUAL/ANNUAL")
    private String cycleType;

    @Schema(description = "考核周期 如 2025Q1")
    private String cyclePeriod;

    @Schema(description = "目标 ID")
    private Long objectiveId;

    @Schema(description = "状态 DRAFT/PLAN_APPROVING/IN_PROGRESS/RESULT_APPROVING/CLOSED")
    private String status;

    @Schema(description = "结果等级 S/A/B/C/D")
    private String resultLevel;

    @Schema(description = "起始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;
}

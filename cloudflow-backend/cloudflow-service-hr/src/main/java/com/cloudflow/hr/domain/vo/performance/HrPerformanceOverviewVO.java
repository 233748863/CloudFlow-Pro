package com.cloudflow.hr.domain.vo.performance;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * HR 绩效概览 VO（按状态分桶统计）。
 */
@Data
@Schema(name = "HrPerformanceOverviewVO", description = "HR 绩效概览 VO")
public class HrPerformanceOverviewVO {
    @Schema(description = "草稿/退回中数量") private Integer draftCount;
    @Schema(description = "计划审批中数量") private Integer planApprovingCount;
    @Schema(description = "执行中数量") private Integer runningCount;
    @Schema(description = "结果审批中数量") private Integer resultApprovingCount;
    @Schema(description = "已完成数量") private Integer completedCount;
    @Schema(description = "目标总数") private Integer objectiveCount;
    @Schema(description = "活跃目标数") private Integer activeObjectiveCount;
    @Schema(description = "已完成目标数") private Integer completedObjectiveCount;
}

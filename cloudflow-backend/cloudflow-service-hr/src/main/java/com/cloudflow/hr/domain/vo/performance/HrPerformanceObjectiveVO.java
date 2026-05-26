package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * HR 绩效目标 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrPerformanceObjectiveVO", description = "HR 绩效目标 VO")
public class HrPerformanceObjectiveVO {
    @Schema(description = "目标 ID") private Long id;
    @Schema(description = "目标编号") private String objectiveNo;
    @Schema(description = "考核周期名称") private String cycleName;
    @Schema(description = "周期开始日期") private LocalDate cycleStartDate;
    @Schema(description = "周期结束日期") private LocalDate cycleEndDate;
    @Schema(description = "目标名称") private String objectiveName;
    @Schema(description = "目标所属员工 ID") private Long ownerEmployeeId;
    @Schema(description = "指标配置（JSON）") private JsonNode metricConfig;
    @Schema(description = "状态") private String status;
    @Schema(description = "计划流程实例 ID") private String planProcessInstanceId;
    @Schema(description = "结果流程实例 ID") private String resultProcessInstanceId;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import com.fasterxml.jackson.databind.JsonNode;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * HR 绩效目标树 VO（目标字段 + 调薪记录列表）。
 */
@Data
@Schema(name = "HrPerformanceObjectiveTreeVO", description = "HR 绩效目标树 VO")
public class HrPerformanceObjectiveTreeVO {
    @Schema(description = "目标 ID") private Long id;
    @Schema(description = "目标编号") private String objectiveNo;
    @Schema(description = "考核周期名称") private String cycleName;
    @Schema(description = "周期开始日期") private LocalDate cycleStartDate;
    @Schema(description = "周期结束日期") private LocalDate cycleEndDate;
    @Schema(description = "目标名称") private String objectiveName;
    @Schema(description = "目标所属员工 ID") private Long ownerEmployeeId;
    @Schema(description = "指标配置（JSON）") private JsonNode metricConfig;
    @Schema(description = "目标总值") private BigDecimal totalTargetAmount;
    @Schema(description = "实际完成值") private BigDecimal actualAmount;
    @Schema(description = "完成率") private BigDecimal completionRate;
    @Schema(description = "评分") private BigDecimal score;
    @Schema(description = "等级") private String grade;
    @Schema(description = "计分封顶") private BigDecimal scoreCap;
    @Schema(description = "考核类型编码列表") private List<String> categoryCodes;
    @Schema(description = "考核类型定义") private List<Map<String, Object>> categoryDefinitions;
    @Schema(description = "指标定义") private List<Map<String, Object>> metrics;
    @Schema(description = "叶子任务数") private Integer leafTaskCount;
    @Schema(description = "部门数") private Integer departmentCount;
    @Schema(description = "绩效分解树") private List<HrPerformanceAssignmentVO> assignments;
    @Schema(description = "状态") private String status;
    @Schema(description = "计划流程实例 ID") private String planProcessInstanceId;
    @Schema(description = "结果流程实例 ID") private String resultProcessInstanceId;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
    @Schema(description = "调薪记录列表") private List<HrPerformanceSalaryAdjustmentVO> salaryAdjustments;
}

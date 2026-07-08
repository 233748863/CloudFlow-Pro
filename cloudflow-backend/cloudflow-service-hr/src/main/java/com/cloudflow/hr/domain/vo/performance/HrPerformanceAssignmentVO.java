package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * HR 绩效分解 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrPerformanceAssignmentVO", description = "HR 绩效分解 VO")
public class HrPerformanceAssignmentVO {
    @Schema(description = "分解 ID") private Long id;
    @Schema(description = "绩效目标 ID") private Long objectiveId;
    @Schema(description = "父分解 ID") private Long parentId;
    @Schema(description = "承接对象类型") private String assigneeType;
    @Schema(description = "承接对象 ID") private Long assigneeId;
    @Schema(description = "承接对象名称") private String assigneeName;
    @Schema(description = "目标值") private BigDecimal targetValue;
    @Schema(description = "实际值") private BigDecimal actualValue;
    @Schema(description = "权重") private BigDecimal weight;
    @Schema(description = "考核类型编码") private String categoryCode;
    @Schema(description = "考核类型名称") private String categoryName;
    @Schema(description = "指标编码") private String metricCode;
    @Schema(description = "指标名称") private String metricName;
    @Schema(description = "指标单位") private String metricUnit;
    @Schema(description = "指标权重") private BigDecimal metricWeight;
    @Schema(description = "指标精度") private Integer metricPrecision;
    @Schema(description = "指标数值类型") private String metricValueType;
    @Schema(description = "目标值（前端展示别名）") private BigDecimal targetAmount;
    @Schema(description = "实际值（前端展示别名）") private BigDecimal actualAmount;
    @Schema(description = "完成率") private BigDecimal completionRate;
    @Schema(description = "评分") private BigDecimal score;
    @Schema(description = "等级") private String grade;
    @Schema(description = "评价总结") private String summary;
    @Schema(description = "配额来源") private String quotaSource;
    @Schema(description = "是否锁定") private Boolean locked;
    @Schema(description = "状态") private String status;
    @Schema(description = "子节点") private List<HrPerformanceAssignmentVO> children;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

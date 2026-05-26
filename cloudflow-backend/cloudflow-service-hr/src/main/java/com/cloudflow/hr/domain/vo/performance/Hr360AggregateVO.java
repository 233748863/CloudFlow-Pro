package com.cloudflow.hr.domain.vo.performance;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.Map;

/**
 * HR 360 评估聚合结果 VO。
 */
@Data
@Schema(name = "Hr360AggregateVO", description = "HR 360 评估聚合结果 VO")
public class Hr360AggregateVO {
    @Schema(description = "绩效结果 ID") private Long resultId;
    @Schema(description = "目标 ID") private Long objectiveId;
    @Schema(description = "被评员工 ID") private Long evaluateeId;
    @Schema(description = "加权得分") private BigDecimal score;
    @Schema(description = "等级") private String grade;
    @Schema(description = "各来源平均分（key=来源, value=均值）") private Map<String, BigDecimal> sourceAvg;
    @Schema(description = "总权重") private BigDecimal totalWeight;
}

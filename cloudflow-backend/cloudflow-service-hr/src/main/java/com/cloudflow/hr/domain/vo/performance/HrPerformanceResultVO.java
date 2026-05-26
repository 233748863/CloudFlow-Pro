package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 绩效结果 VO（剔除 tenantId）。
 */
@Data
@Schema(name = "HrPerformanceResultVO", description = "HR 绩效结果 VO")
public class HrPerformanceResultVO {
    @Schema(description = "结果 ID") private Long id;
    @Schema(description = "目标 ID") private Long objectiveId;
    @Schema(description = "分解 ID") private Long assignmentId;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "得分") private BigDecimal score;
    @Schema(description = "等级") private String grade;
    @Schema(description = "评价总结") private String summary;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

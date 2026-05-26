package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

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
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

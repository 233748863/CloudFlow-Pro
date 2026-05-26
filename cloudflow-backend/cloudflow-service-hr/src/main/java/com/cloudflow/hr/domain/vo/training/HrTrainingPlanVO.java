package com.cloudflow.hr.domain.vo.training;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 培训计划 VO（剔除 deleted/tenantId）。
 */
@Data
@Schema(name = "HrTrainingPlanVO", description = "HR 培训计划 VO")
public class HrTrainingPlanVO {
    @Schema(description = "计划 ID") private Long id;
    @Schema(description = "计划编号") private String planNo;
    @Schema(description = "计划名称") private String planName;
    @Schema(description = "计划类型") private String planType;
    @Schema(description = "年度") private Integer year;
    @Schema(description = "季度") private Integer quarter;
    @Schema(description = "部门 ID") private Long deptId;
    @Schema(description = "负责人 ID") private Long ownerId;
    @Schema(description = "预算") private BigDecimal budget;
    @Schema(description = "状态") private String status;
    @Schema(description = "描述") private String description;
    @Schema(description = "创建人") private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @Schema(description = "更新人") private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

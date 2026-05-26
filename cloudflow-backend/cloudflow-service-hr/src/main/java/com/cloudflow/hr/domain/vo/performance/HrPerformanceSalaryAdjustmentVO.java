package com.cloudflow.hr.domain.vo.performance;

import com.fasterxml.jackson.annotation.JsonFormat;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * HR 绩效调薪 VO（剔除 tenantId；adjustmentAmount 为解密后明文按权限掩码）。
 */
@Data
@Schema(name = "HrPerformanceSalaryAdjustmentVO", description = "HR 绩效调薪 VO")
public class HrPerformanceSalaryAdjustmentVO {
    @Schema(description = "记录 ID") private Long id;
    @Schema(description = "目标 ID") private Long objectiveId;
    @Schema(description = "员工 ID") private Long employeeId;
    @Schema(description = "薪酬变更单 ID") private Long compChangeId;
    @Schema(description = "调薪金额（按权限掩码）") private BigDecimal adjustmentAmount;
    @Schema(description = "调薪原因") private String reason;
    @Schema(description = "状态") private String status;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime createTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss") private LocalDateTime updateTime;
}

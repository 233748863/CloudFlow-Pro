package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class PerformanceSalaryAdjustmentCreateDTO {

    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    private String adjustmentReason;

    @DecimalMin(value = "0.00", message = "绩效调薪最低分不能为负数")
    private BigDecimal minScore;

    @NotBlank(message = "调薪后薪资数据不能为空")
    private String afterSalaryData;

    @NotNull(message = "调薪后总额不能为空")
    @DecimalMin(value = "0.00", message = "调薪后总额不能为负数")
    private BigDecimal afterTotal;

    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;
}

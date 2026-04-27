package com.cloudflow.hr.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@Data
public class PerformanceObjectiveCreateDTO {

    @NotBlank(message = "绩效周期不能为空")
    private String cycleName;

    @NotNull(message = "周期开始日期不能为空")
    private LocalDate cycleStartDate;

    @NotNull(message = "周期结束日期不能为空")
    private LocalDate cycleEndDate;

    @NotBlank(message = "目标名称不能为空")
    private String objectiveName;

    @NotNull(message = "总目标值不能为空")
    @DecimalMin(value = "0.00", message = "总目标值不能为负数")
    private BigDecimal totalTargetAmount;

    private List<String> categoryCodes;

    @Valid
    private List<PerformanceCategoryDefinitionDTO> categoryDefinitions;

    @Valid
    private List<PerformanceMetricDTO> metrics;

    @DecimalMin(value = "100.00", message = "计分封顶不能低于100")
    private BigDecimal scoreCap;

    @Valid
    private List<PerformanceDepartmentAllocationDTO> departmentAssignments;
}

package com.cloudflow.hr.domain.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
public class PerformanceDepartmentAllocationDTO {

    @NotNull(message = "部门ID不能为空")
    private Long deptId;

    private String deptName;

    @NotNull(message = "部门目标值不能为空")
    @DecimalMin(value = "0.00", message = "部门目标值不能为负数")
    private BigDecimal targetAmount;

    private Long ownerEmployeeId;

    @Valid
    private List<PerformanceCategoryAllocationDTO> categories;
}

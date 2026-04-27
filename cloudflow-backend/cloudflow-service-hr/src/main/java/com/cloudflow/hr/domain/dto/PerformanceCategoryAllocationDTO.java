package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class PerformanceCategoryAllocationDTO {

    @NotBlank(message = "考核类型编码不能为空")
    private String categoryCode;

    private String categoryName;

    private String metricCode;

    private String metricName;

    private String metricUnit;

    @DecimalMin(value = "0.01", message = "指标权重必须大于0")
    private BigDecimal metricWeight;

    @NotNull(message = "指标目标值不能为空")
    @DecimalMin(value = "0.00", message = "指标目标值不能为负数")
    private BigDecimal targetAmount;

    private Boolean locked;
}

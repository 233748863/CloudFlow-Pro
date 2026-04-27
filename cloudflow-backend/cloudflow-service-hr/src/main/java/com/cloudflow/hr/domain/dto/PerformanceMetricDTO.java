package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class PerformanceMetricDTO {

    @NotBlank(message = "指标编码不能为空")
    private String metricCode;

    @NotBlank(message = "指标名称不能为空")
    private String metricName;

    @NotBlank(message = "指标单位不能为空")
    private String metricUnit;

    private String valueType;

    @Min(value = 0, message = "指标小数位不能为负数")
    @Max(value = 4, message = "指标小数位最大4位")
    private Integer precision;

    @DecimalMin(value = "0.01", message = "指标权重必须大于0")
    private BigDecimal metricWeight;
}

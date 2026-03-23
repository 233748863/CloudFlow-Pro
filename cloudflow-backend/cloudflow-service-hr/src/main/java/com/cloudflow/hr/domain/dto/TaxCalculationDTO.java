package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 个税计算请求 DTO。
 *
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class TaxCalculationDTO {

    /**
     * 员工 ID。
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 应税收入。
     */
    @NotNull(message = "应税收入不能为空")
    @DecimalMin(value = "0", message = "应税收入不能小于0")
    private BigDecimal taxableIncome;

    /**
     * 计算年度。
     */
    @Min(value = 2000, message = "年份必须在 2000 到 9999 之间")
    @Max(value = 9999, message = "年份必须在 2000 到 9999 之间")
    private Integer year;

    /**
     * 计算月份。
     */
    @Min(value = 1, message = "月份必须在 1 到 12 之间")
    @Max(value = 12, message = "月份必须在 1 到 12 之间")
    private Integer month;
}

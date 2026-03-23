package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 员工五险一金分配DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeInsuranceAssignDTO {

    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;

    /**
     * 方案ID
     */
    @NotNull(message = "方案ID不能为空")
    private Long schemeId;

    /**
     * 缴纳基数
     */
    @NotNull(message = "缴纳基数不能为空")
    @DecimalMin(value = "0.00", message = "缴纳基数不能小于0")
    private BigDecimal base;

    /**
     * 生效日期
     */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;
}

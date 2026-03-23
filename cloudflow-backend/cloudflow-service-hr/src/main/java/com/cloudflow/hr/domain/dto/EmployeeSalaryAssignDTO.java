package com.cloudflow.hr.domain.dto;

import lombok.Data;

import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

/**
 * 员工薪资分配DTO
 */
@Data
public class EmployeeSalaryAssignDTO {
    
    /**
     * 员工ID
     */
    @NotNull(message = "员工ID不能为空")
    private Long employeeId;
    
    /**
     * 薪资结构ID
     */
    @NotNull(message = "薪资结构ID不能为空")
    private Long structureId;
    
    /**
     * 薪资数据（薪资项目ID -> 金额）
     * 格式：{itemId1: 5000.00, itemId2: 1000.00, ...}
     */
    @NotNull(message = "薪资数据不能为空")
    private Map<Long, BigDecimal> salaryData;
    
    /**
     * 生效日期
     */
    @NotNull(message = "生效日期不能为空")
    private LocalDate effectiveDate;
}

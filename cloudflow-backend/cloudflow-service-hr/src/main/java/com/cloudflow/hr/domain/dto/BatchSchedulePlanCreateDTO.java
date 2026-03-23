package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.List;

/**
 * 批量排班计划创建DTO
 * 用于批量创建排班计划
 */
@Data
public class BatchSchedulePlanCreateDTO {
    
    /**
     * 计划名称
     */
    @NotBlank(message = "计划名称不能为空")
    private String planName;
    
    /**
     * 目标类型：EMPLOYEE-员工 DEPT-部门
     */
    @NotBlank(message = "目标类型不能为空")
    private String targetType;
    
    /**
     * 目标ID列表（员工ID列表或部门ID列表）
     */
    @NotEmpty(message = "目标ID列表不能为空")
    private List<Long> targetIds;
    
    /**
     * 班次ID
     */
    @NotNull(message = "班次ID不能为空")
    private Long shiftId;
    
    /**
     * 开始日期
     */
    @NotNull(message = "开始日期不能为空")
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    @NotNull(message = "结束日期不能为空")
    private LocalDate endDate;
}

package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/**
 * 排班计划创建DTO
 * 用于创建单个排班计划
 */
@Data
public class SchedulePlanCreateDTO {
    
    /**
     * 计划名称
     */
    @NotBlank(message = "计划名称不能为空")
    private String planName;
    
    /**
     * 目标类型：EMPLOYEE-员工 POST-岗位 DEPT-部门
     */
    @NotBlank(message = "目标类型不能为空")
    private String targetType;
    
    /**
     * 目标ID（员工ID、岗位ID或部门ID）
     */
    @NotNull(message = "目标ID不能为空")
    private Long targetId;
    
    /**
     * 班次ID
     */
    @NotNull(message = "班次ID不能为空")
    private Long shiftId;
    
    /**
     * 排班日期
     */
    @NotNull(message = "排班日期不能为空")
    private LocalDate scheduleDate;
}

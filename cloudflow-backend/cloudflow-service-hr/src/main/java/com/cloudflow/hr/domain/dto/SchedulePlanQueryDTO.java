package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 排班计划查询DTO
 * 用于查询排班计划列表
 */
@Data
public class SchedulePlanQueryDTO {
    
    /**
     * 目标类型：EMPLOYEE-员工 POST-岗位 DEPT-部门
     */
    private String targetType;
    
    /**
     * 目标ID（员工ID、岗位ID或部门ID）
     */
    private Long targetId;
    
    /**
     * 班次ID
     */
    private Long shiftId;
    
    /**
     * 开始日期
     */
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    private LocalDate endDate;
    
    /**
     * 状态：DRAFT-草稿 PUBLISHED-已发布 CANCELLED-已取消
     */
    private String status;
}

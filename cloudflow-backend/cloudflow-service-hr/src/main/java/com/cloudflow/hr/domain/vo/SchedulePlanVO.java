package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排班计划视图对象
 * 用于返回排班计划信息
 */
@Data
public class SchedulePlanVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 计划名称
     */
    private String planName;
    
    /**
     * 目标类型：EMPLOYEE-员工 DEPT-部门
     */
    private String targetType;
    
    /**
     * 目标ID
     */
    private Long targetId;
    
    /**
     * 目标名称（员工姓名或部门名称）
     */
    private String targetName;
    
    /**
     * 班次ID
     */
    private Long shiftId;
    
    /**
     * 班次名称
     */
    private String shiftName;
    
    /**
     * 班次编码
     */
    private String shiftCode;
    
    /**
     * 排班日期
     */
    private LocalDate scheduleDate;
    
    /**
     * 状态：DRAFT-草稿 PUBLISHED-已发布 CANCELLED-已取消
     */
    private String status;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

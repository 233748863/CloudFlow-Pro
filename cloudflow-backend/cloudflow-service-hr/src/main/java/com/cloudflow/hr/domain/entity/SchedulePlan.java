package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 排班计划实体类
 * 用于记录员工或部门的具体排班安排
 */
@Data
@TableName("hr_schedule_plan")
public class SchedulePlan {
    
    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID（多租户隔离）
     */
    private Long tenantId;
    
    /**
     * 计划名称
     */
    private String planName;
    
    /**
     * 目标类型
     * EMPLOYEE - 员工：为单个员工排班
     * POST - 岗位：为岗位排班
     * DEPT - 部门：为整个部门排班
     */
    private String targetType;
    
    /**
     * 目标ID
     * 当targetType为EMPLOYEE时，存储员工ID
     * 当targetType为DEPT时，存储部门ID
     */
    private Long targetId;
    
    /**
     * 班次ID
     * 关联hr_shift表
     */
    private Long shiftId;
    
    /**
     * 排班日期
     */
    private LocalDate scheduleDate;
    
    /**
     * 状态
     * DRAFT - 草稿：排班计划已创建但未发布
     * PUBLISHED - 已发布：排班计划已发布，员工可见
     * CANCELLED - 已取消：排班计划已取消
     */
    private String status;
    
    /**
     * 创建时间
     */
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
    
    /**
     * 创建人ID
     */
    private Long createBy;
    
    /**
     * 更新人ID
     */
    private Long updateBy;
}

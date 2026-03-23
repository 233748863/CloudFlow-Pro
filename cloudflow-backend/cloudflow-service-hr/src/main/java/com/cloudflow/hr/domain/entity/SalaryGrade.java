package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 薪资等级实体类
 * 用于定义不同职级的薪资范围
 */
@Data
@TableName("hr_salary_grade")
public class SalaryGrade {
    
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
     * 职级ID（关联hr_job_level表）
     */
    private Long levelId;
    
    /**
     * 最低薪资
     */
    private BigDecimal minSalary;
    
    /**
     * 最高薪资
     */
    private BigDecimal maxSalary;
    
    /**
     * 中位薪资
     */
    private BigDecimal midSalary;
    
    /**
     * 币种：CNY-人民币 USD-美元
     */
    private String currency;
    
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
     * 创建者
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新者
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志（0-未删除 1-已删除）
     */
    @TableLogic
    private Boolean deleted;
}

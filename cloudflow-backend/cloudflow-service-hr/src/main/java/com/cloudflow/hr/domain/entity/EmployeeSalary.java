package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工薪资实体类
 * 用于记录员工的薪资结构和薪资数据
 */
@Data
@TableName("hr_employee_salary")
public class EmployeeSalary {
    
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
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 薪资结构ID
     */
    private Long structureId;
    
    /**
     * 薪资数据（JSON格式，存储各项目金额）
     * 格式：{"itemId1": 5000.00, "itemId2": 1000.00, ...}
     */
    private String salaryData;
    
    /**
     * 总薪资
     */
    private BigDecimal totalSalary;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期
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

package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工专项扣除实体类
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
@TableName("hr_employee_tax_deduction")
public class EmployeeTaxDeduction {
    
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
     * 扣除类型
     * CHILD_EDU-子女教育
     * CONTINUING_EDU-继续教育
     * MEDICAL-大病医疗
     * HOUSING_LOAN-住房贷款利息
     * HOUSING_RENT-住房租金
     * ELDERLY_CARE-赡养老人
     */
    private String deductionType;
    
    /**
     * 扣除金额（每月）
     */
    private BigDecimal amount;
    
    /**
     * 开始日期
     */
    private LocalDate startDate;
    
    /**
     * 结束日期
     */
    private LocalDate endDate;
    
    /**
     * 状态：ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;
    
    /**
     * 备注
     */
    private String remark;
    
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
     * 创建人
     */
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    
    /**
     * 更新人
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    
    /**
     * 删除标志：0-未删除 1-已删除
     */
    @TableLogic
    private Integer deleted;
}

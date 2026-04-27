package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 调薪申请实体类
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
@TableName("hr_salary_adjustment")
public class SalaryAdjustment {
    
    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    private Long id;
    
    /**
     * 租户ID
     */
    private Long tenantId;
    
    /**
     * 申请编号
     */
    private String applicationNo;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 调薪类型：PROMOTION-晋升调薪 ANNUAL-年度调薪 PERFORMANCE-绩效调薪 MARKET-市场调薪
     */
    private String adjustmentType;
    
    /**
     * 调薪原因
     */
    private String adjustmentReason;
    
    /**
     * 调薪前薪资数据（JSON）
     */
    private String beforeSalaryData;
    
    /**
     * 调薪后薪资数据（JSON）
     */
    private String afterSalaryData;
    
    /**
     * 调薪前总额
     */
    private BigDecimal beforeTotal;
    
    /**
     * 调薪后总额
     */
    private BigDecimal afterTotal;
    
    /**
     * 调薪金额
     */
    private BigDecimal adjustmentAmount;
    
    /**
     * 调薪比例（百分比）
     */
    private BigDecimal adjustmentRate;
    
    /**
     * 生效日期
     */
    private LocalDate effectiveDate;
    
    /**
     * 流程实例ID
     */
    private String processInstanceId;

    /**
     * 来源类型：PERFORMANCE_OBJECTIVE 等
     */
    private String sourceType;

    /**
     * 来源业务ID
     */
    private Long sourceId;
    
    /**
     * 状态：DRAFT-草稿 APPROVING-审批中 APPROVED-已通过 REJECTED-已拒绝 EFFECTIVE-已生效
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
    private Integer deleted;
}

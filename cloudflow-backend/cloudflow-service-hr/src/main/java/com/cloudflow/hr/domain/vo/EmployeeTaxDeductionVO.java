package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工专项扣除VO
 * 
 * @author CloudFlow
 * @date 2026-03-20
 */
@Data
public class EmployeeTaxDeductionVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 扣除类型
     */
    private String deductionType;
    
    /**
     * 扣除类型名称
     */
    private String deductionTypeName;
    
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
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

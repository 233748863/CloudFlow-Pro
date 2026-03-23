package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工薪资视图对象
 */
@Data
public class EmployeeSalaryVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 员工工号
     */
    private String employeeNo;
    
    /**
     * 员工姓名
     */
    private String employeeName;
    
    /**
     * 薪资结构ID
     */
    private Long structureId;
    
    /**
     * 薪资结构编码
     */
    private String structureCode;
    
    /**
     * 薪资结构名称
     */
    private String structureName;
    
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
     * 状态描述
     */
    private String statusDesc;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

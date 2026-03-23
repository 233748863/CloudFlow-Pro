package com.cloudflow.hr.domain.dto;

import lombok.Data;

import java.time.LocalDate;

/**
 * 调薪申请查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class SalaryAdjustmentQueryDTO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 调薪类型
     */
    private String adjustmentType;
    
    /**
     * 状态
     */
    private String status;
    
    /**
     * 生效日期开始
     */
    private LocalDate effectiveDateStart;
    
    /**
     * 生效日期结束
     */
    private LocalDate effectiveDateEnd;
    
    /**
     * 页码
     */
    private Integer pageNum = 1;
    
    /**
     * 每页大小
     */
    private Integer pageSize = 10;
}

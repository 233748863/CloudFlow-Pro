package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 员工薪资查询DTO
 */
@Data
public class EmployeeSalaryQueryDTO {
    
    /**
     * 员工ID
     */
    private Long employeeId;
    
    /**
     * 薪资结构ID
     */
    private Long structureId;
    
    /**
     * 状态：DRAFT-草稿 ACTIVE-生效中 EXPIRED-已过期
     */
    private String status;
    
    /**
     * 部门ID（用于按部门查询）
     */
    private Long deptId;
}

package com.cloudflow.hr.domain.dto;

import lombok.Data;

/**
 * 员工查询DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeQueryDTO {
    
    /**
     * 工号（模糊查询）
     */
    private String employeeNo;
    
    /**
     * 姓名（模糊查询）
     */
    private String name;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
    /**
     * 职位ID
     */
    private Long positionId;
    
    /**
     * 员工类型：FULL_TIME-全职 PART_TIME-兼职 INTERN-实习生 CONTRACTOR-外包
     */
    private String employeeType;
    
    /**
     * 员工状态：PENDING-待入职 PROBATION-试用期 REGULAR-正式 RESIGNED-已离职
     */
    private String employeeStatus;
}

package com.cloudflow.hr.domain.vo;

import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工VO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeVO {
    
    /**
     * 主键ID
     */
    private Long id;
    
    /**
     * 工号
     */
    private String employeeNo;
    
    /**
     * 姓名
     */
    private String name;
    
    /**
     * 性别：MALE-男 FEMALE-女
     */
    private String gender;
    
    /**
     * 出生日期
     */
    private LocalDate birthDate;
    
    /**
     * 手机号
     */
    private String phone;
    
    /**
     * 邮箱
     */
    private String email;
    
    /**
     * 部门ID
     */
    private Long deptId;
    
    /**
     * 部门名称
     */
    private String deptName;
    
    /**
     * 岗位ID
     */
    private Long postId;
    
    /**
     * 岗位名称
     */
    private String postName;
    
    /**
     * 职位ID
     */
    private Long positionId;
    
    /**
     * 职位名称
     */
    private String positionName;
    
    /**
     * 员工类型：FULL_TIME-全职 PART_TIME-兼职 INTERN-实习生 CONTRACTOR-外包
     */
    private String employeeType;
    
    /**
     * 员工状态：PENDING-待入职 PROBATION-试用期 REGULAR-正式 RESIGNED-已离职
     */
    private String employeeStatus;
    
    /**
     * 入职日期
     */
    private LocalDate hireDate;
    
    /**
     * 转正日期
     */
    private LocalDate regularDate;
    
    /**
     * 离职日期
     */
    private LocalDate resignDate;
    
    /**
     * 用户ID
     */
    private Long userId;
    
    /**
     * 创建时间
     */
    private LocalDateTime createTime;
    
    /**
     * 更新时间
     */
    private LocalDateTime updateTime;
}

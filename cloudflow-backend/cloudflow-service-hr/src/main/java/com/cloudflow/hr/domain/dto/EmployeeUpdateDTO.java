package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Email;
import lombok.Data;

import java.time.LocalDate;

/**
 * 员工更新DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeUpdateDTO {
    
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
    @Email(message = "邮箱格式不正确")
    private String email;
    
    /**
     * 部门ID（关联Auth服务）
     */
    private Long deptId;
    
    /**
     * 岗位ID（关联Auth服务）
     */
    private Long postId;
    
    /**
     * 职位ID（HR服务）
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
     * 关联的系统用户ID（Auth服务sys_user.user_id）
     */
    private Long userId;
}

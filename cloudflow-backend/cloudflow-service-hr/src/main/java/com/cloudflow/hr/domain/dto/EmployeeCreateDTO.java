package com.cloudflow.hr.domain.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;

/**
 * 员工创建DTO
 * 
 * @author CloudFlow
 * @since 2026-03-20
 */
@Data
public class EmployeeCreateDTO {
    
    /**
     * 工号
     */
    @NotBlank(message = "工号不能为空")
    private String employeeNo;
    
    /**
     * 姓名
     */
    @NotBlank(message = "姓名不能为空")
    private String name;
    
    /**
     * 性别：MALE-男 FEMALE-女
     */
    @NotBlank(message = "性别不能为空")
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
    @NotBlank(message = "员工类型不能为空")
    private String employeeType;
    
    /**
     * 员工状态：PENDING-待入职 PROBATION-试用期 REGULAR-正式 RESIGNED-已离职
     */
    @NotBlank(message = "员工状态不能为空")
    private String employeeStatus;
    
    /**
     * 入职日期
     */
    private LocalDate hireDate;
}

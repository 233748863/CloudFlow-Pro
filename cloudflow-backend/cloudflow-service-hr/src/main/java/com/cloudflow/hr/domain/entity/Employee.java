package com.cloudflow.hr.domain.entity;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 员工档案实体类。
 */
@Data
@TableName("hr_employee")
public class Employee {

    @TableId(value = "id", type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private String employeeNo;

    private String name;

    private String gender;

    private LocalDate birthDate;

    private String phone;

    private String email;

    private Long deptId;

    private Long postId;

    private String employeeType;

    private String employeeStatus;

    private LocalDate hireDate;

    private LocalDate regularDate;

    private LocalDate resignDate;

    private Long userId;

    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;
}

package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("hr_employee")
public class HrEmployeePayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private String employeeNo;
    private String name;
    private String gender;
    private LocalDate birthDate;

    @EncryptField
    private String phone;

    @EncryptField
    private String email;

    private Long deptId;
    private Long postId;
    private Long positionId;
    private String employeeType;
    private String employeeStatus;
    private LocalDate hireDate;
    private LocalDate regularDate;
    private LocalDate resignDate;
    private Long userId;
    private String createBy;
    private String updateBy;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;

    @TableField(exist = false)
    private String deptName;

    @TableField(exist = false)
    private String postName;

    @TableField(exist = false)
    private String positionName;
}

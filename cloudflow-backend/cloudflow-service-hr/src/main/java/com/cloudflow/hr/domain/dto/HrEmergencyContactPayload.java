package com.cloudflow.hr.domain.dto;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("hr_emergency_contact")
public class HrEmergencyContactPayload {

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;
    private Long employeeId;
    private String contactName;
    private String relationship;

    @EncryptField
    private String phone;

    @EncryptField
    private String address;

    private Integer priority;
    private Integer deleted;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}

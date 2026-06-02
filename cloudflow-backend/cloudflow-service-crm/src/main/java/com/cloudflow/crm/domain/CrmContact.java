package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_contact")
public class CrmContact implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long contactId;
    private Long tenantId;
    private Long customerId;
    private String contactName;
    private String gender;
    @EncryptField
    @Sensitive(type = SensitiveType.PHONE)
    private String mobile;
    private String phone;
    @EncryptField
    @Sensitive(type = SensitiveType.EMAIL)
    private String email;
    private String position;
    private String department;
    private Integer primaryFlag;
    private String wechat;
    private String qq;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate birthday;
    private String remark;
    private String status;
    private Integer deleted;
    @Version
    private Integer version;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

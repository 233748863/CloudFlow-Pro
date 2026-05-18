package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.cloudflow.common.encrypt.annotation.EncryptField;
import com.cloudflow.common.sensitive.annotation.Sensitive;
import com.cloudflow.common.sensitive.enums.SensitiveType;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("crm_customer")
public class CrmCustomer implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long customerId;
    private Long tenantId;
    private String customerCode;
    private String customerName;
    private String customerType;
    private String industry;
    private String levelCode;
    private String source;
    private String customerTags;
    private Long ownerId;
    private String ownerName;
    private Long deptId;
    private String deptName;
    private String phone;
    @EncryptField
    @Sensitive(type = SensitiveType.EMAIL)
    private String email;
    private String website;
    private String province;
    private String city;
    @Sensitive(type = SensitiveType.ADDRESS)
    private String address;
    @EncryptField
    @Sensitive(type = SensitiveType.DEFAULT)
    private String creditCode;
    private String healthLevel;
    private String healthReason;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastFollowUpTime;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime nextFollowUpTime;
    private String poolFlag;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime pooledTime;
    private Long originalOwnerId;
    private String originalOwnerName;
    private String remark;
    private String status;
    private Integer deleted;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

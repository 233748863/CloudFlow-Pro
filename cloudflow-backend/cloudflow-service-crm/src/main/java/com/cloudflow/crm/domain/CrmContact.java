package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("oa_crm_contact")
public class CrmContact implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long contactId;
    private Long tenantId;
    private Long customerId;
    private String contactName;
    private String gender;
    private String mobile;
    private String phone;
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
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

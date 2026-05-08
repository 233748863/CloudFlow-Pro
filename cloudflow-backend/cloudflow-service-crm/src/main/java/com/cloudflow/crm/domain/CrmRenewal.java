package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("oa_crm_renewal")
public class CrmRenewal implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long renewalId;
    private Long tenantId;
    private String instanceId;
    private String renewalNo;
    private Long customerId;
    private String customerName;
    private Long contractId;
    private String contractNo;
    private String renewalName;
    private BigDecimal renewalAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate expectedSignDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate currentExpireDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate nextExpireDate;
    private Long ownerId;
    private String ownerName;
    private String summary;
    private String remark;
    private String status;
    @TableField(exist = false)
    private String riskLevel;
    @TableField(exist = false)
    private String riskReason;
    private String delFlag;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

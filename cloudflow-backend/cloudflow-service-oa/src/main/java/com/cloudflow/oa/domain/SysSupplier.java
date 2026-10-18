package com.cloudflow.oa.domain;

import java.time.LocalDate;

import java.math.BigDecimal;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 供应商主数据。
 */
@Data
@TableName("oa_supplier")
public class SysSupplier implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long supplierId;

    private Long tenantId;

    private String supplierName;

    private String contactName;

    private String contactPhone;

    private String bankName;

    private String bankAccount;

    /** 状态(ACTIVE启用/DISABLED停用) */
    private String status;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;

    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private LocalDateTime updateTime;

    private String supplierCode;

    private String supplierType;

    private Long categoryId;

    private String shortName;

    private String creditCode;

    private String legalPerson;

    private BigDecimal registerCapital;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate registerDate;

    private String businessScope;

    private String address;

    private String province;

    private String city;

    private String contactEmail;

    private String taxNo;

    private BigDecimal taxRate;

    private String paymentTerms;

    private String currency;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate cooperationStartDate;

    private String levelCode;

    private BigDecimal score;

    private String standing;

    private String indicatorColor;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime lastScoreTime;

    private Integer blacklistFlag;

    private String blacklistReason;

    private Long blacklistBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime blacklistTime;

    private Integer preventPurchaseFlag;

    private Integer preventRfqFlag;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate qualificationExpireDate;

    private String instanceId;

    private Integer bypassFlag;

    private String bypassReason;

    private Long bypassBy;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate bypassExpireDate;
}

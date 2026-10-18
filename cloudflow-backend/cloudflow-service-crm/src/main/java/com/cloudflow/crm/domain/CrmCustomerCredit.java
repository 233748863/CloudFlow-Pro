package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

@Data
@TableName("crm_customer_credit")
public class CrmCustomerCredit implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long creditId;
    private Long tenantId;
    private Long customerId;
    private BigDecimal creditLimit;
    private BigDecimal overdueThreshold;
    private String currency;
    private Integer bypassFlag;
    private String bypassReason;
    private Long bypassBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime bypassTime;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate bypassExpireDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate effectiveStart;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate effectiveEnd;
    private String status;
    private String remark;
    private String instanceId;
    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(fill = FieldFill.INSERT)
    private String createBy;
    @TableField(fill = FieldFill.INSERT)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private String updateBy;
    @TableField(fill = FieldFill.INSERT_UPDATE)
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}


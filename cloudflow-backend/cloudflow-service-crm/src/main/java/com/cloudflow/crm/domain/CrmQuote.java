package com.cloudflow.crm.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.Version;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName("crm_quote")
public class CrmQuote implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long quoteId;
    private Long tenantId;
    private String instanceId;
    private String quoteNo;
    private Long customerId;
    private String customerName;
    private Long opportunityId;
    private String opportunityName;
    private String quoteName;
    private BigDecimal totalAmount;
    private BigDecimal taxAmount;
    private String currency;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate validUntil;
    private Long ownerId;
    private String ownerName;
    private Long contractId;
    private String contractNo;
    private String attachmentUrl;
    private String remark;
    @TableField(exist = false)
    private List<CrmQuoteLine> quoteLines;
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

package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
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
@TableName("oa_invoice")
public class OaInvoice implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long invoiceId;
    private Long tenantId;
    private String invoiceDirection;
    private String thirdPartySystem;
    private String externalBillNo;
    private String externalLinkUrl;
    private String invoiceCode;
    private String invoiceNo;
    private String invoiceType;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate invoiceDate;
    private BigDecimal grossAmount;
    private BigDecimal taxAmount;
    private String sellerName;
    private String buyerName;
    private String imageUrl;
    private Long customerId;
    private String customerName;
    private Long contractId;
    private String contractNo;
    private Long expenseClaimId;
    private Long paymentRequestId;
    private Long receivableId;
    private String status;
    private String remark;
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

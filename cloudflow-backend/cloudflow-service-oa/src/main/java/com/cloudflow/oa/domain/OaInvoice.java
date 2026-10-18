package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableField;
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

    @com.fasterxml.jackson.annotation.JsonSetter("portalPublicVersion")
    @com.fasterxml.jackson.annotation.JsonAlias("portal_public_version")
    public void rejectPortalPublicVersion(com.fasterxml.jackson.databind.JsonNode value) { rejectPublication(); }

    @com.fasterxml.jackson.annotation.JsonSetter("portalPublishedBy")
    @com.fasterxml.jackson.annotation.JsonAlias("portal_published_by")
    public void rejectPortalPublishedBy(com.fasterxml.jackson.databind.JsonNode value) { rejectPublication(); }

    @com.fasterxml.jackson.annotation.JsonSetter("portalPublishedTime")
    @com.fasterxml.jackson.annotation.JsonAlias("portal_published_time")
    public void rejectPortalPublishedTime(com.fasterxml.jackson.databind.JsonNode value) { rejectPublication(); }

    @com.fasterxml.jackson.annotation.JsonSetter("portalFileIds")
    @com.fasterxml.jackson.annotation.JsonAlias("portal_file_ids")
    public void rejectPortalFileIds(com.fasterxml.jackson.databind.JsonNode value) { rejectPublication(); }

    private static void rejectPublication() {
        throw new com.cloudflow.common.core.exception.ServiceException("请在财务公开确认入口办理公开或撤回", 400);
    }

    @TableId(type = IdType.AUTO)
    private Long invoiceId;
    private Long tenantId;
    private String invoiceDirection;
    private String thirdPartySystem;
    private String externalBillNo;
    private String externalLinkUrl;
    private String invoiceCode;
    private String invoiceNo;
    @TableField(exist = false)
    @com.fasterxml.jackson.annotation.JsonIgnore
    private String keyword;
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
    @TableField(exist = false)
    private BigDecimal receivedAmount;
    @TableField(exist = false)
    private BigDecimal outstandingAmount;
    @TableField(exist = false)
    private BigDecimal pendingReceivedAmount;
    @TableField(exist = false)
    private String currency;
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

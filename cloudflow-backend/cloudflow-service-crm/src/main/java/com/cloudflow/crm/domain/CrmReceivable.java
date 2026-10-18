package com.cloudflow.crm.domain;

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
@TableName("crm_receivable")
public class CrmReceivable implements Serializable {
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
    private Long receivableId;
    private Long tenantId;
    private Long customerId;
    private String customerName;
    private Long contractId;
    private String contractNo;
    private String receivableNo;
    private String receivableName;
    private BigDecimal plannedAmount;
    private BigDecimal receivedAmount;
    private BigDecimal outstandingAmount;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate dueDate;
    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate receivedDate;
    private String invoiceStatus;
    private Long invoiceId;
    private Long ownerId;
    private String ownerName;
    private String remark;
    private String status;
    private Integer deleted;
    @Version
    private Integer version;
    @TableField(exist = false)
    private Boolean bindingLocked;
    private String createBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime createTime;
    private String updateBy;
    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime updateTime;
}

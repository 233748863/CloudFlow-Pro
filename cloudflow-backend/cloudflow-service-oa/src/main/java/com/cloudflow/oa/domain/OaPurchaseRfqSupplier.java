package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.*;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;
import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Data
@TableName("oa_purchase_rfq_supplier")
public class OaPurchaseRfqSupplier implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long rfqSupplierId;

    private Long tenantId;

    private Long rfqId;

    private Long supplierId;

    private String supplierName;

    private String contactName;

    private String contactEmail;

    private String contactPhone;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime inviteTime;

    private String inviteChannel;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String inviteDeliveryStatus;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long inviteMessageRecordId;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDateTime inviteSentTime;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDateTime respondTime;

    private String quoteStatus;

    private String declineReason;

    private String remark;

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

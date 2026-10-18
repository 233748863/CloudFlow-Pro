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
@TableName("oa_purchase_rfq")
public class OaPurchaseRfq implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long rfqId;

    private Long tenantId;

    private String rfqNo;

    private String title;

    private Long purchaseRequestId;

    private Long deptId;

    private String deptName;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Long projectId;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String projectName;

    private Long ownerId;

    private String ownerName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate quoteDeadline;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate expectedDeliveryDate;

    private String deliveryAddress;

    private String paymentTerms;

    private String termsContent;

    private Integer invitedCount;

    private Integer respondedCount;

    private String status;

    private Long awardedSupplierId;

    private String awardedSupplierName;

    private Long awardedQuotationId;

    private BigDecimal awardedAmount;

    private String awardReason;

    private Long awardBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime awardTime;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String instanceId;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String attachmentUrl;

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

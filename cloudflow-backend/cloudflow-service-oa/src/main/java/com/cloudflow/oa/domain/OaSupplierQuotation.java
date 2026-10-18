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
@TableName("oa_supplier_quotation")
public class OaSupplierQuotation implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long quotationId;

    private Long tenantId;

    private String quotationNo;

    private Long rfqId;

    private Long supplierId;

    private String supplierName;

    @JsonFormat(pattern = "yyyy-MM-dd")
    private LocalDate quoteDate;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate validUntil;

    private BigDecimal totalAmount;

    private BigDecimal taxAmount;

    private String currency;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String paymentTerms;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer deliveryDays;

    @JsonFormat(pattern = "yyyy-MM-dd")
    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private LocalDate deliveryDate;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer warrantyMonths;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String attachmentUrl;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;

    private String status;

    private Long entryBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime entryTime;

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

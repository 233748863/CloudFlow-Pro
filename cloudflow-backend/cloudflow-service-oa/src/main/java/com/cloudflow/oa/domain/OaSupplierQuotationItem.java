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
@TableName("oa_supplier_quotation_item")
public class OaSupplierQuotationItem implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long itemId;

    private Long tenantId;

    private Long quotationId;

    private Long rfqItemId;

    private Integer sortNo;

    private String itemName;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String spec;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String unit;

    private Integer quantity;

    private BigDecimal unitPrice;

    private BigDecimal discountRate;

    private BigDecimal taxRate;

    private BigDecimal lineAmount;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String brand;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String model;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private Integer deliveryDays;

    @TableField(updateStrategy = FieldStrategy.ALWAYS)
    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private Integer deleted;

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

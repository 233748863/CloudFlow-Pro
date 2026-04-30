package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 行政采购申请明细。
 */
@Data
@TableName("biz_purchase_item")
public class BizPurchaseItem implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long purchaseId;

    private Long consumableId;

    private String consumableName;

    private String model;

    private String unit;

    private Integer quantity;

    private BigDecimal unitPrice;

    private BigDecimal amount;

    private Integer receivedQuantity;
}

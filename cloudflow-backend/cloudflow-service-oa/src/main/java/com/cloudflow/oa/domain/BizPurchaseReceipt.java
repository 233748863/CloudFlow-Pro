package com.cloudflow.oa.domain;

import com.baomidou.mybatisplus.annotation.FieldFill;
import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.fasterxml.jackson.annotation.JsonFormat;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 行政采购到货入库记录。
 */
@Data
@TableName("biz_purchase_receipt")
public class BizPurchaseReceipt implements Serializable {
    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;

    private Long tenantId;

    private Long purchaseId;

    private Long itemId;

    private Long consumableId;

    private String consumableName;

    private Integer receivedQuantity;

    private Long operatorId;

    private String operatorName;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    private LocalDateTime receiptTime;

    private String remark;

    @TableField(fill = FieldFill.INSERT)
    private String createBy;

    @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @TableField(fill = FieldFill.INSERT)
    private LocalDateTime createTime;
}

/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.entity;

import com.baomidou.mybatisplus.annotation.*;
import cn.joywon.poco.common.core.util.TenantTable;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.math.BigDecimal;
import java.time.LocalDateTime;

/**
 * 订单商品子表
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@TenantTable
@TableName("order_items")
@EqualsAndHashCode(callSuper = false)
@Schema(description = "订单商品子表")
public class OrderItem {

    /**
     * 主键ID
     */
    @TableId(value = "id", type = IdType.AUTO)
    @Schema(description = "主键ID")
    private Long id;

    /**
     * 订单ID
     */
    @TableField("order_id")
    @Schema(description = "订单ID")
    private Long orderId;

    /**
     * SKU ID
     */
    @TableField("product_sku_id")
    @Schema(description = "SKU ID")
    private Long productSkuId;

    @TableField("product_id")
    @Schema(description = "商品ID")
    private Long productId;

    @TableField("sku_code")
    @Schema(description = "SKU编码")
    private String skuCode;

    /**
     * 商品名称快照
     */
    @TableField("product_name")
    @Schema(description = "商品名称快照")
    private String productName;

    /**
     * 商品图片快照
     */
    @TableField("product_image")
    @Schema(description = "商品图片快照")
    private String productImage;

    /**
     * SKU规格名称快照
     */
    @TableField("sku_name")
    @Schema(description = "SKU规格名称快照")
    private String skuName;

    /**
     * 数量
     */
    @TableField("quantity")
    @Schema(description = "数量")
    private Integer quantity;

    /**
     * SKU单价(元,2位小数)
     */
    @TableField("original_price")
    @Schema(description = "SKU单价(元)")
    private BigDecimal originalPrice;

    /**
     * SKU市场价/原价(元,2位小数)
     */
    @TableField(exist = false)
    @Schema(description = "SKU市场价(元)")
    private BigDecimal marketPrice;

    /**
     * 分摊优惠(元,2位小数)
     */
    @TableField("apportioned_discount")
    @Schema(description = "分摊优惠(元)")
    private BigDecimal apportionedDiscount;

    /**
     * 实付金额(元,2位小数)
     */
    @TableField("final_price")
    @Schema(description = "实付金额(元)")
    private BigDecimal finalPrice;

    /**
     * 创建人ID
     */
    @TableField(value = "created_by", fill = FieldFill.INSERT)
    @Schema(description = "创建人ID")
    private Long createdBy;

    /**
     * 创建时间
     */
    @TableField(value = "created_time", fill = FieldFill.INSERT)
    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    /**
     * 修改人ID
     */
    @TableField(value = "updated_by", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改人ID")
    private Long updatedBy;

    /**
     * 修改时间
     */
    @TableField(value = "updated_time", fill = FieldFill.INSERT_UPDATE)
    @Schema(description = "修改时间")
    private LocalDateTime updatedTime;

    /**
     * 是否已删除(软删除)
     */
    @TableLogic
    @TableField("is_deleted")
    @Schema(description = "是否已删除")
    private Integer isDeleted;

    /**
     * 删除时间(软删除)
     */
    @TableField("deleted_time")
    @Schema(description = "删除时间")
    private LocalDateTime deletedTime;

    /**
     * 所属租户
     */
    @Schema(description = "所属租户", hidden = true)
    private Long tenantId;
}

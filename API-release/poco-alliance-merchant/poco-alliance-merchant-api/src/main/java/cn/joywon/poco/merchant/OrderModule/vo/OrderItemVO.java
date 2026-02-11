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

package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 订单商品VO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单商品VO")
public class OrderItemVO {

    @Schema(description = "订单ID")
    private Long orderId;

    /**
     * 订单商品ID
     */
    @Schema(description = "订单商品ID")
    private Long id;

    /**
     * SKU ID
     */
    @Schema(description = "SKU ID")
    private Long productSkuId;

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "SKU编码")
    private String skuCode;

    /**
     * 商品名称
     */
    @Schema(description = "商品名称")
    private String productName;

    /**
     * SKU规格
     */
    @Schema(description = "SKU规格")
    private String skuSpec;

    /**
     * 商品图片
     */
    @Schema(description = "商品图片")
    private String productImage;

    /**
     * 数量
     */
    @Schema(description = "数量")
    private Integer quantity;

    /**
     * SKU单价
     */
    @Schema(description = "SKU单价(元)")
    private BigDecimal price;

    /**
     * SKU市场价
     */
    @Schema(description = "SKU市场价(元)")
    private BigDecimal originalPrice;

    /**
     * 分摊优惠
     */
    @Schema(description = "分摊优惠(元)")
    private BigDecimal discountAmount;

    /**
     * 实付金额
     */
    @Schema(description = "实付金额(元)")
    private BigDecimal payAmount;
}

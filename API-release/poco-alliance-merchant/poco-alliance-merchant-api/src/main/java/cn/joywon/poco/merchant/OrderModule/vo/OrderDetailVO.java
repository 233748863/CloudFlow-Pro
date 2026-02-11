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
 * contributors may be used to endorse or promote products derived from this
 * software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 订单详情VO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单详情VO")
public class OrderDetailVO {

    /**
     * 订单ID
     */
    @Schema(description = "订单ID")
    private Long id;

    /**
     * 订单号
     */
    @Schema(description = "订单号")
    private String orderNo;

    /**
     * 用户ID
     */
    @Schema(description = "用户ID")
    private Long userId;

    /**
     * 门店ID
     */
    @Schema(description = "门店ID")
    private Long storeId;

    /**
     * 门店名称
     */
    @Schema(description = "门店名称")
    private String storeName;

    /**
     * 订单状态
     */
    @Schema(description = "订单状态：PENDING_PAYMENT-待支付，PAID-已支付，PENDING_VERIFICATION-待核销，COMPLETED-已完成，CANCELLED-已取消，REFUNDING-退款中，REFUNDED-已退款")
    private String status;

    /**
     * 订单状态描述
     */
    @Schema(description = "订单状态描述")
    private String statusDesc;

    /**
     * 订单总金额
     */
    @Schema(description = "订单总金额(元)")
    private BigDecimal orderAmount;

    /**
     * 优惠金额
     */
    @Schema(description = "优惠金额(元)")
    private BigDecimal discountAmount;

    /**
     * 实付金额
     */
    @Schema(description = "实付金额(元)")
    private BigDecimal payAmount;

    /**
     * 支付方式
     */
    @Schema(description = "支付方式：1-微信支付")
    private Integer payMethod;

    /**
     * 支付方式描述
     */
    @Schema(description = "支付方式描述")
    private String payMethodDesc;

    /**
     * 支付时间
     */
    @Schema(description = "支付时间")
    private LocalDateTime payTime;

    /**
     * 支付流水号（第三方支付单号）
     */
    @Schema(description = "支付流水号")
    private String tradeNo;

    /**
     * 核销码
     */
    @Schema(description = "核销码")
    private String verifyCode;

    /**
     * 核销时间
     */
    @Schema(description = "核销时间")
    private LocalDateTime verifyTime;

    /**
     * 订单备注
     */
    @Schema(description = "订单备注")
    private String remark;

    /**
     * 履约模式
     */
    @Schema(description = "履约模式：IN_STORE-到店核销，LOCAL_DELIVERY-本地配送")
    private String fulfillmentMode;

    /**
     * 履约模式描述
     */
    @Schema(description = "履约模式描述")
    private String fulfillmentModeDesc;

    /**
     * 订单商品列表
     */
    @Schema(description = "订单商品列表")
    private List<OrderItemVO> items;

    /**
     * 收货地址（本地配送）
     */
    @Schema(description = "收货地址（本地配送）")
    private OrderAddressSnapshotVO deliveryAddress;

    /**
     * 最新配送记录（本地配送）
     */
    @Schema(description = "最新配送记录（本地配送）")
    private OrderDeliveryRecordVO deliveryRecord;

    /**
     * 创建时间
     */
    @Schema(description = "创建时间")
    private LocalDateTime createTime;

    /**
     * 修改时间
     */
    @Schema(description = "修改时间")
    private LocalDateTime updateTime;
}
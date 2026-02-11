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

package cn.joywon.poco.merchant.OrderModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 订单查询DTO - 支持多条件查询订单详情
 *
 * @author poco
 * @date 2025-01-29
 */
@Data
@Schema(description = "订单查询DTO")
public class OrderQueryDTO {

    /**
     * 订单ID
     */
    @Schema(description = "订单ID")
    private Long orderId;

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
     * 商家ID
     */
    @Schema(description = "商家ID")
    private Long merchantId;

    /**
     * 订单状态
     */
    @Schema(description = "订单状态：PENDING_PAYMENT-待支付，PAID-已支付，PENDING_VERIFICATION-待核销，COMPLETED-已完成，CANCELLED-已取消，REFUNDING-退款中，REFUNDED-已退款")
    private String status;

    /**
     * 支付方式
     */
    @Schema(description = "支付方式：WECHAT_PAY-微信支付")
    private String paymentMethod;

    /**
     * 支付流水号（第三方支付单号）
     */
    @Schema(description = "支付流水号")
    private String tradeNo;

    /**
     * 核销码
     */
    @Schema(description = "核销码")
    private String verificationCode;

    /**
     * 支付批次号
     */
    @Schema(description = "支付批次号（用于合并支付）")
    private String payBatchNo;

    /**
     * 履约模式
     */
    @Schema(description = "履约模式：IN_STORE-到店核销，LOCAL_DELIVERY-本地配送")
    private String fulfillmentMode;

    /**
     * 优惠券ID
     */
    @Schema(description = "优惠券ID")
    private Long couponId;

    /**
     * 支付开始时间
     */
    @Schema(description = "支付开始时间")
    private LocalDateTime paymentTimeStart;

    /**
     * 支付结束时间
     */
    @Schema(description = "支付结束时间")
    private LocalDateTime paymentTimeEnd;

    /**
     * 创建开始时间
     */
    @Schema(description = "创建开始时间")
    private LocalDateTime createdTimeStart;

    /**
     * 创建结束时间
     */
    @Schema(description = "创建结束时间")
    private LocalDateTime createdTimeEnd;
}

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

/**
 * 订单支付结果VO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单支付结果VO")
public class OrderPayResultVO {

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
     * 支付状态
     */
    @Schema(description = "支付状态：INIT-初始化，PAYING-支付中，SUCCESS-支付成功，FAIL-支付失败")
    private String payStatus;

    /**
     * 支付状态描述
     */
    @Schema(description = "支付状态描述")
    private String payStatusDesc;

    /**
     * 第三方支付单号
     */
    @Schema(description = "第三方支付单号")
    private String thirdPayNo;

    /**
     * 支付二维码（微信支付时返回）
     */
    @Schema(description = "支付二维码")
    private String payQrCode;

    /**
     * 支付链接（H5支付时返回）
     */
    @Schema(description = "支付链接")
    private String payUrl;
}
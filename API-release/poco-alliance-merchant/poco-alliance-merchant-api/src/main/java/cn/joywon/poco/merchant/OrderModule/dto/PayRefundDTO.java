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

import java.math.BigDecimal;

/**
 * 支付退款DTO
 *
 * @author poco
 * @date 2025-11-23
 */
@Data
@Schema(description = "支付退款DTO")
public class PayRefundDTO {

    /**
     * 订单号
     */
    @Schema(description = "订单号")
    private String orderNo;

    /**
     * 退款单号
     */
    @Schema(description = "退款单号")
    private String refundNo;

    /**
     * 退款金额
     */
    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    /**
     * 退款原因
     */
    @Schema(description = "退款原因")
    private String refundReason;
}

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
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/**
 * 订单退款申请DTO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单退款申请DTO")
public class OrderRefundApplyDTO {

    /**
     * 订单ID
     */
    @NotNull(message = "订单ID不能为空")
    @Schema(description = "订单ID", required = true)
    private Long orderId;

    /**
     * 退款类型
     */
    @NotNull(message = "退款类型不能为空")
    @Schema(description = "退款类型：1-全额退款，2-部分退款", required = true)
    private Integer refundType;

    /**
     * 退款金额
     */
    @NotNull(message = "退款金额不能为空")
    @Positive(message = "退款金额必须大于0")
    @Schema(description = "退款金额(元)", required = true)
    private BigDecimal refundAmount;

    /**
     * 退款原因
     */
    @NotNull(message = "退款原因不能为空")
    @Schema(description = "退款原因", required = true)
    private String refundReason;

    /**
     * 退款商品列表（部分退款时必填）
     */
    @Valid
    @Schema(description = "退款商品列表")
    private List<OrderRefundItemDTO> refundItems;
}
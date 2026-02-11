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
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;
import lombok.Data;

/**
 * 购物车下单DTO（重构后）
 *
 * <p>重构说明： 
 * <p>1. 新增 merchantOrders 字段，前端按商家整理好订单数据 
 * <p>2. 新增 platformCouponId 字段，全局只能使用1张平台券 
 * <p>3. 每个商家可以独立配置履约方式和收货地址（在 MerchantOrderItem 中） 
 * <p>4. 简化优惠券逻辑，每个商家只能使用1张商家券
 *
 * @author poco
 * @date 2025-11-29
 */
@Data
@Schema(description = "购物车下单DTO")
public class OrderCreateFromCartDTO {

  /** 商家订单列表（前端已按商家整理好） 每个商家订单项包含商家ID、商品列表、可选的商家券ID、履约方式和收货地址 */
  @NotEmpty(message = "商家订单列表不能为空")
  @Schema(description = "商家订单列表", required = true)
  private List<MerchantOrderItem> merchantOrders;

  /** 平台优惠券ID（可选） 全局只能使用1张平台券，基于所有商家的折后价总和计算优惠 */
  @Schema(description = "平台优惠券ID（可选，全局只能使用1张）")
  private Long platformCouponId;

  /** 支付方式 */
  @NotNull(message = "支付方式不能为空")
  @Schema(description = "支付方式：1-微信支付", required = true)
  private Integer payMethod;

  /** 订单备注 */
  @Schema(description = "订单备注")
  private String remark;

  /** 幂等性键（必填） 用于防止重复提交，确保订单创建的幂等性 */
  @NotBlank(message = "幂等性键不能为空")
  @Schema(description = "幂等性键", required = true)
  private String idempotencyKey;
}

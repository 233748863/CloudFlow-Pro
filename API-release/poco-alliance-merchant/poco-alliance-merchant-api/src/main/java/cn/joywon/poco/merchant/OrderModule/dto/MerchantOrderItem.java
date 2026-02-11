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
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;
import lombok.Data;

/**
 * 商家订单项DTO
 *
 * <p>用于购物车下单时，前端按商家整理好的订单数据。 每个商家订单项包含该商家的商品列表、可选的商家优惠券、履约方式和收货地址信息。
 *
 * @author poco
 * @date 2025-01-20
 */
@Data
@Schema(description = "商家订单项")
public class MerchantOrderItem {

  /** 商家ID */
  @NotNull(message = "商家ID不能为空")
  @Schema(description = "商家ID", required = true)
  private Long merchantId;

  /** 商品列表 包含该商家的所有商品项，每个商品项包含SKU ID和数量 */
  @NotEmpty(message = "商品列表不能为空")
  @Schema(description = "商品列表", required = true)
  private List<OrderItemCreateDTO> items;

  /** 商家优惠券ID（可选） 每个商家只能使用1张商家优惠券 */
  @Schema(description = "商家优惠券ID（可选，每个商家只能使用1张）")
  private Long merchantCouponId;

  /** 履约方式（可选） 如果不提供，则使用系统默认履约方式（IN_STORE） 可选值：IN_STORE(到店核销) / LOCAL_DELIVERY(本地配送) */
  @Schema(description = "履约方式：IN_STORE(到店核销) / LOCAL_DELIVERY(本地配送)")
  private String fulfillmentMode;

  /** 收货人姓名（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "收货人姓名")
  private String receiverName;

  /** 收货人电话（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "收货人电话")
  private String receiverPhone;

  /** 省份（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "省份")
  private String province;

  /** 城市（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "城市")
  private String city;

  /** 区县（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "区县")
  private String district;

  /** 详细地址（可选） 用于收货地址固化，如果不提供则使用用户默认收货地址 */
  @Schema(description = "详细地址")
  private String detailAddress;

  /** 纬度（可选） 用于定位和配送距离计算 */
  @Schema(description = "纬度")
  private BigDecimal latitude;

  /** 经度（可选） 用于定位和配送距离计算 */
  @Schema(description = "经度")
  private BigDecimal longitude;
}

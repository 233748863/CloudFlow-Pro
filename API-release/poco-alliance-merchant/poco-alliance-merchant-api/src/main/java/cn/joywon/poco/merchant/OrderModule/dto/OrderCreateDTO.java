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
import java.util.List;
import lombok.Data;

/**
 * 订单创建DTO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单创建DTO")
public class OrderCreateDTO {

  /** 门店ID (可选，若不传则必须传merchantId) */
  @Schema(description = "门店ID")
  private Long storeId;

  /** 商家ID (可选，若不传则必须传storeId) */
  @Schema(description = "商家ID")
  private Long merchantId;

  /**
   * 商家优惠券ID (可选)
   * 
   * <p>商家券只能在对应商家的订单中使用
   * <p>与平台券可以同时使用
   */
  @Schema(description = "商家优惠券ID")
  private Long merchantCouponId;

  /**
   * 平台优惠券ID (可选)
   * 
   * <p>平台券可以在所有商家的订单中使用
   * <p>与商家券可以同时使用
   */
  @Schema(description = "平台优惠券ID")
  private Long platformCouponId;

  /** 支付方式 */
  @NotNull(message = "支付方式不能为空")
  @Schema(description = "支付方式：1-微信支付", required = true)
  private Integer payMethod;

  /** 订单备注 */
  @Schema(description = "订单备注")
  private String remark;

  /** 订单商品列表 */
  @NotEmpty(message = "订单商品列表不能为空")
  @Valid
  @Schema(description = "订单商品列表", required = true)
  private List<OrderItemCreateDTO> items;

  /** 幂等性键 */
  @Schema(description = "幂等性键")
  private String idempotencyKey;

  /** 履约模式：IN_STORE(到店核销) / LOCAL_DELIVERY(本地配送) */
  @Schema(description = "履约模式：IN_STORE(到店核销) / LOCAL_DELIVERY(本地配送)", defaultValue = "IN_STORE")
  private String fulfillmentMode = "IN_STORE";

  /** 收货人姓名（用于收货地址固化，可选） */
  @Schema(description = "收货人姓名（用于收货地址固化，可选)")
  private String receiverName;

  /** 收货人联系方式（用于收货地址固化，可选） */
  @Schema(description = "收货人联系方式（用于收货地址固化，可选)")
  private String receiverPhone;

  /** 省/直辖市（用于收货地址固化，可选） */
  @Schema(description = "省/直辖市（用于收货地址固化，可选)")
  private String province;

  /** 市（用于收货地址固化，可选） */
  @Schema(description = "市（用于收货地址固化，可选)")
  private String city;

  /** 区县（用于收货地址固化，可选） */
  @Schema(description = "区县（用于收货地址固化，可选)")
  private String district;

  /** 详细地址（用于收货地址固化，可选） */
  @Schema(description = "详细地址（用于收货地址固化，可选)")
  private String detailAddress;

  /** 纬度（用于定位，可选） */
  @Schema(description = "纬度（用于定位，可选)")
  private java.math.BigDecimal latitude;

  /** 经度（用于定位，可选） */
  @Schema(description = "经度（用于定位，可选)")
  private java.math.BigDecimal longitude;
}

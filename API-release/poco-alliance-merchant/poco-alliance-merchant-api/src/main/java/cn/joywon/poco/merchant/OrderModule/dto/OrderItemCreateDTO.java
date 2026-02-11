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
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 订单商品创建DTO
 *
 * @author poco
 * @date 2025-11-02
 */
@Data
@Schema(description = "订单商品创建DTO")
public class OrderItemCreateDTO {

    /**
     * SKU ID
     */
    @NotNull(message = "SKU ID不能为空")
    @Schema(description = "SKU ID", required = true)
    private Long productSkuId;

    /**
     * 数量
     */
    @NotNull(message = "数量不能为空")
    @Positive(message = "数量必须大于0")
    @Schema(description = "数量", required = true)
    private Integer quantity;

}
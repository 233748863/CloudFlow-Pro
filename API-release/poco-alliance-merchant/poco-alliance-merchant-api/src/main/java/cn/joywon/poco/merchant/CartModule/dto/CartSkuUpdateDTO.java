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

package cn.joywon.poco.merchant.CartModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 购物车SKU更新DTO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "购物车SKU更新DTO")
public class CartSkuUpdateDTO {

    @Schema(description = "购物车项ID", required = true)
    @NotNull(message = "购物车项ID不能为空")
    private Long id;

    @Schema(description = "新SKU ID", required = true)
    @NotNull(message = "新SKU ID不能为空")
    private Long newSkuId;

    @Schema(description = "购买数量（可选，若不传则保持原数量）")
    @Min(value = 1, message = "购买数量必须大于0")
    private Integer quantity;
}

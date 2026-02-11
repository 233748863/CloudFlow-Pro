package cn.joywon.poco.merchant.CartModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 添加购物车DTO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "添加购物车DTO")
public class CartAddDTO {

    @Schema(description = "SKU ID", required = true)
    @NotNull(message = "SKU ID不能为空")
    private Long skuId;

    @Schema(description = "购买数量", required = true)
    @NotNull(message = "购买数量不能为空")
    @Min(value = 1, message = "购买数量必须大于0")
    private Integer quantity;
}

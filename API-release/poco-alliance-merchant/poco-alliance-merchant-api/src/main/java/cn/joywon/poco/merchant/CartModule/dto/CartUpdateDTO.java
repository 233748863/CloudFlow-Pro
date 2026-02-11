package cn.joywon.poco.merchant.CartModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 更新购物车DTO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "更新购物车DTO")
public class CartUpdateDTO {

    @Schema(description = "购物车项ID", required = true)
    @NotNull(message = "购物车项ID不能为空")
    private Long id;

    @Schema(description = "购买数量", required = true)
    @NotNull(message = "购买数量不能为空")
    @Min(value = 1, message = "购买数量必须大于0")
    private Integer quantity;
}

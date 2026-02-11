package cn.joywon.poco.merchant.CartModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

/**
 * 批量删除购物车DTO
 *
 * @author poco
 * @date 2024-12-25
 */
@Data
@Schema(description = "批量删除购物车DTO")
public class CartBatchDeleteDTO {

    @Schema(description = "购物车项ID列表", required = true)
    @NotEmpty(message = "购物车项ID列表不能为空")
    private List<Long> ids;
}

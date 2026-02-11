package cn.joywon.poco.merchant.CartModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * 购物车操作结果VO
 *
 * @author poco
 * @date 2024-12-26
 */
@Data
@Schema(description = "购物车操作结果VO")
public class CartOperationResultVO {

    @Schema(description = "操作是否成功")
    private Boolean success;

    @Schema(description = "购物车商品项总数（SKU种类数）")
    private Integer totalItems;

    @Schema(description = "购物车商品总件数")
    private Integer totalQuantity;
}

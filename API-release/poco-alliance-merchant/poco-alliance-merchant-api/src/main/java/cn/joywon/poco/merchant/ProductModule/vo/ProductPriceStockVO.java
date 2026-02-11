

package cn.joywon.poco.merchant.ProductModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

/**
 * 商品价格库存VO
 *
 * @author poco
 * @date 2024-12-19
 */
@Data
@Schema(description = "商品价格库存VO")
public class ProductPriceStockVO {

    /**
     * 商品ID
     */
    @Schema(description = "商品ID")
    private Long productId;

    /**
     * 最低价格
     */
    @Schema(description = "最低价格")
    private BigDecimal minPrice;

    /**
     * 最高价格
     */
    @Schema(description = "最高价格")
    private BigDecimal maxPrice;

    /**
     * 总库存
     */
    @Schema(description = "总库存")
    private Integer totalStock;

    /**
     * SKU数量
     */
    @Schema(description = "SKU数量")
    private Integer skuCount;
}
package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 商品销售排行VO
 * 用于展示当日商品销售实时排行数据
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "商品销售排行VO")
public class GoodsSalesRankVO implements Serializable {

    @Schema(description = "SKU ID")
    private Long skuId;

    @Schema(description = "商品ID")
    private Long productId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "SKU规格")
    private String skuSpec;

    @Schema(description = "销售数量")
    private Integer salesQuantity;

    @Schema(description = "销售金额")
    private BigDecimal salesAmount;

    @Schema(description = "排名")
    private Integer rank;
}

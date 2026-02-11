package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 商品销售趋势VO
 * 用于展示SKU的销售趋势变化，包含当期数据和上周数据对比
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "商品销售趋势VO")
public class GoodsSalesTrendVO implements Serializable {

    @Schema(description = "SKU ID")
    private Long skuId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "SKU规格")
    private String skuSpec;

    @Schema(description = "分类ID")
    private Long categoryId;

    @Schema(description = "分类名称")
    private String categoryName;

    // ========== 当期数据 ==========

    @Schema(description = "当期销量")
    private Integer currentSalesQty;

    @Schema(description = "当期销售额")
    private BigDecimal currentSalesAmount;

    // ========== 上周数据 ==========

    @Schema(description = "上周销量")
    private Integer lastWeekSalesQty;

    @Schema(description = "上周销售额")
    private BigDecimal lastWeekSalesAmount;

    // ========== 变化率 ==========

    @Schema(description = "销量变化率（百分比）")
    private BigDecimal salesQtyChangeRate;

    @Schema(description = "销售额变化率（百分比）")
    private BigDecimal salesAmountChangeRate;

    @Schema(description = "趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String trend;
}

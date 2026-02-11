package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 商品分类销售汇总VO
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@Schema(description = "商品分类销售汇总VO")
public class CategorySalesSummaryVO {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "商品分类ID")
    private Long categoryId;

    @Schema(description = "分类名称")
    private String categoryName;

    @Schema(description = "销售数量")
    private Integer salesCount;

    @Schema(description = "销售金额")
    private BigDecimal salesAmount;

    @Schema(description = "销售占比(百分比)")
    private BigDecimal salesRatio;

    @Schema(description = "订单数")
    private Integer orderCount;

    @Schema(description = "SKU数量")
    private Integer skuCount;
}

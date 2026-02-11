package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 商品销售日报VO
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "商品销售日报VO")
public class GoodsSalesDailyVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "SKU ID")
    private Long skuId;

    @Schema(description = "商品名称")
    private String productName;

    @Schema(description = "规格")
    private String skuSpec;

    @Schema(description = "销量")
    private Integer salesCount;

    @Schema(description = "销售额")
    private BigDecimal salesAmount;
}

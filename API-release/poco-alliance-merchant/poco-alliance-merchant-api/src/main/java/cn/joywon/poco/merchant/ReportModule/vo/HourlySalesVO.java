package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 时段销售趋势VO
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "时段销售趋势VO")
public class HourlySalesVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "小时(0-23)")
    private Integer hourOfDay;

    @Schema(description = "订单数")
    private Integer orderCount;

    @Schema(description = "销售额")
    private BigDecimal salesAmount;

    @Schema(description = "客单价")
    private BigDecimal avgOrderValue;

    @Schema(description = "是否高峰时段")
    private Boolean isPeak;

    @Schema(description = "是否低谷时段")
    private Boolean isValley;
}

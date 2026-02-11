package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 门店经营趋势VO
 * 包含当日数据、周同比（与上周同日对比）、月同比（与上月同日对比）
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "门店经营趋势VO")
public class StoreTrendVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    // ========== 当日数据 ==========

    @Schema(description = "订单数")
    private Integer orderCount;

    @Schema(description = "GMV（总交易额）")
    private BigDecimal gmv;

    @Schema(description = "客单价")
    private BigDecimal avgOrderValue;

    // ========== 周同比（Week over Week，与上周同日对比） ==========

    @Schema(description = "订单数周同比变化率（百分比）")
    private BigDecimal orderCountWow;

    @Schema(description = "GMV周同比变化率（百分比）")
    private BigDecimal gmvWow;

    @Schema(description = "客单价周同比变化率（百分比）")
    private BigDecimal avgOrderValueWow;

    // ========== 月同比（Month over Month，与上月同日对比） ==========

    @Schema(description = "订单数月同比变化率（百分比）")
    private BigDecimal orderCountMom;

    @Schema(description = "GMV月同比变化率（百分比）")
    private BigDecimal gmvMom;

    @Schema(description = "客单价月同比变化率（百分比）")
    private BigDecimal avgOrderValueMom;

    // ========== 趋势标识 ==========

    @Schema(description = "GMV趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String gmvTrend;
}

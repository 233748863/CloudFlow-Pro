package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

/**
 * 平台运营趋势VO
 * 用于展示平台最近30天的运营趋势数据，包含GMV、订单数、活跃商家/用户等时间序列
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "平台运营趋势VO")
public class PlatformTrendVO implements Serializable {

    // ========== 30天趋势时间序列 ==========

    @Schema(description = "30天GMV趋势")
    private List<DailyTrendPoint> gmvTrend;

    @Schema(description = "30天订单数趋势")
    private List<DailyTrendPoint> ordersTrend;

    @Schema(description = "30天活跃商家趋势")
    private List<DailyTrendPoint> merchantsTrend;

    @Schema(description = "30天活跃用户趋势")
    private List<DailyTrendPoint> usersTrend;

    // ========== 汇总指标 ==========

    @Schema(description = "GMV周环比增长率（百分比）")
    private BigDecimal weekOverWeekGmv;

    @Schema(description = "GMV月环比增长率（百分比）")
    private BigDecimal monthOverMonthGmv;

    @Schema(description = "订单数周环比增长率（百分比）")
    private BigDecimal weekOverWeekOrders;

    @Schema(description = "订单数月环比增长率（百分比）")
    private BigDecimal monthOverMonthOrders;
}

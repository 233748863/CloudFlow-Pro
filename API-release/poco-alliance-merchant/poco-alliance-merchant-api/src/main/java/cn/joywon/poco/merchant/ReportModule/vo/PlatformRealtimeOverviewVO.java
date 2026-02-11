package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 平台实时运营概览VO
 * 用于展示当日实时运营数据，包含与昨日同时段的对比
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "平台实时运营概览VO")
public class PlatformRealtimeOverviewVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "当日GMV")
    private BigDecimal todayGmv;

    @Schema(description = "当日订单数")
    private Integer todayOrders;

    @Schema(description = "当日活跃商家数")
    private Integer todayActiveMerchants;

    @Schema(description = "当日活跃用户数")
    private Integer todayActiveUsers;

    @Schema(description = "GMV变化率（与昨日同时段对比，百分比）")
    private BigDecimal gmvChangeRate;

    @Schema(description = "订单数变化率（与昨日同时段对比，百分比）")
    private BigDecimal ordersChangeRate;

    @Schema(description = "活跃商家变化率（与昨日同时段对比，百分比）")
    private BigDecimal merchantsChangeRate;

    @Schema(description = "活跃用户变化率（与昨日同时段对比，百分比）")
    private BigDecimal usersChangeRate;

    @Schema(description = "GMV趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String gmvTrend;

    @Schema(description = "订单数趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String ordersTrend;

    @Schema(description = "活跃商家趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String merchantsTrend;

    @Schema(description = "活跃用户趋势标识：UP-上升，DOWN-下降，FLAT-持平")
    private String usersTrend;
}

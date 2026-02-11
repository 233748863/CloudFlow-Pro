package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 平台运营概览VO
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "平台运营概览VO")
public class PlatformOverviewVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "总GMV")
    private BigDecimal totalGmv;

    @Schema(description = "总订单数")
    private Integer totalOrders;

    @Schema(description = "活跃商家数")
    private Integer activeMerchants;

    @Schema(description = "活跃用户数")
    private Integer activeUsers;

    @Schema(description = "平台佣金收入")
    private BigDecimal commissionIncome;

    @Schema(description = "分润支出")
    private BigDecimal shareExpenditure;

    @Schema(description = "净收入")
    private BigDecimal netIncome;

    @Schema(description = "GMV同比(%)")
    private BigDecimal gmvYoy;

    @Schema(description = "GMV环比(%)")
    private BigDecimal gmvMom;

    @Schema(description = "订单同比(%)")
    private BigDecimal ordersYoy;

    @Schema(description = "订单环比(%)")
    private BigDecimal ordersMom;
}

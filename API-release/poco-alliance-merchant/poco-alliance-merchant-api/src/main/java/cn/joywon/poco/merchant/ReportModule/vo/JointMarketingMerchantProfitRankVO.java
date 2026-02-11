package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "联合营销商家分润排名返回数据")
public class JointMarketingMerchantProfitRankVO {

    @Schema(description = "排名")
    private Integer rank;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "商家logo")
    private String merchantLogo;

    @Schema(description = "总收益")
    private BigDecimal totalProfit;

    @Schema(description = "支付总额")
    private BigDecimal totalPayout;

    @Schema(description = "接收总额")
    private BigDecimal totalReceive;

    @Schema(description = "交易次数")
    private Integer transactionCount;

    @Schema(description = "成功率")
    private BigDecimal successRate;

    @Schema(description = "平均交易金额")
    private BigDecimal avgAmount;

    @Schema(description = "排名变化: UP-上升, DOWN-下降, STABLE-稳定, NEW-新上榜")
    private String rankChange;

    @Schema(description = "收益增长率")
    private BigDecimal profitGrowthRate;

    @Schema(description = "上月排名")
    private Integer lastMonthRank;

    @Schema(description = "上月收益")
    private BigDecimal lastMonthProfit;

}
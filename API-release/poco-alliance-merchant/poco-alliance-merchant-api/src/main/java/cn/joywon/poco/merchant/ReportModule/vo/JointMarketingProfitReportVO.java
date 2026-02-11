package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "联合营销分润统计报表返回数据")
public class JointMarketingProfitReportVO {

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "计划名称")
    private String planName;

    @Schema(description = "统计周期")
    private String period;

    @Schema(description = "总返利金额")
    private BigDecimal totalRebateAmount;

    @Schema(description = "总结算成功金额")
    private BigDecimal totalSettledAmount;

    @Schema(description = "总结算失败金额")
    private BigDecimal totalFailureAmount;

    @Schema(description = "总记录数")
    private Integer totalRecords;

    @Schema(description = "成功记录数")
    private Integer successRecords;

    @Schema(description = "失败记录数")
    private Integer failureRecords;

    @Schema(description = "成功率")
    private BigDecimal successRate;

    @Schema(description = "商家分润明细")
    private List<MerchantProfitDetail> merchantDetails;

    @Schema(description = "时间维度统计")
    private List<TimeDimensionStat> timeStats;

    @Data
    @Schema(description = "商家分润明细")
    public static class MerchantProfitDetail {
        @Schema(description = "商家ID")
        private Long merchantId;

        @Schema(description = "商家名称")
        private String merchantName;

        @Schema(description = "角色")
        private String role;

        @Schema(description = "支付金额")
        private BigDecimal payoutAmount;

        @Schema(description = "接收金额")
        private BigDecimal receiveAmount;

        @Schema(description = "净收益")
        private BigDecimal netProfit;

        @Schema(description = "记录数")
        private Integer recordCount;
    }

    @Data
    @Schema(description = "时间维度统计")
    public static class TimeDimensionStat {
        @Schema(description = "时间标签")
        private String timeLabel;

        @Schema(description = "返利金额")
        private BigDecimal rebateAmount;

        @Schema(description = "结算金额")
        private BigDecimal settledAmount;

        @Schema(description = "记录数")
        private Integer recordCount;
    }

}
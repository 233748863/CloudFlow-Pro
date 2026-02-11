package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
@Schema(description = "联合营销分润趋势返回数据")
public class JointMarketingProfitTrendVO {

    @Schema(description = "日期")
    private LocalDate date;

    @Schema(description = "返利金额")
    private BigDecimal rebateAmount;

    @Schema(description = "结算金额")
    private BigDecimal settledAmount;

    @Schema(description = "记录数")
    private Integer recordCount;

    @Schema(description = "环比增长率")
    private BigDecimal growthRate;

    @Schema(description = "累计金额")
    private BigDecimal cumulativeAmount;

}
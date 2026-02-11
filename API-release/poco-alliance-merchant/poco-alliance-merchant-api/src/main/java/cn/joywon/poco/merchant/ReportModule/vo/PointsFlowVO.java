package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 积分流水VO
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "积分流水VO")
public class PointsFlowVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "来源类型: CONSUME-消费得; SIGN_IN-签到; ACTIVITY-活动; ADJUST-系统调整")
    private String sourceType;

    @Schema(description = "发放积分")
    private Long earnedPoints;

    @Schema(description = "消耗积分")
    private Long consumedPoints;

    @Schema(description = "过期积分")
    private Long expiredPoints;

    @Schema(description = "净增积分")
    private Long netPoints;

    @Schema(description = "积分抵扣金额")
    private BigDecimal deductionAmount;

    @Schema(description = "等效成本")
    private BigDecimal equivalentCost;
}

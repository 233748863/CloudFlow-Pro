package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 用户消费趋势VO
 * 用于展示用户消费行为的趋势变化，包含新用户、活跃用户、复购率等指标
 *
 * @author poco
 * @date 2025-01-06
 */
@Data
@Schema(description = "用户消费趋势VO")
public class UserConsumptionTrendVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "商家ID")
    private Long merchantId;

    // ========== 当日数据 ==========

    @Schema(description = "新用户数")
    private Integer newUserCount;

    @Schema(description = "活跃用户数")
    private Integer activeUserCount;

    @Schema(description = "复购率（百分比）")
    private BigDecimal repurchaseRate;

    // ========== 周同比（Week over Week，与上周同日对比） ==========

    @Schema(description = "新用户数周同比变化率（百分比）")
    private BigDecimal newUserWow;

    @Schema(description = "活跃用户数周同比变化率（百分比）")
    private BigDecimal activeUserWow;

    @Schema(description = "复购率周同比变化（百分点）")
    private BigDecimal repurchaseRateWow;

    // ========== 月同比（Month over Month，与上月同日对比） ==========

    @Schema(description = "新用户数月同比变化率（百分比）")
    private BigDecimal newUserMom;

    @Schema(description = "活跃用户数月同比变化率（百分比）")
    private BigDecimal activeUserMom;

    @Schema(description = "复购率月同比变化（百分点）")
    private BigDecimal repurchaseRateMom;
}

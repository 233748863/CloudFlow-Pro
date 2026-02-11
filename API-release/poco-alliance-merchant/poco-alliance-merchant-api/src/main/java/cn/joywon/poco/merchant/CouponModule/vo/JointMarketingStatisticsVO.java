package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;

@Data
@Schema(description = "联合营销统计VO")
public class JointMarketingStatisticsVO {

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "累计发放优惠券数")
    private Integer totalIssuedCoupons;

    @Schema(description = "累计核销优惠券数")
    private Integer totalRedeemedCoupons;

    @Schema(description = "累计返利金额")
    private BigDecimal totalRebateAmount;

    @Schema(description = "累计已结算金额")
    private BigDecimal totalSettledAmount;
}

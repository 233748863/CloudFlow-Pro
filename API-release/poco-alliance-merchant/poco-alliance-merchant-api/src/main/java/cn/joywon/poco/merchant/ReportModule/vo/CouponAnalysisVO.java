package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 优惠券使用分析VO
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "优惠券使用分析VO")
public class CouponAnalysisVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "优惠券类型: DISCOUNT-折扣券; AMOUNT-满减券")
    private String couponType;

    @Schema(description = "来源: SELF-自有; JOINT-联合营销")
    private String couponSource;

    @Schema(description = "发放数量")
    private Integer issuedCount;

    @Schema(description = "核销数量")
    private Integer usedCount;

    @Schema(description = "核销率(%)")
    private BigDecimal useRate;

    @Schema(description = "优惠金额")
    private BigDecimal discountAmount;

    @Schema(description = "带动销售额")
    private BigDecimal drivenSales;

    @Schema(description = "ROI(带动销售/优惠金额)")
    private BigDecimal roi;
}

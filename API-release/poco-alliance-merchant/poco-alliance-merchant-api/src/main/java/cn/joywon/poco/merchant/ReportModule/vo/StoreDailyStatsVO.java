package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 门店经营日报VO
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "门店经营日报VO")
public class StoreDailyStatsVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "总订单数")
    private Integer totalOrderCount;

    @Schema(description = "支付订单数")
    private Integer paidOrderCount;

    @Schema(description = "总交易额")
    private BigDecimal totalSalesAmount;

    @Schema(description = "实付金额")
    private BigDecimal realPayAmount;

    @Schema(description = "退款订单数")
    private Integer refundOrderCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "访客数")
    private Integer visitorCount;

    @Schema(description = "浏览量")
    private Integer pageViewCount;

    @Schema(description = "客单价")
    private BigDecimal avgOrderValue;
}

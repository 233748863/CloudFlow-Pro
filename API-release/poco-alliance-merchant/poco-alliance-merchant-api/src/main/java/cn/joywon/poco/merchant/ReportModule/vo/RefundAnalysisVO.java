package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 退款分析报表VO
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@Schema(description = "退款分析报表VO")
public class RefundAnalysisVO {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "门店ID")
    private Long storeId;

    @Schema(description = "门店名称")
    private String storeName;

    @Schema(description = "退款订单数")
    private Integer refundOrderCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "退款率(百分比)")
    private BigDecimal refundRate;

    @Schema(description = "用户主动取消数")
    private Integer userCancelCount;

    @Schema(description = "商家取消数")
    private Integer merchantCancelCount;

    @Schema(description = "超时自动取消数")
    private Integer timeoutCancelCount;

    @Schema(description = "售后退款数")
    private Integer afterSaleRefundCount;

    @Schema(description = "平均退款处理时长(小时)")
    private BigDecimal avgRefundHours;
}

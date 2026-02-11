package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 支付渠道对账报表VO
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@Schema(description = "支付渠道对账报表VO")
public class PayChannelReconcileVO {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "支付渠道")
    private String payChannel;

    @Schema(description = "支付渠道名称")
    private String payChannelName;

    @Schema(description = "交易笔数")
    private Integer transactionCount;

    @Schema(description = "交易金额")
    private BigDecimal transactionAmount;

    @Schema(description = "退款笔数")
    private Integer refundCount;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "净交易金额")
    private BigDecimal netAmount;

    @Schema(description = "渠道手续费")
    private BigDecimal channelFee;

    @Schema(description = "手续费率")
    private BigDecimal feeRate;

    @Schema(description = "对账状态")
    private String reconcileStatus;

    @Schema(description = "差异金额")
    private BigDecimal diffAmount;
}

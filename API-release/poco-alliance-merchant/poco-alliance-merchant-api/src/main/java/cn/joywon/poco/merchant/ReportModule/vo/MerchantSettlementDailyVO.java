package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 商家结算日报VO
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "商家结算日报VO")
public class MerchantSettlementDailyVO implements Serializable {

    @Schema(description = "账单日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "总营业额")
    private BigDecimal totalTurnover;

    @Schema(description = "应结基数")
    private BigDecimal settleBaseAmount;

    @Schema(description = "实结金额")
    private BigDecimal realSettleAmount;

    @Schema(description = "结算状态")
    private String settleStatus;

    @Schema(description = "结算时间")
    private LocalDateTime settledTime;

    @Schema(description = "微信支付收入")
    private BigDecimal wechatPayAmount;

    @Schema(description = "余额支付收入")
    private BigDecimal balancePayAmount;

    @Schema(description = "营销分润收入")
    private BigDecimal marketingIncome;

    @Schema(description = "营销分润支出")
    private BigDecimal marketingExpenditure;

    @Schema(description = "退款金额")
    private BigDecimal refundAmount;

    @Schema(description = "平台佣金")
    private BigDecimal platformCommission;
}

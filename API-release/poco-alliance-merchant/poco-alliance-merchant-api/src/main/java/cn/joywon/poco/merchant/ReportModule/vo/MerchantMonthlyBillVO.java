package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;

/**
 * 商家月度账单VO
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "商家月度账单VO")
public class MerchantMonthlyBillVO implements Serializable {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计月份")
    private String statMonth;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "本月总收入")
    private BigDecimal totalIncome;

    @Schema(description = "本月总支出")
    private BigDecimal totalExpenditure;

    @Schema(description = "本月应结净额")
    private BigDecimal finalSettleAmount;

    @Schema(description = "月结状态")
    private String settleStatus;
}

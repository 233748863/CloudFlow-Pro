package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 商家结算明细VO
 *
 * @author poco
 * @date 2025-12-25
 */
@Data
@Schema(description = "商家结算明细VO")
public class SettlementDetailVO implements Serializable {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "归属日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "业务类型")
    private String bizType;

    @Schema(description = "业务单号")
    private String bizNo;

    @Schema(description = "交易金额")
    private BigDecimal tradeAmount;

    @Schema(description = "费率")
    private BigDecimal commissionRate;

    @Schema(description = "手续费/佣金")
    private BigDecimal commissionAmount;

    @Schema(description = "结算入账金额")
    private BigDecimal settleAmount;

    @Schema(description = "摘要/备注")
    private String remark;
}

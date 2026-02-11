package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 应收账款报表VO
 *
 * @author poco
 * @date 2025-12-27
 */
@Data
@Schema(description = "应收账款报表VO")
public class ReceivableReportVO {

    @Schema(description = "主键ID")
    private Long id;

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "商家名称")
    private String merchantName;

    @Schema(description = "待结算总金额")
    private BigDecimal totalReceivable;

    @Schema(description = "0-7天账龄金额")
    private BigDecimal aging0To7;

    @Schema(description = "8-15天账龄金额")
    private BigDecimal aging8To15;

    @Schema(description = "16-30天账龄金额")
    private BigDecimal aging16To30;

    @Schema(description = "30天以上账龄金额")
    private BigDecimal agingOver30;

    @Schema(description = "待结算订单数")
    private Integer pendingOrderCount;

    @Schema(description = "预计结算日期")
    private LocalDate expectedSettleDate;

    @Schema(description = "上期已结算金额")
    private BigDecimal lastSettledAmount;
}

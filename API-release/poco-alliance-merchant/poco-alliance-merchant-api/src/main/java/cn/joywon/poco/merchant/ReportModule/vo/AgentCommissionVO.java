package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 区域代理佣金VO
 * 仅平台管理员可访问
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "区域代理佣金VO")
public class AgentCommissionVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "代理ID")
    private Long agentId;

    @Schema(description = "代理名称")
    private String agentName;

    @Schema(description = "区域编码")
    private String regionCode;

    @Schema(description = "区域名称")
    private String regionName;

    @Schema(description = "佣金总额")
    private BigDecimal totalCommission;

    @Schema(description = "已结算金额")
    private BigDecimal settledAmount;

    @Schema(description = "待结算金额")
    private BigDecimal pendingAmount;

    @Schema(description = "已提现金额")
    private BigDecimal withdrawnAmount;

    @Schema(description = "订单数量")
    private Integer orderCount;

    @Schema(description = "商家数量")
    private Integer merchantCount;

    @Schema(description = "佣金排名")
    private Integer rankByCommission;

    @Schema(description = "订单排名")
    private Integer rankByOrders;
}

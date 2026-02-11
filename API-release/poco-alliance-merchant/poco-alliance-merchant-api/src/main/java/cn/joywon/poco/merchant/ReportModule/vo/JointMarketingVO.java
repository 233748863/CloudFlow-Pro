package cn.joywon.poco.merchant.ReportModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 联合营销效果VO
 *
 * @author poco
 * @date 2025-01-04
 */
@Data
@Schema(description = "联合营销效果VO")
public class JointMarketingVO implements Serializable {

    @Schema(description = "统计日期")
    private LocalDate statDate;

    @Schema(description = "商家ID")
    private Long merchantId;

    @Schema(description = "角色: INITIATOR-发起方; PARTICIPANT-参与方")
    private String roleType;

    @Schema(description = "活动触发次数")
    private Integer triggerCount;

    @Schema(description = "发券数量")
    private Integer couponIssued;

    @Schema(description = "核销数量")
    private Integer couponUsed;

    @Schema(description = "分润金额")
    private BigDecimal shareAmount;

    @Schema(description = "新客户数(引流)")
    private Integer newCustomerCount;

    @Schema(description = "跨商家订单数")
    private Integer crossMerchantOrders;
}

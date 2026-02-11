package cn.joywon.poco.merchant.CouponModule.vo;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@Schema(description = "联合营销分润配置返回数据")
public class JointMarketingAllocationVO {

    @Schema(description = "ID")
    private Long id;

    @Schema(description = "关联规则ID")
    private Long ruleId;

    @Schema(description = "关联奖励ID")
    private Long rewardId;

    @Schema(description = "分润时机")
    private String triggerPhase;

    @Schema(description = "支付方商家ID")
    private Long payerMerchantId;

    @Schema(description = "支付方商家名称")
    private String payerMerchantName;

    @Schema(description = "接收方商家ID")
    private Long payeeMerchantId;

    @Schema(description = "接收方商家名称")
    private String payeeMerchantName;

    @Schema(description = "接收方角色")
    private String payeeRole;

    @Schema(description = "分润类型")
    private String allocationType;

    @Schema(description = "分润值")
    private BigDecimal allocationValue;

    @Schema(description = "费用说明")
    private String description;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

    @Schema(description = "更新时间")
    private LocalDateTime updatedTime;

}
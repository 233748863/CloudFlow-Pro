package cn.joywon.poco.merchant.CouponModule.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.io.Serializable;
import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "创建联合营销规则DTO")
public class JointMarketingRuleCreateDTO implements Serializable {

    @Schema(description = "计划ID")
    @NotNull(message = "计划ID不能为空")
    private Long planId;

    @Schema(description = "规则名称")
    @NotBlank(message = "规则名称不能为空")
    private String name;

    @Schema(description = "触发商家ID列表")
    @NotNull(message = "触发商家ID不能为空")
    private List<Long> triggerMerchantIds;

    @Schema(description = "触发门店ID列表")
    private List<Long> triggerStoreIds;

    @Schema(description = "触发事件")
    private String triggerEvent = "ORDER_COMPLETE";

    @Schema(description = "最低消费金额")
    private BigDecimal minOrderAmount;

    @Schema(description = "商品范围类型")
    private String productScopeType = "ALL";

    @Schema(description = "指定商品/分类ID列表")
    private List<Long> productScopeIds;

    @Schema(description = "单用户每日触发上限")
    private Integer dailyLimitPerUser = 1;

    @Schema(description = "规则总触发上限")
    private Integer totalLimit = -1;

    @Schema(description = "奖励配置列表")
    @NotNull(message = "奖励配置不能为空")
    private List<RewardDTO> rewards;

    @Data
    public static class RewardDTO {
        @Schema(description = "券提供方商家ID")
        @NotNull(message = "券提供方不能为空")
        private Long providerMerchantId;

        @Schema(description = "奖励内容ID(优惠券模板ID)")
        @NotNull(message = "奖励内容不能为空")
        private Long rewardContentId;

        @Schema(description = "发放数量")
        private Integer rewardQuantity = 1;

        @Schema(description = "库存限制")
        private Integer stockLimit = -1;

        @Schema(description = "分润配置列表")
        private List<AllocationDTO> allocations;
    }

    @Data
    public static class AllocationDTO {
        @Schema(description = "支付方商家ID")
        @NotNull(message = "支付方不能为空")
        private Long payerMerchantId;

        @Schema(description = "接收方商家ID")
        @NotNull(message = "接收方不能为空")
        private Long payeeMerchantId;

        @Schema(description = "接收方角色")
        private String payeeRole = "MERCHANT";

        @Schema(description = "分润类型: FIXED/RATE")
        private String allocationType = "FIXED";

        @Schema(description = "分润值")
        @NotNull(message = "分润值不能为空")
        private BigDecimal allocationValue;

        @Schema(description = "分润时机")
        private String triggerPhase = "COUPON_VERIFY";

        @Schema(description = "费用说明")
        private String description;
    }
}

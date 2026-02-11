package cn.joywon.poco.merchant.CouponModule.vo;

import cn.joywon.poco.merchant.CouponModule.entity.JointMarketingAllocation;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

@Data
@Schema(description = "联合营销规则VO")
public class JointMarketingRuleVO {

    @Schema(description = "规则ID")
    private Long id;

    @Schema(description = "计划ID")
    private Long planId;

    @Schema(description = "规则名称")
    private String name;

    @Schema(description = "触发商家ID列表")
    private List<Long> triggerMerchantIds;

    @Schema(description = "触发门店ID列表")
    private List<Long> triggerStoreIds;

    @Schema(description = "触发事件")
    private String triggerEvent;

    @Schema(description = "最低消费金额")
    private BigDecimal minOrderAmount;

    @Schema(description = "商品范围类型")
    private String productScopeType;

    @Schema(description = "指定商品/分类ID列表")
    private List<Long> productScopeIds;

    @Schema(description = "单用户每日触发上限")
    private Integer dailyLimitPerUser;

    @Schema(description = "规则总触发上限")
    private Integer totalLimit;

    @Schema(description = "奖励配置列表")
    private List<RewardVO> rewards;

    @Data
    public static class RewardVO {
        @Schema(description = "奖励ID")
        private Long id;

        @Schema(description = "券提供方商家ID")
        private Long providerMerchantId;

        @Schema(description = "奖励内容ID")
        private Long rewardContentId;

        @Schema(description = "发放数量")
        private Integer rewardQuantity;

        @Schema(description = "库存限制")
        private Integer stockLimit;

        @Schema(description = "分润配置列表")
        private List<JointMarketingAllocation> allocations;
    }
}

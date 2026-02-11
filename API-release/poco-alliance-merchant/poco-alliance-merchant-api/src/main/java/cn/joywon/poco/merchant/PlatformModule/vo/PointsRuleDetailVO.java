package cn.joywon.poco.merchant.PlatformModule.vo;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "积分规则详情返回数据")
public class PointsRuleDetailVO {

    @Schema(description = "积分规则ID")
    private Long id;

    @Schema(description = "规则名称")
    private String ruleName;

    @Schema(description = "规则描述")
    private String description;

    @Schema(description = "积分规则应用范围: GLOBAL-全平台; MERCHANT-商家; PRODUCT-商品")
    private PointsRuleEnum applyScope;

    @Schema(description = "积分变动类型: ADD-增加; DED-减少")
    private PointsRuleEnum changeType;

    @Schema(description = "积分规则类型: ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; " +
            "MALL_REDEEM-商城兑换; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他")
    private PointsRuleEnum ruleType;

    @Schema(description = "单次变动最大积分(0为不限)")
    private Integer onceMaxPoint;

    @Schema(description = "固定变动积分(简单规则适用, 为0表示复杂规则生效)")
    private Integer fixedPoints;

    @Schema(description = "固定有效期天数(简单规则适用, 为0表示复杂规则生效, -1表示用不过期)")
    private Integer fixed_expire;

    @Schema(description = "额外规则")
    private List<String> extraRules;

    @Schema(description = "规则生效开始时间")
    private LocalDateTime activeTime;

    @Schema(description = "规则生效结束时间")
    private LocalDateTime expireTime;

    @Schema(description = "排序权重")
    private Integer sortWeight;

    @Schema(description = "是否默认规则")
    private Boolean primary;

    @Schema(description = "是否启用")
    private Boolean enable;

    @Schema(description = "创建时间")
    private LocalDateTime createdTime;

}
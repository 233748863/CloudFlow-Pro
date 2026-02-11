package cn.joywon.poco.merchant.PlatformModule.dto;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDateTime;
import java.util.List;

@Data
@Schema(description = "积分规则新增参数")
public class PointsRuleAddDTO {

    @NotBlank(message = "规则名称不能为空")
    @Schema(description = "规则名称")
    private String ruleName;

    @Schema(description = "规则描述")
    private String description;

    @NotBlank(message = "积分规则应用范围不能为空")
    @Pattern(regexp = PointsRuleEnum.POINTS_RULE_APPLY_SCOPE_REGEX_PATTERN, message = "无效的积分规则应用范围")
    @Schema(description = "积分规则应用范围: GLOBAL-全平台; MERCHANT-商家; PRODUCT-商品")
    private String applyScope;

    @NotBlank(message = "积分变动类型不能为空")
    @Pattern(regexp = PointsRuleEnum.POINTS_RULE_CHANGE_TYPE_REGEX_PATTERN, message = "无效的积分变动类型")
    @Schema(description = "积分变动类型: ADD-增加; DED-减少")
    private String changeType;

    @NotBlank(message = "积分规则类型不能为空")
    @Schema(description = "积分规则类型: ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; " +
            "MALL_REDEEM-商城兑换; EVALUATE_EARN-发布评价; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他")
    @Pattern(regexp = PointsRuleEnum.POINTS_RULE_TYPE_REGEX_PATTERN, message = "无效的积分规则类型")
    private String ruleType;

    @Schema(description = "单次变动最大积分(0为不限)")
    private Integer onceMaxPoint;

    @Schema(description = "固定有效期天数(简单规则, 为0表示复杂规则生效, -1表示用不过期)")
    private Integer fixedExpire;

    @Schema(description = "固定变动积分(简单规则, 为0表示复杂规则生效)")
    private Integer fixedPoints;

    @Schema(description = "复杂规则")
    private List<String> extraRules;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "规则生效开始时间, 不传值默认立即生效(yyyy-MM-dd HH:mm:ss)")
    private LocalDateTime activeTime;

    @DateTimeFormat(pattern = "yyyy-MM-dd HH:mm:ss")
    @Schema(description = "规则生效结束时间, 不传值默认永不失效(yyyy-MM-dd HH:mm:ss)")
    private LocalDateTime expireTime;

    @Min(value = 1, message = "排序权重不能小于1")
    @Max(value = 999, message = "排序权重不能大于999")
    @Schema(description = "排序权重(权重与值成反比, 最小为 1)")
    private Integer sortWeight;

    @Schema(description = "是否默认规则")
    private Boolean primary;

    @Schema(description = "规则是否启用")
    private Boolean enable;

}
package cn.joywon.poco.merchant.PlatformModule.entity;

import cn.joywon.poco.merchant.PlatformModule.definition.PointsRuleEnum;
import com.baomidou.mybatisplus.annotation.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Data
@TableName("points_rules")
public class PointsRule {

    /**
     * 主键ID
     */
    @TableId(type = IdType.AUTO)
    private Long id;

    /**
     * 规则名称
     */
    private String ruleName;

    /**
     * 规则描述
     */
    private String description;

    /**
     * 规则应用范围
     * GLOBAL-全平台; MERCHANT-商家; PRODUCT-商品
     */
    private PointsRuleEnum applyScope;

    /**
     * 积分变动类型
     * ADD-增加; DED-减少
     */
    private PointsRuleEnum changeType;

    /**
     * 积分规则类型
     * ORDER_EARN-消费得; INVITE_USER-邀请用户; JOIN_ACTIVITY-活动; ORDER_SPEND-下单抵扣; MALL_REDEEM-商城兑换;
     * EVALUATE_EARN-发布评价; SIGN_IN_REWARD-签到; SYSTEM_ADJUST-系统调整; EXPIRED_DEDUCT-过期扣除; OTHERS-其他
     */
    private PointsRuleEnum ruleType;

    /**
     * 单次变动最大积分(0为不限)
     */
    private Integer onceMaxPoint;

    /**
     * 固定变动积分(简单规则, 为0表示复杂规则生效)
     */
    private Integer fixedPoints;

    /**
     * 固定有效期天数(简单规则, 为0表示复杂规则生效, -1表示用不过期)
     */
    private Integer fixedExpire;

    /**
     * 复杂规则(JSON数组)
     */
    private String extraRules;

    /**
     * 规则生效开始时间
     */
    private LocalDateTime activeTime;

    /**
     * 积分规则生效结束时间
     */
    private LocalDateTime expireTime;

    /**
     * 排序权重(越小越靠前)
     */
    private Integer sortWeight;

    /**
     * 是否默认规则
     */
    @TableField(value = "is_primary")
    private Boolean primary;

    /**
     * 规则是否启用
     */
    @TableField(value = "is_enable")
    private Boolean enable;

    /**
     * 创建人ID
     */
    @TableField(fill = FieldFill.INSERT)
    private Long createdBy;

    /**
     * 创建时间
     */
    private LocalDateTime createdTime;

    /**
     * 更新人ID
     */
    @TableField(fill = FieldFill.INSERT_UPDATE)
    private Long updatedBy;

    /**
     * 更新时间
     */
    private LocalDateTime updatedTime;

    /**
     * 删除标记
     */
    @TableField("is_deleted")
    @TableLogic(value = "false", delval = "true")
    private Boolean deleted;

    /**
     * 删除时间
     */
    private LocalDateTime deletedTime;

    /**
     * 其他增加/减少规则
     */
    @Data
    public static class OthersRule {

        /**
         * 增加/减少积分数
         */
        private Integer points;

        /**
         * 积分有效期(天)
         */
        private Integer expireDays;

        /**
         * 规则描述
         */
        private String description;

    }

    /**
     * 订单积分增加规则
     */
    @Data
    public static class OrderEarnRule {

        /**
         * 获得积分所需最小订单金额
         */
        private BigDecimal minOrderAmount;

        /**
         * 每笔订单可获得最大积分数(-1为不限制)
         */
        private BigDecimal maxEarnPreOrder;

        /**
         * 用户消费金额转化积分倍率
         */
        private BigDecimal customerPointsMultiplier;

        /**
         * 商家消费金额转化积分倍率
         */
        private BigDecimal merchantPointsMultiplier;

        /**
         * 用户积分有效期(天)
         */
        private Integer customerExpireDays;

        /**
         * 商家积分有效期(天)
         */
        private Integer merchantExpireDays;

        /**
         * 规则描述
         */
        private String description;

    }

    /**
     * 签到积分增加规则
     */
    @Data
    public static class SignInRewardRule {

        /**
         * 签到连续天数
         */
        private Integer days;

        /**
         * 签到奖励积分数
         */
        private Integer points;

        /**
         * 积分有效期(天)
         */
        private Integer expireDays;

        /**
         * 规则描述
         */
        private String description;

    }

    /**
     * 评价积分增加规则
     */
    @Data
    public static class CommentEarnRule {

        /**
         * 文字评论积分奖励数
         */
        private Integer textComment;

        /**
         * 图文评论积分奖励数
         */
        private Integer graphicComment;

        /**
         * 积分有效期(天)
         */
        private Integer expireDays;

        /**
         * 规则描述
         */
        private String description;

    }


}
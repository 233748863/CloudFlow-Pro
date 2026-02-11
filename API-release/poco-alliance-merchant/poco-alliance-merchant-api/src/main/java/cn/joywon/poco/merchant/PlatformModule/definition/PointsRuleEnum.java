package cn.joywon.poco.merchant.PlatformModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;
import lombok.ToString;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;

@Getter
@ToString
@AllArgsConstructor
public enum PointsRuleEnum {

    // 积分变动类型
    ADD("ADD", "增加积分"),
    DED("DED", "减少积分"),

    // 积分规则类型
    OTHERS("OTHERS", "其他(增加/减少)"),
    ORDER_EARN("ORDER_EARN", "消费获得(增加)"),
    ORDER_SPEND("ORDER_SPEND", "订单抵扣(减少)"),
    MALL_REDEEM("MALL_REDEEM", "商城兑换(减少)"),
    INVITE_USER("INVITE_USER", "邀请用户(增加)"),
    EXPIRED_DEDUCT("EXPIRED_DEDUCT", "过期扣除(减少)"),
    COMMENT_REWARD("COMMENT_REWARD", "发布评价(增加)"),
    SIGN_IN_REWARD("SIGN_IN_REWARD", "签到奖励(增加)"),
    JOIN_ACTIVITY("JOIN_ACTIVITY", "参与活动(增加/减少)"),
    SYSTEM_ADJUST("SYSTEM_ADJUST", "系统调整(增加/减少)"),

    // 积分规则适用会员等级

    // 规则应用范围
    GLOBAL("GLOBAL", "全平台"),
    PRODUCT("PRODUCT", "商品"),
    MERCHANT("MERCHANT", "商家");

    /**
     * 规则永不过期时间
     */
    public static final LocalDateTime POINTS_RULE_NEVER_EXPIRE = LocalDate.of(9999, Month.DECEMBER, 31).atTime(23, 59, 59);

    /**
     * 积分变动类型正则匹配表达式
     */
    public static final String POINTS_RULE_CHANGE_TYPE_REGEX_PATTERN = "^(ADD|DED)$";

    /**
     * 积分增加类型正则匹配表达式
     */
    public static final String POINTS_RULE_ADD_TYPE_REGEX_PATTERN = "^(ORDER_EARN|INVITE_USER|COMMENT_REWARD|JOIN_ACTIVITY|SIGN_IN_REWARD|SYSTEM_ADJUST|OTHERS)$";

    /**
     * 积分减少类型正则匹配表达式
     */
    public static final String POINTS_RULE_DED_TYPE_REGEX_PATTERN = "^(ORDER_SPEND|MALL_REDEEM|JOIN_ACTIVITY|SYSTEM_ADJUST|EXPIRED_DEDUCT|OTHERS)$";

    /**
     * 积分变动类型正则匹配表达式
     */
    public static final String POINTS_RULE_TYPE_REGEX_PATTERN = "^(ORDER_EARN|INVITE_USER|COMMENT_REWARD|JOIN_ACTIVITY|ORDER_SPEND|MALL_REDEEM|SIGN_IN_REWARD|SYSTEM_ADJUST|EXPIRED_DEDUCT|OTHERS)$";

    /**
     * 积分规则应用范围正则匹配表达式
     */
    public static final String POINTS_RULE_APPLY_SCOPE_REGEX_PATTERN = "^(GLOBAL|PRODUCT|MERCHANT)$";

    @EnumValue
    @JsonValue
    private final String value;
    private final String desc;

}
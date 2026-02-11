package cn.joywon.poco.merchant.PointsModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDateTime;
import java.time.Month;

@Getter
@AllArgsConstructor
public enum PointsEnum {

    // 变动账号类型
    USER("USER", "平台用户"),
    MERCHANT("MERCHANT", "平台商家"),

    // 积分变动类型
    OTHERS("OTHERS", "其他(增加/减少)"),
    ORDER_EARN("ORDER_EARN", "消费获得(增加)"),
    ORDER_SPEND("ORDER_SPEND", "订单抵扣(减少)"),
    MALL_REDEEM("MALL_REDEEM", "商城兑换(减少)"),
    INVITE_USER("INVITE_USER", "邀请用户(增加)"),
    EXPIRED_DEDUCT("EXPIRED_DEDUCT", "过期扣除(减少)"),
    SIGN_IN_REWARD("SIGN_IN_REWARD", "签到奖励(增加)"),
    JOIN_ACTIVITY("JOIN_ACTIVITY", "参与活动(增加/减少)"),
    SYSTEM_ADJUST("SYSTEM_ADJUST", "系统调整(增加/减少)");

    /**
     * 积分永久有效时间
     */
    public static final LocalDateTime POINTS_NO_EXPIRE_DATE = LocalDateTime.of(9999, Month.DECEMBER, 31, 23, 59, 59);

    /**
     * 变动账号类型正则匹配表达式
     */
    public static final String POINTS_OWNER_TYPE_REGEX_PATTERN = "^(USER|MERCHANT)$";

    /**
     * 积分增加类型正则匹配表达式
     */
    public static final String POINTS_CHANGE_ADD_TYPE_REGEX_PATTERN = "^(ORDER_EARN|INVITE_USER|JOIN_ACTIVITY|SIGN_IN_REWARD|SYSTEM_ADJUST|OTHERS)$";

    /**
     * 积分减少类型正则匹配表达式
     */
    public static final String POINTS_CHANGE_DED_TYPE_REGEX_PATTERN = "^(ORDER_SPEND|MALL_REDEEM|JOIN_ACTIVITY|SYSTEM_ADJUST|EXPIRED_DEDUCT|OTHERS)$";

    /**
     * 积分变动类型正则匹配表达式
     */
    public static final String POINTS_CHANGE_TYPE_REGEX_PATTERN = "^(ORDER_EARN|INVITE_USER|JOIN_ACTIVITY|ORDER_SPEND|MALL_REDEEM|SIGN_IN_REWARD|SYSTEM_ADJUST|EXPIRED_DEDUCT|OTHERS)$";

    @EnumValue
    @JsonValue
    private final String value;
    private final String desc;

}
package cn.joywon.poco.merchant.CouponModule.definition;

import cn.joywon.poco.merchant.Common.convert.EnumFullPropertySerializer;
import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
@JsonSerialize(using = EnumFullPropertySerializer.class)
public enum CouponStatusEnum {

    // 优惠券模板状态
    TEMPLATE_ACTIVE("ACTIVE", "已生效"),
    TEMPLATE_CANCEL("CANCEL", "已作废"),
    TEMPLATE_PENDING("PENDING", "待审核"),
    TEMPLATE_REJECTED("REJECTED", "审核拒绝"),
    TEMPLATE_ALL_CLAIMED("ALL_CLAIMED", "已被领完"),

    // 商家合作状态
    COOP_VALID("COOP_VALID", "有效"),
    COOP_INVALID("COOP_INVALID", "无效"),
    COOP_ALL_CLAIMED("COOP_ALL_CLAIMED", "已被领完"),

    // 用户优惠券使用状态
    USER_COUPON_USED("USED", "已使用"),
    USER_COUPON_UNUSED("UNUSED", "未使用"),
    USER_COUPON_LOCKED("LOCKED", "已锁定"),
    USER_COUPON_EXPIRED("EXPIRED", "已过期"),
    USER_COUPON_INVALID("INVALID", "已作废"),
    USER_COUPON_UNCLAIMED("UNCLAIMED", "未领取"),
    USER_COUPON_REFUNDED("REFUNDED", "已退款失效");

    /**
     * 优惠券审核结果正则匹配表达式
     */
    public static final String COUPON_AUDIT_STATUS_REGEX_PATTERN = "^(ACTIVE|REJECTED)$";

    /**
     * 用户优惠券状态正则匹配表达式
     */
    public static final String USER_COUPON_STATUS_REGEX_PATTERN = "^(USED|UNUSED|LOCKED|EXPIRED)$";

    /**
     * 优惠券模板状态正则匹配表达式
     */
    public static final String COUPON_TEMPLATE_STATUS_REGEX_PATTERN = "^(ACTIVE|PENDING|CANCEL|REJECTED|ALL_CLAIMED)$";


    public static CouponStatusEnum getByValue(String value) {
        for (CouponStatusEnum e : CouponStatusEnum.values()) {
            if (e.getValue().equals(value)) {
                return e;
            }
        }
        throw new IllegalArgumentException("不存在 value 为 " + value + " 的枚举值");
    }

    @EnumValue
    private final String value;
    private final String desc;

}
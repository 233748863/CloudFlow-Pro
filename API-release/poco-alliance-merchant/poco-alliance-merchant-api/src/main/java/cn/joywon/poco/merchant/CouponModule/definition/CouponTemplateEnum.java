package cn.joywon.poco.merchant.CouponModule.definition;

import cn.joywon.poco.merchant.Common.convert.EnumFullPropertySerializer;
import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.databind.annotation.JsonSerialize;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;

@Getter
@AllArgsConstructor
@JsonSerialize(using = EnumFullPropertySerializer.class)
public enum CouponTemplateEnum {

    // 优惠券类型
    COUPON_TYPE_CASH("CASH", "满减/代金"),
    COUPON_TYPE_DISCOUNT("DISCOUNT", "折扣"),
    COUPON_TYPE_PRODUCT_REDEMPTION("PRODUCT_REDEMPTION", "商品兑换"),

    // 优惠券适用范围
    COUPON_SCOPE_STORE("STORE", "门店"),
    COUPON_SCOPE_GLOBAL("GLOBAL", "全平台"),
    COUPON_SCOPE_MERCHANT_OWN("MERCHANT_OWN", "商家自身"),

    // 优惠券有效期类型
    VALIDITY_DYNAMIC_DAYS("DYNAMIC_DAYS", "领取后生效"),
    VALIDITY_FIXED_DATE_RANGE("FIXED_DATE_RANGE", "固定有效期");

    /**
     * 优惠券类型-平台券
     */
    private static final String COUPON_TYPE_PLATFORM = "平台券";

    /**
     * 优惠券类型正则匹配表达式
     */
    public static final String COUPON_TYPE_REGEX_PATTERN = "^(CASH|DISCOUNT|PRODUCT_REDEMPTION)$";

    /**
     * 优惠券使用范围正则匹配表达式-商家
     */
    public static final String COUPON_SCOPE_REGEX_PATTERN_MERCHANT = "^(MERCHANT_OWN|STORE)$";

    /**
     * 优惠券使用范围正则匹配表达式-平台
     */
    public static final String COUPON_SCOPE_REGEX_PATTERN_PLATFORM = "^(GLOBAL|MERCHANT_OWN|STORE)$";

    /**
     * 优惠券有效期类型正则匹配表达式
     */
    public static final String COUPON_VALIDITY_TYPE_REGEX_PATTERN = "^(DYNAMIC_DAYS|FIXED_DATE_RANGE)$";

    /**
     * 天数有效期最后一秒
     */
    public static final LocalTime DAYS_LAST_SEC = LocalTime.of(23, 59, 59);

    /**
     * 初始化获取某天最后一秒
     */
    public static LocalDateTime lastSecOfDay(LocalDate day, int days) {
        return LocalDateTime.of(day.plusDays(days), DAYS_LAST_SEC);
    }

    public static CouponTemplateEnum getByValue(String value) {
        for (CouponTemplateEnum e : CouponTemplateEnum.values()) {
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
package cn.joywon.poco.merchant.PlatformModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;

@Getter
@AllArgsConstructor
public enum BannerTypeEnum {

    STORE("STORE", "门店"),
    NOTICE("NOTICE", "公告"),
    COUPON("COUPON", "优惠券"),
    PRODUCT("PRODUCT", "商品"),
    MERCHANT("MERCHANT", "商家"),
    INDUSTRY("INDUSTRY", "行业");

    /**
     * 轮播图类型正则匹配表达式
     */
    public static final String BANNER_TYPE_REGEX_PATTERN = "^(NOTICE|COUPON|PRODUCT|STORE|MERCHANT|INDUSTRY)$";

    /**
     * 轮播图永不过期时间
     */
    public static final LocalDateTime BANNER_NEVER_EXPIRE = LocalDate.of(9999, Month.DECEMBER, 31).atTime(23, 59, 59);

    @EnumValue
    private final String value;
    private final String desc;

}
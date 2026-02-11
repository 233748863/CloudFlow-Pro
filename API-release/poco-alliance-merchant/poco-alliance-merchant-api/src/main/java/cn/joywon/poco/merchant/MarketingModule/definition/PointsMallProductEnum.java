package cn.joywon.poco.merchant.MarketingModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum PointsMallProductEnum {

    // 商品类型
    VIRTUAL_COUPON("VIRTUAL_COUPON", "虚拟券"),
    PHYSICAL_GOOD("PHYSICAL_GOOD", "实物商品"),

    // 商品状态
    ON_SHELF("ON_SHELF", "已上架"),
    OFF_SHELF("OFF_SHELF", "已下架"),
    OUT_OF_STOCK("OUT_OF_STOCK", "已售罄"),
    PENDING_ON_SHELF("PENDING_ON_SHELF", "待上架");

    /**
     * 积分商城商品类型正则匹配表达式
     */
    public static final String PRODUCT_TYPE_REGEX_PATTERN = "^(VIRTUAL_COUPON|PHYSICAL_GOOD)$";

    @EnumValue
    private final String value;
    private final String desc;

}
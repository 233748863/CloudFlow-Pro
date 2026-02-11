package cn.joywon.poco.merchant.CouponModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum CouponRebateEnum {

    // 返利状态
    REBATE_WAITING("WAITING", "待结算"),
    REBATE_SETTLED("SETTLED", "已结算"),
    REBATE_FAILED("FAILED", "结算失败"),
    REBATE_REFUNDED("REFUNDED", "已失效(订单退款/取消)"),

    // 返利失效原因
    INVALID_ORDER_CANCEL("ORDER_CANCEL", "订单取消"),
    INVALID_PARTIAL_REFUND("PARTIAL_REFUND", "部分退款"),
    INVALID_FULL_REFUND("FULL_REFUND", "全额退款"),

    // 返利追回状态
    RECOVER_RECOVERING("RECOVERING", "追回中"),
    RECOVER_RECOVERED("RECOVERED", "追回成功"),
    RECOVER_NOT_NEEDED("NOT_NEEDED", "无需追回"),
    RECOVER_FAILED("RECOVER_FAILED", "追回失败");

    /**
     * 合作优惠券返利状态正则匹配表达式
     */
    public static final String COOP_COUPON_REBATE_STATUS_REGEX_PATTERN = "^(WAITING|SETTLED|FAILED|REFUNDED)$";

    public static CouponRebateEnum getByValue(String value) {
        for (CouponRebateEnum e : CouponRebateEnum.values()) {
            if (e.getValue().equals(value)) {
                return e;
            }
        }
        throw new IllegalArgumentException("不存在 value 为 " + value + " 的枚举值");
    }

    @EnumValue
    @JsonValue
    private final String value;
    private final String desc;

}
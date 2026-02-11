package cn.joywon.poco.merchant.MerchantModule.definition;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 门店营业状态枚举
 */
@Getter
@AllArgsConstructor
public enum BusinessStatusEnum {

    // 门店营业状态
    STORE_OPEN("OPEN", "营业状态-营业中"),
    STORE_CLOSE("CLOSED", "营业状态-已关店"),
    STORE_RESTING("RESTING", "营业状态-休息中"),
    STORE_DELETED("DELETED", "营业状态-已删除"),

    // 商家经营状态
    MERCHANT_PREPARING("PREPARING", "经营状态-准备中"),
    MERCHANT_OPERATING("OPERATING", "经营状态-经营中"),
    MERCHANT_SUSPENDED("SUSPENDED", "经营状态-停业中"),
    MERCHANT_TERMINATED("TERMINATED", "经营状态-已结业");

    @EnumValue
    @JsonValue
    private final String value;
    private final String desc;

    /**
     * 门店营业状态正则匹配表达式
     */
    public static final String STORE_BIZ_STATUS_REGEX_PATTERN = "^(OPEN|CLOSED|RESTING)$";

    /**
     * 门店经营状态正则匹配表达式
     */
    public static final String MERCHANT_BIZ_STATUS_REGEX_PATTERN = "^(PREPARING|OPERATING|SUSPENDED|TERMINATED)$";

    public static BusinessStatusEnum getByValue(String value) {
        for (BusinessStatusEnum e : BusinessStatusEnum.values()) {
            if (e.getValue().equals(value)) {
                return e;
            }
        }
        throw new IllegalArgumentException("不存在 value 为 " + value + " 的枚举值");
    }

}

package cn.joywon.poco.merchant.ProductModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 库存业务类型枚举
 *
 * @author poco
 * @date 2024-12-19
 */
@Getter
@AllArgsConstructor
public enum StockBusinessTypeEnum {

    /**
     * 订单扣减
     */
    ORDER("ORDER", "订单"),

    /**
     * 促销活动扣减
     */
    PROMOTION("PROMOTION", "促销活动"),

    /**
     * 退款增加
     */
    REFUND("REFUND", "退款"),

    /**
     * 补货增加
     */
    RESTOCK("RESTOCK", "补货");

    /**
     * 业务类型码
     */
    private final String code;

    /**
     * 业务类型描述
     */
    private final String description;

    /**
     * 根据业务类型码获取枚举
     * @param code 业务类型码
     * @return 枚举值
     */
    public static StockBusinessTypeEnum getByCode(String code) {
        for (StockBusinessTypeEnum value : values()) {
            if (value.getCode().equals(code)) {
                return value;
            }
        }
        return null;
    }
}
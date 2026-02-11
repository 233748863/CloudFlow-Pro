
package cn.joywon.poco.merchant.ProductModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 商品类型枚举
 *
 * @author poco
 * @date 2025-01-01
 */
@Getter
@AllArgsConstructor
public enum ProductTypeEnum {

    /**
     * 实物商品
     */
    PHYSICAL("PHYSICAL", "实物商品"),

    /**
     * 服务商品
     */
    SERVICE("SERVICE", "服务商品");

    /**
     * 类型码
     */
    private final String code;

    /**
     * 类型描述
     */
    private final String description;

    /**
     * 根据类型码获取枚举
     *
     * @param code 类型码
     * @return 商品类型枚举
     */
    public static ProductTypeEnum getByCode(String code) {
        for (ProductTypeEnum type : values()) {
            if (type.getCode().equals(code)) {
                return type;
            }
        }
        return null;
    }
}
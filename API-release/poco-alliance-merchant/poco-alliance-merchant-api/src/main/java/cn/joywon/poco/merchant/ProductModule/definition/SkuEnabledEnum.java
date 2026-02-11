
package cn.joywon.poco.merchant.ProductModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * SKU启用状态枚举
 *
 * @author poco
 * @date 2024-12-19
 */
@Getter
@AllArgsConstructor
public enum SkuEnabledEnum {

    /**
     * 禁用状态
     */
    DISABLED("0", "禁用"),

    /**
     * 启用状态
     */
    ENABLED("1", "启用");

    /**
     * 状态码
     */
    private final String code;

    /**
     * 状态描述
     */
    private final String description;

    /**
     * 根据状态码获取枚举
     * @param code 状态码
     * @return 枚举值
     */
    public static SkuEnabledEnum getByCode(String code) {
        for (SkuEnabledEnum value : values()) {
            if (value.getCode().equals(code)) {
                return value;
            }
        }
        return null;
    }
}

package cn.joywon.poco.merchant.ProductModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 商品状态枚举
 *
 * @author poco
 * @date 2025-01-01
 */
@Getter
@AllArgsConstructor
public enum ProductStatusEnum {

    /**
     * 草稿状态
     */
    DRAFT("DRAFT", "草稿"),

    /**
     * 已发布状态
     */
    PUBLISHED("PUBLISHED", "已发布"),

    /**
     * 已归档状态
     */
    ARCHIVED("ARCHIVED", "已归档");

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
     *
     * @param code 状态码
     * @return 商品状态枚举
     */
    public static ProductStatusEnum getByCode(String code) {
        for (ProductStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}
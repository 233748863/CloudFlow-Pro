package com.cloudflow.common.oss.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 桶访问策略类型枚举
 *
 * @author CloudFlow
 */
@Getter
@AllArgsConstructor
public enum AccessPolicyType {

    /**
     * 私有（仅拥有者可访问）
     */
    PRIVATE("0", "private"),

    /**
     * 公共读（任何人可读取）
     */
    PUBLIC("1", "public-read"),

    /**
     * 公共读写（任何人可读写）
     */
    PUBLIC_READ_WRITE("2", "public-read-write");

    /**
     * 策略类型代码
     */
    private final String type;

    /**
     * 策略名称
     */
    private final String policyType;

    /**
     * 根据类型代码获取枚举
     *
     * @param type 类型代码
     * @return 对应的枚举值，默认返回 PUBLIC
     */
    public static AccessPolicyType getByType(String type) {
        for (AccessPolicyType value : values()) {
            if (value.getType().equals(type)) {
                return value;
            }
        }
        return PUBLIC;
    }
}

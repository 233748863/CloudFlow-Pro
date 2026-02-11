/*
 *    Copyright (c) 2018-2025, poco All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 * Redistributions in binary form must reproduce the above copyright
 * notice, this list of conditions and the following disclaimer in the
 * documentation and/or other materials provided with the distribution.
 * Neither the name of the pig4cloud.com developer nor the names of its
 * contributors may be used to endorse or promote products derived from
 * this software without specific prior written permission.
 * Author: poco
 */

package cn.joywon.poco.merchant.OrderModule.definition;

import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 支付状态枚举
 *
 * @author poco
 * @date 2025-11-02
 */
@Getter
@AllArgsConstructor
public enum PaymentStatusEnum {

    /**
     * 初始化
     */
    INIT("INIT", "初始化"),

    /**
     * 支付中
     */
    PAYING("PAYING", "支付中"),

    /**
     * 支付成功
     */
    SUCCESS("SUCCESS", "支付成功"),

    /**
     * 支付失败
     */
    FAIL("FAIL", "支付失败");

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
     * @return 支付状态枚举
     */
    public static PaymentStatusEnum getByCode(String code) {
        for (PaymentStatusEnum status : values()) {
            if (status.getCode().equals(code)) {
                return status;
            }
        }
        return null;
    }
}